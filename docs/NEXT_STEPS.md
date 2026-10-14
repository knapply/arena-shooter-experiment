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
3. **Lag compensation for player-vs-player hits in CTF:** arena hits between players and every CTF hit on the AI are rewound and checked (`net/hitcheck.js`), but in CTF a hit on another player is still applied by the victim's client with only a range and line-of-sight check. The victim could run the same rewound check against its own history, as the arena does.
4. **Act on confirmed cheating:** the host only reports hits the replay check confirms as impossible (network panel, results screen). Kicking, or ignoring a player's claims for the rest of the match, could follow once the false positive rate is known from real matches.

## Fun and feel

1. **Vehicles or a jump pad network** for the larger CTF map: movement is the game's identity, and mid-map launch pads would add routes.
2. **More medals and post-match moments:** pod kills, flag swings, skull kills, carrier kills, flag denials, clutch returns and last-second holds are in. Next: assists on a capture, a "hold the line" for defending the flag through a push, a skull kept for 30 s straight.
3. **Equipment slot** (a deployable shield or a grapple) with its own cooldown on the HUD kit chips.
4. **Spectator tools for online matches:** follow-cam for dead players, and the director camera from AI-vs-AI.

## AI

Done: learned positions per map (`modes/ctf/memory.js`), adaptive difficulty (Settings → Gameplay) and the magnum's rhythm at Legendary; measured in [TUNING.md](TUNING.md) (AI pass).

1. **Memory online:** the host's AI remembers the maps it has played on, but a client's never learns (it only mirrors). Sharing the host's memory in the room, or learning from mirrored kills, would make a host migration keep it.
2. **Adaptive difficulty per mode:** one level covers every mode today; free-for-all against eight bots is harder than a 4 v 4 at the same level. A level per mode (or a handicap by mode) would settle each one separately.
3. **Movement skill by level:** levels differ in aim, reaction and dodging, not in movement tech (slide jumps, clambers to high ground). Giving Legendary the movement a good player uses would show more of the skill ceiling in the simulations.

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

1. **Build size: done for now** (678 KB to 652 KB of the 700 KB budget). The motion capture clips are predicted and packed (42 to 24 KB); map validation, the trailer's cinematic look and offline audio rendering left the game (they ship in the simulation bundle and the trailer build); unused exports went. `node tools/sizes.mjs` lists where the rest goes: the styles (46 KB), `characters/rig.js`, `modes/ctf/agent.js`, `core/settings.js` (its descriptions are about 10 KB) and the maps. Further cuts would cost something: packing the map documents (about 6 KB, but they are the hand-edited format), or dropping the practice drones (see Gameplay 2).
2. **ES modules for the engine: started.** `core/store.js`, `core/rng.js`, `game/frame-hooks.js` and `data/modes.js` are ES modules; the build, lint, types, worker bundle and headless loader all handle them (`tools/esm.cjs`). The rest converts outward from these, a module at a time once everything it imports is converted; `core/prelude.js` needs setters first (other modules assign its `myColor` and `myArmor`), and `world/physics.js` depends on half the engine. See ARCHITECTURE's roadmap.
3. **Live matches on the simulation worker: measured, not moved.** A rendered 4v4 match spends 0.36 ms per frame in `G.step` on average (0.8 ms at the 95th percentile). A rendered step does its presentation and netcode inline, so moving it would turn that into messages and put the AI a frame behind you, for no measurable saving (ARCHITECTURE, Background simulation). Worth revisiting if matches grow to 16 players.
4. **Continuous tuning: done.** The Tune workflow runs weekly as well as by hand, with null controls, and writes which knobs moved skill share beyond the noise as its job summary (`tools/tune-summary.js`, docs/TUNING.md).
5. **Unify the drones with the agents: not yet.** The AI free-for-all mode runs on the CTF agents; the practice arena still uses the drones (`botStep` and friends in `game/state.js`, about 8 KB). What is left: the practice arena's play model (every client runs its own three drones next to the peer-to-peer presence play in `net/arena-net.js`, where a `CTF.Game` needs a host to own the AI), the menu's Practice drones toggle and the drones wandering behind the menu, the developer console's `bots`, the drone stats rows, and the browser tests and three preview tools that start from `#deploy` and read `KA.bots` (about 24 references). The path is Gameplay 2: run the practice arena as a free-for-all `CTF.Game` with drop-in hosting, then move those tests to it.
6. **Test the post-match flow online: done.** Two-tab tests cover Play again keeping the room online (`tests/net.test.js`).
