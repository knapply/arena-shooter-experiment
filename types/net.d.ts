/* Wire formats of the current capture-the-flag netcode (JSON presence). The binary message registry
   (src/net/messages.js) supersedes these as messages move to it. */

/** flag: [state 0 home | 1 carried | 2 dropped, x, y, z, carrierId or "", seconds since dropped] */
type FlagRow = [number, number, number, number, string, number];
/** agent: [id, team, slot, x, y, z, vx, vy, vz, yaw, pitch, state bits, shield, dead 0|1, spotted-by-team bits, name, kills, deaths] */
type AgentRow = [string, number, number, number, number, number, number, number, number, number, number, number, number, number, number, string, number, number];
/** host to everyone, about 15 times a second */
interface HostSnapshot {
  id: string;
  t: number;
  tl: number;
  sc: [number, number];
  ov: number | null;
  fl: FlagRow[];
  ag: AgentRow[];
  ev: any[];
  cm: any[];
  pu: [string, number][];
  br: number[];
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
