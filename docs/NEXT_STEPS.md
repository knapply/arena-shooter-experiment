# Suggested next steps

Ideas for what to build next, grouped by area and roughly ordered by value for effort within each group. Each one says why and where it would go. Nothing here is committed to.

## Gameplay and modes

Done: Team Slayer, free-for-all with AI that fights everyone, Team Oddball and callout zones as map data (`docs/ARCHITECTURE.md`, Game modes), human and supply drop pods visible online in capture the flag, and spawn safety online in the arena (shared fights).

1. **King of the Hill** on the same framework as oddball: a hill zone (a callout zone with a flag on it), held time scored like the skull, the AI's roles from `assignBall` (hold, escort, hunt). A moving hill would use the skull's pod drop to announce each move.
2. **Retire the practice drones.** The practice arena (`#deploy`) still runs the drones' own simpler AI (`game/state.js`) and the arena's peer-to-peer presence play, because many tests and tools start there. Moving it onto a free-for-all `CTF.Game` with drop-in hosting would leave one AI to maintain.
3. **Mode-specific map features:** oddball and Slayer play on maps made for capture the flag and free-for-all. Hold spots for the skull (today: the middle of each callout zone near the skull's spot), Slayer spawns on Twin Foundry away from the flag stands, and a free-for-all spawn list for Twin Foundry would each be a few lines of map data.

## Competitiveness

1. **Ranked-style matchmaking within rooms:** a simple Elo or Glicko rating per player, saved as a document (`core/store.js`). Bots get fixed ratings by skill level, so a first rating forms quickly against them.
2. **Career stats:** `game/stats.js` already builds every number per match. Saving a summary per match (a `career` document) gives lifetime K/D, accuracy by weapon and medals, plus a profile screen.
3. **Server-side or host-side replay validation:** recordings and seeded simulation make it possible to re-check suspicious hit streams after a match.
4. **Tighter lag compensation for player-vs-player arena hits:** CTF AI hits are rewound by the host. Arena hits between players are applied by the victim; rewinding the victim's own history would be fairer on bad links.

## Fun and feel

1. **Vehicles or a jump pad network** for the larger CTF map: movement is the game's identity, and mid-map launch pads would add routes.
2. **More medals and post-match moments:** pod kills, flag swings, skull kills, carrier kills, flag denials, clutch returns and last-second holds are in. Next: assists on a capture, a "hold the line" for defending the flag through a push, a skull kept for 30 s straight.
3. **Equipment slot** (a deployable shield or a grapple) with its own cooldown on the HUD kit chips.
4. **Spectator tools for online matches:** follow-cam for dead players, and the director camera from AI-vs-AI.

## AI

1. **Learned positions per map:** danger maps are already learned per match. Saving per-map hot spots would let bots pre-aim common routes on maps they've seen.
2. **Difficulty that adapts:** start at Recruit and step up after wins (the skill table is data, so interpolating between levels is easy).
3. **Use the magnum's perfect-kill rhythm at Legendary:** Legendary bots could pace their shots to the fire rate exactly when they're landing hits, and hold fire when they're not.

## Graphics

1. **Floor reflections: done.** Screen-space reflections on the polished floor plates, the tops of decks and the wet patches, as a quality setting: Reflections "Glossy + screen-space on the floor" (High: half resolution, 20 steps) and "high quality" (Ultra: 40 steps with each hit refined by bisection). The map's surfaces leave their reflectivity in the scene target's alpha (`render/surfaces.js`); rough surfaces scatter the ray and the composite blurs them by their roughness (`render/pipeline.js`). Low and Medium have none. Planar reflections were not needed: the floor is not one plane on any map, and a second scene render would double the draw calls.
2. **Light shafts: done** (Ultra). The rays come from the open sky near the sun, so they fan out from every edge that crosses it.
3. **Decals: done.** Bullet holes, scorches and pod craters in one pooled instanced mesh; the ring holds 24 (Basic combat effects: pod craters only), 64 (High) or 128 (Ultra) and overwrites the oldest.
4. **WebGPU renderer: not feasible on three.js r128.** The game ships r128 (a single CDN script), whose renderer is WebGL only; three.js's WebGPU renderer needs a much newer release, ES module imports and its node material system, which would mean porting every `onBeforeCompile` patch and post shader. Revisit only together with a three.js upgrade; `render/*` is still the only place it would touch.
5. **Character detail: done.** Per-team armor patterns (chevrons, camo, stripes) and a visor that pulses with the shield are in `characters/look.js`, and a short tabard hangs on the hips (two spring-driven flaps). A truly simulated cloth tabard (like the flag) is still open.
6. **Motion capture: done.** CMU takes drive the locomotion as compact clips (`data/anim-clips.js`, converted by `tools/mocap/convert.js`), blended in `characters/anim.js`.

## Sound

1. **Distance filtering and reverb: done** (`sfxAt` in `core/audio.js`). Positional sounds lose their highs with distance (a low-pass scaled by the sound's range) and send to one shared convolution reverb with a generated impulse, by how enclosed the sound and you are; your own sounds go through a body bus that echoes where you stand. Enclosure is a roof overhead or tall walls close by on several sides (8 rays), cached per 2 m cell. Neither map has roofs yet, so only lanes and corners between tall walls echo; a roofed room would ring fully.
2. **Footstep surfaces: done.** Floor plates, metal decks (platforms, cover, walls, gates) and gratings (stairs) each have their own step, landing and slide, picked from the collision box under the foot for you and, positionally, for every other pilot. A map piece's `mat` decides it (`FOOT_SURF` in `core/audio.js`); a `grate` material on catwalks would rattle too.
3. **Adaptive music** for matches: the trailer's synthesized score engine could play low-key stems that intensify with the score or the flag state.

## Efficiency and engineering

1. **Build size:** the budget is 700 KB (raised from 600 for a third map, with detailed weapons and armor). The trailer and the movement tutorial are out of the game (the trailer is a separate recording build), which took the game from about 476 KB to about 418 KB. The largest modules are now `modes/ctf/agent.js` and `characters/rig.js`.
2. **ES modules for the engine:** the shared-scope concatenation works and is checked by the unused/duplicate-name lint. Converting leaf modules (`core/prelude.js`, `world/physics.js`) to import/export first would make dependencies explicit (see ARCHITECTURE's roadmap).
3. **Live matches on the simulation worker:** the AI step is about 0.15 ms per frame now. If matches grow (16 players, more AI), moving CTF's `G.step` to the worker is ready to do: the worker bundle already runs it.
4. **Continuous tuning:** the manual Tune workflow can run on a schedule and post a summary comment when any knob's effect crosses the noise threshold, so balance drift from code changes is caught early.
5. **Unify the drones with the agents:** the AI free-for-all mode now runs on the CTF agents; only the practice arena still uses the drones (see Gameplay 2).
6. **Test the post-match flow online:** the results screen is covered offline. A two-tab test of "Play again keeps the room" in CTF would protect the online path.
