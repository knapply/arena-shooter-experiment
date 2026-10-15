/* The network lab's PeerJS stand-in (tools/net-lab.js): the same as fake-peer.js, but between separate
   browser processes. Every message goes to the lab's relay over a local WebSocket (window.__LAB.url),
   which delivers it to the other instances through each link's simulated network (delay, jitter, loss,
   reordering, bandwidth). Frames: u32 header length, the JSON header, then the binary payload if any. */
/* global WebSocket */
(function () {
  const LAB = window.__LAB || {};
  const ch = { onmessage: null, postMessage: null };
  {
    const ws = new WebSocket(LAB.url);
    ws.binaryType = "arraybuffer";
    const queue = [];
    const enc = new TextEncoder(),
      dec = new TextDecoder();
    const frame = m => {
      const bin = m.data instanceof ArrayBuffer;
      const head = enc.encode(JSON.stringify(bin ? Object.assign({}, m, { data: null, bin: true }) : m));
      const pay = bin ? new Uint8Array(m.data) : null;
      const out = new Uint8Array(4 + head.length + (pay ? pay.length : 0));
      new DataView(out.buffer).setUint32(0, head.length);
      out.set(head, 4);
      if (pay) out.set(pay, 4 + head.length);
      return out.buffer;
    };
    ch.postMessage = m => {
      const f = frame(m);
      if (ws.readyState === 1) ws.send(f);
      else queue.push(f);
    };
    ws.onopen = () => {
      for (const f of queue) ws.send(f);
      queue.length = 0;
    };
    ws.onmessage = e => {
      const b = e.data,
        v = new DataView(b),
        n = v.getUint32(0);
      const m = JSON.parse(dec.decode(new Uint8Array(b, 4, n)));
      if (m.bin) m.data = b.slice(4 + n);
      if (ch.onmessage) ch.onmessage({ data: m });
    };
  }
  const peers = new Map(),
    conns = new Map();
  class Em {
    constructor() {
      this.h = {};
    }
    on(e, f) {
      (this.h[e] = this.h[e] || []).push(f);
      return this;
    }
    emit(e, ...a) {
      for (const f of this.h[e] || []) f(...a);
    }
  }
  const clone = d => (d instanceof ArrayBuffer ? d.slice(0) : JSON.parse(JSON.stringify(d)));
  class Conn extends Em {
    constructor(cid, peer, owner, opts) {
      super();
      this.cid = cid;
      this.peer = peer;
      this.owner = owner;
      this.open = false;
      this.label = (opts && opts.label) || "";
      this.reliable = !(opts && opts.reliable === false);
      this.serialization = (opts && opts.serialization) || "binary";
      this.metadata = (opts && opts.metadata) || null;
      conns.set(cid + "|" + owner, this);
    }
    send(d) {
      if (!this.open) return;
      ch.postMessage({ type: "data", cid: this.cid, to: this.peer, rel: this.reliable, data: clone(d) });
    }
    close() {
      if (!this.open) return;
      this.open = false;
      ch.postMessage({ type: "close", cid: this.cid, to: this.peer });
      this.emit("close");
    }
  }
  class Peer extends Em {
    constructor(id) {
      super();
      this.id = id || crypto.randomUUID();
      this.destroyed = false;
      peers.set(this.id, this);
      const me = this;
      this.taken = false;
      ch.postMessage({ type: "who", id: this.id });
      setTimeout(() => {
        if (me.taken) me.emit("error", { type: "unavailable-id" });
        else me.emit("open", me.id);
      }, 120);
    }
    connect(to, opts) {
      const cid = Math.random().toString(36).slice(2);
      const c = new Conn(cid, to, this.id, opts);
      setTimeout(() => {
        if (!c.open && !this.destroyed) this.emit("error", { type: "peer-unavailable" });
      }, 400);
      ch.postMessage({
        type: "conn",
        cid,
        from: this.id,
        to,
        opts: { label: c.label, reliable: c.reliable, serialization: c.serialization, metadata: c.metadata },
      });
      return c;
    }
    reconnect() {}
    destroy() {
      this.destroyed = true;
      peers.delete(this.id);
      ch.postMessage({ type: "gone", id: this.id });
      for (const c of conns.values()) if (c.owner === this.id) c.close();
    }
  }
  ch.onmessage = e => {
    const m = e.data;
    if (m.type === "who") {
      if (peers.has(m.id)) ch.postMessage({ type: "taken", id: m.id });
    }
    if (m.type === "taken") {
      const p = peers.get(m.id);
      if (p) p.taken = true;
    }
    if (m.type === "conn") {
      const p = peers.get(m.to);
      if (!p) return;
      const c = new Conn(m.cid, m.from, p.id, m.opts);
      p.emit("connection", c);
      ch.postMessage({ type: "ack", cid: m.cid, to: m.from });
      setTimeout(() => {
        c.open = true;
        c.emit("open");
      }, 20);
    }
    if (m.type === "ack") {
      const c = conns.get(m.cid + "|" + m.to);
      if (c) {
        c.open = true;
        c.emit("open");
      }
    }
    if (m.type === "data") {
      const c = conns.get(m.cid + "|" + m.to);
      if (c && c.open) c.emit("data", m.data);
    }
    if (m.type === "close") {
      const c = conns.get(m.cid + "|" + m.to);
      if (c && c.open) {
        c.open = false;
        c.emit("close");
      }
    }
    /* a closed tab takes its connections with it */
    if (m.type === "gone")
      for (const c of conns.values())
        if (c.peer === m.id && c.open) {
          c.open = false;
          c.emit("close");
        }
  };
  window.Peer = Peer;
})();
