(function () {
  // test double for PeerJS over BroadcastChannel
  const ch = new BroadcastChannel("fakepeer");
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
  class Conn extends Em {
    constructor(cid, peer, owner) {
      super();
      this.cid = cid;
      this.peer = peer;
      this.owner = owner;
      this.open = false;
      conns.set(cid + "|" + owner, this);
    }
    send(d) {
      ch.postMessage({ type: "data", cid: this.cid, to: this.peer, data: JSON.parse(JSON.stringify(d)) });
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
    connect(to) {
      const cid = Math.random().toString(36).slice(2);
      const c = new Conn(cid, to, this.id);
      this.pending = setTimeout(() => {
        if (!c.open) this.emit("error", { type: "peer-unavailable" });
      }, 400);
      ch.postMessage({ type: "conn", cid, from: this.id, to });
      return c;
    }
    reconnect() {}
    destroy() {
      this.destroyed = true;
      peers.delete(this.id);
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
      const c = new Conn(m.cid, m.from, p.id);
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
  };
  window.Peer = Peer;
  window.__pad = null;
  navigator.getGamepads = () => (window.__pad ? [window.__pad] : []);
})();
