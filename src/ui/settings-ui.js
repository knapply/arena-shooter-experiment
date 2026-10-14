/* ============ settings screen ============ */
const T_KEYS = "Keys";
const STABS = [T_GFX, T_CTL, T_KEYS, T_PAD, T_GAME, T_MODE, T_SBX, T_LAB, T_AUD, T_DES];
/** q: the search box (empty shows the current tab) */
const SUI = { tab: T_GFX, from: "menu", padCap: null, q: "" };
const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};
function setMsg(t, bad) {
  const m = $("setMsg");
  m.textContent = t || "";
  m.classList.toggle("bad", !!bad);
}
/** from: "menu" or "pause"; tab and focus: open on a tab with one setting focused (a mode's rules) */
function openSettings(from, tab, focus) {
  SUI.from = from;
  if (tab) {
    SUI.tab = tab;
    SUI.q = "";
    $("setSearch").value = "";
  }
  $("settings").hidden = false;
  (from === "pause" ? $("pause") : $("menu")).hidden = true;
  renderSettings();
  setMsg("");
  $("setIO").hidden = true;
  const f = /** @type {HTMLElement} */ (
    (focus && $("set_" + focus)) || $("settings").querySelector(".stab[aria-selected=true]")
  );
  if (f) {
    f.focus();
    if (focus && f.scrollIntoView) f.scrollIntoView({ block: "center" });
  }
}
/* dragging a slider changes a setting many times a second: save once it settles (closing the
   panel or the page saves straight away) */
let saveSoonT = 0;
function saveSoon() {
  clearTimeout(saveSoonT);
  saveSoonT = setTimeout(saveSettings, 300);
}
function saveNow() {
  clearTimeout(saveSoonT);
  saveSettings();
}
addEventListener("pagehide", saveNow);
function closeSettings() {
  rebindCapture = null;
  SUI.padCap = null;
  saveNow();
  $("settings").hidden = true;
  (SUI.from === "pause" ? $("pause") : $("menu")).hidden = false;
  renderKeyHelp();
}
function onSetChange(s) {
  if (s.tab === T_GFX && s.k !== "preset" && PRESET_KEYS.includes(s.k) && SET.preset !== "custom") {
    SET.preset = "custom";
    const ps = $("set_preset");
    if (ps) ps.value = "custom";
  }
  applySettings();
  saveSoon();
}
function renderSettings() {
  const tabs = $("setTabs");
  tabs.textContent = "";
  for (const t of STABS) {
    const b = el("button", "stab", t);
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(t === SUI.tab));
    b.onclick = () => {
      /* picking a tab leaves the search */
      SUI.q = "";
      $("setSearch").value = "";
      SUI.tab = t;
      rebindCapture = null;
      SUI.padCap = null;
      renderSettings();
    };
    tabs.appendChild(b);
  }
  const body = $("setBody");
  body.textContent = "";
  if (SUI.q.trim()) {
    renderSearch(body);
    return;
  }
  if (SUI.tab === T_KEYS) {
    renderKeys(body);
    return;
  }
  for (const s of SCHEMA) if (s.tab === SUI.tab) settingRow(s, body, false);
  if (SUI.tab === T_PAD) renderPadBinds(body);
}
/** does every word of the search appear in this text? */
function searchHit(text) {
  const t = text.toLowerCase();
  return SUI.q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(w => t.includes(w));
}
/** search results: matching settings from every tab (each tagged with its tab), then matching key bindings */
function renderSearch(body) {
  const hits = SCHEMA.filter(s => searchHit([s.label, s.desc || "", s.tab, s.k].join(" ")));
  const keys = ACTIONS.filter(([a, label]) => searchHit(label + " " + a + " keys bind"));
  body.appendChild(
    el(
      "p",
      "sdesc",
      hits.length + keys.length
        ? `${hits.length + keys.length} match${hits.length + keys.length === 1 ? "" : "es"} for “${SUI.q.trim()}”`
        : `Nothing matches “${SUI.q.trim()}”.`
    )
  );
  for (const s of hits) settingRow(s, body, true);
  for (const [, label] of keys) {
    const row = el("div", "srow");
    row.appendChild(el("span", "stag", T_KEYS));
    row.appendChild(el("span", "slab", label));
    const b = el("button", "dbtn", "Change in Keys");
    b.onclick = () => {
      SUI.q = "";
      $("setSearch").value = "";
      SUI.tab = T_KEYS;
      renderSettings();
    };
    row.appendChild(b);
    body.appendChild(row);
  }
}
/** one setting's row (label, control, value, description); showTab tags it with its tab for search results */
function settingRow(s, body, showTab) {
  {
    const row = el("div", "srow");
    if (showTab) row.appendChild(el("span", "stag", s.tab));
    const lab = el("label", "slab", s.label);
    lab.htmlFor = "set_" + s.k;
    row.appendChild(lab);
    let ctl,
      val = null;
    if (s.type === "range") {
      ctl = el("input");
      ctl.type = "range";
      ctl.min = s.min;
      ctl.max = s.max;
      ctl.step = s.step;
      ctl.value = SET[s.k];
      val = el("output", "sval", s.fmt ? s.fmt(SET[s.k]) : String(SET[s.k]));
      ctl.oninput = () => {
        SET[s.k] = +ctl.value;
        val.textContent = s.fmt ? s.fmt(SET[s.k]) : ctl.value;
        onSetChange(s);
      };
    } else if (s.type === "toggle") {
      ctl = el("input");
      ctl.type = "checkbox";
      ctl.checked = !!SET[s.k];
      ctl.onchange = () => {
        SET[s.k] = ctl.checked;
        onSetChange(s);
      };
    } else {
      ctl = el("select");
      for (const [v, t] of s.opts) {
        const o = el("option", null, t);
        o.value = v;
        ctl.appendChild(o);
      }
      ctl.value = SET[s.k];
      ctl.onchange = () => {
        SET[s.k] = ctl.value;
        if (s.k === "preset" && ctl.value !== "custom") {
          applyPreset(ctl.value);
          applySettings();
          saveSettings();
          renderSettings();
          return;
        }
        onSetChange(s);
      };
    }
    ctl.id = "set_" + s.k;
    row.appendChild(ctl);
    if (val) row.appendChild(val);
    if (s.desc) row.appendChild(el("p", "sdesc", s.desc));
    body.appendChild(row);
  }
}
function renderKeys(body) {
  body.appendChild(
    el(
      "p",
      "sdesc",
      "Click a slot, then press a key, mouse button or scroll the wheel. Backspace clears the slot, Escape cancels. A key used elsewhere moves to the new action."
    )
  );
  const grid = el("div", "kgrid");
  for (const [a, label] of ACTIONS) {
    grid.appendChild(el("span", "klab", label));
    for (let slot = 0; slot < 2; slot++) {
      const code = (BIND[a] || [])[slot];
      const b = el("button", "kbtn", keyLabel(code));
      b.dataset.a = a;
      b.onclick = () => {
        b.textContent = "Press a key…";
        b.classList.add("cap");
        setMsg("");
        setTimeout(() => {
          rebindCapture = (c, e) => {
            if (e && e.preventDefault) e.preventDefault();
            rebindCapture = null;
            if (c === "Escape") {
              renderSettings();
              return;
            }
            const list = (BIND[a] || []).slice();
            if (c === "Backspace" || c === "Delete") {
              list.splice(slot, 1);
              BIND[a] = list;
            } else if (CODE_RE.test(c)) {
              let moved = null;
              for (const [o] of ACTIONS) {
                if (o === a) continue;
                const i = (BIND[o] || []).indexOf(c);
                if (i >= 0) {
                  BIND[o].splice(i, 1);
                  moved = o;
                }
              }
              list[slot] = c;
              BIND[a] = list
                .filter(Boolean)
                .filter((x, i, arr) => arr.indexOf(x) === i)
                .slice(0, 2);
              if (moved) setMsg(`${keyLabel(c)} moved from “${ACTIONS.find(x => x[0] === moved)[1]}”.`);
            } else setMsg("That key can't be bound.", true);
            rebuildCodeMap();
            saveSettings();
            renderSettings();
          };
        }, 0);
      };
      grid.appendChild(b);
    }
  }
  body.appendChild(grid);
}
function renderPadBinds(body) {
  body.appendChild(el("h3", "ssub", "Controller buttons"));
  body.appendChild(el("p", "sdesc", "Select an action, then press a controller button. Menu always pauses."));
  const grid = el("div", "kgrid pad");
  for (const [a, label] of ACTIONS) {
    if (a === "weapon1" || a === "weapon2") continue;
    grid.appendChild(el("span", "klab", label));
    const cur = (PADB[a] || []).map(i => PAD_NAMES[i]).join(" / ") || "Unbound";
    const b = el("button", "kbtn wide", SUI.padCap === a ? "Press a button…" : cur);
    if (SUI.padCap === a) b.classList.add("cap");
    b.onclick = () => {
      SUI.padCap = a;
      setMsg(pad.on ? "" : "Connect a controller to remap it.", !pad.on);
      renderSettings();
    };
    grid.appendChild(b);
  }
  body.appendChild(grid);
}
function padCapture() {
  if (!SUI.padCap || $("settings").hidden) return;
  for (let i = 0; i < 17; i++) {
    if (i === GPB.MENU || !gpDown(i)) continue;
    const a = SUI.padCap;
    SUI.padCap = null;
    for (const [o] of ACTIONS) {
      if (o !== a && PADB[o]) {
        PADB[o] = PADB[o].filter(x => x !== i);
      }
    }
    PADB[a] = [i];
    saveSettings();
    renderSettings();
    setMsg(`${PAD_NAMES[i]} → ${ACTIONS.find(x => x[0] === a)[1]}`);
    return;
  }
}
$("setDone").onclick = closeSettings;
$("setReset").onclick = () => {
  const t = SUI.tab;
  if (t === T_KEYS) BIND = JSON.parse(JSON.stringify(DEF_BIND));
  else {
    for (const s of SCHEMA) if (s.tab === t) SET[s.k] = s.def;
    if (t === T_PAD) PADB = JSON.parse(JSON.stringify(DEF_PAD));
    if (t === T_GFX) applyPreset("high");
  }
  applySettings();
  saveSettings();
  renderSettings();
  setMsg(`${t} reset to defaults.`);
};
$("setExport").onclick = async () => {
  const text = exportSettings();
  $("setIO").hidden = false;
  $("setText").value = text;
  let saved = false;
  try {
    const dl = await window.KAHOST.use("downloads");
    if (dl) {
      await dl.save({ filename: "kinetic-arena-settings.json", data: text });
      saved = true;
    }
  } catch (e) {
    if (e && e.code === "declined") {
      setMsg("Download cancelled. The settings are in the box below to copy.");
      return;
    }
  }
  setMsg(saved ? "Settings file saved." : "Copy the settings below, or use Copy.");
};
$("setImport").onclick = () => {
  $("setIO").hidden = false;
  $("setText").value = "";
  $("setText").focus();
  setMsg("Paste settings below and press Apply, or choose a file.");
};
$("setCopy").onclick = () => {
  const t = $("setText");
  try {
    const p = navigator.clipboard.writeText(t.value);
    if (p && p.then)
      p.then(
        () => setMsg("Copied."),
        () => {
          t.select();
          setMsg("Select-all is on. Press Ctrl+C to copy.");
        }
      );
  } catch (e) {
    t.select();
    setMsg("Select-all is on. Press Ctrl+C to copy.");
  }
};
$("setApply").onclick = () => {
  const r = importSettings($("setText").value);
  setMsg(r.msg, !r.ok);
  if (r.ok) renderSettings();
};
$("setFile").onchange = e => {
  const inp = /** @type {HTMLInputElement} */ (e.target);
  const f = inp.files && inp.files[0];
  if (!f) return;
  if (f.size > 200000) {
    setMsg("That file is too large to be a settings file.", true);
    return;
  }
  const rd = new FileReader();
  rd.onload = () => {
    $("setText").value = String(rd.result);
    const r = importSettings(rd.result);
    setMsg(r.msg, !r.ok);
    if (r.ok) renderSettings();
  };
  rd.readAsText(f);
  inp.value = "";
};
addEventListener(
  "mousedown",
  e => {
    if (rebindCapture) {
      e.preventDefault();
      e.stopPropagation();
      rebindCapture("Mouse" + e.button, e);
    }
  },
  true
);
$("setSearch").addEventListener("input", () => {
  SUI.q = $("setSearch").value;
  renderSettings();
});
$("openSet").onclick = () => openSettings("menu");
/* the trailer is a recorded video (tools/record-trailer.js), not part of the game: served pages
   play the copy next to index.html, a file opened from disk plays the published one */
$("trailerBtn").onclick = () =>
  window.open(
    (location.protocol === "file:" ? "https://knapply.github.io/arena-shooter-experiment/" : "") +
      "media/trailer.mp4",
    "_blank",
    "noopener"
  );
$("pauseSet").onclick = () => openSettings("pause");
addEventListener("keydown", e => {
  if (e.code === "Escape" && !$("settings").hidden && !rebindCapture) {
    e.preventDefault();
    /* Escape clears a search first, then closes */
    if (SUI.q) {
      SUI.q = "";
      $("setSearch").value = "";
      renderSettings();
    } else closeSettings();
  }
});
/* the help list on the menu always shows the player's current bindings */
function renderKeyHelp() {
  const box = $("keysDesk");
  if (!box) return;
  box.textContent = "";
  /** @type {[string[], string][]} */
  const rows = [
    [["forward", "left", "back", "right"], "Move · mouse to look"],
    [["sprint"], "Sprint (delays shield recharge)"],
    [["thrust"], "Thruster dash"],
    [["crouch"], "Crouch · slide · ground pound held in the air"],
    [["jump"], "Jump · hold forward at a ledge to clamber"],
    [["aim"], "Aim · stabilize in the air"],
    [["fire", "reload"], "Fire · reload"],
    [["melee"], "Melee · charge after sprinting"],
    [["weapon1", "weapon2", "swapWeapon"], "Weapon slots · switch"],
    [["grenade", "swapNade"], "Grenade · swap type"],
    [["roster"], "Roster"],
    [["switchTeam"], "Switch team in CTF"],
  ];
  for (const [acts, txt] of rows) {
    box.appendChild(
      el("kbd", null, acts.map(a => ((BIND[a] || [])[0] ? keyLabel(BIND[a][0]) : "—")).join(" "))
    );
    box.appendChild(el("span", null, txt));
  }
}

const hudHook = () => {
  document.documentElement.style.setProperty("--xh", SET.xhColor);
  $("xh").style.scale = String(SET.xhSize);
  /* the motion tracker's corner and size (styles/base.css: body[data-trk], --trk) */
  document.body.dataset.trk = SET.trackerPos;
  document.documentElement.style.setProperty(
    "--trk",
    Math.round(200 * SET.trackerSize * SET.hudScale) + "px"
  );
  for (const s of [".vitals", ".ammo", ".kit", "#medals", ".status", "#feed"])
    for (const e of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(s)))
      e.style.zoom = String(SET.hudScale);
  if (master) master.gain.value = SET.master * SET.sfx;
};
for (const m of [flashMat, shardMat, plasMat, glowMat]) m.map = SOFT;
flashSprite.material.map = STAR;
vmRoot.traverse(o => {
  if (o.isSprite && o !== flashSprite) o.material.map = SOFT;
});
[flashMat, shardMat, plasMat, glowMat].forEach(m => (m.needsUpdate = true));
SET_HOOKS.push(applyGfx, hudHook);
gfxReady = true;
applySettings();
renderKeyHelp();
makeBots();
function hideBots() {
  for (const b of bots) {
    b.rig.root.visible = false;
  }
  for (const r of remotes.values()) if (r.rig) r.rig.root.visible = false;
}
function showWorld() {
  for (const b of bots) b.rig.root.visible = !b.body.dead;
  for (const r of remotes.values()) if (r.rig) r.rig.root.visible = !r.dead;
}
function extPlay(ext, opts) {
  EXT = ext;
  audio();
  VO.on = $("vo").checked;
  myName = ($("callsign").value || "Pilot").trim().slice(0, 14) || "Pilot";
  savePrefs();
  myArmor = (opts && opts.color) || myColor;
  vmArmor.color.set(myArmor).multiplyScalar(0.55);
  hideBots();
  if (document.activeElement) /** @type {HTMLElement} */ (document.activeElement).blur();
  playing = true;
  paused = false;
  reloadT = 0;
  prevReload = 0;
  refill();
  kills = 0;
  deaths = 0;
  streak = 0;
  multi = 0;
  firstBlood = false;
  lastKiller = null;
  feed.length = 0;
  renderFeed();
  me.reset();
  if (EXT.respawn) EXT.respawn();
  $("dead").hidden = true;
  $("menu").hidden = true;
  $("hud").hidden = false;
  if (isTouch) $("touch").hidden = false;
  else if (!padRecent()) lock();
}
function extFull(ext) {
  EXT = ext;
  audio();
  VO.on = $("vo").checked;
  hideBots();
  playing = false;
  $("menu").hidden = true;
  vmRoot.visible = false;
}
function extStop() {
  if (playing) {
    leaveGame();
    return;
  }
  if (EXT) {
    const e = EXT;
    EXT = null;
    if (e.exit) e.exit();
  }
  showWorld();
  $("menu").hidden = false;
  camera.fov = 78;
  camera.updateProjectionMatrix();
  camera.rotation.z = 0;
  try {
    if (hasTTS) speechSynthesis.cancel();
  } catch (e) {}
}
