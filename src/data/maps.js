/* ============ MAPS: every map is a data document ============
   A map is plain data (it could be a JSON file): versioned, with a stable id on every piece, so a
   future map editor, map files and the network can refer to pieces by id. Piece types:
     box     { p: [centerX, bottomY, centerZ], s: [width, height, depth], mat }   (mat "cover" is destructible)
     stairs  { p: [x, z], dir: [dx, dz], steps, top, width }                       (rises toward p)
     strip   { p: [x, y, z], s: [width, depth], mat }                              (glowing trim, no collision)
   twin: true adds the piece's 180° rotated copy (id + "~"), for symmetric team maps; twinMat
   gives the copy a different material (team colors). validateMap() (data/map-check.js, in the
   simulation bundle and the tests) checks a document strictly and buildMap() turns one into
   geometry; navigation is built from the result automatically. */
const MAP_SCHEMA = 1;
const MAPS = {};
MAPS.arena = {
  schema: 1,
  id: "arena",
  name: "Proving Grounds",
  bounds: { x0: -37, x1: 37, z0: -37, z1: 37 },
  pieces: [
    { id: "floor1", type: "box", mat: "floor", p: [0, -1, 0], s: [84, 1, 84] },
    { id: "wall2", type: "box", mat: "wall", p: [0, 0, -37], s: [76, 7, 2] },
    { id: "wall3", type: "box", mat: "wall", p: [0, 0, 37], s: [76, 7, 2] },
    { id: "wall4", type: "box", mat: "wall", p: [-37, 0, 0], s: [2, 7, 76] },
    { id: "wall5", type: "box", mat: "wall", p: [37, 0, 0], s: [2, 7, 76] },
    { id: "b6", type: "box", mat: "core", p: [0, 0, 0], s: [10, 3.2, 10] },
    { id: "trim7", type: "strip", mat: "strip", p: [0, 3.2, -4.95], s: [10, 0.1] },
    { id: "trim8", type: "strip", mat: "strip", p: [0, 3.2, 4.95], s: [10, 0.1] },
    { id: "cover9", type: "box", mat: "cover", p: [0, 3.2, 0], s: [1.4, 1.3, 1.4] },
    { id: "stairs10", type: "stairs", p: [0, 5], dir: [0, 1], steps: 8, top: 3.2, width: 3 },
    { id: "stairs11", type: "stairs", p: [0, -5], dir: [0, -1], steps: 8, top: 3.2, width: 3 },
    { id: "b12", type: "box", mat: "base", p: [6.6, 0, 0], s: [3.2, 5.2, 3.2] },
    { id: "b13", type: "box", mat: "base", p: [-6.6, 0, 0], s: [3.2, 5.2, 3.2] },
    { id: "trim14", type: "strip", mat: "stripB", p: [6.6, 5.2, 0], s: [3.2, 3.2] },
    { id: "trim15", type: "strip", mat: "stripB", p: [-6.6, 5.2, 0], s: [3.2, 3.2] },
    { id: "b16", type: "box", mat: "base", p: [24, 0, 24], s: [10, 2.6, 10] },
    { id: "cover17", type: "box", mat: "cover", p: [27.6, 2.6, 27.6], s: [2.8, 1.2, 2.8] },
    { id: "stairs18", type: "stairs", p: [19, 24], dir: [-1, 0], steps: 6, top: 2.6, width: 3 },
    { id: "trim19", type: "strip", mat: "strip", p: [19.05, 2.6, 24], s: [0.1, 10] },
    { id: "b20", type: "box", mat: "base", p: [-24, 0, 24], s: [10, 2.6, 10] },
    { id: "cover21", type: "box", mat: "cover", p: [-27.6, 2.6, 27.6], s: [2.8, 1.2, 2.8] },
    { id: "stairs22", type: "stairs", p: [-19, 24], dir: [1, 0], steps: 6, top: 2.6, width: 3 },
    { id: "trim23", type: "strip", mat: "strip", p: [-19.05, 2.6, 24], s: [0.1, 10] },
    { id: "b24", type: "box", mat: "base", p: [24, 0, -24], s: [10, 2.6, 10] },
    { id: "cover25", type: "box", mat: "cover", p: [27.6, 2.6, -27.6], s: [2.8, 1.2, 2.8] },
    { id: "stairs26", type: "stairs", p: [19, -24], dir: [-1, 0], steps: 6, top: 2.6, width: 3 },
    { id: "trim27", type: "strip", mat: "strip", p: [19.05, 2.6, -24], s: [0.1, 10] },
    { id: "b28", type: "box", mat: "base", p: [-24, 0, -24], s: [10, 2.6, 10] },
    { id: "cover29", type: "box", mat: "cover", p: [-27.6, 2.6, -27.6], s: [2.8, 1.2, 2.8] },
    { id: "stairs30", type: "stairs", p: [-19, -24], dir: [1, 0], steps: 6, top: 2.6, width: 3 },
    { id: "trim31", type: "strip", mat: "strip", p: [-19.05, 2.6, -24], s: [0.1, 10] },
    { id: "cover32", type: "box", mat: "cover", p: [0, 0, 18], s: [7, 2.5, 2] },
    { id: "cover33", type: "box", mat: "cover", p: [0, 0, -18], s: [7, 2.5, 2] },
    { id: "cover34", type: "box", mat: "cover", p: [18, 0, 0], s: [2, 2.5, 7] },
    { id: "cover35", type: "box", mat: "cover", p: [-18, 0, 0], s: [2, 2.5, 7] },
    { id: "cover36", type: "box", mat: "cover", p: [13, 0, 13], s: [4, 1.3, 1.2] },
    { id: "cover37", type: "box", mat: "cover", p: [15.5, 0, 11], s: [1.2, 1.3, 3] },
    { id: "cover38", type: "box", mat: "cover", p: [-13, 0, 13], s: [4, 1.3, 1.2] },
    { id: "cover39", type: "box", mat: "cover", p: [-15.5, 0, 11], s: [1.2, 1.3, 3] },
    { id: "cover40", type: "box", mat: "cover", p: [13, 0, -13], s: [4, 1.3, 1.2] },
    { id: "cover41", type: "box", mat: "cover", p: [15.5, 0, -11], s: [1.2, 1.3, 3] },
    { id: "cover42", type: "box", mat: "cover", p: [-13, 0, -13], s: [4, 1.3, 1.2] },
    { id: "cover43", type: "box", mat: "cover", p: [-15.5, 0, -11], s: [1.2, 1.3, 3] },
    { id: "wall44", type: "box", mat: "wall", p: [29, 0, 0], s: [3, 6, 3] },
    { id: "wall45", type: "box", mat: "wall", p: [-29, 0, 0], s: [3, 6, 3] },
    { id: "wall46", type: "box", mat: "wall", p: [0, 0, 29], s: [3, 6, 3] },
    { id: "wall47", type: "box", mat: "wall", p: [0, 0, -29], s: [3, 6, 3] },
    { id: "b48", type: "box", mat: "step", p: [26.9, 0, 0], s: [1.2, 2.2, 3] },
    { id: "b49", type: "box", mat: "step", p: [-26.9, 0, 0], s: [1.2, 2.2, 3] },
    { id: "b50", type: "box", mat: "step", p: [0, 0, 26.9], s: [3, 2.2, 1.2] },
    { id: "b51", type: "box", mat: "step", p: [0, 0, -26.9], s: [3, 2.2, 1.2] },
    { id: "b52", type: "box", mat: "base", p: [10, 0, -34.5], s: [10, 2.4, 3] },
    { id: "b53", type: "box", mat: "base", p: [-10, 0, 34.5], s: [10, 2.4, 3] },
    { id: "b54", type: "box", mat: "base", p: [34.5, 0, 10], s: [3, 2.4, 10] },
    { id: "b55", type: "box", mat: "base", p: [-34.5, 0, -10], s: [3, 2.4, 10] },
    /* more structure: matching balconies on the other side walls, and slabs that break the long
       east-west sightlines past the core */
    { id: "balcony1", type: "box", mat: "base", p: [-10, 0, -34.5], s: [10, 2.4, 3] },
    { id: "balcony2", type: "box", mat: "base", p: [10, 0, 34.5], s: [10, 2.4, 3] },
    { id: "balcony3", type: "box", mat: "base", p: [34.5, 0, -10], s: [3, 2.4, 10] },
    { id: "balcony4", type: "box", mat: "base", p: [-34.5, 0, 10], s: [3, 2.4, 10] },
    { id: "slab1", type: "box", mat: "wall", p: [13, 0, 0], s: [0.8, 3.5, 4] },
    { id: "slab2", type: "box", mat: "wall", p: [-13, 0, 0], s: [0.8, 3.5, 4] },
    /* destructible crate clusters on the outer lanes, and barricades across the mid lanes */
    { id: "crate1", type: "box", mat: "cover", p: [26, 0, -12], s: [1.6, 1.6, 1.6] },
    { id: "crate2", type: "box", mat: "cover", p: [27.7, 0, -11.5], s: [1.2, 1.2, 1.2] },
    { id: "crate3", type: "box", mat: "cover", p: [25.6, 0, -10.1], s: [2.2, 0.9, 1.0] },
    { id: "crate4", type: "box", mat: "cover", p: [12, 0, 26], s: [1.6, 1.6, 1.6] },
    { id: "crate5", type: "box", mat: "cover", p: [11.5, 0, 27.7], s: [1.2, 1.2, 1.2] },
    { id: "crate6", type: "box", mat: "cover", p: [10.1, 0, 25.6], s: [1.0, 0.9, 2.2] },
    { id: "crate7", type: "box", mat: "cover", p: [-26, 0, 12], s: [1.6, 1.6, 1.6] },
    { id: "crate8", type: "box", mat: "cover", p: [-27.7, 0, 11.5], s: [1.2, 1.2, 1.2] },
    { id: "crate9", type: "box", mat: "cover", p: [-25.6, 0, 10.1], s: [2.2, 0.9, 1.0] },
    { id: "crate10", type: "box", mat: "cover", p: [-12, 0, -26], s: [1.6, 1.6, 1.6] },
    { id: "crate11", type: "box", mat: "cover", p: [-11.5, 0, -27.7], s: [1.2, 1.2, 1.2] },
    { id: "crate12", type: "box", mat: "cover", p: [-10.1, 0, -25.6], s: [1.0, 0.9, 2.2] },
    { id: "barricade1", type: "box", mat: "cover", p: [18, 0, 9], s: [3.6, 1.1, 0.6] },
    { id: "barricade2", type: "box", mat: "cover", p: [18, 0, -9], s: [3.6, 1.1, 0.6] },
    { id: "barricade3", type: "box", mat: "cover", p: [-18, 0, 9], s: [3.6, 1.1, 0.6] },
    { id: "barricade4", type: "box", mat: "cover", p: [-18, 0, -9], s: [3.6, 1.1, 0.6] },
  ],
  spawns: {
    /* free-for-all: fifteen spots. The open east and west lane spots (±22, 0) were the worst spawn
       traps; the alcoves behind the pillars and four quiet corners replace them, and with more spots
       to choose from spawn safety cut deaths within 3 s of spawning from 5.4% to 3.4% (docs/TUNING.md) */
    ffa: [
      [24, 2.6, 24],
      [-24, 2.6, -24],
      [24, 2.6, -24],
      [-24, 2.6, 24],
      [0, 0, 22],
      [0, 0, -22],
      [0, 3.2, 2],
      [10, 0, -30],
      [-10, 0, 30],
      [32.5, 0, 0],
      [-32.5, 0, 0],
      [30, 0, 18],
      [-30, 0, -18],
      [18, 0, -30],
      [-18, 0, 30],
    ],
    /* team modes: red spawns together on the south half, blue on the north */
    teams: [
      [
        [-24, 2.6, -24],
        [24, 2.6, -24],
        [0, 0, -22],
        [10, 0, -30],
        [-10, 0, -30],
        [0, 0, -32.5],
      ],
      [
        [24, 2.6, 24],
        [-24, 2.6, 24],
        [0, 0, 22],
        [-10, 0, 30],
        [10, 0, 30],
        [0, 0, 32.5],
      ],
    ],
  },
  /* oddball: where the skull's pod comes down (the core's roof, beside the power weapon) */
  ball: [3, 3.2, 0],
  /* every drop, the first included, picks one of these instead (never the last one again): the core's
     roof and the alcoves behind the east and west pillars, all the same distance from both teams. The
     one spot east of centre left the west of the arena empty (docs/TUNING.md) */
  balls: [
    [3, 3.2, 0],
    [32.5, 0, 0],
    [-32.5, 0, 0],
  ],
  /* callout zones (first match wins): b = [x0, z0, x1, z1], y = [low, high]; north is +z */
  zones: [
    { name: "core top", b: [-5, -5, 5, 5], y: [2.8, 99] },
    { name: "core", b: [-10, -10, 10, 10] },
    { name: "NE platform", b: [19, 19, 29, 29], y: [2, 99] },
    { name: "NW platform", b: [-29, 19, -19, 29], y: [2, 99] },
    { name: "SE platform", b: [19, -29, 29, -19], y: [2, 99] },
    { name: "SW platform", b: [-29, -29, -19, -19], y: [2, 99] },
    { name: "north balcony", b: [-15, 33, 15, 37], y: [2, 99] },
    { name: "south balcony", b: [-15, -37, 15, -33], y: [2, 99] },
    { name: "east balcony", b: [33, -15, 37, 15], y: [2, 99] },
    { name: "west balcony", b: [-37, -15, -33, 15], y: [2, 99] },
    { name: "NE corner", b: [12, 12, 37, 37] },
    { name: "NW corner", b: [-37, 12, -12, 37] },
    { name: "SE corner", b: [12, -37, 37, -12] },
    { name: "SW corner", b: [-37, -37, -12, -12] },
    { name: "north lane", b: [-12, 10, 12, 37] },
    { name: "south lane", b: [-12, -37, 12, -10] },
    { name: "east lane", b: [10, -12, 37, 12] },
    { name: "west lane", b: [-37, -12, -10, 12] },
  ],
  /* rotate: the centre power weapon cycles through POWER_ROTATION, one each time it spawns */
  pickups: [
    { id: "arena-power", weapon: "sniper", rotate: true, p: [0, 4.5, 0], respawn: 90 },
    /* lab pickups: only while their LABS flag is on (docs/PROPOSALS.md) */
    { id: "burst-e", weapon: "burst", lab: "burst", p: [22, 0, 4], respawn: 30 },
    { id: "burst-w", weapon: "burst", lab: "burst", p: [-22, 0, -4], respawn: 30 },
    { id: "beam-ne", weapon: "beam", lab: "beam", p: [21, 2.6, 27], respawn: 45 },
    { id: "beam-sw", weapon: "beam", lab: "beam", p: [-21, 2.6, -27], respawn: 45 },
  ],
  /* blast gates (world/gates.js): one across each side of the ring round the core, cutting its long
     lines (north and south between the stairs and the barricade, east and west either side of the
     slab). A quarter cycle apart, so the shut side goes round the core */
  gates: [
    { id: "gate-n", leaves: [[0, 13.88, 0.8, 6.24]], h: 3.9, phase: 0 },
    {
      id: "gate-e",
      leaves: [
        [10.4, 0, 4.4, 0.8],
        [15.2, 0, 3.6, 0.8],
      ],
      h: 3.9,
      phase: 0.25,
    },
    { id: "gate-s", leaves: [[0, -13.88, 0.8, 6.24]], h: 3.9, phase: 0.5 },
    {
      id: "gate-w",
      leaves: [
        [-10.4, 0, 4.4, 0.8],
        [-15.2, 0, 3.6, 0.8],
      ],
      h: 3.9,
      phase: 0.75,
    },
  ],
};
MAPS.ctf = {
  schema: 1,
  id: "twin-foundry",
  name: "Twin Foundry",
  symmetry: "rotate180",
  bounds: { x0: -26, x1: 26, z0: -50, z1: 50 },
  pieces: [
    { id: "floor1", type: "box", mat: "floor", p: [0, -1, 0], s: [56, 1, 104] },
    { id: "wall2", type: "box", mat: "wall", p: [0, 0, -51], s: [56, 7, 2] },
    { id: "wall3", type: "box", mat: "wall", p: [0, 0, 51], s: [56, 7, 2] },
    { id: "wall4", type: "box", mat: "wall", p: [-27, 0, 0], s: [2, 7, 104] },
    { id: "wall5", type: "box", mat: "wall", p: [27, 0, 0], s: [2, 7, 104] },
    { id: "b6", type: "box", mat: "redBase", p: [0, 0, -42], s: [18, 2.4, 10] },
    { id: "b7", type: "box", mat: "blueBase", p: [0, 0, 42], s: [18, 2.4, 10] },
    {
      id: "trim8",
      type: "strip",
      mat: "redStrip",
      p: [0, 2.4, -37.05],
      s: [18, 0.1],
      twin: true,
      twinMat: "blueStrip",
    },
    {
      id: "trim9",
      type: "strip",
      mat: "redStrip",
      p: [-8.95, 2.4, -42],
      s: [0.1, 10],
      twin: true,
      twinMat: "blueStrip",
    },
    {
      id: "trim10",
      type: "strip",
      mat: "redStrip",
      p: [8.95, 2.4, -42],
      s: [0.1, 10],
      twin: true,
      twinMat: "blueStrip",
    },
    { id: "stairs11", type: "stairs", p: [5, -37], dir: [0, 1], steps: 6, top: 2.4, width: 3, twin: true },
    { id: "stairs12", type: "stairs", p: [-5, -37], dir: [0, 1], steps: 6, top: 2.4, width: 3, twin: true },
    { id: "b13", type: "box", mat: "step", p: [11.5, 0, -42], s: [4, 1.2, 6], twin: true },
    { id: "b14", type: "box", mat: "step", p: [-11.5, 0, -42], s: [4, 1.2, 6], twin: true },
    { id: "cover15", type: "box", mat: "cover", p: [-5, 2.4, -39.6], s: [1.2, 1.2, 2.4], twin: true },
    { id: "cover16", type: "box", mat: "cover", p: [5, 2.4, -39.6], s: [1.2, 1.2, 2.4], twin: true },
    { id: "wall17", type: "box", mat: "wall", p: [-7.4, 2.4, -46], s: [1.6, 3, 1.6], twin: true },
    { id: "wall18", type: "box", mat: "wall", p: [7.4, 2.4, -46], s: [1.6, 3, 1.6], twin: true },
    { id: "cover19", type: "box", mat: "cover", p: [0, 0, -29.5], s: [6, 1.3, 1.2], twin: true },
    { id: "cover20", type: "box", mat: "cover", p: [-14, 0, -33], s: [1.2, 1.3, 4], twin: true },
    { id: "cover21", type: "box", mat: "cover", p: [14, 0, -33], s: [1.2, 1.3, 4], twin: true },
    { id: "wall22", type: "box", mat: "wall", p: [-10, 0, -18], s: [1.2, 3.6, 14], twin: true },
    { id: "wall23", type: "box", mat: "wall", p: [10, 0, -18], s: [1.2, 3.6, 14], twin: true },
    { id: "b24", type: "box", mat: "step", p: [-10, 0, -6.5], s: [1.2, 1.2, 3], twin: true },
    { id: "b25", type: "box", mat: "step", p: [10, 0, -6.5], s: [1.2, 1.2, 3], twin: true },
    { id: "b26", type: "box", mat: "core", p: [0, 0, 0], s: [9, 3, 9] },
    { id: "cover27", type: "box", mat: "cover", p: [0, 3, 0], s: [1.4, 1.2, 1.4] },
    { id: "stairs28", type: "stairs", p: [0, 4.5], dir: [0, 1], steps: 7, top: 3, width: 3, twin: true },
    { id: "cover29", type: "box", mat: "cover", p: [-6.5, 0, 0], s: [2, 1.4, 5], twin: true },
    { id: "trim31", type: "strip", mat: "redStrip", p: [0, 3, -4.45], s: [9, 0.1] },
    { id: "trim32", type: "strip", mat: "blueStrip", p: [0, 3, 4.45], s: [9, 0.1] },
    { id: "b33", type: "box", mat: "base", p: [-24.5, 0, 0], s: [3, 2.6, 22] },
    { id: "b34", type: "box", mat: "base", p: [24.5, 0, 0], s: [3, 2.6, 22] },
    {
      id: "stairs35",
      type: "stairs",
      p: [-24.5, -11],
      dir: [0, -1],
      steps: 6,
      top: 2.6,
      width: 3,
      twin: true,
    },
    {
      id: "stairs36",
      type: "stairs",
      p: [24.5, -11],
      dir: [0, -1],
      steps: 6,
      top: 2.6,
      width: 3,
      twin: true,
    },
    { id: "trim37", type: "strip", mat: "stripB", p: [-23.05, 2.6, 0], s: [0.1, 22] },
    { id: "trim38", type: "strip", mat: "stripB", p: [23.05, 2.6, 0], s: [0.1, 22] },
    { id: "cover39", type: "box", mat: "cover", p: [-18, 0, -16], s: [3.2, 1.3, 1.2], twin: true },
    { id: "cover40", type: "box", mat: "cover", p: [18, 0, -22], s: [3.2, 1.3, 1.2], twin: true },
    { id: "cover41", type: "box", mat: "cover", p: [-18.5, 0, -27], s: [1.2, 1.3, 3.2], twin: true },
    { id: "cover42", type: "box", mat: "cover", p: [18.5, 0, -11], s: [1.2, 1.3, 3.2], twin: true },
    { id: "cover43", type: "box", mat: "cover", p: [0, 0, -15], s: [4, 1.3, 1.2], twin: true },
    { id: "cover44", type: "box", mat: "cover", p: [-4.5, 0, -21], s: [1.2, 2, 3], twin: true },
    { id: "cover45", type: "box", mat: "cover", p: [4.5, 0, -24], s: [1.2, 2, 3], twin: true },
    { id: "wall46", type: "box", mat: "wall", p: [-17, 0, -23.5], s: [2.4, 4.2, 2.4], twin: true },
    { id: "b47", type: "box", mat: "step", p: [-17, 0, -21.1], s: [2.4, 2, 2.4], twin: true },
    { id: "wall48", type: "box", mat: "wall", p: [17, 0, -14], s: [2.4, 4.2, 2.4], twin: true },
    { id: "b49", type: "box", mat: "step", p: [17, 0, -16.4], s: [2.4, 2, 2.4], twin: true },
    /* sightline breakers in the mid lanes */
    { id: "midSlab1", type: "box", mat: "wall", p: [-6, 0, -14], s: [0.8, 3, 3], twin: true },
    /* more destructible cover: crates around mid and in the lanes, barricades in front of the bases */
    { id: "midCrate1", type: "box", mat: "cover", p: [3.5, 0, -7], s: [1.4, 1.4, 1.4], twin: true },
    { id: "midCrate2", type: "box", mat: "cover", p: [-3.2, 0, -8.5], s: [1.2, 1.2, 1.2], twin: true },
    { id: "laneCrate1", type: "box", mat: "cover", p: [-20, 0, -5], s: [1.6, 1.6, 1.6], twin: true },
    { id: "laneCrate2", type: "box", mat: "cover", p: [-21.6, 0, -6.2], s: [1.2, 1.1, 1.2], twin: true },
    { id: "laneCrate3", type: "box", mat: "cover", p: [20, 0, -26], s: [1.4, 1.4, 1.4], twin: true },
    { id: "baseBarricade1", type: "box", mat: "cover", p: [-5, 0, -32], s: [3, 1.1, 0.6], twin: true },
    { id: "baseBarricade2", type: "box", mat: "cover", p: [5, 0, -32], s: [3, 1.1, 0.6], twin: true },
    { id: "midBarricade1", type: "box", mat: "cover", p: [-13.5, 0, -2], s: [0.6, 1.2, 3], twin: true },
  ],
  spawns: {
    /* free-for-all: twelve spots over the bases, wings, catwalks and mid (with only the bases' spawns,
       free-for-all fought almost entirely in the bases; docs/TUNING.md) */
    ffa: [
      [-6, 2.4, -45.5],
      [6, 2.4, 45.5],
      [14, 0, -46],
      [-14, 0, 46],
      [-21, 0, -19],
      [21, 0, 19],
      [21, 0, -30],
      [-21, 0, 30],
      [-24.5, 2.6, -6],
      [24.5, 2.6, 6],
      [-7, 0, -8],
      [7, 0, 8],
    ],
    teams: [
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
      [
        [6, 2.4, 45.5],
        [-6, 2.4, 45.5],
        [14, 0, 46],
        [-14, 0, 46],
        [19, 0, 38],
        [-19, 0, 38],
        [3, 2.4, 46.5],
        [-3, 2.4, 46.5],
      ],
    ],
  },
  flags: [
    [0, 2.4, -43],
    [0, 2.4, 43],
  ],
  /* oddball: the skull comes down on the mid tower's roof, level with both bases; with balls, every
     drop picks one of them: the roof or either catwalk (which nothing else brings anyone to) */
  ball: [3, 3, 0],
  balls: [
    [3, 3, 0],
    [-24.5, 2.6, 0],
    [24.5, 2.6, 0],
  ],
  /* callout zones (first match wins). side: the team whose half it is (0 red, south; 1 blue, north):
     callouts say "our" or "their" to a team and "Red" or "Blue" to everyone else */
  zones: [
    { name: "flag stand", side: 0, b: [-9, -47, 9, -37], y: [1.8, 99] },
    { name: "flag stand", side: 1, b: [-9, 37, 9, 47], y: [1.8, 99] },
    { name: "base", side: 0, b: [-26, -50, 26, -34] },
    { name: "base", side: 1, b: [-26, 34, 26, 50] },
    { name: "top of mid", b: [-4.5, -4.5, 4.5, 4.5], y: [2.5, 99] },
    { name: "west catwalk", b: [-26, -11, -23, 11], y: [2, 99] },
    { name: "east catwalk", b: [23, -11, 26, 11], y: [2, 99] },
    { name: "mid", b: [-9.5, -6, 9.5, 6] },
    { name: "west wing", side: 0, b: [-26, -34, -9.5, 0] },
    { name: "east wing", side: 0, b: [9.5, -34, 26, 0] },
    { name: "mid lane", side: 0, b: [-9.5, -34, 9.5, 0] },
    { name: "west wing", side: 1, b: [-26, 0, -9.5, 34] },
    { name: "east wing", side: 1, b: [9.5, 0, 26, 34] },
    { name: "mid lane", side: 1, b: [-9.5, 0, 9.5, 34] },
  ],
  /* power weapon: sniper on the cover block atop the mid tower, grabbable from the tower roof */
  pickups: [
    { id: "ctf-power", weapon: "sniper", rotate: true, p: [0, 4.2, 0], respawn: 90 },
    /* lab pickups (one of each per team, rotated like the map) */
    { id: "burst-r", weapon: "burst", lab: "burst", p: [-13, 0, -28], respawn: 30 },
    { id: "burst-b", weapon: "burst", lab: "burst", p: [13, 0, 28], respawn: 30 },
    { id: "beam-r", weapon: "beam", lab: "beam", p: [-17, 0, -9], respawn: 45 },
    { id: "beam-b", weapon: "beam", lab: "beam", p: [17, 0, 9], respawn: 45 },
  ],
  /* blast gates (world/gates.js): one across the mid lane between the wing walls on each half, shut
     together, so mid closes and play moves out to the wings, then back. Gates across the wings were
     tried too and pushed everyone into mid (docs/PROPOSALS.md, M10) */
  gates: [{ id: "gate-mid", leaves: [[0, -17.6, 18.8, 0.8]], h: 3.9, phase: 0, twin: true }],
  /* lanes for the AI and callouts: x < -split is the left wing, x > split the right, mid between */
  lanes: { split: 9.5, x: [-18, 0, 18] },
};

/* ---- callout zones: what a place is called, from the map's `zones` (first match wins) ---- */
/** the zone a point is in on a map, or null */
function mapZone(doc, p) {
  if (!doc || !doc.zones) return null;
  for (const z of doc.zones)
    if (
      p.x >= z.b[0] &&
      p.x <= z.b[2] &&
      p.z >= z.b[1] &&
      p.z <= z.b[3] &&
      (!z.y || (p.y >= z.y[0] && p.y <= z.y[1]))
    )
      return z;
  return null;
}
const SIDE_NAMES = ["Red", "Blue"];
/** a zone's callout: "our base" / "their base" to a team (0 or 1), "Red base" to anyone else; "" if
    the point is in no zone */
function zoneLabel(doc, p, team) {
  const z = mapZone(doc, p);
  if (!z) return "";
  if (z.side == null) return z.name;
  if (team === 0 || team === 1) return (z.side === team ? "our " : "their ") + z.name;
  return SIDE_NAMES[z.side] + " " + z.name;
}
/** the map being played (modes set it; the arena otherwise), for pings and the kill feed */
let PLAY_MAP = MAPS.arena;
function setPlayMap(doc) {
  PLAY_MAP = doc || MAPS.arena;
}
/** where a point is on the map being played, as a callout anyone can read ("" outside every zone) */
const zoneAt = p => zoneLabel(PLAY_MAP, p, -1);
/** pieces with their 180° twins expanded, in build order (a twin right after its original) */
function mapPieces(doc) {
  const out = [];
  for (const pc of doc.pieces) {
    out.push(pc);
    if (!pc.twin) continue;
    const t = Object.assign({}, pc, { id: pc.id + "~", twin: false });
    if (pc.type === "stairs") {
      t.p = [-pc.p[0], -pc.p[1]];
      t.dir = [-pc.dir[0], -pc.dir[1]];
    } else t.p = [-pc.p[0], pc.p[1], -pc.p[2]];
    if (pc.twinMat) t.mat = pc.twinMat;
    out.push(t);
  }
  return out;
}

/* ---- map mods (lab): named changes to a map, each behind LABS.mods (docs/PROPOSALS.md) ----
   A mod lists piece ids to remove, pieces to add (twin works as usual) and an optional pickups edit.
   mapDoc(key, mods) returns the map with the mods that apply to it, as its own document (its own
   id, so it gets its own built world and navigation grid). */
/** the arena's high ring: bridges from each corner platform to the balconies beside it, and a span
    between the two balconies on each wall, so the whole perimeter can be run up high */
function ringPieces() {
  const out = [];
  /** @type {[number, number, string][]} */
  const corners = [
    [1, 1, "ne"],
    [-1, 1, "nw"],
    [-1, -1, "sw"],
    [1, -1, "se"],
  ];
  for (const [sx, sz, c] of corners) {
    const slab = (id, x0, x1, z0, z1) => {
      const ax = Math.min(sx * x0, sx * x1),
        bx = Math.max(sx * x0, sx * x1),
        az = Math.min(sz * z0, sz * z1),
        bz = Math.max(sz * z0, sz * z1);
      out.push({
        id: `ring-${c}${id}`,
        type: "box",
        mat: "base",
        p: [(ax + bx) / 2, 2, (az + bz) / 2],
        s: [bx - ax, 0.5, bz - az],
      });
    };
    slab("a", 19, 23, 29, 36);
    slab("b", 15, 19, 33, 36);
    slab("c", 29, 36, 19, 23);
    slab("d", 33, 36, 15, 19);
  }
  for (const [x, z, n] of [
    [0, 34.5, "n"],
    [0, -34.5, "s"],
    [34.5, 0, "e"],
    [-34.5, 0, "w"],
  ])
    out.push({
      id: `ring-${n}`,
      type: "box",
      mat: "base",
      p: [x, 1.9, z],
      s: x ? [3, 0.5, 10] : [10, 0.5, 3],
    });
  return out;
}
const MAP_MODS = {
  /* the arena's team spawns spread: each team also spawns in the two quiet corners of its own half
     (ten spots a team, not six), against spawn camping by a stronger team (docs/TUNING.md) */
  teamspread: {
    map: ["arena"],
    name: "Spread team spawns",
    set: {
      arena: doc => ({
        spawns: Object.assign({}, doc.spawns, {
          teams: [
            doc.spawns.teams[0].concat([
              [30, 0, -18],
              [-30, 0, -18],
              [18, 0, -30],
              [-18, 0, -30],
            ]),
            doc.spawns.teams[1].concat([
              [-30, 0, 18],
              [30, 0, 18],
              [-18, 0, 30],
              [18, 0, 30],
            ]),
          ],
        }),
      }),
    },
  },
  /* the layouts before pass four (docs/TUNING.md), kept so the changes can be measured again: the
     skull's one spot, and the old free-for-all spawns (the arena's eleven; Twin Foundry's bases) */
  oneskull: {
    map: ["arena", "ctf"],
    name: "One skull spot",
    set: { arena: { balls: undefined }, ctf: { balls: undefined } },
  },
  oldspawns: {
    map: ["arena", "ctf"],
    name: "Free-for-all spawns before pass four",
    set: {
      arena: doc => ({
        spawns: Object.assign({}, doc.spawns, {
          ffa: [
            [24, 2.6, 24],
            [-24, 2.6, -24],
            [24, 2.6, -24],
            [-24, 2.6, 24],
            [0, 0, 22],
            [0, 0, -22],
            [22, 0, 0],
            [-22, 0, 0],
            [0, 3.2, 2],
            [10, 0, -30],
            [-10, 0, 30],
          ],
        }),
      }),
      ctf: doc => ({ spawns: { teams: doc.spawns.teams } }),
    },
  },
  /* Twin Foundry: a doorway through each wing wall, so mid and the wings can rotate early */
  doors: {
    map: "ctf",
    name: "Crossover doors",
    remove: ["wall22", "wall23"],
    add: [
      { id: "wall22a", type: "box", mat: "wall", p: [-10, 0, -22.25], s: [1.2, 3.6, 5.5], twin: true },
      { id: "wall22b", type: "box", mat: "wall", p: [-10, 0, -13.75], s: [1.2, 3.6, 5.5], twin: true },
      { id: "wall23a", type: "box", mat: "wall", p: [10, 0, -22.25], s: [1.2, 3.6, 5.5], twin: true },
      { id: "wall23b", type: "box", mat: "wall", p: [10, 0, -13.75], s: [1.2, 3.6, 5.5], twin: true },
    ],
  },
  /* Twin Foundry: the sniper stays on the tower; the rockets move to the two wing platforms, one each
     side, so there are three power positions to fight over instead of one */
  split: {
    map: "ctf",
    name: "Split power",
    pickups: list =>
      list
        .map(p => (p.id === "ctf-power" ? Object.assign({}, p, { rotate: false }) : p))
        .concat([
          { id: "wing-l", weapon: "rocket", p: [-24.5, 2.6, 0], respawn: 150 },
          { id: "wing-r", weapon: "rocket", p: [24.5, 2.6, 0], respawn: 150 },
        ]),
  },
  /* Twin Foundry: a scattergun on each wing platform (the tower keeps its rotation): a close-range
     power position on each wing, away from the long lines */
  pads: {
    map: "ctf",
    name: "Scattergun pads",
    pickups: list =>
      list.concat([
        { id: "pad-l", weapon: "scatter", p: [-24.5, 2.6, 0], respawn: 60 },
        { id: "pad-r", weapon: "scatter", p: [24.5, 2.6, 0], respawn: 60 },
      ]),
  },
  /* the arena: a ring of high ground around the walls (see ringPieces) */
  ring: { map: "arena", name: "High ring", add: ringPieces() },
  /* the arena: four pillars off the core's corners that break its long lines to the corner lanes */
  pillars: {
    map: "arena",
    name: "Core pillars",
    add: [
      { id: "pillar-ne", type: "box", mat: "wall", p: [8, 0, 8], s: [1.4, 4.6, 1.4] },
      { id: "pillar-nw", type: "box", mat: "wall", p: [-8, 0, 8], s: [1.4, 4.6, 1.4] },
      { id: "pillar-sw", type: "box", mat: "wall", p: [-8, 0, -8], s: [1.4, 4.6, 1.4] },
      { id: "pillar-se", type: "box", mat: "wall", p: [8, 0, -8], s: [1.4, 4.6, 1.4] },
    ],
  },
};
const MOD_DOCS = new Map();
/** the map document for a MAPS key with the named mods that apply to it (the plain map when none do) */
function mapDoc(key, mods) {
  const base = MAPS[key];
  const onMap = M => (Array.isArray(M.map) ? M.map.includes(key) : M.map === key);
  const on = (mods || []).filter(m => MAP_MODS[m] && onMap(MAP_MODS[m])).sort();
  if (!base || !on.length) return base;
  const id = [base.id, ...on].join("-");
  if (MOD_DOCS.has(id)) return MOD_DOCS.get(id);
  const doc = Object.assign({}, base, { id, name: base.name, pieces: base.pieces.slice() });
  for (const m of on) {
    const M = MAP_MODS[m];
    if (M.remove) doc.pieces = doc.pieces.filter(pc => !M.remove.includes(pc.id));
    if (M.add) doc.pieces = doc.pieces.concat(M.add);
    if (M.pickups) doc.pickups = M.pickups(doc.pickups || []);
    /* fields set outright (or computed from the map so far) */
    const set = M.set && M.set[key];
    if (set) Object.assign(doc, typeof set === "function" ? set(doc) : set);
  }
  MOD_DOCS.set(id, doc);
  return doc;
}
