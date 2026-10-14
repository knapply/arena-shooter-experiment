/* ===== Team maps (Twin Foundry and the others), 180° rotationally symmetric. Team 0 (Red) holds -z, Team 1 (Blue) holds +z ===== */
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
  /* everything about a map's layout comes from its data document (data/maps.js). CTF.useMap(id) picks
     the map the next match is built on: Twin Foundry (flags, team spawns, lanes) for capture the flag,
     or the arena (no flags: both teams use its free-for-all spawns, kept apart by spawn safety) for the
     team deathmatch simulations. noFlags plays team deathmatch on a map that has flags. Everything
     below reads CTF.MAP, so it follows the choice. */
  CTF.useMap = function (id, mods, noFlags) {
    /* lab map mods (data/maps.js MAP_MODS) make their own document, with its own id */
    const doc = K.mapDoc(id, mods);
    if (!doc) throw new Error("no map " + id);
    CTF.FLAG_HOME = (noFlags ? [] : doc.flags || []).map(p => new T.Vector3(p[0], p[1], p[2]));
    if (CTF.MAP === doc) return;
    if (CTF.MAP && CTF.MAP !== doc) CTF.exitMap();
    CTF.MAP = doc;
    CTF.SPAWNS = doc.spawns.teams
      ? doc.spawns.teams.map(t => t.map(p => p.slice()))
      : [0, 1].map(() => doc.spawns.ffa.map(p => p.slice()));
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
    const m = CTF.buildMap();
    if (m.home) {
      /* the arena: nothing to swap, but the AI's grid follows its destruction */
      K.DESTR.onChange = b => CTF.NAV.patch(b);
      return;
    }
    if (m.arena) return;
    K.resetDestruction();
    K.DESTR.onChange = b => CTF.NAV.patch(b);
    if (K.sun) {
      const c = K.sun.shadow.camera;
      const B = CTF.MAP.bounds,
        hx = Math.max(-B.x0, B.x1) + 8,
        hz = Math.max(-B.z0, B.z1) + 8;
      c.left = -hx;
      c.right = hx;
      c.top = hz;
      c.bottom = -hz;
      c.updateProjectionMatrix();
    }
    m.arena = K.SOLID.splice(0);
    K.SOLID.push(...m.solids);
    K.ARENA_G.visible = false;
    m.group.visible = true;
  };
  CTF.exitMap = function () {
    const m = BUILT[CTF.MAP.id];
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
