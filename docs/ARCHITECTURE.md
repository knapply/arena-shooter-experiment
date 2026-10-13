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
  world/               physics and collision, destruction, maps and their sci-fi dressing
  characters/          procedural pilot rig and animation
  player/              aim assist, ground-pound marker
  weapons/             arsenal data, firing, viewmodels and their animation, grenades, rockets, pickups and floor items
  ui/                  HUD, reticle, settings screen
  game/                game state, deploy, main loop, drop pods, the sandbox (tuning settings), the window.KA API
  modes/               trailer and its synthesized score (trailer build only); ctf/ (map, nav, AI brain and agents, rules, UI, play and simulation modes)
  net/                 arena presence sync, CTF host and client, peer-to-peer room transport
tests/                 headless sim, browser and render tests
types/                 TypeScript declarations: globals, the KA API type, wire formats, settings schema
tools/                 build helpers (module scope analysis, unused-name check), trailer recorder, sandbox tuning simulations (tune.js)
docs/MODULES.md        generated index of what each module declares
docs/EXECUTION.md      what runs, in what order: build, page load, every frame, matches, online, headless
docs/EXTENDING.md      recipes for adding a HUD widget, setting, weapon, map, mode, AI behaviour or animation
```

## How modules connect

- **Engine modules** (`manifest.engine`) are concatenated, in order, into one strict-mode closure. They share a scope, so a module can use anything declared by modules listed before it, and functions declared anywhere (calls resolve at run time). Keep cross-module use to what `docs/MODULES.md` lists.
- **Mode modules** (`manifest.modes`) are each their own closure. They only talk to the engine through `window.KA` (exported by `game/exports.js`) and to each other through `window.CTF`. This is the boundary to preserve: new modes should use `KA`, not engine internals.
- **The multiplayer transport** (`net/p2p-transport.js`) provides `window.KAHOST.use("room")`, a presence-room interface: `presence(patch)`, `peers()`, `onPeers(cb, onClose)`, `join(name)`. Any transport implementing it (a relay server, a native socket layer) can replace it without touching the netcode.
- **Pilots** (`game/pilot.js`): every player-shaped thing (you, drones, online players, CTF agents, trailer actors) is a `Pilot` with a stable id, a `Body`, an optional rig and a controller kind (`local`, `ai`, `net`, `script`). Registered pilots live in `PILOTS` by id (`local`, `bot:<n>`, `peer:<id>`, `actor:<n>`); CTF agents use the same fields and their own ids because the match owns them. Anything that only needs a body and a rig (posing via `posePilot`, kill cams, recordings, stats) is written once against this shape.
- **Events** (`game/events.js`): one stream for kills, damage, medals, sprees, pickups, spawns, flag events and match start/end. Each event carries stable pilot ids, display names, the weapon and the current map and mode (`EVENTS.setContext`). The kill feed and medals are subscribers; CTF forwards its rule events into the same stream. Stats, highlights and challenges should be added as subscribers (`EVENTS.on(type or "*", fn)`), not as hooks in gameplay code. `EVENTS.recent(n)` returns the rolling log.
- **Recording and determinism** (`game/recorder.js`, `core/rng.js`): the recorder keeps the last 45 s of every pilot's position and full rig pose state at 30 Hz (`REC.sample(id, t)` interpolates; ids match the event stream). Simulation randomness (AI, rules, spawns) goes through the seeded `rand()`; a CTF match started with the same `seed` replays identically (checked in `tests/sim.test.js`). Visual-only randomness stays on `Math.random`.
- **Cinema** (`render/cinema.js`): shared camera toolkit. Shots are functions of time returning `{ p, l, fov }`: `orbit`, `track` (chase / over the shoulder, pulled in front of walls), `firstPerson` (a recorded pose's eyes, for replays), `crane` (blend two shots), `fixed`. `CINE.apply` places the camera with smoothing, shake and roll; `letterbox`, `card`, `caption`, `flash` and `slowmo` (game-time scale) drive the shared overlay, and `look({ dof, focus, range, grade, ca, streak })` switches the post pipeline to a cinematic look (depth of field from the depth buffer, split-tone grade, lens fringing, anamorphic streaks; `look(null)` restores the game look). The trailer, the spectator director, the match intro, kill cams and Play of the Game all use it.
- **Replays** (`game/replay.js`, `game/highlights.js`): `REPLAY.play` shows a window of the recording (live, or a saved clip) through ghost rigs while the live pilots are hidden and the world keeps simulating. The kill cam replays your death through the killer's eyes. Highlights score kills (multikills, sprees, power moves), captures and returns from the event stream and save clips of the best three; at match end the best one plays as Play of the Game (title card, first person with slow motion on the kills, then an orbit). Each client picks from what it saw, so online players see the same moment in almost every match.
- **Game modes** (`game/modes.js`, `data/modes.js`): a mode registers with `defineMode({ id, name, settings, start })` and, while running, hands the engine a hooks object via `extPlay` (`tick`, `targets`, `respawn`, `onPlayerDeath`, `onFx`, `pickups`, `scores`, `switchTeam`, `exit`; all optional). Free-for-all (first to 15, 10 minutes, new match after 8 s), capture the flag, AI-vs-AI spectating and (in the trailer build) the trailer are registered modes; `startMode(id)` starts one. Every mode number (score and time limits, respawn delay, team size) lives in `data/modes.js`.
- **Maps as data** (`data/maps.js`): each map is a versioned document (schema 1) of pieces with stable ids (`box`, `stairs`, `strip`; `twin: true` adds a 180° rotated copy for symmetric team maps), spawns, pickups, flags and lane hints. `validateMap` checks a document strictly (safe for untrusted files: types, ranges, counts, materials, ids, weapons) and `buildMap` turns it into meshes and collision; built boxes keep their piece id (`b.pid`). Navigation is built from the resulting collision boxes. A new map is a new document; a map editor or import only has to produce one.
- **Sandbox** (`game/sandbox.js`, `SANDBOX_DEFS` in `core/settings.js`): every tuning number in the Sandbox settings tab is applied to the live data (movement in `TUNE`, weapons in `WEAPON_DATA`, grenades in `NADES` / `NADE_TUNE`). The AI reads the same data, so `tools/tune.js` can measure a change by playing headless matches. Online, the room host shares its sandbox in presence and everyone else plays by it (`setSandboxOverride`) until they leave; saved settings are never touched.
- **Items on the floor** (`weapons/pickups.js`): power spawns (with rotation through `POWER_ROTATION`) and dropped items share one shape (`type`, `pos`, `avail`, `take()`). Grenades and ammo for a carried weapon are taken by walking over them (`autoTake`); other weapons need a held interact (`swapFor`). In the arena, drops travel as `drop` / `take` fx; in CTF the host owns `G.items` and clients claim them.
- **Drop pods** (`game/pods.js`): `dropPod(pos, color, { onLand })` is purely visual plus a callback; the caller places the pilot on landing and applies the crush (`podCrush` in the arena, the host in CTF). Pods fall from `POD_HEIGHT` (200 m) in `POD_TIME` (2.6 s); the longer fall is spectacle only, so a pod launches `POD_EARLY` seconds before the respawn time and the time out (respawn delay + 1.35 s) is what it was with the old 70 m drop (all in `data/modes.js`; players, drones, CTF AI and online all use them). The spawn point is picked once when the respawn starts; one without open sky falls back to an in-place spawn at the usual time. Jump, fire or melee skips your pod camera. While you ride your own pod, move steers where it lands (`steerPod`, 9 m/s, within 14 m of the chosen spawn, only onto ground with open sky, locked for the last 18% of the fall); the mouse turns the pod camera, a ring marks the landing point, and a `podto` fx tells the room. A mode can limit it with `EXT.podZone()` (CTF: within 26 m of your own flag stand, on your half). The `spawnStyle` setting switches back to in-place spawns.
- **Per-frame hooks** (`game/frame-hooks.js`): features that only need the frame time register with `onFrame(fn, { menu, full })`; the loop runs them after the world and camera move and before the HUD and render.
- **AI on any map** (`modes/ctf/map.js`, `nav.js`): `CTF.useMap(id)` picks the map a match is built on and derives its flags, spawns, pickups and lanes; the nav grid sizes itself from the map's bounds. A map without flags plays team deathmatch (every bot hunts, kills score), which is how the simulations measure the arena.
- **Spawn safety** (`world/spawns.js`, shared with the simulation worker): every spawn (pods and classic, arena and CTF, players and AI) scores the map's spawn points with `pickSpawn`: an enemy with a clear line to the spot costs a lot (more if they are looking that way), enemies within 30 m and hits or kills in the last 10 s within 18 m cost per metre, and a little jitter keeps equal spots unpredictable. Weights are in `SPAWN_W`. In the arena everyone else alive is an enemy (drones count you); CTF counts the other team. Spawn protection (1.2 s) ends as soon as you fire, throw or melee.
- **Stats** (`game/stats.js`, `ui/stats-ui.js`): a subscriber to the event stream (kill, damage, shot, medal, flag events) that keeps per-pilot numbers and a timeline of big moments; the mode's roster (`EXT.roster`, or the arena's players) supplies who is in the match, teams and the score of record, so the same tables work offline, hosting, as a client and after a host migration (rows follow a pilot by name and team when ids change). The roster (Tab) and the results screen (`showPost`) share one sortable table.
- **HUD cues:** `ui/power.js` (power spawn timer, pickup callouts and holder marks from `EXT.powerHolders`), `ui/damage-dir.js` (arcs toward whoever hit you), `sfxAt` in `core/audio.js` (stereo-panned, distance-shaped sounds), hit-marker kinds in `hitMarker`/`hitKind` (`game/state.js`).
- **Map dressing** (`world/dress.js`): runs inside `buildMap` before merging and never adds collision. The worker build skips it (it has no `dressMap`).
- **Draw-call budget:** static map pieces are merged into one mesh per material when a map is built (`mergeMapGroup`; destructible cover keeps its own meshes), and each pilot's parts are merged per bone and material with one shield shell per bone (`mergeParts`, geometry shared by all pilots). Bloom runs at quarter resolution and tone mapping happens once, in the composite pass. Worst-case views went from ~466 to ~305 draw calls in the arena and ~955 to ~545 in CTF; `tests/budgets.json` holds the limits.
- **Multiplayer topology** (`net/p2p-transport.js`): the room host relays presence (reliable: names, scores, hits, events, flags); every pair of players also has a direct unordered, no-retransmit link for movement (full mesh, hub relay as fallback). Rooms expose `fast(buffer, to?)`/`onFast(fn)` on top of the presence API, so a transport without them (a relay server, a platform room service) still works on presence alone. The host names a backup; if the host leaves, everyone moves to the backup and the room carries on (`migrate`), and the backup claims the room code. The host can hand the room to a suggested better host. A CTF match survives its host leaving: the successor (room backup if in the match, else the lowest peer id) rebuilds a real match from its mirror (time, score, flags, agents) and hosts it under the same match id (`promote` in `modes/ctf/modes.js`).
- **Remote playback** (`net/playback.js`): movement packets are timestamped with the sender's clock; each remote player has a buffer with an estimated clock offset and an adaptive delay (about one send interval plus jitter), sampled every frame with interpolation and brief extrapolation. Arena movement goes out at 40 Hz, CTF movement at 30 Hz.
- **Lag compensation:** a client's hit on an AI carries the host-clock time the client was seeing; the host checks the hit against the recorder's position for that target at that time.
- **Background simulation** (`src/worker/`, built to `sim-worker.js` next to `index.html`): the simulation modules (physics, destruction, grenades, map, the CTF AI and rules) with rendering stubbed out by `three-lite.js`. AI training runs there, so it never stalls rendering; pages opened from a file fall back to slices on the main thread. The headless tests load the exact same bundle (`tools/sim-bundle.cjs`). Live matches still simulate on the main thread: the measured AI step is ~0.2 ms per frame, so moving it would add a frame of latency for no visible gain; the worker bundle is the path if that changes (bigger matches, more AI).
- **Network messages** (`net/messages.js`): every message is defined once (id, reliable or fast channel, typed fields such as `v3:100` fixed-point vectors, wrapped angles and capped strings). `MSG.encode`/`MSG.decode` are generated from the definitions; decode returns `null` for anything truncated, padded, unknown or out of range and never throws (fuzzed in `tests/messages.test.js`). `MSG.PROTOCOL` is checked by the transport when a friend joins: a mismatch shows both players a clear "different versions" message. Bump it whenever a message changes shape.
- **Save data** (`core/store.js`): everything saved is a named, versioned document (`pilot`, `settings`, `ctfTeam`, `ctfBrain`) in an envelope `{app, doc, version, savedAt, data}`. `STORE.load` runs migrations then the document's `clean()`, ignores junk and leaves saves from a newer build untouched; `STORE.save` keeps the previous copy as `<key>.bak` (`STORE.restoreBackup`). The backend (`get/set/remove/keys`) is swappable, so career stats, map files and a chosen save folder can be added as more documents and another backend.
- **Network diagnostics:** each connection is a `Link` that measures round trip, jitter, loss and bandwidth. `?netsim=latency,jitter,loss%` (or `KAHOST.net.setSim`) adds simulated lag and loss to everything a tab sends; F4 shows the panel and F3 the performance overlay. `tests/net.test.js` records how far behind and how far off a remote player is drawn under ideal and bad links.

## Roadmap mapping

| Roadmap item | Where it lands |
|---|---|
| Host migration, relay server | `net/p2p-transport.js` (transport), `net/ctf-host.js` and `net/ctf-client.js` (state handoff) |
| More maps and modes | `world/maps/*`, `modes/*` using the `KA` API; CTF rules in `modes/ctf/rules.js` |
| ES modules and a bundler | convert one engine module at a time to `import`/`export`, starting from the leaves (`core/prelude.js`, `world/physics.js`); `build.mjs` can switch to esbuild without changing the output contract |
| Web Worker / WebAssembly (not needed today: the simulation costs well under 1 ms per frame) | `world/physics.js` (`Body`, raycasts), `modes/ctf/nav.js`, and `modes/ctf/agent.js` are pure simulation with no DOM access and are already exercised headless by `tests/lib/headless.js` |
| WebGPU renderer, newer three.js | `render/*` only; gameplay code does not touch the pipeline |
| Desktop packaging | wraps the built `index.html` unchanged |

## Developer console

In a dev build (`npm run dev`) or with `#dev` in the page address, backquote opens a console: `tp`, `give`, `god`, `timescale`, `bots`, `hitboxes` (the exact boxes shots are tested against), `nav` (the CTF AI's walkable grid), `net` (simulated latency, jitter and loss), `seed`, `events`, `pilots`, `perf`, `netpanel`, `kill`. Commands live in one table in `src/ui/console.js`; add new ones there.

## Scenario tests

`tests/lib/scenario.js` runs scripted situations against the real movement, collision, hit and rules code in Node, in milliseconds: place pilots, give them inputs per tick, then assert on positions, events and hits. `tests/scenarios.test.js` holds the current movement "feel contract" (walk, sprint, strafe, thrust, jump, slide, pound), hit registration (head and body boxes, crouching, walls) and CTF rules (pickup, capture, drop, reset). Sandbox tuning should change those numbers deliberately, in the same commit.

## Visual regression

`tests/visual.test.js` renders the menu, an arena view, a pilot close-up and a trailer frame (from the trailer build) with real three.js in software WebGL (the world frozen with `timescale 0`) and compares each with the approved screenshot in `tests/visual/` on a 160x90 downscale (mean difference ≤ 6/255, ≤ 3% of pixels changed a lot). When a look changes on purpose, approve it with `VISUAL_UPDATE=1 THREE_PATH=... node tests/visual.test.js` and commit the new PNGs; a failing run writes `<name>.actual.png` next to the approved one.

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

The trailer is not part of the game. `src/manifest.json`'s `trailer` section lists its modules (`modes/trailer-score.js`, `modes/trailer.js`), markup (`html/trailer.html`) and styles; `node build.mjs --trailer` writes `out/trailer.html`, the game plus those files, and the recorder, the previewer and the trailer tests open that page (`open(ctx, { trailer: true })` in `tests/lib/browser.js` builds it). The game's Watch trailer button plays the recorded `media/trailer.mp4`.

The trailer (`modes/trailer.js`) is a pure function of trailer time: live it is clocked by the music's audio context; for video capture it is stepped frame by frame (`KA.trailer.record()`, `KA.trailer.step(dt)`), and the score (`modes/trailer-score.js`) renders to a file through an `OfflineAudioContext`.

Each trailer shot is `{ t, setup, update(lt, dt, st), ts, look, mood }`: `ts(lt)` ramps time (slow motion), `look(lt)` sets depth of field and grade (`af(point)` focuses on a point), and `mood` sets the sun, sky and fog. Actors are `Pilot`s whose `ctl(actor, simTime)` returns input every 120 Hz physics step; `steer()` follows a route of points by turning toward a spot a little ahead on it, like a person running, so motion doesn't depend on frame rate. The physics emits a `bump` event when a body hits something solid at speed; the trailer logs those in `KA.trailer.diag.bumps`, logs any frame where the camera is inside geometry in `diag.cam`, and the browser test simulates the whole cut and fails on either. `tools/trailer-preview.js` runs the same check, renders contact sheets of stills, or short clips with the score.

The browser tests use stubs in `tests/stubs/`: a minimal three.js stand-in and an in-memory PeerJS replacement, so two or three tabs can play online against each other without a network. The build refuses to emit a module containing a closing script tag or an unresolved template directive.
