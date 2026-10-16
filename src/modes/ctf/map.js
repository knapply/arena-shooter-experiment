/* ===== CTF map: "Twin Foundry", 180° rotationally symmetric. Team 0 (Red) holds -z, Team 1 (Blue) holds +z ===== */
(function () {
  const K = window.KA,
    T = K.THREE;
  const CTF = (window.CTF = /** @type {CTFNamespace} */ ({}));
  CTF.TEAM_COLORS = [
    ["#ff6a5c", "#e8584b", "#ff8a70", "#d64a3e"],
    ["#5aa9ff", "#4a8fe0", "#7cc0ff", "#3f7ad0"],
  ];
  CTF.TEAM_NAMES = ["Red", "Blue"];
  CTF.TEAM_HEX = ["#ff6a5c", "#5aa9ff"];
  CTF.TEAM_INT = [0xff6a5c, 0x5aa9ff];
  /* free-for-all: every pilot is a team of one with a color of their own (the first two are the teams') */
  const PALETTE = [
    "#ff6a5c",
    "#5aa9ff",
    "#7ddc6a",
    "#ffc94a",
    "#c48bff",
    "#4fe0d2",
    "#ff8fc8",
    "#e2e8ec",
    "#ff9a3c",
    "#9fb4ff",
    "#b8e04a",
    "#ff5fa0",
  ];
  /** a team's color (any team index: in free-for-all every pilot is a team) */
  CTF.teamHex = t => PALETTE[(t | 0) % PALETTE.length];
  CTF.teamInt = t => parseInt(CTF.teamHex(t).slice(1), 16);
  /** the armor color of a team's k-th pilot: shades of the team color for red and blue */
  CTF.rigColor = (t, k) => (t < 2 ? CTF.TEAM_COLORS[t][k % 4] : CTF.teamHex(t));
  /* everything about a map's layout comes from its data document (data/maps.js). CTF.useMap(id) picks
     the map the next match is built on: Twin Foundry (flags, team spawns, lanes) or the arena (team
     spawns on opposite halves, no flags). Everything below reads CTF.MAP, so it follows the choice. */
  CTF.useMap = function (id, mods) {
    /* lab map mods (data/maps.js MAP_MODS) make their own document, with its own id */
    const doc = K.mapDoc(id, mods);
    if (!doc) throw new Error("no map " + id);
    if (CTF.MAP === doc) return;
    if (CTF.MAP && CTF.MAP !== doc) CTF.exitMap();
    CTF.MAP = doc;
    /** the map's MAPS key (for the event stream) */
    CTF.MAP_KEY = id;
    CTF.FLAG_HOME = (doc.flags || []).map(p => new T.Vector3(p[0], p[1], p[2]));
    CTF.SPAWNS = doc.spawns.teams
      ? doc.spawns.teams.map(t => t.map(p => p.slice()))
      : [0, 1].map(() => doc.spawns.ffa.map(p => p.slice()));
    /* free-for-all: the map's free-for-all spawns, or both teams' */
    CTF.FFA_SPAWNS = doc.spawns.ffa ? doc.spawns.ffa.map(p => p.slice()) : CTF.SPAWNS.flat();
    /* oddball: where the skull comes down (the map's ball point, else the middle) */
    CTF.BALL_HOME = new T.Vector3(...(doc.ball || [0, 0, 0]));
    /* the opening drop's spots for a team's n AI pilots (the last of its spawns; on a map without team
       spawns the two teams take alternate ones), so no two pods come down on one spot; the players
       pick from the rest */
    CTF.dropSpots = (team, n) => {
      const pts = doc.spawns.teams ? CTF.SPAWNS[team] : CTF.SPAWNS[team].filter((p, i) => i % 2 === team);
      return pts.slice(Math.max(0, pts.length - n));
    };
    CTF.PICKUP_DEFS = (doc.pickups || []).map(p => ({
      id: p.id,
      type: K.WEAPON_DATA.findIndex(w => w.key === p.weapon),
      pos: new T.Vector3(p.p[0], p.p[1], p.p[2]),
      respawn: p.respawn,
      rotate: !!p.rotate,
      weapon: p.weapon,
      lab: p.lab || null,
    }));
    CTF.BOUNDS = Object.assign({}, doc.bounds);
  };
  /** does the current map have flags (capture the flag) or not (team deathmatch)? */
  CTF.hasFlags = () => CTF.FLAG_HOME.length === 2;

  /* each map's built world, made once: Twin Foundry is built hidden and swapped in; the arena is the
     world that is already there */
  const BUILT = {};
  CTF.buildMap = function () {
    const id = CTF.MAP.id;
    if (BUILT[id]) return BUILT[id];
    if (id === "arena") {
      /* the arena as built (every cover box standing) */
      K.resetDestruction();
      return (BUILT[id] = { group: K.ARENA_G, solids: K.SOLID.slice(), arena: null, home: true });
    }
    const g = new T.Group();
    K.scene.add(g);
    const { solids } = K.buildMap(CTF.MAP, g);
    g.visible = false;
    return (BUILT[id] = { group: g, solids, arena: null });
  };
  CTF.enterMap = function () {
    /* pings and the kill feed name places from this map's callout zones */
    if (K.setPlayMap) K.setPlayMap(CTF.MAP);
    const m = CTF.buildMap();
    if (m.home) {
      /* the arena: nothing to swap, but the AI's grid follows its destruction */
      K.DESTR.onChange = b => CTF.NAV.patch(b);
      K.GATES.onNav = b => CTF.NAV.patch(b);
      return;
    }
    if (m.arena) return;
    K.resetDestruction();
    K.DESTR.onChange = b => CTF.NAV.patch(b);
    K.GATES.onNav = b => CTF.NAV.patch(b);
    if (K.sun) {
      const c = K.sun.shadow.camera;
      c.left = -34;
      c.right = 34;
      c.top = 58;
      c.bottom = -58;
      c.updateProjectionMatrix();
    }
    m.arena = K.SOLID.splice(0);
    K.SOLID.push(...m.solids);
    K.ARENA_G.visible = false;
    m.group.visible = true;
  };
  CTF.exitMap = function () {
    if (K.setPlayMap) K.setPlayMap(null);
    const m = BUILT[CTF.MAP.id];
    K.GATES.onNav = null;
    if (m && m.home) {
      K.DESTR.onChange = null;
      return;
    }
    if (!m || !m.arena) return;
    K.resetDestruction();
    K.DESTR.onChange = null;
    K.DESTR.bodies = null;
    K.DESTR.locked = false;
    if (K.sun) {
      const c = K.sun.shadow.camera;
      c.left = -42;
      c.right = 42;
      c.top = 42;
      c.bottom = -42;
      c.updateProjectionMatrix();
    }
    K.SOLID.splice(0);
    K.SOLID.push(...m.arena);
    m.arena = null;
    K.ARENA_G.visible = true;
    m.group.visible = false;
  };

  /* lanes, team-relative: 0 = carrier's left wing, 1 = mid, 2 = right wing (mirrored so both teams
     describe the same geometry the same way). A map without lanes is all "mid". */
  CTF.worldLane = x => {
    const L = CTF.MAP.lanes;
    return !L ? 1 : x < -L.split ? 0 : x > L.split ? 2 : 1;
  };
  CTF.relLane = (team, x) => {
    const w = CTF.worldLane(x);
    return team === 0 ? w : 2 - w;
  };
  CTF.LANE_NAMES = ["left", "mid", "right"];
  /* lane waypoint x for a team going on its own relative lane */
  CTF.laneX = (team, lane) => {
    const wx = CTF.MAP.lanes ? CTF.MAP.lanes.x[lane] : 0;
    return team === 0 ? wx : -wx;
  };
  /* oddball: the places on the current map the skull can come down (a 3 m lattice of walkable ground,
     cached per map): open sky above, room for the pod (level ground and standing room a metre round),
     6 m or more from every spawn, off the weapon pads, and fair: as far from one team's spawns as from the other's (within
     15%, and 15 m or more from both), or on a map whose teams share spawns, within half its half-width
     of the middle. Too few, and the map's listed balls (or its ball point) are used instead */
  const SKULL_SPOTS = new Map();
  CTF.skullSpots = function () {
    const doc = CTF.MAP,
      NAV = CTF.NAV;
    if (SKULL_SPOTS.has(doc.id)) return SKULL_SPOTS.get(doc.id);
    const mid = t => {
      const s = CTF.SPAWNS[t];
      let x = 0,
        z = 0;
      for (const p of s) {
        x += p[0];
        z += p[2];
      }
      return [x / s.length, z / s.length];
    };
    const c0 = mid(0),
      c1 = mid(1),
      split = Math.hypot(c0[0] - c1[0], c0[1] - c1[1]) > 10;
    const B = doc.bounds,
      mx = (B.x0 + B.x1) / 2,
      mz = (B.z0 + B.z1) / 2,
      half = Math.min(B.x1 - B.x0, B.z1 - B.z0) / 2;
    const spawns = CTF.FFA_SPAWNS.concat(CTF.SPAWNS.flat());
    const up = new T.Vector3(0, 1, 0),
      o = new T.Vector3(),
      out = [];
    for (let x = B.x0 + 1.5; x < B.x1; x += 3)
      for (let z = B.z0 + 1.5; z < B.z1; z += 3) {
        const c = NAV.cell(x, z);
        if (c < 0 || !NAV.ok[c]) continue;
        const p = NAV.pos(c);
        if (K.rayWorld(o.set(p.x, p.y + 2.2, p.z), up, 60) < 59) continue;
        let room = true;
        for (const [dx, dz] of [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ])
          if (
            Math.abs(K.groundBelow(p.x + dx, p.z + dz, p.y + 0.3, 0.05) - p.y) > 0.1 ||
            !K.freeAt(p.x + dx, p.y + 0.05, p.z + dz, K.H_STAND)
          ) {
            room = false;
            break;
          }
        if (
          !room ||
          spawns.some(s => Math.hypot(s[0] - p.x, s[2] - p.z) < 6) ||
          (doc.pickups || []).some(q => Math.hypot(q.p[0] - p.x, q.p[2] - p.z) < 3)
        )
          continue;
        const d0 = Math.hypot(p.x - c0[0], p.z - c0[1]),
          d1 = Math.hypot(p.x - c1[0], p.z - c1[1]);
        const fair = split
          ? Math.abs(d0 - d1) <= 0.15 * ((d0 + d1) / 2) && Math.min(d0, d1) >= 15
          : Math.hypot(p.x - mx, p.z - mz) <= half / 2;
        if (fair) out.push([p.x, p.y, p.z]);
      }
    const list = out.length >= 4 ? out : doc.balls || [doc.ball || [0, 0, 0]];
    SKULL_SPOTS.set(doc.id, list);
    return list;
  };
  CTF.useMap("ctf");

  /* flag visuals */
  CTF.makeFlag = function (team) {
    const col = CTF.TEAM_HEX[team];
    const g = new T.Group();
    const pole = new T.Mesh(
      new T.CylinderGeometry(0.035, 0.035, 2.1, 8),
      new T.MeshStandardMaterial({ color: "#cfd8dc", metalness: 0.8, roughness: 0.3 })
    );
    pole.position.y = 1.05;
    g.add(pole);
    const clothGeo = new T.PlaneGeometry(0.95, 0.6, 10, 4);
    clothGeo.translate(0.475, 0, 0);
    const cloth = new T.Mesh(
      clothGeo,
      new T.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.35,
        side: T.DoubleSide,
        roughness: 0.6,
      })
    );
    cloth.position.y = 1.75;
    g.add(cloth);
    const base0 = clothGeo.attributes.position.array.slice();
    const glow = new T.Sprite(
      new T.SpriteMaterial({
        color: col,
        transparent: true,
        opacity: 0.55,
        blending: T.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.scale.set(1.6, 1.6, 1);
    glow.position.y = 1.4;
    g.add(glow);
    const beam = new T.Mesh(
      new T.CylinderGeometry(0.12, 0.12, 40, 8, 1, true),
      new T.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: T.AdditiveBlending,
      })
    );
    beam.position.y = 21;
    g.add(beam);
    const stand = new T.Mesh(
      new T.CylinderGeometry(0.9, 1.05, 0.12, 24),
      new T.MeshStandardMaterial({ color: "#2a3236", emissive: col, emissiveIntensity: 0.25 })
    );
    const ring = new T.Mesh(
      new T.RingGeometry(0.95, 1.1, 32),
      new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: T.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    const home = new T.Group();
    stand.position.y = 0.06;
    ring.position.y = 0.13;
    home.add(stand, ring);
    home.position.copy(CTF.FLAG_HOME[team]);
    K.scene.add(home);
    K.scene.add(g);
    return {
      group: g,
      home,
      beam,
      glow,
      animate(t, carried) {
        const a = clothGeo.attributes.position;
        for (let i = 0; i < a.count; i++) {
          const x = base0[i * 3];
          const w = Math.sin(t * (carried ? 11 : 5) + x * 5) * 0.09 * x;
          a.setZ(i, base0[i * 3 + 2] + w);
          a.setY(i, base0[i * 3 + 1] - (carried ? x * 0.12 : 0));
        }
        a.needsUpdate = true;
        glow.material.opacity = 0.4 + 0.2 * Math.sin(t * 4);
        beam.visible = !carried;
      },
      dispose() {
        K.scene.remove(g);
        K.scene.remove(home);
      },
    };
  };
})();
