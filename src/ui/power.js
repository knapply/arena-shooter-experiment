/* ============ POWER WEAPON CLARITY ============
   The power spawn's next weapon and its countdown on the HUD, a callout when an enemy picks up the
   sniper or rocket, and a mark over anyone holding one (red for enemies, white for allies), seen
   through walls. Modes supply their holders with EXT.powerHolders() ({ id, name, pos, h, key, enemy });
   the arena's are online players. A callout fires when a new holder appears, so it works the same
   offline, hosting and as an online client. */
const PW_KEYS = ["sniper", "rocket", "scatter"];
const pwKey = type => (WEAPON_DATA[type] ? WEAPON_DATA[type].key : "");
/* one canvas texture per weapon and side, shared by every mark */
const PW_TEX = new Map();
function pwTex(key, enemy) {
  const id = key + (enemy ? ":e" : ":a");
  let t = PW_TEX.get(id);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const x = c.getContext("2d");
  const col = enemy ? "#ff5a4a" : "#e8f4f8";
  x.fillStyle = "rgba(10,14,18,0.72)";
  x.strokeStyle = col;
  x.lineWidth = 7;
  /* a diamond with the weapon's initial, a little pointer underneath */
  x.beginPath();
  x.moveTo(64, 8);
  x.lineTo(112, 56);
  x.lineTo(64, 104);
  x.lineTo(16, 56);
  x.closePath();
  x.fill();
  x.stroke();
  x.fillStyle = col;
  x.font = "700 52px Chakra Petch, sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(key === "rocket" ? "R" : key === "scatter" ? "G" : "S", 64, 58);
  x.beginPath();
  x.moveTo(52, 112);
  x.lineTo(76, 112);
  x.lineTo(64, 126);
  x.closePath();
  x.fill();
  t = new THREE.CanvasTexture(c);
  PW_TEX.set(id, t);
  return t;
}
const PW_MARKS = [];
function pwMark(i) {
  let m = PW_MARKS[i];
  if (!m) {
    m = new THREE.Sprite(
      new THREE.SpriteMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: false,
      })
    );
    m.renderOrder = 10;
    m.scale.set(0.034, 0.034, 1);
    scene.add(m);
    PW_MARKS[i] = m;
  }
  return m;
}
/** the arena's holders: online players carrying a power weapon (everyone is an enemy in free for all) */
function arenaPowerHolders() {
  const out = [];
  for (const r of remotes.values()) {
    if (!r.has || r.dead || !r.rig) continue;
    const s = r.st | 0,
      w = (s & 40960) === 40960 ? 3 : s & 32768 ? 2 : 0;
    if (w >= 2)
      out.push({
        id: r.id,
        name: r.name,
        pos: r.rig.root.position,
        h: r.crouch ? H_CROUCH : H_STAND,
        key: pwKey(w),
        enemy: true,
      });
  }
  return out;
}
/** a callout when someone takes a power weapon: loud for an enemy, a line for an ally */
let pwCallT = 0;
function powerCallout(name, key, enemy) {
  const nm = key === "rocket" ? "rockets" : "the sniper";
  const el = $("callout");
  el.textContent = enemy ? `Enemy has ${nm}` : `${name} has ${nm}`;
  el.className = enemy ? "enemy" : "";
  el.style.opacity = "1";
  pwCallT = 2.6;
  if (enemy) {
    say(key === "rocket" ? "Enemy rockets" : "Enemy sniper", true);
    sfx("alarm", 0.5);
  }
  EVENTS.emit("powerTaken", { name, weapon: key, enemy: !!enemy });
}
let pwHudLast = "";
let pwPrev = new Set();
function updPower(dt) {
  pwCallT -= dt;
  if (pwCallT <= 0) $("callout").style.opacity = "0";
  /* the HUD timer: what the power spawn brings next, and when */
  let txt = "";
  if (playing || EXT) {
    for (const p of pickupList()) {
      if (!p.power || !PW_KEYS.includes(pwKey(p.type))) continue;
      const s = Math.ceil(p.availIn),
        nm = capWord(wName(p.type));
      txt +=
        (txt ? "  " : "") +
        (p.avail ? `${nm} up` : `${nm} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
    }
  }
  if (txt !== pwHudLast) {
    pwHudLast = txt;
    const el = $("powerT");
    el.hidden = !txt;
    el.textContent = txt ? "◆ " + txt : "";
  }
  /* marks over the holders */
  const list = playing || EXT ? (EXT && EXT.powerHolders ? EXT.powerHolders() : arenaPowerHolders()) : [];
  let n = 0;
  const cur = new Set();
  for (const h of list) {
    if (!PW_KEYS.includes(h.key)) continue;
    const id = h.id + ":" + h.key;
    cur.add(id);
    if (!pwPrev.has(id) && !paused) powerCallout(h.name, h.key, h.enemy);
    const m = pwMark(n++);
    m.material.map = pwTex(h.key, h.enemy);
    m.material.needsUpdate = m.material.map !== m.userData.map;
    m.userData.map = m.material.map;
    m.position.set(h.pos.x, h.pos.y + (h.h || H_STAND) + 0.55, h.pos.z);
    m.visible = true;
  }
  for (let i = n; i < PW_MARKS.length; i++) PW_MARKS[i].visible = false;
  pwPrev = cur;
}
onFrame(updPower, { menu: true });
