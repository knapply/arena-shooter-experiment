/* Ambient types for the game. Engine modules are scripts sharing one global scope, so TypeScript sees them
   exactly as the browser does. The KA API's type is inferred from the object built in src/game/exports.js. */

/** three.js r128 ships without bundled types; it is typed loosely. */
declare const THREE: any;

/** Element lookup by id: the game's markup uses inputs, selects, buttons, text areas and the canvas. */
type El = HTMLInputElement & Pick<HTMLSelectElement, "selectedIndex" | "options"> & Pick<HTMLCanvasElement, "getContext" | "toDataURL">;

/** Presence room provided by the host page (peer-to-peer transport or an embedding host). */
interface PresencePeer {
  peer: string;
  presence: Record<string, any>;
  sameTab: boolean;
  isMe: boolean;
  kind: string;
  updatedAt: number;
}
interface PresenceRoom {
  presence(patch: Record<string, any>): Promise<void>;
  peers(): PresencePeer[];
  onPeers(cb: (change: { peers: PresencePeer[]; joined: PresencePeer[]; left: PresencePeer[]; updated: PresencePeer[] }) => void, onClose?: () => void): () => void;
  connected(): boolean;
  onConnection(cb: (connected: boolean) => void): () => void;
  join(name: string): Promise<PresenceRoom>;
  leave(): Promise<void>;
  emit?(...a: any[]): Promise<void>;
  on?(...a: any[]): () => void;
}
interface NetLinkStats { peer: string; name: string; fast?: boolean; rtt: number; jitter: number; loss: number; inBps: number; outBps: number; inMsgs: number; outMsgs: number; age: number }
interface NetStats {
  role: "offline" | "host" | "client";
  code: string | null;
  me: string;
  sim: { latency: number; jitter: number; loss: number } | null;
  links: NetLinkStats[];
  /** round trip to every known peer: direct links, or through the room host */
  peers: Record<string, { rtt: number; direct: boolean }>;
  /** who takes over if the host leaves */
  backup?: string | null;
  members?: string[];
  /** host only: a player who would make a better host */
  suggest?: { peer: string; ms: number; mine: number } | null;
}
interface HostServices {
  /** network protocol version the game speaks; set by the game, read by the transport during the join handshake */
  protocol?: number;
  net?: { stats(): NetStats; sim: { latency: number; jitter: number; loss: number }; setSim(o: Partial<{ latency: number; jitter: number; loss: number }>): void; handover?(to?: string): boolean };
  use(name: "room"): Promise<PresenceRoom | null>;
  use(name: "downloads"): Promise<{ save(o: { filename: string; data: string }): Promise<void> } | null>;
  use(name: string): Promise<any>;
}

/** Members modes attach to KA after the engine loads. */
interface KAExtensions {
  trailerScore: { score(ctx: BaseAudioContext, out: AudioNode, t0: number): number; BPM: number; BEAT: number; BAR: number; LENGTH: number };
  trailer: {
    active: boolean;
    recording: boolean;
    readonly t: number;
    END: number;
    start(): void;
    stop(): void;
    record(): void;
    step(dt: number): number;
    seek(t: number): void;
  };
}
type KAApi = typeof KA_API & KAExtensions;

/** Capture-the-flag namespace shared by the mode modules. Members are added by each CTF module as it loads. */
interface CTFNamespace {
  [key: string]: any;
  NET: NetApi;
  UI: CTFUI;
}
interface NetApi {
  room: PresenceRoom | null;
  named: boolean;
  connecting?: boolean;
  base: { m: string; n: string; tm: number; ph: string; [k: string]: any };
  onPeers: (() => void) | null;
  connect(): Promise<PresenceRoom | null>;
  send(extra: Record<string, any>): void;
  myPeer(): string | null;
  ctfPeers(): PresencePeer[];
  liveHost(): { peer: string; name: string; mid: string; players: number } | null;
  okId(id: unknown): boolean;
  bitsOf(body: any, o: { reload?: boolean; fire?: boolean; wpn?: number; carry?: boolean }): number;
  applyBits(body: any, bits: number): void;
  readBody(body: any, presence: Record<string, any>): void;
  plausible(shooterPos: any, target: any, weapon: string): boolean;
}
interface CTFUI {
  [key: string]: any;
  quiet: boolean;
  onEvent: ((type: string, data?: any) => void) | null;
}

interface Window {
  KA: KAApi;
  CTF: CTFNamespace;
  KAHOST: HostServices;
  TRAILER_SCORE?: KAExtensions["trailerScore"];
  webkitAudioContext?: typeof AudioContext;
  /** PeerJS global, loaded on demand by the peer-to-peer transport */
  Peer?: any;
  peerjs?: any;
  /** test hook exposed by the peer-to-peer transport */
  __p2p?: any;
}
