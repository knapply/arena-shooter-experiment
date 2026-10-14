/* ============ NETWORK MESSAGE REGISTRY ============
   Every network message is defined once here: a numeric id, a channel (reliable, or fast where a
   late packet is worthless), and typed fields. Binary encoding, decoding and validation all come
   from the definitions, so adding a field is one line and a malformed or hostile packet can never
   reach game code (decode returns null instead of throwing, every number is finite and in range,
   every string is length-capped and stripped of control characters).

   Field types:
     u8 u16 u32 i8 i16 i32 f32 bool
     q<bits>:<scale>   fixed-point number, e.g. "q16:100" = int16 of value*100 (±327.67, 1 cm steps)
     ang               angle wrapped to ±π in 16 bits (0.0001 rad steps)
     str:<max>         UTF-8 string up to max bytes
     v3:<scale>        three q16 numbers (positions and velocities)
     [type, max]       array of up to max items of type (a field list for structs)
   Bump PROTOCOL whenever an existing message changes shape; players on different versions are
   told so when they join instead of receiving garbage. */
const MSG = (() => {
  const PROTOCOL = 6;
  const TWO_PI = Math.PI * 2;
  const BAD = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;
  const enc = new TextEncoder(),
    dec = new TextDecoder("utf-8", { fatal: false });
  /** @type {Record<string, any>} */
  const BY_NAME = {};
  /** @type {any[]} */
  const BY_ID = [];

  /* ---- writer / reader ---- */
  class W {
    constructor() {
      this.b = new ArrayBuffer(256);
      this.v = new DataView(this.b);
      this.o = 0;
    }
    need(n) {
      if (this.o + n <= this.b.byteLength) return;
      let sz = this.b.byteLength * 2;
      while (sz < this.o + n) sz *= 2;
      const nb = new ArrayBuffer(sz);
      new Uint8Array(nb).set(new Uint8Array(this.b, 0, this.o));
      this.b = nb;
      this.v = new DataView(nb);
    }
    done() {
      return this.b.slice(0, this.o);
    }
  }
  class R {
    constructor(buf) {
      this.v = new DataView(buf);
      this.o = 0;
    }
    need(n) {
      if (this.o + n > this.v.byteLength) throw new RangeError("short packet");
    }
  }
  const INT = {
    u8: [1, "Uint8", 0, 255],
    u16: [2, "Uint16", 0, 65535],
    u32: [4, "Uint32", 0, 4294967295],
    i8: [1, "Int8", -128, 127],
    i16: [2, "Int16", -32768, 32767],
    i32: [4, "Int32", -2147483648, 2147483647],
  };
  const clampInt = (x, lo, hi) => (Number.isFinite(+x) ? Math.max(lo, Math.min(hi, Math.round(+x))) : 0);

  /** compile a type string or array spec into {w(writer, value), r(reader)} */
  function codec(t) {
    if (Array.isArray(t)) {
      const [item, max] = t;
      const c = Array.isArray(item) && typeof item[0] !== "string" ? struct(item) : codec(item);
      return {
        w(o, a) {
          const arr = Array.isArray(a) ? a.slice(0, max) : [];
          o.need(1);
          o.v.setUint8(o.o++, arr.length);
          for (const x of arr) c.w(o, x);
        },
        r(i) {
          i.need(1);
          const n = i.v.getUint8(i.o++);
          if (n > max) throw new RangeError("array too long");
          const out = [];
          for (let k = 0; k < n; k++) out.push(c.r(i));
          return out;
        },
      };
    }
    if (INT[t]) {
      const [n, fn, lo, hi] = INT[t];
      return {
        w(o, x) {
          o.need(n);
          o.v["set" + fn](o.o, clampInt(x, lo, hi));
          o.o += n;
        },
        r(i) {
          i.need(n);
          const x = i.v["get" + fn](i.o);
          i.o += n;
          return x;
        },
      };
    }
    if (t === "f32")
      return {
        w(o, x) {
          o.need(4);
          o.v.setFloat32(o.o, Number.isFinite(+x) ? +x : 0);
          o.o += 4;
        },
        r(i) {
          i.need(4);
          const x = i.v.getFloat32(i.o);
          i.o += 4;
          if (!Number.isFinite(x)) throw new RangeError("non-finite");
          return x;
        },
      };
    if (t === "bool") {
      const c = codec("u8");
      return { w: (o, x) => c.w(o, x ? 1 : 0), r: i => c.r(i) !== 0 };
    }
    if (t === "ang") {
      const c = codec("i16");
      return {
        w(o, x) {
          let a = Number.isFinite(+x) ? +x % TWO_PI : 0;
          if (a > Math.PI) a -= TWO_PI;
          else if (a < -Math.PI) a += TWO_PI;
          c.w(o, a * 10000);
        },
        r: i => c.r(i) / 10000,
      };
    }
    let m = /^q(8|16|32):(\d+(?:\.\d+)?)$/.exec(t);
    if (m) {
      const c = codec("i" + m[1]),
        s = +m[2];
      return { w: (o, x) => c.w(o, +x * s), r: i => c.r(i) / s };
    }
    m = /^v3:(\d+(?:\.\d+)?)$/.exec(t);
    if (m) {
      const c = codec("q16:" + m[1]);
      return {
        w(o, a) {
          const v = Array.isArray(a) ? a : a && typeof a === "object" ? [a.x, a.y, a.z] : [0, 0, 0];
          c.w(o, v[0]);
          c.w(o, v[1]);
          c.w(o, v[2]);
        },
        r: i => [c.r(i), c.r(i), c.r(i)],
      };
    }
    m = /^str:(\d+)$/.exec(t);
    if (m) {
      const max = Math.min(255, +m[1]);
      return {
        w(o, s) {
          let b = enc.encode(String(s == null ? "" : s).replace(BAD, ""));
          if (b.length > max) b = b.slice(0, max);
          o.need(1 + b.length);
          o.v.setUint8(o.o++, b.length);
          new Uint8Array(o.b, o.o, b.length).set(b);
          o.o += b.length;
        },
        r(i) {
          i.need(1);
          const n = i.v.getUint8(i.o++);
          if (n > max) throw new RangeError("string too long");
          i.need(n);
          const s = dec.decode(new Uint8Array(i.v.buffer, i.v.byteOffset + i.o, n));
          i.o += n;
          return s.replace(BAD, "");
        },
      };
    }
    throw new Error("unknown field type " + t);
  }
  /** fields: [[name, type], ...] → codec for an object with those keys */
  function struct(fields) {
    const cs = fields.map(([k, t]) => [k, codec(t)]);
    return {
      w(o, obj) {
        const src = obj && typeof obj === "object" ? obj : {};
        for (const [k, c] of cs) c.w(o, src[k]);
      },
      r(i) {
        const out = {};
        for (const [k, c] of cs) out[k] = c.r(i);
        return out;
      },
    };
  }
  /** register a message type */
  function def(id, name, channel, fields) {
    if (BY_ID[id] || BY_NAME[name]) throw new Error("duplicate message " + id + " " + name);
    const m = { id, name, channel, fields, c: struct(fields) };
    BY_ID[id] = m;
    BY_NAME[name] = m;
    return m;
  }

  /* ---- definitions ---- */
  /* handshake and housekeeping */
  def(1, "hello", "reliable", [
    ["pv", "u16"],
    ["name", "str:14"],
    ["color", "str:9"],
  ]);
  def(2, "ping", "fast", [
    ["n", "u16"],
    ["ts", "f32"],
  ]);
  def(3, "pong", "fast", [
    ["n", "u16"],
    ["ts", "f32"],
  ]);
  /* free-for-all arena: each player's own state, ~22 Hz */
  def(10, "arenaState", "fast", [
    ["seq", "u16"],
    ["ts", "u32"],
    ["p", "v3:100"],
    ["v", "v3:100"],
    ["y", "ang"],
    ["pt", "ang"],
    ["st", "u32"],
    ["sh", "u8"],
    ["dead", "bool"],
    ["k", "u16"],
    ["d", "u16"],
  ]);
  /* a hit the shooter claims on someone; the victim's client applies it after its own checks */
  def(11, "arenaHit", "reliable", [
    ["s", "u16"],
    ["t", "str:64"],
    ["d", "u8"],
    ["w", "str:12"],
    ["hd", "bool"],
  ]);
  def(12, "arenaDeath", "reliable", [
    ["s", "u16"],
    ["by", "str:64"],
    ["bn", "str:14"],
    ["w", "str:12"],
    ["hd", "bool"],
  ]);
  def(13, "arenaFx", "reliable", [
    ["s", "u16"],
    ["k", "str:8"],
    ["a", "v3:100"],
    ["b", "v3:100"],
    ["g", "u8"],
  ]);
  /* capture the flag: everyone's movement from the host, ~30 Hz. Agents are listed in the order of
     the roster the host last sent over presence (rv says which roster version that is) */
  def(20, "ctfMove", "fast", [
    ["ts", "u32"],
    ["rv", "u8"],
    [
      "ag",
      [
        [
          ["p", "v3:100"],
          ["v", "v3:100"],
          ["y", "ang"],
          ["pt", "ang"],
          ["st", "u32"],
          ["sh", "u8"],
          ["dead", "bool"],
        ],
        16,
      ],
    ],
  ]);
  /* capture the flag: a joined player's own movement to the host, ~30 Hz */
  def(21, "ctfClient", "fast", [
    ["ts", "u32"],
    ["p", "v3:100"],
    ["v", "v3:100"],
    ["y", "ang"],
    ["pt", "ang"],
    ["st", "u32"],
    ["sh", "u8"],
    ["dead", "bool"],
  ]);

  /** encode a message by name → ArrayBuffer (first byte is the message id) */
  function encode(name, obj) {
    const m = BY_NAME[name];
    if (!m) throw new Error("unknown message " + name);
    const o = new W();
    o.need(1);
    o.v.setUint8(o.o++, m.id);
    m.c.w(o, obj);
    return o.done();
  }
  /** decode → {name, channel, data}, or null for anything malformed, unknown or with trailing bytes */
  function decode(buf) {
    try {
      const ab = buf instanceof ArrayBuffer ? buf : ArrayBuffer.isView(buf) ? buf.buffer : null;
      if (!ab) return null;
      const view = ArrayBuffer.isView(buf) ? buf : null;
      const slice = view ? ab.slice(view.byteOffset, view.byteOffset + view.byteLength) : ab;
      const i = new R(slice);
      i.need(1);
      const m = BY_ID[i.v.getUint8(i.o++)];
      if (!m) return null;
      const data = m.c.r(i);
      if (i.o !== i.v.byteLength) return null;
      return { name: m.name, channel: m.channel, data };
    } catch (e) {
      return null;
    }
  }
  return {
    PROTOCOL,
    encode,
    decode,
    channel: name => (BY_NAME[name] ? BY_NAME[name].channel : null),
    /** message table for docs and tests: [{id, name, channel, fields}] */
    list: () =>
      BY_ID.filter(Boolean).map(m => ({ id: m.id, name: m.name, channel: m.channel, fields: m.fields })),
  };
})();
/* the transport checks this when a friend joins, so mismatched versions get a clear message */
try {
  if (window.KAHOST) window.KAHOST.protocol = MSG.PROTOCOL;
} catch (e) {}
