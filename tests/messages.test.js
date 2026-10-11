/* Network message registry: round trips, sizes against JSON, and hostile input. */
const fs = require("fs"),
  path = require("path");
const { check, finish } = require("./lib/check.js");
global.window = global;
const MSG = (0, eval)(
  fs.readFileSync(path.join(__dirname, "..", "src", "net", "messages.js"), "utf8") + "\nMSG"
);

const close = (a, b, tol) => {
  if (Array.isArray(a))
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => close(x, b[i], tol));
  if (a && typeof a === "object") return Object.keys(a).every(k => close(a[k], b[k], tol));
  if (typeof a === "number") return Math.abs(a - b) <= tol;
  return a === b;
};

const arena = {
  seq: 812,
  ts: 123456789,
  p: [12.34, 3.05, -40.12],
  v: [-8.5, 0.25, 11.75],
  y: 2.5,
  pt: -0.31,
  st: 4096 | 2 | 512,
  sh: 64,
  dead: false,
  k: 7,
  d: 3,
};
const agent = i => ({
  id: "a" + i,
  team: i & 1,
  slot: i >> 1,
  p: [i * 3.1, 1.2, -i * 2.7],
  v: [1.5, 0, -2.25],
  y: -1.2,
  pt: 0.1,
  st: 2,
  sh: 70,
  dead: false,
  spot: 1,
  name: "Bot " + i,
  k: i,
  d: 1,
});
const snap = {
  t: 123.5,
  tl: 540,
  sc: [1, 2],
  ov: -1,
  fl: [
    { st: 0, p: [0, 2, -43], by: "", dt: 0 },
    { st: 1, p: [3, 2.5, 10], by: "a3", dt: 0 },
  ],
  ag: Array.from({ length: 8 }, (_, i) => agent(i)),
  pu: [{ id: "ctf-sniper", in: 12.5 }],
  br: [3, 17, 200],
};

/* every registered message round-trips (with its fixed-point precision) */
const SAMPLES = {
  hello: { pv: MSG.PROTOCOL, name: "Pilot", color: "#ffb347" },
  ping: { n: 5, ts: 1234.5 },
  pong: { n: 5, ts: 1234.5 },
  arenaState: arena,
  arenaHit: { s: 9, t: "peer-abc", d: 16, w: "rifle", hd: true },
  arenaDeath: { s: 2, by: "peer-xyz", bn: "", w: "sniper", hd: false },
  arenaFx: { s: 4, k: "slam", a: [1, 2, 3], b: [0, 0, 0], g: 0 },
  ctfSnap: snap,
  ctfClient: { tm: 1, p: [1, 2, 3], v: [0, 0, 0], y: 1, pt: 0, st: 0, sh: 70, dead: false },
};
for (const m of MSG.list()) {
  const s = SAMPLES[m.name];
  if (!check(!!s, `${m.name} has a test sample`)) continue;
  const d = MSG.decode(MSG.encode(m.name, s));
  check(d && d.name === m.name && close(s, d.data, 0.011), `${m.name} round-trips`, d && d.data);
}

/* sizes: binary should be several times smaller than the JSON it replaces */
const jsonArena = JSON.stringify({
  p: arena.p,
  v: arena.v,
  y: arena.y,
  pt: arena.pt,
  st: arena.st,
  sh: arena.sh,
  dead: 0,
  k: 7,
  d: 3,
}).length;
const binArena = MSG.encode("arenaState", arena).byteLength;
check(binArena * 2.5 < jsonArena, "arena state is much smaller than JSON", {
  binary: binArena,
  json: jsonArena,
});
const binSnap = MSG.encode("ctfSnap", snap).byteLength;
const jsonSnap = JSON.stringify({
  t: snap.t,
  tl: snap.tl,
  sc: snap.sc,
  ov: null,
  fl: snap.fl.map(f => [f.st, ...f.p, f.by, f.dt]),
  ag: snap.ag.map(a => [
    a.id,
    a.team,
    a.slot,
    ...a.p,
    ...a.v,
    a.y,
    a.pt,
    a.st,
    a.sh,
    0,
    a.spot,
    a.name,
    a.k,
    a.d,
  ]),
  pu: [["ctf-sniper", 12.5]],
  br: snap.br,
}).length;
check(binSnap * 2 < jsonSnap, "CTF snapshot is much smaller than JSON", { binary: binSnap, json: jsonSnap });

/* angles wrap, junk numbers become zero, strings are capped and cleaned */
{
  const d = MSG.decode(
    MSG.encode("arenaState", Object.assign({}, arena, { y: 7.5, sh: NaN, k: 1e9, p: [1e9, -1e9, "x"] }))
  ).data;
  check(Math.abs(d.y - (7.5 - 2 * Math.PI)) < 0.001, "angles wrap to ±π", d.y);
  check(d.sh === 0 && d.k === 65535, "non-numbers become 0 and big numbers clamp", [d.sh, d.k]);
  check(d.p[0] === 327.67 && d.p[1] === -327.68 && d.p[2] === 0, "positions clamp to range", d.p);
  const h = MSG.decode(
    MSG.encode("hello", { pv: 1, name: "A\u0000B\u202eC" + "x".repeat(40), color: "#fff" })
  ).data;
  check(h.name.length <= 14 && !/[\u0000\u202e]/.test(h.name), "names are capped and cleaned", h.name);
}

/* hostile input: truncated, padded, unknown and random packets decode to null and never throw */
{
  const full = new Uint8Array(MSG.encode("ctfSnap", snap));
  let bad = 0;
  for (let n = 0; n < full.length; n++) if (MSG.decode(full.slice(0, n).buffer) !== null) bad++;
  check(bad === 0, "every truncated packet is rejected", bad);
  const pad = new Uint8Array(full.length + 1);
  pad.set(full);
  check(MSG.decode(pad.buffer) === null, "trailing bytes are rejected");
  check(MSG.decode(new Uint8Array([250, 1, 2]).buffer) === null, "unknown message ids are rejected");
  check(MSG.decode("hello") === null && MSG.decode(null) === null, "non-binary input is rejected");
  let threw = 0,
    passed = 0;
  for (let i = 0; i < 20000; i++) {
    const b = new Uint8Array(1 + ((Math.random() * 120) | 0));
    for (let k = 0; k < b.length; k++) b[k] = (Math.random() * 256) | 0;
    if (Math.random() < 0.7) b[0] = MSG.list()[(Math.random() * MSG.list().length) | 0].id;
    try {
      const d = MSG.decode(b.buffer);
      if (d) {
        passed++;
        const bad = JSON.stringify(d.data, (k, v) =>
          typeof v === "number" && !Number.isFinite(v) ? "BAD" : v
        );
        if (bad.includes('"BAD"')) threw++;
      }
    } catch (e) {
      threw++;
    }
  }
  check(threw === 0, "20k random packets never throw or produce non-finite numbers", {
    threw,
    decoded: passed,
  });
}
finish("messages");
