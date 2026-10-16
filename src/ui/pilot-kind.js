/* ============ WHO IS A PLAYER: one marker for real players, AI and you, wherever a name shows ============
   Real players: a ◆ before the name, in warm white. AI: muted, with an "AI" tag after the name. You:
   bright mint and "you". Never colour alone: the glyph and the tag carry it for colour-blind players.
   Nameplates over heads (rig.setLabel), the kill feed, the roster and results table, the room lobby
   and ping callouts all use it. */
const PK = {
  human: { color: "#ffe6a3", glyph: "◆" },
  ai: { color: "#9db0b8", tag: "AI" },
  you: { color: "#7ef0c2", tag: "you" },
};
/** what a pilot id is: "you", "human", "ai", or "" for no one (a fall, the world).
    Ids: local (you), peer:<id> or h:<id> (people online), bot:<n> and ctf:<id> or a bare agent id (AI) */
function pilotKind(id) {
  const s = String(id == null ? "" : id);
  if (!s || s === "world") return "";
  if (s === "local" || s === "h:local") return "you";
  if (s.startsWith("peer:") || s.startsWith("h:")) return "human";
  return "ai";
}
/** a name as plain text with its marker: "◆ Kestrel", "Vex · AI", "Kestrel (you)" */
function pilotText(name, kind) {
  if (kind === "human") return `${PK.human.glyph} ${name}`;
  if (kind === "ai") return `${name} · ${PK.ai.tag}`;
  if (kind === "you") return `${name} (${PK.you.tag})`;
  return String(name);
}
/** a name as a node: <span class="pk pk-human"><i>◆</i>Kestrel</span>, <span class="pk pk-ai">Vex<i>AI</i></span> */
function pilotName(name, kind) {
  const s = document.createElement("span");
  s.className = "pk" + (kind ? " pk-" + kind : "");
  if (kind === "human") {
    const g = document.createElement("i");
    g.className = "pkg";
    g.textContent = PK.human.glyph;
    g.setAttribute("aria-hidden", "true");
    s.append(g, String(name));
    s.title = "Player";
  } else if (kind === "ai" || kind === "you") {
    const t = document.createElement("i");
    t.className = "pkt";
    t.textContent = PK[kind].tag;
    s.append(String(name), t);
    s.title = kind === "ai" ? "AI pilot" : "You";
  } else s.textContent = String(name);
  return s;
}
