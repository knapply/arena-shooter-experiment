# Suggested next steps

Ideas for what to build next, grouped by area and roughly ordered by value for effort within each group. Each one says why and where it would go. Nothing here is committed to.

## Gameplay and modes

1. **Team Slayer on the arena (playable).** The AI already plays team deathmatch on the arena for the simulations (`CTF.Game({ map: "arena" })`). A playable mode needs a menu entry, a score-only HUD (the CTF HUD shows flag states) and the results screen hook. It would give friends a team mode that isn't capture the flag. (`modes/ctf/modes.js`, `modes/ctf/ui.js`.)
2. **Free-for-all AI that fights each other.** The practice drones only ever fight you. Letting the CTF agents play free-for-all (every pilot its own team) would make the arena feel alive with friends and drones together, and would let the simulations measure the actual free-for-all mode. The agent code assumes two teams (`G.teams[1 - team]`); it needs an "enemies of" helper.
3. **King of the Hill and Oddball** on the mode framework: both reuse spawns, stats and the results screen. Oddball needs a carried object (the flag carry is the template).
4. **Callout zones as map data.** `CTF.zoneName` hardcodes Twin Foundry's geometry. A `zones` field in map documents would give every map proper callouts for the AI, pings and the kill feed.
5. **Human drop pods visible online in CTF.** Your own pod is local in CTF; other players only see AI pods (relayed by the host). Relay human pods the way the arena does (`pod` / `podto` fx).
6. **Spawn safety online for the arena host.** Each client picks its own arena spawn from what it sees. A host-advised spawn (or sharing recent fights) would make picks consistent.

## Competitiveness

1. **Ranked-style matchmaking within rooms:** a simple Elo or Glicko rating per player, saved as a document (`core/store.js`). Bots get fixed ratings by skill level, so a first rating forms quickly against them.
2. **Career stats:** `game/stats.js` already builds every number per match. Saving a summary per match (a `career` document) gives lifetime K/D, accuracy by weapon and medals, plus a profile screen.
3. **Server-side or host-side replay validation:** recordings and seeded simulation make it possible to re-check suspicious hit streams after a match.
4. **Tighter lag compensation for player-vs-player arena hits:** CTF AI hits are rewound by the host. Arena hits between players are applied by the victim; rewinding the victim's own history would be fairer on bad links.

## Fun and feel

1. **Vehicles or a jump pad network** for the larger CTF map: movement is the game's identity, and mid-map launch pads would add routes.
2. **More medals and post-match moments:** pod kills, flag denials, clutch returns. The event stream makes each one a few lines in `core/announcer.js` and `game/stats.js`.
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
5. **Unify the drones with the agents:** the arena's practice drones have their own simpler AI in `game/state.js`. Making them CTF agents in free-for-all (see gameplay 2) would remove a second AI to maintain.
6. **Test the post-match flow online:** the results screen is covered offline. A two-tab test of "Play again keeps the room" in CTF would protect the online path.
