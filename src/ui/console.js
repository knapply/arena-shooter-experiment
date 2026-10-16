/* ============ DEVELOPER CONSOLE ============
   Press ` (backquote) in a dev build (npm run dev) or with ?dev in the page address.
   Type "help" for the command list. Commands only change this tab; nothing is sent to other players
   except what the game would send anyway (moving yourself, for example). */
const DEV = !!(/** @type {any} */ (window).KA_DEV) || /[?&#]dev\b/.test(location.search + location.hash);
let timeScale = 1,
  godMode = false;
const CON = (() => {
  let el = null,
    out = null,
    input = null;
  const hist = [];
  let hi = 0;
  const overlays = { hitboxes: null, nav: null };
  function ui() {
    if (el) return;
    el = document.createElement("div");
    el.id = "devcon";
    el.hidden = true;
    el.innerHTML =
      '<div class="dc-out" role="log" aria-live="polite"></div><input class="dc-in" spellcheck="false" autocomplete="off" aria-label="Developer console command" placeholder="help">';
    document.body.appendChild(el);
    out = /** @type {HTMLElement} */ (el.querySelector(".dc-out"));
    input = /** @type {HTMLInputElement} */ (el.querySelector(".dc-in"));
    input.addEventListener("keydown", e => {
      if (e.code === "Backquote" || e.code === "Escape") {
        e.preventDefault();
        toggle(false);
        return;
      }
      if (e.key === "Enter") {
        const line = input.value.trim();
        input.value = "";
        if (line) {
          hist.push(line);
          hi = hist.length;
          print("> " + line, "cmd");
          run(line);
        }
      } else if (e.key === "ArrowUp" && hist.length) {
        hi = Math.max(0, hi - 1);
        input.value = hist[hi];
        e.preventDefault();
      } else if (e.key === "ArrowDown" && hist.length) {
        hi = Math.min(hist.length, hi + 1);
        input.value = hist[hi] || "";
        e.preventDefault();
      }
      e.stopPropagation();
    });
  }
  function print(text, cls) {
    ui();
    const d = document.createElement("div");
    if (cls) d.className = cls;
    d.textContent = text;
    out.appendChild(d);
    while (out.children.length > 200) out.firstChild.remove();
    out.scrollTop = out.scrollHeight;
  }
  function toggle(on) {
    ui();
    const show = on == null ? el.hidden : on;
    el.hidden = !show;
    if (show) {
      try {
        document.exitPointerLock();
      } catch (e) {}
      setTimeout(() => input.focus(), 0);
    } else input.blur();
  }
  const num = (v, d) => (Number.isFinite(+v) ? +v : d);
  const onOff = (v, cur) => (v === "on" || v === "1" ? true : v === "off" || v === "0" ? false : !cur);

  /* ---- overlays ---- */
  function hitboxOverlay(on) {
    if (overlays.hitboxes) {
      scene.remove(overlays.hitboxes.group);
      overlays.hitboxes = null;
    }
    if (!on) return;
    const group = new THREE.Group(),
      mat = new THREE.LineBasicMaterial({
        color: 0x55ff99,
        depthTest: false,
        transparent: true,
        opacity: 0.8,
      }),
      hmat = new THREE.LineBasicMaterial({
        color: 0xff5566,
        depthTest: false,
        transparent: true,
        opacity: 0.9,
      });
    const body = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.8, 1, 0.8)),
      head = new THREE.EdgesGeometry(new THREE.SphereGeometry(0.25, 8, 6));
    const pool = [];
    group.renderOrder = 999;
    scene.add(group);
    overlays.hitboxes = {
      group,
      /* same boxes rayTarget tests: a 0.8 m box from the feet to h - 0.45 and a 0.25 m head sphere */
      update() {
        const list = targets();
        while (pool.length < list.length) {
          const b = new THREE.LineSegments(body, mat),
            h = new THREE.LineSegments(head, hmat);
          group.add(b, h);
          pool.push([b, h]);
        }
        pool.forEach(([b, h], i) => {
          const t = list[i];
          b.visible = h.visible = !!t;
          if (!t) return;
          const bh = t.h - 0.45;
          b.scale.set(1, bh, 1);
          b.position.set(t.pos.x, t.pos.y + bh / 2, t.pos.z);
          h.position.set(t.pos.x, t.pos.y + t.h - 0.24, t.pos.z);
        });
      },
    };
  }
  function navOverlay(on) {
    if (overlays.nav) {
      scene.remove(overlays.nav);
      overlays.nav = null;
    }
    if (!on) return true;
    const NAV = window.CTF && window.CTF.NAV;
    if (!NAV || !NAV.ok) return false;
    const pts = [],
      cols = [];
    for (let c = 0; c < NAV.ok.length; c++) {
      if (!NAV.ok[c]) continue;
      pts.push(NAV.X0 + (c % NAV.W) + 0.5, NAV.top[c] + 0.08, NAV.Z0 + ((c / NAV.W) | 0) + 0.5);
      const l = NAV.wl[c];
      cols.push(l === 0 ? 1 : 0.3, l === 1 ? 1 : 0.4, l === 2 ? 1 : 0.3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    overlays.nav = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 0.18, vertexColors: true, depthTest: true })
    );
    scene.add(overlays.nav);
    return true;
  }

  /* ---- commands ---- */
  const WEAPON_NAMES = { carbine: 0, pistol: 1, sniper: 2, rocket: 3, scatter: 4 };
  /** @type {Record<string, [string, (a: string[]) => any]>} */
  const CMDS = {
    help: [
      "list commands",
      () => {
        for (const [k, [d]] of Object.entries(CMDS)) print(k.padEnd(10) + d);
      },
    ],
    clear: ["clear the console", () => (out.textContent = "")],
    tp: [
      "tp x y z | tp spawn n — move yourself",
      a => {
        if (a[0] === "spawn") {
          const s = SPAWNS[num(a[1], 0) % SPAWNS.length];
          me.pos.set(s[0], s[1], s[2]);
        } else me.pos.set(num(a[0], me.pos.x), num(a[1], me.pos.y), num(a[2], me.pos.z));
        me.vel.set(0, 0, 0);
        snapView();
        return `at ${me.pos.x.toFixed(1)} ${me.pos.y.toFixed(1)} ${me.pos.z.toFixed(1)}`;
      },
    ],
    pos: [
      "print your position and facing",
      () =>
        `${me.pos
          .toArray()
          .map(v => v.toFixed(2))
          .join(" ")} yaw ${me.yaw.toFixed(2)}`,
    ],
    give: [
      "give carbine|pistol|sniper|rocket|scatter",
      a => {
        const w = WEAPON_NAMES[a[0]];
        if (w == null) return "unknown weapon";
        giveWeapon(w);
        return "gave " + a[0];
      },
    ],
    god: [
      "god [on|off] — take no damage",
      a => ((godMode = onOff(a[0], godMode)), "god " + (godMode ? "on" : "off")),
    ],
    timescale: [
      "timescale x — 0 to 4 (0 freezes the world; slow motion or fast forward)",
      a => ((timeScale = clamp(num(a[0], 1), 0, 4)), "time scale " + timeScale),
    ],
    bots: [
      "bots on|off — arena practice drones",
      a => {
        botsOn = onOff(a[0], botsOn);
        makeBots();
        return "drones " + (botsOn ? "on" : "off");
      },
    ],
    hitboxes: [
      "hitboxes [on|off] — draw the boxes shots are tested against",
      a => {
        const on = onOff(a[0], !!overlays.hitboxes);
        hitboxOverlay(on);
        return "hitboxes " + (on ? "on" : "off");
      },
    ],
    bake: [
      "bake [on|off] — show only the light baked into the map (occlusion grey, bounce in color)",
      a => {
        SURF_DEBUG.on = onOff(a[0], SURF_DEBUG.on);
        for (const m of SURF_MATS) m.needsUpdate = true;
        return "bake " + (SURF_DEBUG.on ? "on" : "off");
      },
    ],
    nav: [
      "nav [on|off] — draw the CTF AI's walkable grid (colored by lane)",
      a => {
        const on = onOff(a[0], !!overlays.nav);
        return navOverlay(on)
          ? "nav " + (on ? "on" : "off")
          : "the nav grid exists once a CTF match has started";
      },
    ],
    net: [
      "net latency jitter loss% — simulate a bad connection (net 0 0 0 to clear)",
      a => {
        const N = window.KAHOST && window.KAHOST.net;
        if (!N) return "no network layer";
        if (a.length) N.setSim({ latency: num(a[0], 0), jitter: num(a[1], 0), loss: num(a[2], 0) / 100 });
        const s = N.sim;
        return `latency ${s.latency} ms, jitter ${s.jitter} ms, loss ${(s.loss * 100).toFixed(1)}%`;
      },
    ],
    seed: [
      "seed [n] — show or set the simulation seed",
      a => (a.length ? "seed " + RNG.seed(num(a[0], 1)) : "seed " + RNG.current),
    ],
    events: [
      "events [n] — the last n game events",
      a => {
        for (const e of EVENTS.recent(num(a[0], 10))) {
          const { type, t, seq, map, mode, ...rest } = e;
          print(`${t.toFixed(1)} ${type} ${JSON.stringify(rest)}`);
        }
      },
    ],
    pilots: [
      "list pilots and where they are",
      () => {
        for (const p of PILOTS.values())
          print(
            `${p.id.padEnd(16)} ${p.ctl.padEnd(7)} ${p.name} ${p.body.pos
              .toArray()
              .map(v => v.toFixed(1))
              .join(" ")}`
          );
      },
    ],
    perf: [
      "toggle the performance overlay (F3)",
      () => ((SET.perfOverlay = !SET.perfOverlay), saveSettings(), "perf " + SET.perfOverlay),
    ],
    netpanel: [
      "toggle the network panel (F4)",
      () => ((SET.netOverlay = !SET.netOverlay), saveSettings(), "net panel " + SET.netOverlay),
    ],
    kill: ["kill yourself", () => (hurtMe(999, { name: "Console", w: "self" }), "")],
  };
  function run(line) {
    const [cmd, ...args] = line.split(/\s+/);
    const c = CMDS[cmd.toLowerCase()];
    if (!c) return print(`unknown command "${cmd}" (try help)`, "err");
    try {
      const r = c[1](args);
      if (r != null && r !== "") print(String(r));
    } catch (e) {
      print(String(e && e.message), "err");
    }
  }
  if (DEV)
    addEventListener(
      "keydown",
      e => {
        if (e.code !== "Backquote" || e.repeat) return;
        const tg = /** @type {HTMLElement} */ (e.target).tagName;
        if ((tg === "INPUT" || tg === "TEXTAREA") && e.target !== input) return;
        e.preventDefault();
        e.stopPropagation();
        toggle();
      },
      true
    );
  return {
    run,
    print,
    toggle,
    get open() {
      return !!el && !el.hidden;
    },
    /** per frame: keep overlays in step with the world */
    frame() {
      if (overlays.hitboxes) overlays.hitboxes.update();
    },
  };
})();
