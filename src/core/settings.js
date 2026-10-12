/* ============ settings: schema, presets, bindings, validated save / export / import ============ */
const ACTIONS = [
  ["forward", "Move forward"],
  ["back", "Move back"],
  ["left", "Strafe left"],
  ["right", "Strafe right"],
  ["jump", "Jump · clamber"],
  ["crouch", "Crouch · slide · pound"],
  ["sprint", "Sprint"],
  ["thrust", "Thrust"],
  ["fire", "Fire"],
  ["aim", "Aim · stabilize"],
  ["melee", "Melee · charge"],
  ["reload", "Reload"],
  ["grenade", "Throw grenade"],
  ["swapNade", "Swap grenade type"],
  ["weapon1", "Weapon slot 1"],
  ["weapon2", "Weapon slot 2"],
  ["swapWeapon", "Switch weapon"],
  ["roster", "Roster (hold)"],
  ["switchTeam", "Switch team (CTF)"],
  ["perfHud", "Performance overlay"],
  ["netHud", "Network panel"],
  ["interact", "Pick up weapon (hold)"],
  ["ping", "Ping (mark enemy, weapon or place)"],
];
const DEF_BIND = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  jump: ["Space"],
  crouch: ["KeyC", "ControlLeft"],
  sprint: ["ShiftLeft"],
  thrust: ["KeyQ"],
  fire: ["Mouse0"],
  aim: ["Mouse2"],
  melee: ["KeyF", "Mouse3"],
  reload: ["KeyR"],
  grenade: ["KeyG", "Mouse4"],
  swapNade: ["KeyT"],
  weapon1: ["Digit1"],
  weapon2: ["Digit2"],
  swapWeapon: ["WheelUp", "WheelDown"],
  roster: ["Tab"],
  switchTeam: ["KeyJ"],
  perfHud: ["F3"],
  netHud: ["F4"],
  interact: ["KeyE"],
  ping: ["KeyZ", "Mouse1"],
};
const PAD_NAMES = [
  "A",
  "B",
  "X",
  "Y",
  "LB",
  "RB",
  "LT",
  "RT",
  "View",
  "Menu",
  "L stick",
  "R stick",
  "D-pad up",
  "D-pad down",
  "D-pad left",
  "D-pad right",
  "Guide",
];
const DEF_PAD = {
  jump: [0],
  crouch: [1],
  reload: [2],
  swapWeapon: [3],
  thrust: [4],
  grenade: [5],
  aim: [6],
  fire: [7],
  roster: [8],
  sprint: [10],
  melee: [11],
  switchTeam: [12],
  swapNade: [14, 15],
  interact: [2],
  ping: [13],
};
const T_GFX = "Graphics",
  T_CTL = "Controls",
  T_PAD = "Controller",
  T_GAME = "Gameplay",
  T_AUD = "Audio",
  T_DES = "Destruction",
  T_SBX = "Sandbox";
/* [key, label, default, min, max, step, unit, description] */
/** @type {[string, string, number, number, number, number, string, string?][]} */
const SANDBOX_DEFS = [
  ["sbRun", "Run speed", 6.4, 5, 8, 0.1, " m/s"],
  ["sbSprint", "Sprint speed", 9, 7, 11, 0.1, " m/s"],
  ["sbAccel", "Ground acceleration", 80, 30, 140, 5, " m/s²", "How fast you reach full speed."],
  [
    "sbReverse",
    "Strafe reversal",
    95,
    30,
    180,
    5,
    " m/s²",
    "How hard a change of direction bites. Higher makes strafing a sharper skill.",
  ],
  ["sbAir", "Air control", 18, 4, 36, 1, " m/s²"],
  ["sbJump", "Jump strength", 7.4, 6, 9, 0.1, " m/s"],
  ["sbGrav", "Gravity", 24, 16, 32, 0.5, " m/s²"],
  ["sbThrust", "Thrust speed", 17, 11, 23, 0.5, " m/s"],
  ["sbThrustCD", "Thrust cooldown", 2.2, 0.8, 4, 0.1, " s"],
  ["sbSlide", "Slide boost", 3.2, 0, 6, 0.1, " m/s"],
  ["sbCarbDmg", "Carbine damage", 9, 6, 13, 0.5, ""],
  ["sbCarbRate", "Carbine fire interval", 0.1, 0.06, 0.16, 0.005, " s"],
  ["sbCarbSpread", "Carbine hip spread", 0.012, 0, 0.03, 0.001, ""],
  ["sbCarbBloom", "Carbine bloom per shot", 0.004, 0, 0.012, 0.0005, ""],
  ["sbMagDmg", "Magnum damage", 20, 14, 28, 1, ""],
  ["sbMagRate", "Magnum fire interval", 0.26, 0.16, 0.45, 0.01, " s"],
  ["sbSnipeRate", "Sniper fire interval", 0.62, 0.4, 1.2, 0.02, " s"],
  ["sbRocketSpeed", "Rocket speed", 32, 18, 60, 1, " m/s"],
  ["sbRocketRadius", "Rocket blast radius", 4.2, 2.5, 6.5, 0.1, " m"],
  ["sbNadeThrow", "Grenade throw speed", 19, 12, 27, 0.5, " m/s", "How far grenades fly."],
  [
    "sbNadeBounce",
    "Frag bounciness",
    0.38,
    0,
    0.8,
    0.02,
    "",
    "Share of speed kept when a frag hits the floor.",
  ],
  ["sbNadeFuse", "Frag fuse", 2.2, 1.2, 3.4, 0.1, " s"],
  ["sbNadeRadius", "Frag blast radius", 5.2, 3, 7, 0.1, " m"],
];
/** @type {SettingDef[]} */
const SCHEMA = [
  {
    k: "preset",
    tab: T_GFX,
    label: "Quality preset",
    type: "select",
    def: "high",
    opts: [
      ["low", "Low"],
      ["medium", "Medium"],
      ["high", "High"],
      ["ultra", "Ultra"],
      ["custom", "Custom"],
    ],
    desc: "Sets everything below at once. Changing any graphics option switches to Custom.",
  },
  {
    k: "upscale",
    tab: T_GFX,
    label: "Upscaling",
    type: "select",
    def: "native",
    opts: [
      ["native", "Off (native)"],
      ["quality", "Quality · 77%"],
      ["balanced", "Balanced · 67%"],
      ["performance", "Performance · 50%"],
      ["ultraperf", "Ultra performance · 33%"],
    ],
    desc: "Renders fewer pixels and rebuilds a sharp full-size image, the way FSR works. Browsers cannot run DLSS.",
  },
  {
    k: "renderScale",
    tab: T_GFX,
    label: "Render scale",
    type: "range",
    def: 1,
    min: 0.5,
    max: 1.5,
    step: 0.05,
    fmt: v => Math.round(v * 100) + "%",
    desc: "Above 100% supersamples for a cleaner image.",
  },
  {
    k: "dynRes",
    tab: T_GFX,
    label: "Dynamic resolution",
    type: "toggle",
    def: true,
    desc: "Lowers resolution briefly when the frame rate dips below target.",
  },
  {
    k: "targetFps",
    tab: T_GFX,
    label: "Frame rate target",
    type: "select",
    def: "60",
    opts: [
      ["30", "30"],
      ["60", "60"],
      ["90", "90"],
      ["120", "120"],
      ["144", "144"],
    ],
  },
  {
    k: "aa",
    tab: T_GFX,
    label: "Anti-aliasing",
    type: "select",
    def: "fxaa",
    opts: [
      ["off", "Off"],
      ["fxaa", "FXAA"],
      ["msaa", "MSAA 4×"],
    ],
  },
  {
    k: "sharpen",
    tab: T_GFX,
    label: "Sharpening",
    type: "range",
    def: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "reflections",
    tab: T_GFX,
    label: "Reflections",
    type: "select",
    def: "env",
    opts: [
      ["off", "Off"],
      ["env", "Environment lighting"],
      ["glossy", "Environment + glossy surfaces"],
    ],
    desc: "Image-based lighting and reflections, the closest browsers get to ray tracing.",
  },
  {
    k: "shadows",
    tab: T_GFX,
    label: "Shadows",
    type: "select",
    def: "medium",
    opts: [
      ["off", "Off"],
      ["low", "Low"],
      ["medium", "Medium"],
      ["high", "High"],
      ["ultra", "Ultra"],
    ],
  },
  {
    k: "bloom",
    tab: T_GFX,
    label: "Bloom",
    type: "range",
    def: 0.7,
    min: 0,
    max: 1.5,
    step: 0.05,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "textures",
    tab: T_GFX,
    label: "Surface detail",
    type: "select",
    def: "high",
    opts: [
      ["low", "Flat"],
      ["high", "Detailed panels"],
    ],
  },
  {
    k: "aniso",
    tab: T_GFX,
    label: "Texture filtering",
    type: "select",
    def: "8",
    opts: [
      ["1", "Bilinear"],
      ["4", "4×"],
      ["8", "8×"],
      ["16", "16×"],
    ],
  },
  {
    k: "particles",
    tab: T_GFX,
    label: "Particle density",
    type: "range",
    def: 1,
    min: 0,
    max: 1.5,
    step: 0.05,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "drawDist",
    tab: T_GFX,
    label: "Draw distance",
    type: "range",
    def: 150,
    min: 60,
    max: 220,
    step: 10,
    fmt: v => v + " m",
  },
  {
    k: "exposure",
    tab: T_GFX,
    label: "Brightness",
    type: "range",
    def: 1,
    min: 0.6,
    max: 1.6,
    step: 0.05,
    fmt: v => v.toFixed(2),
  },
  {
    k: "saturation",
    tab: T_GFX,
    label: "Color saturation",
    type: "range",
    def: 1.05,
    min: 0.5,
    max: 1.5,
    step: 0.05,
    fmt: v => v.toFixed(2),
  },
  {
    k: "vignette",
    tab: T_GFX,
    label: "Vignette",
    type: "range",
    def: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "grain",
    tab: T_GFX,
    label: "Film grain",
    type: "range",
    def: 0.04,
    min: 0,
    max: 0.3,
    step: 0.01,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "fov",
    tab: T_GFX,
    label: "Field of view",
    type: "range",
    def: 78,
    min: 65,
    max: 110,
    step: 1,
    fmt: v => v + "°",
  },
  { k: "fpsCounter", tab: T_GFX, label: "FPS counter", type: "toggle", def: true },
  {
    k: "perfOverlay",
    tab: T_GFX,
    label: "Performance overlay",
    type: "toggle",
    def: false,
    desc: "Frame time split into game logic, rendering and post-processing, plus draw calls, memory and network. Also toggled with F3.",
  },
  {
    k: "netOverlay",
    tab: T_GFX,
    label: "Network panel",
    type: "toggle",
    def: false,
    desc: "Ping, jitter, packet loss, update age and bandwidth for each connection. Also toggled with F4.",
  },
  {
    k: "sens",
    tab: T_CTL,
    label: "Mouse sensitivity",
    type: "range",
    def: 1,
    min: 0.1,
    max: 3,
    step: 0.05,
    fmt: v => v.toFixed(2),
  },
  {
    k: "adsSens",
    tab: T_CTL,
    label: "Aiming sensitivity",
    type: "range",
    def: 0.6,
    min: 0.2,
    max: 1.5,
    step: 0.05,
    fmt: v => v.toFixed(2) + "×",
  },
  { k: "invertY", tab: T_CTL, label: "Invert mouse Y", type: "toggle", def: false },
  {
    k: "smoothing",
    tab: T_CTL,
    label: "Mouse smoothing",
    type: "range",
    def: 0,
    min: 0,
    max: 0.9,
    step: 0.05,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "rawInput",
    tab: T_CTL,
    label: "Raw mouse input",
    type: "toggle",
    def: true,
    desc: "Skips operating-system acceleration where the browser allows it.",
  },
  {
    k: "sprintMode",
    tab: T_CTL,
    label: "Sprint",
    type: "select",
    def: "hold",
    opts: [
      ["hold", "Hold"],
      ["toggle", "Toggle"],
      ["auto", "Always sprint"],
    ],
  },
  {
    k: "crouchMode",
    tab: T_CTL,
    label: "Crouch",
    type: "select",
    def: "hold",
    opts: [
      ["hold", "Hold"],
      ["toggle", "Toggle"],
    ],
  },
  {
    k: "aimMode",
    tab: T_CTL,
    label: "Aim",
    type: "select",
    def: "hold",
    opts: [
      ["hold", "Hold"],
      ["toggle", "Toggle"],
    ],
  },
  {
    k: "padSens",
    tab: T_PAD,
    label: "Look sensitivity",
    type: "range",
    def: 1,
    min: 0.3,
    max: 2.5,
    step: 0.05,
    fmt: v => v.toFixed(2),
  },
  {
    k: "padAdsSens",
    tab: T_PAD,
    label: "Aiming sensitivity",
    type: "range",
    def: 0.5,
    min: 0.2,
    max: 1.2,
    step: 0.05,
    fmt: v => v.toFixed(2) + "×",
  },
  {
    k: "padCurve",
    tab: T_PAD,
    label: "Response curve",
    type: "range",
    def: 1.9,
    min: 1,
    max: 3,
    step: 0.1,
    fmt: v => v.toFixed(1),
    desc: "1 is linear. Higher gives finer control near center.",
  },
  {
    k: "padDeadzone",
    tab: T_PAD,
    label: "Right stick deadzone",
    type: "range",
    def: 0.12,
    min: 0.03,
    max: 0.3,
    step: 0.01,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "padMoveDeadzone",
    tab: T_PAD,
    label: "Left stick deadzone",
    type: "range",
    def: 0.16,
    min: 0.03,
    max: 0.35,
    step: 0.01,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "padAccel",
    tab: T_PAD,
    label: "Turn acceleration",
    type: "range",
    def: 0.9,
    min: 0,
    max: 2,
    step: 0.1,
    fmt: v => v.toFixed(1),
  },
  {
    k: "aimAssist",
    tab: T_PAD,
    label: "Aim assist",
    type: "range",
    def: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
    fmt: v => Math.round(v * 100) + "%",
  },
  { k: "padInvertY", tab: T_PAD, label: "Invert look Y", type: "toggle", def: false },
  {
    k: "rumble",
    tab: T_PAD,
    label: "Vibration",
    type: "range",
    def: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "padSprint",
    tab: T_PAD,
    label: "Sprint on stick click",
    type: "select",
    def: "toggle",
    opts: [
      ["toggle", "Toggle"],
      ["hold", "Hold"],
    ],
  },
  {
    k: "xhColor",
    tab: T_GAME,
    label: "Reticle color",
    type: "select",
    def: "#dbe6ea",
    opts: [
      ["#dbe6ea", "White"],
      ["#7dff9a", "Green"],
      ["#ffe066", "Yellow"],
      ["#5ad2ff", "Cyan"],
      ["#ff6fd8", "Magenta"],
    ],
  },
  {
    k: "xhSize",
    tab: T_GAME,
    label: "Reticle size",
    type: "range",
    def: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    fmt: v => v.toFixed(1) + "×",
  },
  {
    k: "hudScale",
    tab: T_GAME,
    label: "HUD size",
    type: "range",
    def: 1,
    min: 0.7,
    max: 1.4,
    step: 0.05,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "bob",
    tab: T_GAME,
    label: "Camera bob",
    type: "range",
    def: 1,
    min: 0,
    max: 1.5,
    step: 0.1,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "shake",
    tab: T_GAME,
    label: "Screen shake",
    type: "range",
    def: 1,
    min: 0,
    max: 1.5,
    step: 0.1,
    fmt: v => Math.round(v * 100) + "%",
  },
  { k: "speedLines", tab: T_GAME, label: "Speed lines", type: "toggle", def: true },
  {
    k: "tracker",
    tab: T_GAME,
    label: "Motion tracker",
    type: "toggle",
    def: true,
    desc: "Radar showing enemies within 25 m who run, jump or shoot (not crouch-walkers). Off for a no-radar competitive game.",
  },
  {
    k: "intros",
    tab: T_GAME,
    label: "Match intros",
    type: "toggle",
    def: true,
    desc: "A five-second flyover of the map, the teams and the objectives before each match. Jump skips it.",
  },
  {
    k: "killCam",
    tab: T_GAME,
    label: "Kill cam",
    type: "toggle",
    def: true,
    desc: "After you die, replay the last seconds through your killer's eyes. Jump skips it.",
  },
  { k: "hitSounds", tab: T_GAME, label: "Hit marker sounds", type: "toggle", def: true },
  {
    k: "friendlyFire",
    tab: T_GAME,
    label: "Friendly fire",
    type: "toggle",
    def: true,
    desc: "Team modes: your shots, grenades and rockets hurt teammates too (and theirs hurt you). The host's setting applies online.",
  },
  {
    k: "spawnStyle",
    tab: T_GAME,
    label: "Spawns",
    type: "select",
    def: "pods",
    opts: [
      ["pods", "Drop pods"],
      ["classic", "Classic (appear in place)"],
    ],
    desc: "Drop pods: pilots fall from orbit in a pod that crashes in and blows its doors. A pod that lands on an enemy takes them out.",
  },
  {
    k: "master",
    tab: T_AUD,
    label: "Master volume",
    type: "range",
    def: 0.9,
    min: 0,
    max: 1,
    step: 0.05,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "sfx",
    tab: T_AUD,
    label: "Effects",
    type: "range",
    def: 1,
    min: 0,
    max: 1,
    step: 0.05,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "voVol",
    tab: T_AUD,
    label: "Announcer volume",
    type: "range",
    def: 1,
    min: 0,
    max: 1,
    step: 0.05,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "voRate",
    tab: T_AUD,
    label: "Announcer pace",
    type: "range",
    def: 0.86,
    min: 0.6,
    max: 1.3,
    step: 0.02,
    fmt: v => v.toFixed(2) + "×",
  },
  {
    k: "destruct",
    tab: T_DES,
    label: "Destruction",
    type: "select",
    def: "full",
    opts: [
      ["off", "Off"],
      ["explosives", "Explosives only"],
      ["full", "Explosives and gunfire"],
    ],
  },
  {
    k: "destructStrength",
    tab: T_DES,
    label: "Cover toughness",
    type: "range",
    def: 1,
    min: 0.25,
    max: 4,
    step: 0.25,
    fmt: v => v.toFixed(2) + "×",
    desc: "Higher means cover takes more damage before it breaks.",
  },
  {
    k: "debris",
    tab: T_DES,
    label: "Debris amount",
    type: "range",
    def: 1,
    min: 0,
    max: 2,
    step: 0.1,
    fmt: v => Math.round(v * 100) + "%",
  },
  {
    k: "regen",
    tab: T_DES,
    label: "Cover rebuilds after",
    type: "select",
    def: "45",
    opts: [
      ["0", "Never"],
      ["15", "15 s"],
      ["30", "30 s"],
      ["45", "45 s"],
      ["90", "90 s"],
    ],
  },
  /* ----- Sandbox: movement, weapons and grenades. Defaults chosen by simulation (docs/TUNING.md).
     Online, the host's sandbox applies to everyone in the match. ----- */
  ...SANDBOX_DEFS.map(([k, label, def, min, max, step, unit, desc]) => ({
    k,
    tab: T_SBX,
    label,
    type: /** @type {"range"} */ ("range"),
    def,
    min,
    max,
    step,
    fmt: v => +v.toFixed(3) + (unit || ""),
    desc,
  })),
];
const PRESETS = {
  low: {
    upscale: "performance",
    renderScale: 1,
    aa: "off",
    sharpen: 0.5,
    reflections: "off",
    shadows: "off",
    bloom: 0,
    textures: "low",
    aniso: "1",
    particles: 0.5,
    drawDist: 90,
  },
  medium: {
    upscale: "balanced",
    renderScale: 1,
    aa: "fxaa",
    sharpen: 0.45,
    reflections: "off",
    shadows: "low",
    bloom: 0.45,
    textures: "high",
    aniso: "4",
    particles: 0.8,
    drawDist: 120,
  },
  high: {
    upscale: "native",
    renderScale: 1,
    aa: "fxaa",
    sharpen: 0.3,
    reflections: "env",
    shadows: "medium",
    bloom: 0.7,
    textures: "high",
    aniso: "8",
    particles: 1,
    drawDist: 150,
  },
  ultra: {
    upscale: "native",
    renderScale: 1.25,
    aa: "msaa",
    sharpen: 0.2,
    reflections: "glossy",
    shadows: "ultra",
    bloom: 0.85,
    textures: "high",
    aniso: "16",
    particles: 1.3,
    drawDist: 220,
  },
};
const PRESET_KEYS = Object.keys(PRESETS.high);
/** current settings, keyed by SettingDef.k */
/** @type {Record<string, any>} */
const SET = {};
for (const s of SCHEMA) SET[s.k] = s.def;
let BIND = JSON.parse(JSON.stringify(DEF_BIND)),
  PADB = JSON.parse(JSON.stringify(DEF_PAD));
const CODE_RE =
  /^(Key[A-Z]|Digit[0-9]|Numpad[0-9A-Za-z]{1,8}|F[0-9]{1,2}|Arrow(Up|Down|Left|Right)|Mouse[0-4]|Wheel(Up|Down)|Space|Tab|Enter|Backspace|Backquote|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash|CapsLock|(Shift|Control|Alt|Meta)(Left|Right)|Insert|Delete|Home|End|PageUp|PageDown|IntlBackslash)$/;
/* every imported or stored value is checked against the schema: unknown keys dropped, numbers clamped, options whitelisted */
function cleanSettings(o) {
  const out = {},
    bad = [];
  if (!o || typeof o !== "object") return { out, bad: ["not an object"] };
  const src = o.settings && typeof o.settings === "object" ? o.settings : o;
  for (const s of SCHEMA) {
    if (!(s.k in src)) continue;
    const v = src[s.k];
    if (s.type === "range") {
      const n = +v;
      if (Number.isFinite(n)) out[s.k] = Math.max(s.min, Math.min(s.max, n));
      else bad.push(s.k);
    } else if (s.type === "toggle") {
      if (typeof v === "boolean") out[s.k] = v;
      else bad.push(s.k);
    } else {
      if (s.opts.some(([val]) => val === String(v))) out[s.k] = String(v);
      else bad.push(s.k);
    }
  }
  const kb = {},
    pb = {};
  if (o.keys && typeof o.keys === "object")
    for (const [a] of ACTIONS) {
      const v = o.keys[a];
      if (Array.isArray(v)) kb[a] = v.filter(c => typeof c === "string" && CODE_RE.test(c)).slice(0, 2);
    }
  if (o.pad && typeof o.pad === "object")
    for (const [a] of ACTIONS) {
      const v = o.pad[a];
      if (Array.isArray(v))
        pb[a] = v
          .map(n => n | 0)
          .filter(n => n >= 0 && n <= 16)
          .slice(0, 2);
    }
  return { out, kb, pb, bad };
}
function loadSettings() {
  try {
    const d = STORE.load("settings");
    if (!d) return;
    const r = cleanSettings(d);
    Object.assign(SET, r.out);
    Object.assign(BIND, r.kb);
    Object.assign(PADB, r.pb);
    if (!r.kb.interact && BIND.thrust) BIND.thrust = BIND.thrust.filter(c => c !== "KeyE");
  } catch (e) {}
}
function saveSettings() {
  STORE.save("settings", { settings: SET, keys: BIND, pad: PADB });
}
function exportSettings() {
  return JSON.stringify({ app: "kinetic-arena", version: 1, settings: SET, keys: BIND, pad: PADB }, null, 2);
}
function importSettings(text) {
  let o;
  try {
    o = JSON.parse(String(text).slice(0, 60000));
  } catch (e) {
    return { ok: false, msg: "That file isn't valid JSON." };
  }
  const r = cleanSettings(o);
  const n = Object.keys(r.out).length + Object.keys(r.kb).length + Object.keys(r.pb).length;
  if (!n) return { ok: false, msg: "No Kinetic Arena settings found in that file." };
  Object.assign(SET, r.out);
  Object.assign(BIND, r.kb);
  Object.assign(PADB, r.pb);
  saveSettings();
  applySettings();
  return {
    ok: true,
    msg: `Imported ${n} setting${n > 1 ? "s" : ""}${r.bad.length ? `, skipped ${r.bad.length} invalid` : ""}.`,
  };
}
function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  Object.assign(SET, p);
  SET.preset = name;
}
const SET_HOOKS = [];
function applySettings() {
  for (const f of SET_HOOKS) {
    try {
      f();
    } catch (e) {}
  }
  rebuildCodeMap();
}
/* input routing: physical codes -> actions */
const CODE2ACT = new Map();
function rebuildCodeMap() {
  CODE2ACT.clear();
  for (const [a] of ACTIONS)
    for (const c of BIND[a] || []) {
      if (!CODE2ACT.has(c)) CODE2ACT.set(c, []);
      CODE2ACT.get(c).push(a);
    }
}
function keyLabel(code) {
  if (!code) return "—";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const m = {
    Mouse0: "Left click",
    Mouse1: "Middle click",
    Mouse2: "Right click",
    Mouse3: "Mouse 4",
    Mouse4: "Mouse 5",
    WheelUp: "Wheel up",
    WheelDown: "Wheel down",
    Space: "Space",
    ShiftLeft: "Shift",
    ShiftRight: "R Shift",
    ControlLeft: "Ctrl",
    ControlRight: "R Ctrl",
    AltLeft: "Alt",
    AltRight: "R Alt",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Tab: "Tab",
    CapsLock: "Caps",
  };
  return m[code] || code.replace(/(Left|Right)$/, "");
}
const bindLabel = a => (BIND[a] || []).map(keyLabel).join(" / ") || "Unbound";
loadSettings();
rebuildCodeMap();
