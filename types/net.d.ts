/* Wire formats of the current capture-the-flag netcode (JSON presence). The binary message registry
   (src/net/messages.js) supersedes these as messages move to it. */

/** flag: [state 0 home | 1 carried | 2 dropped, x, y, z, carrierId or "", seconds since dropped] */
type FlagRow = [number, number, number, number, string, number];
/** agent: [id, team, slot, x, y, z, vx, vy, vz, yaw, pitch, state bits, shield, dead 0|1, spotted-by-team bits, name, kills, deaths] */
type AgentRow = [
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string,
  number,
  number,
];
/** host to everyone, about 15 times a second */
interface HostSnapshot {
  id: string;
  /** roster version: fast ctfMove packets list agents in this snapshot's ag order */
  rv: number;
  t: number;
  tl: number;
  /** each team's score (in free-for-all, every pilot's kills) */
  sc: number[];
  /** the mode ("ctf", "slayer", "ffa", "oddball") and map (a MAPS key) the match plays */
  md?: string;
  mp?: string;
  /** score limit, flag reset and skull reset (seconds) */
  sl?: number;
  fr?: number;
  rr?: number;
  /** oddball: seconds each team has held the skull */
  ho?: number[];
  /** oddball: the skull [state (0 incoming, 1 home, 2 carried, 3 dropped), x, y, z, carrier id, seconds on the floor] */
  bl?: [number, number, number, number, string, number];
  ov: number | null;
  fl: FlagRow[];
  ag: AgentRow[];
  ev: any[];
  cm: any[];
  /** power spawns: [id, seconds until available, weapon type showing next] */
  pu: [string, number, number?][];
  br: number[];
  /** weapons and grenades on the floor: [id, type (-1 grenades), x, y, z], and a weapon's magazine and reserve */
  it?: ([string, number, number, number, number] | [string, number, number, number, number, number, number])[];
  /** friendly fire on (1) or off (0) */
  ff?: number;
}
/** client to host: the joining player's own state and their outgoing hits, grenades, death and pickups */
interface ClientPresence {
  ph: "client";
  mid: string;
  tm: number;
  p: [number, number, number];
  v: [number, number, number];
  y: number;
  pt: number;
  st: number;
  sh: number;
  dd: 0 | 1;
  hs: [number, string, number, string, 0 | 1][];
  fx: any[];
  dth: [number, string, string, 0 | 1] | null;
  pk: [number, string] | null;
  br: number[];
  /** this player's drops: [seq, x, y, z, [type, mag, reserve, frag, plasma][]] */
  dr?: any[] | null;
  /** take the flag / let it go (counters) */
  fp?: number;
  fd?: number;
}

/** one entry of the settings schema (src/core/settings.js) */
interface SettingDef {
  k: string;
  tab: string;
  label: string;
  type: "select" | "range" | "toggle";
  def: string | number | boolean;
  opts?: [string, string][];
  min?: number;
  max?: number;
  step?: number;
  fmt?: (v: number) => string;
  desc?: string;
}
