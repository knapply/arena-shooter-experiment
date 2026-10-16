# Extending the game

Recipes for the most common additions, with the files to touch and the checks that keep them honest. Read [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit and [EXECUTION.md](EXECUTION.md) for the order things run in.

Ground rules that apply to everything below:

- **Engine vs modes.**
  - Engine modules (`manifest.engine`) share one scope. A new engine file goes in `src/manifest.json` after everything it uses at load time. Calls made inside functions can reach modules listed later.
  - An engine module may be an ES module instead (`core/store.js`, `core/rng.js`, `game/frame-hooks.js`, `data/modes.js`): `import { x } from "./y.js"` from other ES modules only, and `export` on its top-level declarations. The build strips both (`tools/esm.cjs`), the lint gives it only what it imports, and `node build.mjs` regenerates `types/engine-modules.d.ts` so script modules can keep using its exports by name.
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
2. Model it in `weapons/models.js` (`GUN_MODELS`): one list of parts (boxes, bevelled boxes, cylinders, the ammo counter) in the viewmodel's frame builds the first-person viewmodel, the gun in other pilots' hands and the floor model. Keep the muzzle where `muzzle` says and the sight where ADS looks. Parts flagged `a` (a slide or pump) cycle after each shot. Then give it hand points, poses (hip, aim, sprint, reload, low), a light colour and how a shot looks from behind it in `weapons/viewmodels.js` (`VMW`: `kr` kick recovery, `kj` random twist, `cyc` the action's travel and timing, `fl`/`fc` the muzzle flash; plus its holo glass or sight dot), and its fit in the hands in `characters/rig.js` (`WPN_FIT`: the offset that puts its grip in the hand and the materials it may use, one draw each per pilot; `WPN_RIG`). `tools/weapon-preview.js` screenshots every weapon in first person (hip, ADS, low ammo, and frozen coming up from a draw, firing, sprinting and mid-reload) and held by pilots.
3. If it is a power weapon, add it to `POWER_ROTATION` and teach the AI to use it (`modes/ctf/agent.js`: see `shootSniper` / `shootRocket`). Add a `LOCK` value in `tools/tune.js` so it can be tuned on its own.
4. Network: the held weapon travels as three state bits (8192, 32768 and 131072 in `NET.bitsOf` and the arena's presence), so weapons 0 to 7 fit. A ninth needs a fourth bit (the state word is a `u32`), and **`MSG.PROTOCOL` must go up**.

### Prototypes (Labs)

Map changes can ship off by default: put them in `MAP_MODS` (`data/maps.js`; `mapDoc(key, mods)` builds the modded document with its own id and navigation grid), add a row to `LAB_DEFS` (`core/settings.js`) and a knob in `tools/tune.js`. A feature with its own switch (like the blast gates) adds a flag to `LABS` (`data/weapons.js`) and reads it with `labOn`. Labs are off online (`LABS.on`). See [PROPOSALS.md](PROPOSALS.md).

## A map

1. Write a map document in `data/maps.js` (schema 1). It needs:
   - `bounds`;
   - `pieces` (`box`, `stairs`, `strip`; `twin: true` mirrors a piece for team maps);
   - `spawns.ffa` and/or `spawns.teams`.

   Optional fields: `flags` (capture the flag), `ball` (where oddball's skull comes down; default the middle), `zones` (callouts, below), `lanes` (`split`, `x`: lane hints for the AI), `pickups`, and `gates` (blast walls that rise and sink on the match clock: `leaves` `[x, z, width, depth]`, `h`, `phase` 0 to 1 of the cycle, `twin`; see `world/gates.js`).
2. `validateMap` (`data/map-check.js`, in the simulation bundle only) checks it strictly; `tests/maps.test.js` runs it on every map and mod, including overlap checks.
3. The AI can play it straight away in every mode: `CTF.Game({ map: "<id>", rules: "slayer", mode: "sim", render: false })` (`rules`: `ctf` needs `flags`; `slayer`, `ffa` and `oddball` play anywhere; without `rules` a map with flags plays capture the flag and one without Team Slayer). The nav grid sizes itself from `bounds` and seeds reachability from the first flag or spawn. Team modes use `spawns.teams` (each team together on its own side), free-for-all `spawns.ffa` (or both teams' spawns). Check it with:
   ```bash
   MAP=<id> MODE=oddball MATCHES=8 KNOBS=none node tools/tune.js
   ```
4. Callouts: a `zones` list names places for the AI's comms, pings and the kill feed. Each zone is `{ name, b: [x0, z0, x1, z1], y?: [low, high], side?: 0 | 1 }`; the first zone a point is in wins, so list platforms before the floor under them. A zone with a `side` is on that team's half: a team hears "our base" or "their base", everyone else "Red base". `tests/maps.test.js` checks every spawn and pickup is in a zone.
5. To offer it in the menu, add its key to the `maps` of the modes in `PLAY_MODES` (`data/modes.js`) that it suits.

## A game mode

The four match modes share one implementation: `CTF.Game({ rules })` in `modes/ctf/rules.js` (scoring, flags, the skull, respawns, the clock), the AI (`brain.js` roles per rules, `agent.js` objectives), the HUD and waypoints (`ui.js`), the netcode and `modes.js` (hosting, joining, spectating). A new set of rules (King of the Hill, say) is mostly a branch in each: a `RULES_DATA` entry and `MODE_DATA` numbers, its scoring in `G.step`, roles in `TeamBrain.assign`, a HUD side in `UI.sides`, its state in the host snapshot, and a `PLAY_MODES` card. A mode outside that framework registers itself:

1. Numbers go in `MODE_DATA` (`data/modes.js`). Register the mode with `defineMode({ id, name, settings, start })` (`game/modes.js`).
2. When it starts, hand the engine a hooks object with `extPlay(hooks)`. Every hook is optional:
   - Simulation: `tick(dt)`, `targets()`, `respawn()`, `spawnPoint()`, `podZone()`, `dropItems()` and `pickups()`.
   - Your HUD and stats: `roster()` (ids, names, teams, score of record, for the stats screens), `powerHolders()`, `radar()` and `scores(tbody)`.
   - Carrying something in both hands: `carrying()` (`"flag"`, `"skull"` or `""`: no guns or grenades, a one-hit melee), `carryNoRun()` (sprinting or thrusting drops it, through `dropFlag()`).
   - Online: `onFx()` and `onPing()`.
   - Leaving: `exit()`.
3. Emit the standard events (`kill`, `flagTaken`, `capture`, `ballTaken`, `matchStart`, `matchEnd` and so on; a kill can say what the victim `carried`, whether it was a `denial`, and the `zone`). Then the kill feed, medals (`core/announcer.js`: add a `MEDAL` entry and push it in `onKill` or a subscriber), highlights, Play of the Game and the stats screens work without further code; a moment for the results screen is one `STATS.mark(text, kind, team)` in a subscriber (`game/stats.js`).
4. At the end, call `K.playOfTheGame(...)`, then `K.showPost({ title, sub, mode, again, change, leave })`.
5. Online modes follow the CTF pattern: host-authoritative rules (`net/ctf-host.js`), clients mirroring snapshots and predicting their own movement (`net/ctf-client.js`). The snapshot names the mode and map (`md`, `mp`), so joiners build the same match; when its shape changes, bump `MSG.PROTOCOL`. Every new message goes in `net/messages.js`.
6. Rules a player can change (score and time limits) are settings in the Modes tab (`core/settings.js`), read through `modeRules(id)`; the menu card's limits and the Rules button follow them.

## AI behaviour

- **Skill levels:** `AI_SKILL` in `data/modes.js` covers reaction, aim error, sight, dodging, grenades, and magnum aim and pace. The practice drones read the same table.
- **Roles and goals:** `TeamBrain.assign` (`modes/ctf/brain.js`) hands out roles, and `Agent.objective` (`modes/ctf/agent.js`) turns a role into a goal point. Combat (target choice, gun choice, aim, movement tech) is in `Agent.think` / `pickGun` / `aimPoint`.
- **Measuring changes:** measure any behaviour change with `tools/tune.js` against null controls (see [TUNING.md](TUNING.md)), not by eye.

## Character animation

The pilot is a 32-bone rig (`characters/rig.js`) posed every frame from the body's state (`bodyState`), in two layers:
- **Locomotion from motion capture** (`characters/anim.js`): pelvis, spine, legs and the free arm's swing. A blend space over speed and move direction (relative to facing) mixes the clips on one phase (0 is the left foot's strike), with stride, cadence and stance length warped to the game's speeds and the hips turned toward the travel. A small state machine (idle/move, crouch, air, land) cross-fades between states. Planted feet lock in the world, follow the ground and step when turning on the spot; the rig's leg IK puts them there.
- **One-shots** over the gait (`play` in `anim.js`, with a body mask): chosen by the velocity's history (a braking `stop`, a `plant` on a reversal, a `start` from a standstill), the takeoff (`jumpRun` or `jump`) and the fall (`landHard`). `ANIM.hit` plays the captured stumble additively on the hips and spine, turned toward the push; `ANIM.emote` (cheer, flex, wave, shrug; `rig.emote`) plays standing and frees the arms. Each pilot idles in one of three captured idles and drifts between them. `characters/gaze.js` turns heads toward threats and pings and triggers the gestures (after a kill, at the end of a match).
- **A fighting stance** on top of the capture (`anim.js`): the hips sit lower over wider-set feet with the knees out, narrowing with pace; jumps tuck the knees. The rig adds a slight forward hunch, elbows wide, and leans into acceleration and turns.
- **How it reads from outside**, matched to third-person reference footage (the poses and timings are in `POSE` and `rig.update`):
  - The gun is carried level at the chest (low ready) and comes up to the shoulder to fire or aim, then stays up for a moment (`S.hotT`, `S.carry`).
  - A sprint hugs the rifle high against the chest in the right hand while the free fist pumps to the helmet.
  - A thrust splits the legs like a leap along the burst and leans into it.
  - The stabilizer hovers with one knee up.
  - A ground pound sits upright in its hover, then slams straight-legged with the free arm out.
  - A slide stays upright with the gun across the chest.
  - A charge leads with the right shoulder.
  - A grenade is thrown overhand by the free (left) arm: up beside the helmet, forward to the centre (it leaves the hand at about 0.12 s), down across to the hip, while the gun dips in the right hand and is back up by about 0.45 s. `rig.throwNade()` starts it (CTF agents from their `nade` event, other players from theirs, a client by the throw's origin: `rigThrowAt`); it is written into the drawn state as `st.throw`, so replays and kill cams keep it.
  - Hits barely move the body (the shield shows them).
  - Deaths either buckle at the knees and fold forward, or throw the body with the arms flung up (heavy weapons).
  - Poses follow the physics state and timings, so the Classic feel preset (floatier jump, sprint wind-up, slower clamber) animates as it plays: landings are judged by the height of the fall against the preset's own jump (an ordinary jump always lands light: the body rides the arc at standing height, sinks about 0.1 m and is back up in about 0.3 s without a bounce; only drops well beyond a jump land deep), and the sprint gait builds with the speed.
  - Weight: a jump pushes off (the legs drive through the first 0.1 s while the body already rises at full speed), the held gun lags the torso on a spring when the body rises, falls or turns fast, a shot kicks back through the shoulders (clavicles), and on a fast turn the hips trail and the torso follows half as much while the head stays on the aim.
  - Stairs: the body (`world/physics.js`) sets down on a step within a stair's height (0.46 m, the same as a step up) when it was standing and did not jump or thrust, so running down a flight it stays on the steps instead of sailing over them; the rig counts a short drop as ground, and when the body steps up or down at once the hips stay where they were in the world and the ground under the feet brings them along (`S.stepDy`, `L.gnd`). `tests/render.test.js` runs a pilot down and up a real flight: never airborne, never landing, and the hips' jolt at most three quarters of the body's.
- **Procedural layers** in `rig.update`: the weapon pose and hand IK, aiming down sights, reloads (`RELOAD_T`, shared with the first-person viewmodel), melee, recoil, flinch, head look-at, breathing, lean springs, the special moves (slide, ground pound, clamber, jetpack, stabilizer) and deaths. A melee blow has a wind-up, a strike and a follow-through (`meleeShape`, shared with the first-person viewmodel, which runs it on its own clock with a hitstop when it lands: `meleeLand`). The clamber is driven by the body's clamber state (`clK`, `clH` in `bodyState`): a hand on the ledge, a knee up, over the top; leaving any special move eases the legs back into the capture. A tabard (two flaps on spring-driven bones) hangs from the belt.
- **First-person hands** (`weapons/viewmodels.js`): a palm, jointed fingers and thumb, and armored plates, built once per grip shape (`HAND_POSE`: grip, wrap, flat) and merged per material; each forearm runs from the wrist to an elbow below the view (`handArm`). A weapon's support hand turns to its handguard with `lq`.

The clips are generated data (`data/anim-clips.js`). To change them, download the CMU takes the converter lists (`CLIPS` in `tools/mocap/convert.js`; B. Hahne's BVH conversion, one `<take>.bvh` per take) and run:
```bash
node tools/mocap/convert.js <folder with the BVH files> [more folders]
```
A new gait is a new entry in `CLIPS` (take, cycle length range, travel direction) and a place in a blend-space tier in `anim.js` (`T_STAND`, `T_CROUCH`). A one-shot is an entry in `SHOTS` (take, window in seconds, how its root is kept, `air` for jumps, `mirror`); capture glitches are bridged (`despike`). `tests/anim.test.js` checks every loop closes without a pop, every one-shot is free of glitches, planted feet drift under 3 cm a stride at every speed and direction and through stops, reversals, push-offs and turns on the spot, hits lean the right way, emotes give way to moving, and jumps and landings fit; and times the animation per pilot.

Preview any change with:
```bash
THREE_PATH=three.module.min.js node tools/rig-preview.js gait    # run, sprint, jump
THREE_PATH=three.module.min.js node tools/rig-preview.js loco    # walk, strafe, backpedal, crouched run
THREE_PATH=three.module.min.js node tools/rig-preview.js poses   # idle, ADS, melee, reload
THREE_PATH=three.module.min.js node tools/rig-preview.js moves   # the armor up close, crouch, ADS, sprint, slide, death
THREE_PATH=three.module.min.js node tools/rig-preview.js climb   # a clamber, from the side and three-quarters
THREE_PATH=three.module.min.js node tools/rig-preview.js react   # stop, plant, push-off, hard landing, hits, deaths
THREE_PATH=three.module.min.js node tools/rig-preview.js emote   # the three idles; cheer, flex, wave, shrug
THREE_PATH=three.module.min.js node tools/rig-preview.js abilities   # carry and fire, thrusts, stabilizer, ground pound, charge
THREE_PATH=three.module.min.js node tools/rig-preview.js throw   # a grenade throw, front and side
```

## Sounds

Every sound is synthesized in `core/audio.js` (a `case` in `sfx`). Use `sfxAt(kind, position, range, volume)` for anything in the world, so it pans, is louder up close, loses its highs far away and echoes in enclosed places. A step, landing or slide becomes its surface variant there by itself (`step`, `stepm`, `stepg`: floor plates, metal decks, gratings); add a new world sound you make yourself to `BODY_KINDS` so it echoes where you stand. The trailer's soundtrack and effects render offline through the same code.

A sound that lasts as long as something happens (a hover's thrusters) is a held sound: call `holdSound(key, on, position, volume)` every frame with a key per source (yours without a position). It fades in and out, follows the source, and is released once it stops; a source that stops reporting fades out by itself.

## Tests to add

| Change | Where |
|---|---|
| Movement, hit rules, AI decisions, mode rules | `tests/scenarios.test.js` (headless, milliseconds) |
| Whole-match behaviour, determinism (every mode on every map) | `tests/sim.test.js` |
| A mode from the menu, its rules for a player, the results, the room's mode online | `tests/modes.test.js` |
| UI, settings, online play | `tests/browser.test.js` (stub three.js, simulated peers) |
| Wire formats | `tests/messages.test.js` |
| A look that changed on purpose | `VISUAL_UPDATE=1 THREE_PATH=... node tests/visual.test.js`, then commit the PNGs |
