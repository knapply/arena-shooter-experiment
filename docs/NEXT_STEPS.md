# Suggested next steps

Ideas for what to build next, grouped by area and roughly ordered by value for effort within each group. Each one says why and where it would go. Nothing here is committed to.

## Gameplay and modes

Done: Team Slayer, free-for-all with AI that fights everyone, Team Oddball and callout zones as map data (`docs/ARCHITECTURE.md`, Game modes).

1. **King of the Hill** on the same framework as oddball: a hill zone (a callout zone with a flag on it), held time scored like the skull, the AI's roles from `assignBall` (hold, escort, hunt). A moving hill would use the skull's pod drop to announce each move.
2. **Retire the practice drones.** The practice arena (`#deploy`) still runs the drones' own simpler AI (`game/state.js`) and the arena's peer-to-peer presence play, because many tests and tools start there. Moving it onto a free-for-all `CTF.Game` with drop-in hosting would leave one AI to maintain.
3. **Mode-specific map features:** oddball and Slayer play on maps made for capture the flag and free-for-all. Hold spots for the skull (today: the middle of each callout zone near the skull's spot), Slayer spawns on Twin Foundry away from the flag stands, and a free-for-all spawn list for Twin Foundry would each be a few lines of map data.
4. **Human drop pods visible online in CTF.** Your own pod is local in CTF; other players only see AI pods (relayed by the host). Relay human pods the way the arena does (`pod` / `podto` fx).
5. **Spawn safety online for the arena host.** Each client picks its own arena spawn from what it sees. A host-advised spawn (or sharing recent fights) would make picks consistent.

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

1. **Screen-space reflections or planar reflections on the floor** for the arena's polished metal, with a quality setting.
2. **Light shafts** from the sky through the arena's openings: needs the sun visible in the sky shader and a depth-aware radial pass (the bloom bright pass is the starting point).
3. **Decals:** scorch marks under grenades and rockets, impact marks on walls, with a pooled decal mesh capped by quality.
4. **WebGPU renderer** behind the same `render/*` boundary, when three.js's WebGPU path is stable for the shaders used here.
5. **Character detail:** per-team armor patterns, emissive visor glows that pulse with shields, and a cloth tabard on the hips (the flag's cloth is the template).
6. **Motion capture as reference, not data:** the CMU motion capture library is free to use. Fitting the procedural gait's curves (stride, duty factor, knee and hip angles over the cycle) to a few mocap runs would improve realism with no download cost. Shipping the clips themselves would cost hundreds of KB.

## Sound

1. **Distance filtering and reverb:** a low-pass on distant shots and a short convolution reverb inside enclosed areas would add a lot of space. `sfxAt` is where both go.
2. **Footstep surfaces:** metal versus grating versus floor plates, chosen from the material under the foot (the rig's foot raycast already finds the ground).
3. **Adaptive music** for matches: the trailer's synthesized score engine could play low-key stems that intensify with the score or the flag state.

## Efficiency and engineering

1. **Build size:** the budget is 700 KB (raised from 600 for a third map, with detailed weapons and armor). The trailer and the movement tutorial are out of the game (the trailer is a separate recording build), which took the game from about 476 KB to about 418 KB. The largest modules are now `modes/ctf/agent.js` and `characters/rig.js`.
2. **ES modules for the engine:** the shared-scope concatenation works and is checked by the unused/duplicate-name lint. Converting leaf modules (`core/prelude.js`, `world/physics.js`) to import/export first would make dependencies explicit (see ARCHITECTURE's roadmap).
3. **Live matches on the simulation worker:** the AI step is about 0.15 ms per frame now. If matches grow (16 players, more AI), moving CTF's `G.step` to the worker is ready to do: the worker bundle already runs it.
4. **Continuous tuning:** the manual Tune workflow can run on a schedule and post a summary comment when any knob's effect crosses the noise threshold, so balance drift from code changes is caught early.
5. **Unify the drones with the agents:** the AI free-for-all mode now runs on the CTF agents; only the practice arena still uses the drones (see Gameplay 2).
6. **Test the post-match flow online:** the results screen is covered offline. A two-tab test of "Play again keeps the room" in CTF would protect the online path.
