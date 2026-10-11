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
  CTF.FLAG_HOME = [new T.Vector3(0, 2.4, -43), new T.Vector3(0, 2.4, 43)];
  CTF.SPAWNS = [
    [
      [-6, 2.4, -45.5],
      [6, 2.4, -45.5],
      [-14, 0, -46],
      [14, 0, -46],
      [-19, 0, -38],
      [19, 0, -38],
      [-3, 2.4, -46.5],
      [3, 2.4, -46.5],
    ],
  ];
  /* power weapon: sniper on the cover block atop the mid tower, grabbable from the tower roof */
  CTF.PICKUP_DEFS = [{ id: "ctf-sniper", type: 2, pos: new T.Vector3(0, 4.2, 0), respawn: 90 }];
  CTF.SPAWNS.push(CTF.SPAWNS[0].map(([x, y, z]) => [-x, y, -z]));
  CTF.BOUNDS = { x0: -26, x1: 26, z0: -50, z1: 50 };

  let built = null;
  CTF.buildMap = function () {
    if (built) return built;
    const M = K.MATS;
    M.redStrip = new T.MeshBasicMaterial({ color: "#ff6a5c" });
    M.blueStrip = new T.MeshBasicMaterial({ color: "#5aa9ff" });
    M.redBase = new T.MeshStandardMaterial({ color: "#4d3d3c", roughness: 0.8, metalness: 0.1 });
    M.blueBase = new T.MeshStandardMaterial({ color: "#3a4654", roughness: 0.8, metalness: 0.1 });
    K.detailMat(M.redBase);
    K.detailMat(M.blueBase);
    M.redStrip.color.multiplyScalar(2.4);
    M.blueStrip.color.multiplyScalar(2.4);
    const g = new T.Group();
    K.scene.add(g);
    K.setMapGroup(g);
    const saved = K.SOLID.splice(0);
    const B = (cx, y0, cz, w, h, d, m) => K.box(cx, y0, cz, w, h, d, m);
    // S = place a part and its 180° rotated twin (same w/d under half-turn)
    const S = (cx, y0, cz, w, h, d, m) => {
      B(cx, y0, cz, w, h, d, m);
      if (cx !== 0 || cz !== 0) B(-cx, y0, -cz, w, h, d, m);
    };
    const ST = (x, z, dx, dz, n, top, w) => {
      K.stairs(x, z, dx, dz, n, top, w);
      K.stairs(-x, -z, -dx, -dz, n, top, w);
    };
    const TS = (cx, y, cz, w, d) => {
      K.strip(cx, y, cz, w, d, "redStrip");
      K.strip(-cx, y, -cz, w, d, "blueStrip");
    };
    // shell
    B(0, -1, 0, 56, 1, 104, "floor");
    B(0, 0, -51, 56, 7, 2, "wall");
    B(0, 0, 51, 56, 7, 2, "wall");
    B(-27, 0, 0, 2, 7, 104, "wall");
    B(27, 0, 0, 2, 7, 104, "wall");
    // bases (team tinted)
    B(0, 0, -42, 18, 2.4, 10, "redBase");
    B(0, 0, 42, 18, 2.4, 10, "blueBase");
    TS(0, 2.4, -37.05, 18, 0.1);
    TS(-8.95, 2.4, -42, 0.1, 10);
    TS(8.95, 2.4, -42, 0.1, 10);
    ST(5, -37, 0, 1, 6, 2.4, 3);
    ST(-5, -37, 0, 1, 6, 2.4, 3);
    S(11.5, 0, -42, 4, 1.2, 6, "step");
    S(-11.5, 0, -42, 4, 1.2, 6, "step");
    S(-5, 2.4, -39.6, 1.2, 1.2, 2.4, "cover");
    S(5, 2.4, -39.6, 1.2, 1.2, 2.4, "cover");
    S(-7.4, 2.4, -46, 1.6, 3, 1.6, "wall");
    S(7.4, 2.4, -46, 1.6, 3, 1.6, "wall");
    S(0, 0, -29.5, 6, 1.3, 1.2, "cover");
    S(-14, 0, -33, 1.2, 1.3, 4, "cover");
    S(14, 0, -33, 1.2, 1.3, 4, "cover");
    // lane dividers
    S(-10, 0, -18, 1.2, 3.6, 14, "wall");
    S(10, 0, -18, 1.2, 3.6, 14, "wall");
    S(-10, 0, -6.5, 1.2, 1.2, 3, "step");
    S(10, 0, -6.5, 1.2, 1.2, 3, "step");
    // mid tower
    B(0, 0, 0, 9, 3, 9, "core");
    B(0, 3, 0, 1.4, 1.2, 1.4, "cover");
    ST(0, 4.5, 0, 1, 7, 3, 3);
    S(-6.5, 0, 0, 2, 1.4, 5, "cover");
    S(6.5, 0, 0, 2, 1.4, 5, "cover");
    K.strip(0, 3, -4.45, 9, 0.1, "redStrip");
    K.strip(0, 3, 4.45, 9, 0.1, "blueStrip");
    // side catwalks along the outer walls
    B(-24.5, 0, 0, 3, 2.6, 22, "base");
    B(24.5, 0, 0, 3, 2.6, 22, "base");
    ST(-24.5, -11, 0, -1, 6, 2.6, 3);
    ST(24.5, -11, 0, -1, 6, 2.6, 3);
    K.strip(-23.05, 2.6, 0, 0.1, 22, "stripB");
    K.strip(23.05, 2.6, 0, 0.1, 22, "stripB");
    // lane cover
    S(-18, 0, -16, 3.2, 1.3, 1.2, "cover");
    S(18, 0, -22, 3.2, 1.3, 1.2, "cover");
    S(-18.5, 0, -27, 1.2, 1.3, 3.2, "cover");
    S(18.5, 0, -11, 1.2, 1.3, 3.2, "cover");
    S(0, 0, -15, 4, 1.3, 1.2, "cover");
    S(-4.5, 0, -21, 1.2, 2, 3, "cover");
    S(4.5, 0, -24, 1.2, 2, 3, "cover");
    // perch pillars (clamber via step blocks, pound launch points)
    S(-17, 0, -23.5, 2.4, 4.2, 2.4, "wall");
    S(-17, 0, -21.1, 2.4, 2, 2.4, "step");
    S(17, 0, -14, 2.4, 4.2, 2.4, "wall");
    S(17, 0, -16.4, 2.4, 2, 2.4, "step");
    const solids = K.SOLID.splice(0);
    K.SOLID.push(...saved);
    K.setMapGroup(K.ARENA_G);
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
  CTF.worldLane = x => (x < -9.5 ? 0 : x > 9.5 ? 2 : 1);
  CTF.relLane = (team, x) => {
    const w = CTF.worldLane(x);
    return team === 0 ? w : 2 - w;
  };
  CTF.LANE_NAMES = ["left", "mid", "right"];
  /* lane waypoint x for a team going on its own relative lane */
  CTF.laneX = (team, lane) => {
    const wx = [-18, 0, 18][lane];
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
