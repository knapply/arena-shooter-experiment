# Extending the game

Recipes for the most common additions, with the files to touch and the checks that keep them honest. Read [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit and [EXECUTION.md](EXECUTION.md) for the order things run in.

Ground rules that apply to everything below:

- **Engine vs modes.**
  - Engine modules (`manifest.engine`) share one scope. A new engine file goes in `src/manifest.json` after everything it uses at load time. Calls made inside functions can reach modules listed later.
  - Mode modules (`manifest.modes`) only see `window.KA` (`game/exports.js`) and `window.CTF`. If a mode needs something new from the engine, export it from `game/exports.js`. The simulation bundle also needs it in `worker/sim-exports.js` (as a stub if it's visual).
- **The simulation must stay deterministic.**
  - Anything that affects play (AI, rules, spawns, physics) uses the seeded `rand()` / `K.rand()`, never `Math.random`, and must restore exactly on reset.
  - `tests/sim.test.js` replays a seed after other matches and fails otherwise.
- **Numbers live in data:**
  - `data/weapons.js` for weapons, melee, the switch time;
  - `data/modes.js` for mode limits, AI skill levels and pod timing;
  - `data/maps.js` for maps.
  - The sandbox and the tuning simulations read the same data.
- **Before pushing:** `bash tools/verify.sh render` (format, types, lint, the unused-name check, build, every test suite and the render/visual checks).

## A HUD widget or an ambient effect

1. Write `ui/my-widget.js` with an update function, and register it at the bottom of the file:
   ```js
   function updMyWidget(dt) { ... }
   onFrame(updMyWidget);                         // while playing
   // onFrame(fn, { menu: true, full: true })    // also behind the menu / in full-screen modes
   ```
   `game/frame-hooks.js` runs it at the right point of the frame, so `game/loop.js` needs no edit.
2. Markup goes in `src/html/index.html` inside `#hud` and styles in `src/styles/base.css`. Keep the HUD readable at 375 px wide and give it a `prefers-reduced-motion` fallback if it animates.
3. If it reacts to something happening, subscribe to the event stream (`EVENTS.on("kill", e => ...)`) rather than hooking gameplay code.

Examples: `ui/power.js` (power weapon timer and marks), `ui/damage-dir.js` (damage arcs), `render/atmosphere.js` (dust and breathing lights).

## A setting

Add an entry to `SCHEMA` in `core/settings.js`. For example:
```js
{ k: "myOption", tab: T_GAME, label: "My option", type: "toggle" | "range" | "select", def, min, max, step, opts, desc }
```
It appears in its tab, in the settings search, in export/import, and in the saved document automatically. Read it as `SET.myOption`. If changing it needs work beyond reading the value, handle that in `applySettings`.

## A weapon

1. Add an entry to `WEAPON_DATA` in `data/weapons.js`: damage, rate, magazine, spread, zoom and sounds. `docs/SANDBOX.md` regenerates its kill-time row on the next build.
2. Give it a viewmodel and its pose set in `weapons/viewmodels.js` (`VMW`), a third-person model in `characters/rig.js` (`weaponParts`, `WPN_RIG`), and a pickup model in `weapons/pickups.js` (`MODEL_PARTS`).
3. If it is a power weapon, add it to `POWER_ROTATION` and teach the AI to use it (`modes/ctf/agent.js`: see `shootSniper` / `shootRocket`). Add a `LOCK` value in `tools/tune.js` so it can be tuned on its own.
4. Network: the held weapon travels as two state bits (`NET.bitsOf`). A fifth weapon needs a third bit (the state word is a `u32`), and **`MSG.PROTOCOL` must go up**.

### Prototypes (Labs)

New content can ship off by default: give a weapon `lab: "<name>"` (it appears only on map pickups marked with the same `lab`, and power weapons join the rotation through `powerRotation()`), add the flag to `LABS` (`data/weapons.js`) and a row to `LAB_DEFS` (`core/settings.js`), and a knob in `tools/tune.js`. Map changes go in `MAP_MODS` (`data/maps.js`); `mapDoc(key, mods)` builds the modded document with its own id and navigation grid. Labs are off online (`LABS.on`). See [PROPOSALS.md](PROPOSALS.md).

## A map

1. Write a map document in `data/maps.js` (schema 1). It needs:
   - `bounds`;
   - `pieces` (`box`, `stairs`, `strip`; `twin: true` mirrors a piece for team maps);
   - `spawns.ffa` and/or `spawns.teams`.

   Optional fields: `flags` (capture the flag), `lanes` (`split`, `x`: lane hints for the AI), `pickups`, `zones` (callouts, below) and `gates` (blast walls that rise and sink on the match clock: `leaves` `[x, z, width, depth]`, `h`, `phase` 0 to 1 of the cycle, `twin`; see `world/gates.js`).
2. `validateMap` checks it strictly; `tests/maps.test.js` runs it, including overlap checks.
3. The AI can play it straight away: `CTF.Game({ map: "<id>", mode: "sim", render: false })`. The nav grid sizes itself from `bounds` and seeds reachability from the first flag or spawn. A map without `flags` plays team deathmatch. Check it with:
   ```bash
   MAP=<id> MATCHES=8 KNOBS=none node tools/tune.js
   ```
4. Callout names: a team map lists its own in `zones`, `[name, x0, z0, x1, z1, lowest y]` rectangles in Red's half (the first match wins; Blue's half is the same rotated, and "our"/"their" comes from the half). Without `zones`, `CTF.zoneName` (`modes/ctf/brain.js`) falls back to names written for Twin Foundry. Hadal Station is the example.
5. To offer it in the menu, add an option to `#ffaMap` (a map with `spawns.ffa`) or `#ctfMap` (a map with `spawns.teams`) in `html/index.html`. Online, the CTF host's pick and the arena room hub's pick travel in presence, so everyone loads the same map. Team deathmatch plays on any team map (`CTF.Game({ tdm: true })`; `MODE=tdm` in tools/tune.js).

## A game mode

1. Numbers go in `MODE_DATA` (`data/modes.js`). Register the mode with `defineMode({ id, name, settings, start })` (`game/modes.js`).
2. When it starts, hand the engine a hooks object with `extPlay(hooks)`. Every hook is optional:
   - Simulation: `tick(dt)`, `targets()`, `respawn()`, `spawnPoint()`, `podZone()`, `dropItems()` and `pickups()`.
   - Your HUD and stats: `roster()` (ids, names, teams, score of record, for the stats screens), `powerHolders()`, `radar()` and `scores(tbody)`.
   - Online: `onFx()` and `onPing()`.
   - Leaving: `exit()`.
3. Emit the standard events (`kill`, `flagTaken`, `capture`, `matchStart`, `matchEnd` and so on). Then the kill feed, medals, highlights, Play of the Game and the stats screens work without further code.
4. At the end, call `K.playOfTheGame(...)`, then `K.showPost({ title, sub, mode, again, change, leave })`.
5. Online modes follow the CTF pattern: host-authoritative rules (`net/ctf-host.js`), clients mirroring snapshots and predicting their own movement (`net/ctf-client.js`). Every new message goes in `net/messages.js`.

The flagless rules in `modes/ctf/rules.js` (team deathmatch on the arena, used by the simulations) are the starting point for a playable Slayer mode. That mode needs a menu entry, a score-only HUD (the CTF HUD shows flag states), and a scoreboard hook.

## AI behaviour

- **Skill levels:** `AI_SKILL` in `data/modes.js` covers reaction, aim error, sight, dodging, grenades, and magnum aim and pace. The practice drones read the same table.
- **Roles and goals:** `TeamBrain.assign` (`modes/ctf/brain.js`) hands out roles, and `Agent.objective` (`modes/ctf/agent.js`) turns a role into a goal point. Combat (target choice, gun choice, aim, movement tech) is in `Agent.think` / `pickGun` / `aimPoint`.
- **Measuring changes:** measure any behaviour change with `tools/tune.js` against null controls (see [TUNING.md](TUNING.md)), not by eye.

## Character animation

The pilot is a 32-bone rig (`characters/rig.js`) posed every frame from the body's state (`bodyState`), in two layers:
- **Locomotion from motion capture** (`characters/anim.js`): pelvis, spine, legs and the free arm's swing. A blend space over speed and move direction (relative to facing) mixes the clips on one phase (0 is the left foot's strike), with stride, cadence and stance length warped to the game's speeds and the hips turned toward the travel. A small state machine (idle/move, crouch, air, land) cross-fades between states. Planted feet lock in the world, follow the ground and step when turning on the spot; the rig's leg IK puts them there.
- **A fighting stance** on top of the capture (`anim.js`): the hips sit lower over wider-set feet with the knees out, narrowing with pace; jumps tuck the knees. The rig adds a forward hunch in every state, the gun carried up and out with the elbows wide, and hard leans into sprints and turns.
- **Procedural layers** in `rig.update`: the weapon pose and hand IK, aiming down sights, reloads (`RELOAD_T`, shared with the first-person viewmodel), melee, recoil, flinch, head look-at, breathing, lean springs, the special moves (slide, ground pound, clamber, jetpack, stabilizer) and deaths.

The clips are generated data (`data/anim-clips.js`). To change them, download the CMU takes the converter lists (`CLIPS` in `tools/mocap/convert.js`; B. Hahne's BVH conversion, one `<take>.bvh` per take) and run:
```bash
node tools/mocap/convert.js <folder with the BVH files>
```
A new gait is a new entry in `CLIPS` (take, cycle length range, travel direction) and a place in a blend-space tier in `anim.js` (`T_STAND`, `T_CROUCH`). `tests/anim.test.js` checks every loop closes without a pop and that planted feet drift under 3 cm a stride at every speed and direction, and times the animation per pilot.

Preview any change with:
```bash
THREE_PATH=three.min.js node tools/rig-preview.js gait    # run, sprint, jump
THREE_PATH=three.min.js node tools/rig-preview.js loco    # walk, strafe, backpedal, crouched run
THREE_PATH=three.min.js node tools/rig-preview.js poses   # idle, ADS, melee, reload
THREE_PATH=three.min.js node tools/rig-preview.js moves   # the armor up close, crouch, ADS, sprint, slide, death
```

## Sounds

Every sound is synthesized in `core/audio.js` (a `case` in `sfx`). Use `sfxAt(kind, position, range, volume)` for anything in the world, so it pans and is louder up close. The trailer's soundtrack and effects render offline through the same code.

## Tests to add

| Change | Where |
|---|---|
| Movement, hit rules, AI decisions, mode rules | `tests/scenarios.test.js` (headless, milliseconds) |
| Whole-match behaviour, determinism | `tests/sim.test.js` |
| UI, settings, online play | `tests/browser.test.js` (stub three.js, simulated peers) |
| Wire formats | `tests/messages.test.js` |
| A look that changed on purpose | `VISUAL_UPDATE=1 THREE_PATH=... node tests/visual.test.js`, then commit the PNGs |
