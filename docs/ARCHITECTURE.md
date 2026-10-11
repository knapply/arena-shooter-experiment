# Architecture

The game ships as one self-contained `index.html`, built from the modules in `src/` by `node build.mjs`. There is no bundler and no runtime dependency beyond three.js (r128), and PeerJS when you play online.

## Layout

```
src/
  manifest.json        load order (the single source of truth)
  html/                page template and HUD partials
  styles/              base, CTF and multiplayer-panel CSS
  core/                prelude helpers, settings, input, gamepad, audio, announcer
  render/              renderer, post-processing pipeline, environment and materials, pooled FX
  world/               physics and collision, destruction, maps
  characters/          procedural pilot rig and animation
  player/              aim assist, ground-pound marker
  weapons/             arsenal data, firing, viewmodels and their animation, grenades, pickups
  ui/                  HUD, reticle, settings screen
  game/                game state, deploy, main loop, the window.KA API
  modes/               movement tutorial; trailer and its synthesized score; ctf/ (map, nav, AI brain and agents, rules, UI, play and simulation modes)
  net/                 arena presence sync, CTF host and client, peer-to-peer room transport
tests/                 headless sim, browser and render tests
types/                 TypeScript declarations: globals, the KA API type, wire formats, settings schema
tools/                 build helpers (module scope analysis, unused-name check), trailer recorder
docs/MODULES.md        generated index of what each module declares
```

## How modules connect

- **Engine modules** (`manifest.engine`) are concatenated, in order, into one strict-mode closure. They share a scope, so a module can use anything declared by modules listed before it, and functions declared anywhere (calls resolve at run time). Keep cross-module use to what `docs/MODULES.md` lists.
- **Mode modules** (`manifest.modes`) are each their own closure. They only talk to the engine through `window.KA` (exported by `game/exports.js`) and to each other through `window.CTF`. This is the boundary to preserve: new modes should use `KA`, not engine internals.
- **The multiplayer transport** (`net/p2p-transport.js`) provides `window.KAHOST.use("room")`, a presence-room interface: `presence(patch)`, `peers()`, `onPeers(cb, onClose)`, `join(name)`. Any transport implementing it (a relay server, a native socket layer) can replace it without touching the netcode.
- **Pilots** (`game/pilot.js`): every player-shaped thing (you, drones, online players, CTF agents, tutorial targets, trailer actors) is a `Pilot` with a stable id, a `Body`, an optional rig and a controller kind (`local`, `ai`, `net`, `script`). Registered pilots live in `PILOTS` by id (`local`, `bot:<n>`, `peer:<id>`, `dummy:<n>`, `actor:<n>`); CTF agents use the same fields and their own ids because the match owns them. Anything that only needs a body and a rig (posing via `posePilot`, kill cams, recordings, stats) is written once against this shape.
- **Events** (`game/events.js`): one stream for kills, damage, medals, sprees, pickups, spawns, flag events and match start/end. Each event carries stable pilot ids, display names, the weapon and the current map and mode (`EVENTS.setContext`). The kill feed and medals are subscribers; CTF forwards its rule events into the same stream. Stats, highlights and challenges should be added as subscribers (`EVENTS.on(type or "*", fn)`), not as hooks in gameplay code. `EVENTS.recent(n)` returns the rolling log.
- **Recording and determinism** (`game/recorder.js`, `core/rng.js`): the recorder keeps the last 45 s of every pilot's position and full rig pose state at 30 Hz (`REC.sample(id, t)` interpolates; ids match the event stream). Simulation randomness (AI, rules, spawns) goes through the seeded `rand()`; a CTF match started with the same `seed` replays identically (checked in `tests/sim.test.js`). Visual-only randomness stays on `Math.random`.
- **Network messages** (`net/messages.js`): every message is defined once (id, reliable or fast channel, typed fields such as `v3:100` fixed-point vectors, wrapped angles and capped strings). `MSG.encode`/`MSG.decode` are generated from the definitions; decode returns `null` for anything truncated, padded, unknown or out of range and never throws (fuzzed in `tests/messages.test.js`). `MSG.PROTOCOL` is checked by the transport when a friend joins: a mismatch shows both players a clear "different versions" message. Bump it whenever a message changes shape.
- **Save data** (`core/store.js`): everything saved is a named, versioned document (`pilot`, `settings`, `ctfTeam`, `ctfBrain`) in an envelope `{app, doc, version, savedAt, data}`. `STORE.load` runs migrations then the document's `clean()`, ignores junk and leaves saves from a newer build untouched; `STORE.save` keeps the previous copy as `<key>.bak` (`STORE.restoreBackup`). The backend (`get/set/remove/keys`) is swappable, so career stats, map files and a chosen save folder can be added as more documents and another backend.
- **Network diagnostics:** each connection is a `Link` that measures round trip, jitter, loss and bandwidth. `?netsim=latency,jitter,loss%` (or `KAHOST.net.setSim`) adds simulated lag and loss to everything a tab sends; F4 shows the panel and F3 the performance overlay. `tests/net.test.js` records how far behind and how far off a remote player is drawn under ideal and bad links.

## Roadmap mapping

| Roadmap item | Where it lands |
|---|---|
| Host migration, relay server | `net/p2p-transport.js` (transport), `net/ctf-host.js` and `net/ctf-client.js` (state handoff) |
| More maps and modes | `world/maps/*`, `modes/*` using the `KA` API; CTF rules in `modes/ctf/rules.js` |
| ES modules and a bundler | convert one engine module at a time to `import`/`export`, starting from the leaves (`core/prelude.js`, `world/physics.js`); `build.mjs` can switch to esbuild without changing the output contract |
| Web Worker / WebAssembly | `world/physics.js` (`Body`, raycasts), `modes/ctf/nav.js`, and `modes/ctf/agent.js` are pure simulation with no DOM access and are already exercised headless by `tests/lib/headless.js` |
| WebGPU renderer, newer three.js | `render/*` only; gameplay code does not touch the pipeline |
| Desktop packaging | wraps the built `index.html` unchanged |

## Developer console

In a dev build (`npm run dev`) or with `#dev` in the page address, backquote opens a console: `tp`, `give`, `god`, `timescale`, `bots`, `hitboxes` (the exact boxes shots are tested against), `nav` (the CTF AI's walkable grid), `net` (simulated latency, jitter and loss), `seed`, `events`, `pilots`, `perf`, `netpanel`, `kill`. Commands live in one table in `src/ui/console.js`; add new ones there.

## Scenario tests

`tests/lib/scenario.js` runs scripted situations against the real movement, collision, hit and rules code in Node, in milliseconds: place pilots, give them inputs per tick, then assert on positions, events and hits. `tests/scenarios.test.js` holds the current movement "feel contract" (walk, sprint, strafe, thrust, jump, slide, pound), hit registration (head and body boxes, crouching, walls) and CTF rules (pickup, capture, drop, reset). Sandbox tuning should change those numbers deliberately, in the same commit.

## Code quality

- **Formatting:** Prettier (`npm run format`), checked in CI.
- **Linting:** ESLint with a generated shared-scope config: each engine module is linted with the names declared by the other engine modules as globals, so a misspelled or missing name anywhere fails the build. `tools/check-unused.mjs` reports engine declarations nothing uses.
- **Types:** TypeScript checks every source file as JavaScript (`npm run typecheck`, no rewrite). The engine API's type is inferred from the object in `src/game/exports.js`, so mode modules are checked against the real API. Wire formats and the settings schema are declared in `types/`.

## Building and testing

```
node build.mjs            # writes index.html and docs/MODULES.md
node build.mjs --check    # fails if they are out of date (CI runs this)
node tests/sim.test.js    # two headless AI matches
node tests/browser.test.js
THREE_PATH=path/to/three.min.js node tests/render.test.js
```

The trailer (`modes/trailer.js`) is a pure function of trailer time: live it is clocked by the music's audio context; for video capture it is stepped frame by frame (`KA.trailer.record()`, `KA.trailer.step(dt)`), and the score (`modes/trailer-score.js`) renders to a file through an `OfflineAudioContext`.

The browser tests use stubs in `tests/stubs/`: a minimal three.js stand-in and an in-memory PeerJS replacement, so two or three tabs can play online against each other without a network. The build refuses to emit a module containing a closing script tag or an unresolved template directive.
