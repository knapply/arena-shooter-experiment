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
  /* everything about the map's layout comes from its data document (data/maps.js) */
  const MAP = K.MAPS.ctf;
  CTF.MAP = MAP;
  CTF.FLAG_HOME = MAP.flags.map(p => new T.Vector3(p[0], p[1], p[2]));
  CTF.SPAWNS = MAP.spawns.teams.map(t => t.map(p => p.slice()));
  CTF.PICKUP_DEFS = MAP.pickups.map(p => ({
    id: p.id,
    type: K.WEAPON_DATA.findIndex(w => w.key === p.weapon),
    pos: new T.Vector3(p.p[0], p.p[1], p.p[2]),
    respawn: p.respawn,
  }));
  CTF.BOUNDS = Object.assign({}, MAP.bounds);

  let built = null;
  CTF.buildMap = function () {
    if (built) return built;
    const g = new T.Group();
    K.scene.add(g);
    const { solids } = K.buildMap(MAP, g);
    g.visible = false;
    built = { group: g, solids, arena: null };
    return built;
  };
  CTF.enterMap = function () {
    const m = CTF.buildMap();
    if (m.arena) return;
    K.resetDestruction();
    K.DESTR.onChange = b => CTF.NAV.patch(b);
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
    const m = built;
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

  /* lanes, team-relative: 0 = carrier's left wing, 1 = mid, 2 = right wing (mirrored so both teams describe the same geometry the same way) */
  CTF.worldLane = x => (x < -MAP.lanes.split ? 0 : x > MAP.lanes.split ? 2 : 1);
  CTF.relLane = (team, x) => {
    const w = CTF.worldLane(x);
    return team === 0 ? w : 2 - w;
  };
  CTF.LANE_NAMES = ["left", "mid", "right"];
  /* lane waypoint x for a team going on its own relative lane */
  CTF.laneX = (team, lane) => {
    const wx = MAP.lanes.x[lane];
    return team === 0 ? wx : -wx;
  };

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
