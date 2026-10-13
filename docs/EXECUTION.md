# How the code executes

A walkthrough of what runs, in what order, from opening the page to a frame on screen. For how the modules relate and where features live, see [ARCHITECTURE.md](ARCHITECTURE.md); for what each file declares, [MODULES.md](MODULES.md) (generated).

## 1. Build time: one file from many

`node build.mjs` reads `src/manifest.json` and produces:

- **`index.html`**: the page template (`src/html/index.html`) with every stylesheet inlined, HTML partials substituted, and one `<script>` holding the game:
  ```
  (() => { "use strict";
     <every engine module, concatenated in manifest order>
  })();
  <every mode module, each its own (function () { ... })() closure>
  ```
  So all engine modules share **one scope**: a top-level `const` in `core/settings.js` is visible to `game/loop.js`. Mode modules cannot see engine names; they use `window.KA` (built in `game/exports.js`) and talk to each other through `window.CTF`.
- **`sim-worker.js`**: the simulation subset (physics, destruction, spawns, grenades, rockets, the CTF map, nav, AI and rules) with rendering stubbed out by `worker/three-lite.js` and `worker/sim-prelude.js`. Headless tests and `tools/tune.js` load the same bundle through `tests/lib/headless.js`.
- **`docs/MODULES.md`** and **`docs/SANDBOX.md`** (the kill-time table, computed from `data/weapons.js`).

Minification is esbuild; `--dev` skips it and turns on the developer console.

## 2. Page load: top to bottom, once

The browser parses the HTML (menu, HUD, overlays are plain markup), loads three.js r128 from a CDN, then runs the game script. Engine modules execute **in manifest order**, and each one's top-level code runs immediately:

| Order | Module(s) | What happens at load |
|---|---|---|
| 1 | `core/store.js`, `core/rng.js` | Versioned save documents (`STORE`) and the seeded random source (`rand`). |
| 2 | `core/prelude.js` | DOM helper `$`, small math helpers, armor colors; reads the saved pilot (name, color, bot skill) into the menu. |
| 3 | `game/events.js`, `game/frame-hooks.js` | The event stream (`EVENTS.on/emit`), before anything that emits; the per-frame hook lists (`onFrame`) that HUD widgets and effects join as they load. |
| 4 | `core/settings.js` | The settings schema, presets and key/pad bindings; loads saved settings. |
| 5 | `render/renderer.js`, `pipeline.js`, `environment.js`, `perf.js` | WebGL renderer, scene, camera, lights, the procedural sky (with `SKY_TIME`), the post-processing materials and render targets. |
| 6 | `data/modes.js`, `data/maps.js` | Mode numbers, AI skill levels, pod timing; map documents and their validator. |
| 7 | `world/destruction.js`, `dress.js`, `maps/arena.js`, `physics.js`, `spawns.js` | **The arena map is built here** (`buildMap`): boxes become meshes and collision (`SOLID`), dressing is added and merged. `Body` (the 120 Hz movement capsule) and raycasts are defined. |
| 8 | `data/anim-clips.js`, `characters/anim.js`, `rig.js`, `game/recorder.js`, `game/pilot.js` | Motion capture clips (decoded here) and the locomotion blend space, the 32-bone pilot rig, the 30 Hz pose recorder, the `Pilot` registry. |
| 9 | `data/weapons.js`, `weapons/*`, `render/fx.js`, `cinema.js`, `atmosphere.js` | Weapon numbers, viewmodels, particle systems, camera toolkit, dust motes. |
| 10 | `game/sandbox.js`, `core/audio.js`, `announcer.js` | Sandbox overrides; synthesized sound (the AudioContext is created on the first click); speech callouts. |
| 11 | `game/state.js` | Game state (`me`, score, practice drones), local damage (`hurtMe`), the kill feed and hit markers. |
| 12 | `weapons/firing.js`, `core/input.js`, `gamepad.js` | Outgoing damage, input listeners (keyboard, mouse, touch, pointer lock), gamepad polling. |
| 13 | `game/deploy.js`, `game/modes.js` | The Deploy button handler, free-for-all rules, the mode registry (`defineMode`). |
| 14 | `net/*` | Wire message codecs, remote playback buffers, arena presence sync. |
| 15 | `ui/*`, `game/replay.js`, `highlights.js`, `intro.js`, `pods.js`, `pod-view.js`, `stats.js` | HUD, network panel, motion tracker, console, kill cam and Play of the Game, match intros, drop pods and their cockpit, match stats. |
| 16 | `game/loop.js` | The frame function (`frame`) and everything it calls per frame. Nothing runs yet. |
| 17 | `ui/settings-ui.js` (sets `gfxReady`), `weapons/pickups.js`, `ui/power.js`, `damage-dir.js`, `stats-ui.js`, `player/assists.js`, `ui/reticle.js` | Remaining UI, pickups and their visuals. |
| 18 | `game/exports.js` | Builds `window.KA` and **starts the loop**: `requestAnimationFrame(frame)`. |

Then the mode modules run, each registering itself: `modes/ctf/map.js` … `modes/ctf/modes.js` set up `window.CTF` (map, nav, brain, agent, rules, UI, host and client netcode) and register the CTF and AI-vs-AI modes with `defineMode`; In the trailer build only (`node build.mjs --trailer`), `modes/trailer-score.js` and `modes/trailer.js` register the trailer. None of them builds a match until asked.

## 3. Every frame

`frame(t)` (in `game/loop.js`) runs once per display refresh:

```
frame(t)
  requestAnimationFrame(frame)        schedule the next one first
  perfBegin()
  frameBody(t)                        everything below
  recLocal()                          record your pose for replays
  CON.frame(); updNetHud(); perfEnd()
```

`frameBody(t)` in order:

1. **Time.** `dt` = frame time clamped to 50 ms, scaled by the console time scale and cinematic slow motion (`CINE.timeK`); `now` advances; the recorder ticks.
2. **Housekeeping.** Destruction rebuild timers (`destrTick`), gamepad polling and menu navigation, roster toggling.
3. **Who owns the frame.**
   - A full-screen mode (`EXT.full`: AI-vs-AI spectating, the trailer in the trailer build) takes over and returns.
   - At the menu (`!playing`): an orbiting camera over the arena, drones wander, then render and return.
4. **You.**
   - Dead: the respawn countdown; then a drop pod (steerable, see `steerPod`) or an in-place spawn.
   - Alive: input becomes an input record (`inp`), and your `Body` steps at a **fixed 120 Hz** (up to 8 steps a frame, with one-shot inputs buffered between steps) so movement feels the same at any frame rate. Then weapon timers, reloads and firing (`fire`, `throwNade`, melee).
5. **The world.** Drones think and move (`botStep`). In a mode, `EXT.tick(dt)` runs it: in CTF that is the rules and AI stepping (`G.step`), host or client netcode, and the CTF UI (rigs, flags, waypoints).
6. **Camera.** Interpolated eye position (between physics steps), landing dip, bob, roll, FOV (sprint, slide, zoom); the pod cockpit (`podCockpit`) replaces it while you ride a pod, and eases you up out of the landed pod after (`podCockpitIdle`).
7. **Presentation.**
   - Viewmodel animation (`updVM`) and particle and debris effects (`updFX`).
   - Player grenades and rockets, rig posing for remote players and drones (`updRigs`, which calls `rig.update` and plays rig events: steps, swings, reload sounds).
   - Free-for-all rules (`ffaTick`), pickups, then the per-frame hooks (`runFrameHooks`): power weapon marks, damage arcs, atmosphere, the results screen and anything else registered with `onFrame`.
   - HUD and tracker, pings, kill cam and highlights, the match intro and replays.
   - Network presence (`sendPresence`), then **`renderFrame()`**.

`renderFrame()` (`render/pipeline.js`): the scene renders into a scaled half-float target. Bloom takes a bright pass and blurs it at quarter resolution. Cutscenes add depth of field. A composite pass then tone maps (ACES), applies FXAA and sharpening, and adds bloom, grade, vignette and grain to the screen. If the post shaders fail on a GPU, it falls back to plain rendering.

## 4. Starting and ending a match

- **Deploy** (`game/deploy.js`): reads the menu (name, drones, bot skill), makes the drones, emits `matchStart` (stats, highlights and the recorder reset on it), spawns you, starts the opening drop (`matchDrop`: you and the drones wait in orbit through the intro, then drop in together; the clock starts as the pods land), plays the intro and sets `playing`. CTF does the same for a rendered match (`G.start(true)` and `matchDrop` for each player).
- **A mode** (`startMode(id)` or its menu button): the mode builds its world (CTF swaps the arena map for Twin Foundry with `CTF.enterMap`), creates its rules object and hands the engine a hooks object with `extPlay(hooks)`: `tick`, `targets`, `respawn`, `spawnPoint`, `podZone`, `roster`, `powerHolders`, `scores`, `exit`, and so on. From then on `EXT` is that object and the loop calls it.
- **The end:** the mode emits `matchEnd`, plays Play of the Game (`playOfTheGame`), then shows the results screen (`showPost`) with Play again / Change mode / Leave. `leaveGame()` clears `EXT` (calling its `exit`) and shows the menu.

## 5. Online

- Hosting or joining (`net/p2p-transport.js`) opens a PeerJS room. Presence (names, scores, hits, effects, events) travels on a reliable channel at about 10 Hz. Movement goes on a fast unordered channel: 40 Hz in the arena, 30 Hz in CTF. Each is encoded by `net/messages.js`.
- Each remote player is a `Pilot` drawn from a playback buffer (`net/playback.js`) that estimates their clock and delays slightly to smooth jitter.
- In CTF, the host runs the rules and AI and sends snapshots (`net/ctf-host.js`). Clients mirror them, predict their own movement and send hits for the host to verify (`net/ctf-client.js`). If the host leaves, the backup takes the room, and a match in progress is rebuilt from the mirror (`promote`).

## 6. Headless: tests and simulations

`tests/lib/headless.js` evaluates the simulation bundle in Node with a fake `window`, so `CTF.Game({ mode: "sim", render: false, seed })` plays a full match without a browser in about a second per four minutes of play. Everything random in the simulation goes through the seeded `rand`, and resets restore the world exactly, so a seed replays the same match. `tools/tune.js` runs thousands of these on worker threads.
