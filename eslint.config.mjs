/* Lint config. Engine modules share one scope (see docs/ARCHITECTURE.md), so each engine file gets the names
   declared by the other engine modules as globals: misspelled or missing names are caught across files. */
import { engineScope, manifest } from "./tools/modules.mjs";

const BROWSER = Object.fromEntries(
  `window document navigator location localStorage sessionStorage performance console requestAnimationFrame cancelAnimationFrame
   setTimeout clearTimeout setInterval clearInterval queueMicrotask addEventListener removeEventListener dispatchEvent matchMedia
   devicePixelRatio innerWidth innerHeight getComputedStyle alert prompt confirm fetch crypto URL Blob File FileReader
   AudioContext OfflineAudioContext webkitAudioContext speechSynthesis SpeechSynthesisUtterance Event CustomEvent KeyboardEvent
   createImageBitmap ImageData BroadcastChannel structuredClone atob btoa TextEncoder TextDecoder DOMParser HTMLElement
   Worker MessageChannel self globalThis WebGL2RenderingContext WebGLRenderingContext RTCPeerConnection`
    .split(/\s+/)
    .filter(Boolean)
    .map(n => [n, "readonly"])
);
const NODE = Object.fromEntries(
  "require module process __dirname __filename Buffer console setTimeout clearTimeout setInterval clearInterval global URL"
    .split(" ")
    .map(n => [n, "readonly"])
);
const RULES = {
  "no-undef": "error",
  "no-unused-vars": [
    "error",
    { vars: "local", args: "none", caughtErrors: "none", ignoreRestSiblings: true },
  ],
  "no-redeclare": "error",
  "no-dupe-keys": "error",
  "no-duplicate-case": "error",
  "no-dupe-class-members": "error",
  "no-unreachable": "error",
  "no-func-assign": "error",
  "no-const-assign": "error",
  "no-self-assign": "error",
  "no-self-compare": "error",
  "no-sparse-arrays": "error",
  "no-unsafe-finally": "error",
  "no-unsafe-negation": "error",
  "no-cond-assign": ["error", "except-parens"],
  "no-empty": ["error", { allowEmptyCatch: true }],
  "no-debugger": "error",
  "no-loss-of-precision": "error",
  "no-shadow-restricted-names": "error",
  "use-isnan": "error",
  "valid-typeof": "error",
  "no-import-assign": "error",
  "no-obj-calls": "error",
  "no-compare-neg-zero": "error",
  "no-unsafe-optional-chaining": "error",
};
const scope = engineScope();
const engine = scope.map(({ path, names }) => {
  const own = new Set(names);
  const shared = {};
  for (const m of scope)
    if (m.path !== path) for (const n of m.names) if (!own.has(n)) shared[n] = "writable";
  return {
    files: [`src/${path}`],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: { ...BROWSER, THREE: "readonly", ...shared },
    },
    rules: RULES,
  };
});
const modes = manifest().modes.map(p => `src/${p}`);
export default [
  { ignores: ["index.html", "node_modules/**", "media/**", "docs/**"] },
  ...engine,
  {
    files: [...modes, "src/net/p2p-transport.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: { ...BROWSER, THREE: "readonly" },
    },
    rules: RULES,
  },
  {
    files: ["tests/**/*.js", "tools/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: { ...NODE, ...BROWSER, KA: "readonly", CTF: "readonly" },
    },
    rules: RULES,
  },
  {
    files: ["*.mjs", "tools/**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: NODE },
    rules: RULES,
  },
];
