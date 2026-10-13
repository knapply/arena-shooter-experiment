# Proposals: new weapons and map changes

Ideas to make the game more dynamic and competitive, the ones worth building prototyped behind flags, and simulations of each. The goal throughout: easy to pick up, an extremely high skill ceiling, and play that feels smooth and responsive.

Everything here is **off by default**. Turn prototypes on in **Settings → Labs** (offline matches only; online rooms always play the shipped game) or in simulation with `tools/tune.js` knobs (below). No existing default was changed.

## Summary

| Idea | What it is | Headline sim result | Recommendation |
|---|---|---|---|
| **Scattergun pads** (map + weapon) | A scattergun on each Twin Foundry wing platform, 60 s respawn | 10% of kills; pilots in the mid lane 53% → 47% (37% at Legendary); kills 0.19 s faster; skill share −0.011 | **Ship as option** (Labs), playtest as a default candidate |
| **Pulse grenade** | Strips shields in 5 m (thrower's too), jams thrust 2.5 s, no damage | Fights end 0.07 to 0.20 s sooner; grenade kills −2 points; skill share within noise | **Ship as option**, playtest |
| **Lighter melee** (rule) | A melee blow takes at most 40 shield, not all of it | Melee's share of kills unchanged (47% arena); fights last +0.08 to +0.24 s, **+0.44 s for Recruits on CTF** | **Ship as option**, worth a default-tuning look for accessibility |
| **Burst rifle** | 3-round precision bursts, four bursts kill (1.14 s) | Popular (15% of time held on CTF, 24% in duels); neutral on skill share in every mode | **Ship as option**; the AI cannot express its skill, so playtest |
| **High ring** (arena) | Bridges and spans that link every high platform round the arena | Neutral (skill ±0.005, kills per minute unchanged) | **Ship as option** (movement playtest) |
| **Arc beam** | Continuous tracking beam | Underpowered: 5.6 to 6 s median kill on CTF alone; skill share 0.76 alone (below the carbine) | **Rework** (5 damage per tick tested better) or drop |
| **Scattergun in the power rotation** | A third weapon in the centre rotation | Invisible: 0.3% of time held, 1% of kills | **Rework** into the pads (above) |
| **Crossover doors** (Twin Foundry) | A doorway through each wing wall | No measurable effect (lanes, captures, skill share all within noise) | **Drop**, or rework as a back entrance (open question) |
| **Split power** (Twin Foundry) | Rockets move to the wing platforms | Rocket kills ×2.7, teamkills +15%, fights 0.21 s faster, skill share −0.006 | **Drop** (the pads do the same job better) |
| **Core pillars** (arena) | Four pillars off the core's corners | Skill share **−0.021** (clear of noise on all three seed sets and every skill pairing) | **Drop** |

Existing behaviour found along the way (no change made; for the defaults-tuning pass):

1. **The AI fires automatic weapons 25% slower than players.** The simulation steps at 30 Hz and an AI pilot's fire cooldown is reset, not carried over, so the carbine (0.1 s interval) fires every 4 steps: 7.5 rounds per second against a player's 10. Every simulated carbine number is from a weaker carbine than the one players hold. The fix is one line in `Agent.shoot` (add the interval to the cooldown instead of setting it), but it moves every baseline, so it belongs in the tuning pass.
2. **Melee is the most common way to die on the arena at low skill:** 78% of kills at Recruit, 47% at Normal, 30% at Heroic, 14% at Legendary (CTF: 54%, 23%, 9%, 3%). It is mostly finishing blows (see Lighter melee), so the lever is how eagerly the AI closes to melee range, not melee damage.
3. **Capture the flag stalls as skill rises:** captures per 4-minute match fall from 1.35 (Recruit) to 0.77 (Normal), 0.50 (Heroic) and 0.21 (Legendary). Defence wins at high skill on Twin Foundry. Neither the doors nor split power fixed it, so it is the main open map problem (see M7, the back entrance).
4. **Spawn deaths jump at Legendary on the arena:** 5.8% of deaths within 3 s of spawning, against 1.0% at Normal and 0.2% on Twin Foundry.

## How to try them

**In the game:** Settings → Labs. Weapons and the pulse grenade apply from your next respawn. The Twin Foundry changes (doors, split power, scattergun pads) apply from the next capture-the-flag match. Split power and the pads use the same two platforms, so pick one. The arena changes (high ring, core pillars) are simulation-only for now: the free-for-all arena is built once at load and shared with online players, so it would need a rebuild path first.

**In simulation:**

```bash
node tools/tune.js labBurst labScatter labBeam labPulse labMelee labWeapons modDoors modSplit modPads
MAP=arena node tools/tune.js labWeapons labMelee modRing modPillars        # team deathmatch on the arena
MAP=arena TEAM=1 node tools/tune.js labWeapons                            # one-on-one duels
LOCK=carbine,magnum,burst,scatter,beam KNOBS=none node tools/tune.js     # single-weapon skill share
LOCK=beam node tools/tune.js labBeamDmg                                  # a lab weapon's numbers
```

`tools/tune.js` now also reports, per variant: time-to-kill quartiles, each weapon's share of kills and of time held, each weapon's skill share (the better team's share of that weapon's kills; biased toward weapons the better team picks up more, so use the weapon locks for a clean number), captures and time to capture (from a grab at the stand), deaths within 3 s of spawning, and lane use in the middle of Twin Foundry (the share of pilot-seconds in the left wing, mid and right wing for |z| < 30).

## Method

- Real headless matches (physics, weapons, grenades, the full AI), 4 minutes each, run with `tools/tune.js` on 12 workers.
- **Full matches:** three seed sets (100, 700, 1300), 48 matches of each kind per variant per set. Skill matches are Legendary vs Normal (sides swapped every other match); "even" matches are Normal vs Normal. Modes: capture the flag on Twin Foundry, team deathmatch on the arena (4 v 4), and one-on-one duels on the arena (the closest the AI comes to free-for-all, since the practice drones only fight the player).
- **Null controls:** every run includes four run-speed nudges (±0.0001 m/s), so each variant's effect is measured against the mean of five null results. The noise band is the largest null deviation in that seed set. A result counts when it has the same sign on all three seed sets and clears the noise on most of them.
- **Every difficulty:** even matches at Recruit, Heroic and Legendary (32 matches each), and skill pairs Heroic vs Normal and Normal vs Recruit, for the weapons and every map change.
- **Single-weapon locks:** every pilot holds one weapon with endless ammo, no pickups, no grenades: carbine, magnum, burst rifle, scattergun, arc beam, on both maps, two seed sets, Legendary vs Normal and Normal vs Recruit.
- **Defaults:** the simulations ran on the defaults before main's tuning pass three (frag fuse 2.2 s, not 2.6 s). Effects are measured against same-run baselines, so they hold as differences; absolute numbers (grenade share, time to kill) will shift a little. Re-run with `tools/tune.js` to refresh.
- **Determinism:** with every lab off, a seeded match is identical to the code before this work (checked by replaying the same seed on both), and `tests/sim.test.js` still replays seeds exactly.

### Baselines (null mean over three seed sets)

| | Skill share (L vs N) | Noise | Time to kill (quartiles) | Kills/min | Grenade kills | Spawn deaths | Other |
|---|---|---|---|---|---|---|---|
| CTF, Twin Foundry | 0.850 | ±0.006 to 0.008 | 1.73 / 3.2 / 5.0 s | 14.5 | 13.3% | 0.2% | 0.77 captures per match, 20 s from grab to capture; lanes 24 / 53 / 23% |
| Team deathmatch, arena | 0.787 | ±0.005 to 0.007 | 1.0 / 2.1 / 3.3 s | 29.6 | 16% | 1.0% | melee 47% of kills |
| Duel, arena | 0.778 | ±0.016 to 0.031 | 0.9 / 2.0 / 3.0 s | 4.7 | 14% | 1.5% | melee 47% of kills |

### Single-weapon skill share (Legendary vs Normal; two seed sets)

| Weapon | CTF | Arena | Normal vs Recruit (CTF / arena) | Median time to kill, Normal vs Normal (CTF) |
|---|---|---|---|---|
| Magnum | 0.909, 0.904 | 0.895, 0.899 | 0.750 / 0.821 | 2.7 s |
| Burst rifle (lab) | 0.824, 0.821 | 0.806, 0.810 | 0.688 / 0.729 | 4.1 s |
| Carbine | 0.804, 0.797 | 0.812, 0.804 | 0.688 / 0.733 | 4.2 s |
| Arc beam (lab) | 0.761, 0.754 | 0.759, 0.769 | 0.662 / 0.717 | 5.6 to 6.0 s |
| Scattergun (lab) | 0.666, 0.656 | 0.684, 0.680 | 0.618 / 0.654 | 2.3 s |

For reference (docs/TUNING.md): sniper 0.79, rockets 0.53, grenades only 0.55.

## Weapons

### W1. MR-3 burst rifle (prototyped)

**What:** a primary (it takes the carbine's slot) firing 3-round bursts, 0.06 s between rounds, a burst every 0.36 s. Precision (no spread): every round goes where the reticle is at that instant. 8 body, 22 head once shields are down. Four bursts kill: **11 rounds, 1.14 s** if the last two are headshots; 15 rounds, 1.56 s body only. 2x zoom, 36 rounds, endless reserve. Pickups by each base (Twin Foundry) and on the arena's east and west sides, 30 s respawn.

**Why:** the magnum is the skill weapon, but it is a sidearm with click timing. The burst rifle is a primary that rewards **tracking through a burst** (three chances to stay on a strafing target in 0.12 s) and burst pacing. Pick-up-and-play: hold the trigger and it keeps bursting; with no spread, what you see is what you hit.

**Results:**

| | Skill share effect (seeds 100 / 700 / 1300) | Kills | Time held | Other |
|---|---|---|---|---|
| CTF | +0.009, −0.003, +0.003 (noise ±0.007) | 11.2% | 15% | time to kill +0.04 s; teamkills −10% |
| Arena | +0.002, +0.004, +0.000 | 2.9% | 3.7% | none |
| Duel | +0.001, −0.018, −0.027 (noise ±0.03) | 12.1% | 24% | none |

- Alone: 0.82 skill share, between the carbine (0.80) and the magnum (0.91), with a carbine-like kill time.
- Damage 7 or 9 instead of 8 made no consistent difference (−0.015 to +0.013 across maps and seeds).
- The AI picks it up eagerly when it passes one, so it is popular. It does not change how much skill decides a match.

**Recommendation: ship as an option and playtest.** The simulation can't see the skill this weapon is built for. The AI's aim error is drawn fresh for every round, so a burst is three independent shots, not a track. Humans will separate on it more than the AI does.

**Open questions:** Does it crowd out the magnum (both are precision weapons)? It took 5 points of held time from the magnum on CTF. Should it be a spawn loadout option instead of a pickup?

### W2. SG-12 scattergun (prototyped)

**What:** a power weapon. 9 pellets of 14 in a 0.05 cone, full damage to 5 m, falling to a quarter by 16 m. One shot kills up close; two at mid range. 0.8 s pump, 6 shells plus 12. No headshot bonus. The AI draws it inside 13 m and puts it away beyond (with the switch time).

**Why:** there is no close-range power option. Counterplay is readable: range (the falloff), the pump (a 0.8 s window), and a loud boom with a mechanical rack. Easy to pick up (point and shoot up close); the ceiling is positioning, the pump timing, and for the other side, spacing.

**Results:**

- **In the power rotation** (sniper, rocket, scattergun at the centre): invisible. 0.3% of time held, 1.1% of kills, no effect on anything. A third rotation slot only comes round once a match.
- **Alone:** skill share 0.66 to 0.68. An equaliser, like the existing power weapons (sniper 0.79, rockets 0.53).
- **On the wing pads:** see M3. Its natural home.

**Recommendation: rework** from the rotation into the pads (M3).

### W3. AR-1 arc beam (prototyped)

**What:** a continuous beam: 4 damage per tick, 20 ticks a second (80 per second), no spread, no headshots. Falloff from 22 m to 40% by 40 m. Vents (reloads) after 2.5 s. Pickups on each Twin Foundry wing and on two arena corner platforms.

**Why:** tracking, holding the reticle on a strafing pilot, is the hardest aim skill and the one this game's movement (strafe reversals, thrust dodges) tests best. Nothing rewards it today. It is easy to read: damage on target is continuous, and misses show instantly.

**Results:** underpowered.

- **Alone:** median time to kill 5.6 to 6.0 s on CTF (the carbine is 4.2), skill share 0.76.
- **In full matches:** pilots hold it (11% of time in duels) but rarely kill with it (0.7%). Skill share −0.006 to −0.011 in duels and CTF (inside the noise).
- **Rework tests (single weapon):** 5 per tick gives arena +0.019 and +0.025 and CTF +0.003 and +0.010, with time to kill 0.3 to 0.7 s shorter. 6 per tick is no better.
- **AI caveat:** the AI handicap in finding 1 hits the beam too (15 ticks a second instead of 20).

**Recommendation: rework or drop.** Before deciding:

- Try 5 per tick with a later falloff.
- Fix the AI fire cadence (finding 1).
- Give the AI a tracking model: aim error that drifts smoothly instead of being drawn fresh each tick.

If it still sits below the carbine, drop it.

### W4. Pulse grenade (prototyped)

**What:** a third grenade; each pilot carries one. It bounces like a frag on a 1.3 s fuse. The pulse takes every shield within 5 m to zero, the thrower's included. It does no health damage, and the strip counts as a hit, so shield regeneration restarts. It also jams thrust for 2.5 s. The AI throws it at a shielded enemy 6 to 16 m away.

**Why:** every grenade today ends fights; nothing opens one. The pulse rewards combos (pulse, then a magnum headshot: 50 damage), takes away the thrust escape, and risks the thrower. It is the safest thing in the game to experiment with: it cannot kill anyone, including you.

**Results:**

| | Skill share effect | Time to kill | Grenade kills | Other |
|---|---|---|---|---|
| CTF | −0.010, +0.006, +0.008 | −0.12 s | −2.4 points | captures +0.12 per match (noise ±0.3) |
| Arena | −0.005, −0.006, −0.007 (one of three clear) | −0.07 s | −1.8 points | kills/min +0.3 |
| Duel | +0.004, +0.011, +0.020 (noise ±0.03) | −0.20 s | −3.5 points | |
| Pairs (CTF) | Heroic vs Normal +0.009; Normal vs Recruit −0.010 | | | |

- Fewer grenade kills: pilots throw a pulse where they would have thrown a plasma.
- A small arena-only negative, and positive in duels where one-on-one combos matter most.

**Recommendation: ship as an option and playtest.** Its value is in human combos the AI only half uses. The AI throws it, but doesn't time a magnum headshot to the strip.

**Open questions:** Should the thrower be immune (more accessible, less risk-reward)? Should it come from pickups instead of the spawn loadout?

### W5. Lighter melee (prototyped; found during the sims)

**What:** today the first melee blow on a shielded pilot takes **all** of their remaining shield, and the second kills, so two blows kill anyone. With the lab on, a blow takes at most 40 shield. Blows from behind, and blows on a pilot whose shield is gone, still kill.

**Why:** melee was 47% of arena kills, with a low skill share (0.68, against 0.86 for the magnum).

**Results:**

- **Melee's share of kills doesn't move:** 47% to 47% on the arena, 22% to 23% on CTF. Melee kills are finishing blows on pilots the guns already opened.
- **Fights last longer:** +0.08 s (CTF), +0.13 s (arena), +0.24 s (duels).
- **The biggest gain is at Recruit level:** +0.44 s on CTF and +0.24 s on the arena. That is exactly where getting rushed is most common.
- **Skill share:** within noise everywhere. Arena Heroic vs Normal was +0.015 (noise ±0.013).

**Recommendation: ship as an option, and look at it in the defaults pass** as an accessibility change: more time to react when rushed, at no measured cost. For melee's share itself, look at the AI's closing behaviour (`genes.charge`, the melee range check in `Agent.think`).

### W6 to W12 (not built)

| Idea | Gap | Why not now |
|---|---|---|
| Charge lance: hold to charge, release a fast projectile that kills on a full-charge direct hit | A skill-shot power weapon with a telegraph | Needs a hold-to-charge input path for players and projectile leading for the AI (the rocket's lead code is the start). The strongest unbuilt weapon idea. |
| Remote-detonation launcher | Area denial with timing | Rockets alone score 0.53 skill share; another explosive is likely to equalise again |
| Smoke / sight grenade | On-demand sightline breakers | The AI sees by ray tests; smoke volumes would have to enter `rayWorld` for everyone |
| Deployable cover / bubble shield | Defence, flag holding | Needs the equipment slot (NEXT_STEPS) |
| Grapple / repulsor | Movement routes | Physics plus nav edges for the AI |
| DMR (semi-auto, 2x) | Mid-range precision | Dropped: guns have no damage falloff, so it duplicates the magnum |
| Homing / lock-on gun | | Dropped: the gun aims for you, which lowers the ceiling |

## Maps

### M1. Twin Foundry: crossover doors (prototyped)

**What:** a 3 m doorway in the middle of each 14 m wall between the wings and mid (pieces `wall22`/`wall23` split in two).

**Why:** mid and the wings only meet at the ends of those walls. Earlier rotations should make flanks a read rather than a surprise.

**Results:** nothing moved. Skill share −0.008, −0.006, −0.001 (one of three clear). Lane use 53.5% in mid against 53%. Captures +0.03 per match, time to capture −0.2 s, time to kill unchanged. At Legendary, time to capture fell 6 s on one seed set, but captures did not rise.

**Recommendation: drop as built.** The real open problem is that capture the flag stalls at high skill (finding 3). Rework the idea as a flag-room back entrance (M7), which adds attack routes where defence is winning.

### M2. Twin Foundry: split power (prototyped)

**What:** the tower's power spawn stops rotating (sniper only). The rockets move to the two wing platforms, one each side, 150 s respawn.

**Why:** spread the power fights over three positions instead of one.

**Results:**

- Rocket kills rise from 2.4% to 6.6%, sniper kills from 2.9% to 4.2%.
- Teamkills +21 per 48 matches (+15%).
- Time to kill −0.21 s.
- Skill share −0.007, −0.003, −0.009 (one of three clear, same sign).
- Captures +0.10 per match (noise).

**Recommendation: drop.** More rockets means more equalising and more friendly fire. The scattergun pads (M3) do the same job of drawing fights to the wings, with fewer teamkills.

### M3. Twin Foundry: scattergun pads (prototyped)

**What:** a scattergun on each wing platform (the raised walkways at x = ±24.5), 60 s respawn. The tower keeps its sniper and rocket rotation.

**Why:** a contested close-range power position on each wing, away from the long lines. It gives the wings a reason to be fought over, gives the scattergun a home where its counterplay (range) is natural, and rewards map control and timing.

**Results:**

- **Kills:** the scattergun takes 9.8% of kills.
- **Lane use:** mid falls from 53% to 47% (left and right wings go from 24/23% to 26/26%). At Heroic, mid is 50% to 41%; at Legendary, 45.5% to 37%.
- **Speed and friendly fire:** fights are 0.19 s faster, and teamkills fall 15%.
- **Captures:** +0.07 per match (noise); +0.31 at Heroic.
- **Skill share:** −0.007, −0.012, −0.013 (two of three clear), as expected for a power weapon. Heroic vs Normal +0.011 and Normal vs Recruit +0.006 (both inside ±0.03).

**Recommendation: ship as an option, and playtest as the default.** It is the one change that measurably makes Twin Foundry more dynamic: fights spread across all three lanes, and more so as skill rises. The cost is the usual one for a power weapon, about a point of skill share.

**Open questions:** Should the respawn be 60 or 90 s? Should one pad hold a scattergun and the other a sniper? Should the pads also go on the arena's side balconies?

### M4. Arena: high ring (prototyped)

**What:** 20 thin slabs (tops at 2.4 and 2.5 m, walkable underneath) that bridge each corner platform to the balconies beside it and close the gap between the two balconies on each wall. The arena's whole perimeter can be run up high.

**Why:** movement routes and verticality. High ground you can rotate along instead of camp.

**Results:** neutral. Skill share +0.001, 0.000, −0.005. Time to kill −0.03 s, kills per minute unchanged, teamkills +4%. Heroic vs Normal −0.010 and Normal vs Recruit −0.016 (noise ±0.013 and ±0.014).

**Recommendation: ship as an option, for a movement playtest.** The AI doesn't value high ground or movement routes beyond pathing, so this is exactly the kind of change the simulation cannot judge (TUNING.md, "Limits of the method"). It needs the free-for-all arena to build from map documents with mods first.

### M5. Arena: core pillars (prototyped)

**What:** four 1.4 m pillars, 4.6 m tall, off the core's corners at (±8, ±8).

**Why:** break the core top's long lines to the corner lanes.

**Results:** consistently bad.

- Skill share **−0.022, −0.015, −0.025**, clear of the noise on all three seed sets. Heroic vs Normal −0.016, Normal vs Recruit −0.014.
- Duels −0.008, −0.021, −0.007.
- Fights are 0.15 s faster (0.27 s in duels), and teamkills are up 8%.
- Close-corner ambushes favour whoever is already there, not who aims better.

**Recommendation: drop.**

### M6 to M9 (not built)

| Idea | Why | What it needs |
|---|---|---|
| M6. Gravity lifts / jump pads (base to tower) | Fast vertical routes, movement identity | A lift-volume piece type and "launch" edges in the nav grid (`modes/ctf/nav.js` has walk, clamber and drop edges today) |
| M7. Flag-room back entrance on Twin Foundry | Captures fall from 1.35 to 0.21 per match as skill rises; attackers need routes where defence wins | Stairs from the outer wing to the back of each base platform; no new mechanics. **The next map change to build.** |
| M8. Overshield or damage-boost pickup in an exposed spot | Risk-reward timing without another gun | A non-weapon pickup type (the item code assumes a weapon or grenades) |
| M9. Spawn-room cover | Spawn deaths | Not needed at Normal (0.2% CTF, 1% arena). At Legendary on the arena it is 5.8%, so revisit the arena's spawn safety (`world/spawns.js`) first |

## What shipping any of these needs

- **Online:** every lab is offline-only today (`LABS.on` is false in any room). To ship a weapon online:
  - The held weapon travels in two state bits, so weapons 4 to 6 need a third bit (`NET.bitsOf` / `applyBits`, and `myBits` in `net/arena-net.js`), and `MSG.PROTOCOL` must go up.
  - Host hit validation needs per-weapon damage caps (`net/ctf-host.js`, `net/arena-net.js`).
  - Map mods need to reach clients before they build the map.
- **Free-for-all arena mods:** the arena is built once at load. Arena mods need a rebuild path (like Twin Foundry's hidden-group swap) and the practice drones checked on the new geometry.
- **Polish:**
  - The scattergun's viewmodel sits a little low in frame.
  - The beam is drawn as rapid tracers; a real beam mesh would read better.
  - The pulse grenade has no distinct HUD icon beyond its name in the grenade line.
- **Size:** the prototypes add about 14 KB to the build (440 KB of the 600 KB budget after merging main).

## Files

| Area | Where |
|---|---|
| Lab flags and weapon data | `src/data/weapons.js` (`LABS`, `labOn`, `powerRotation`, `falloffAt`, the three weapons, `meleeDamage`) |
| Map mods and lab pickups | `src/data/maps.js` (`MAP_MODS`, `mapDoc`, `lab` on pickups) |
| Settings | `src/core/settings.js` (`LAB_DEFS`, the Labs tab); `src/game/sandbox.js` (`applyLabs`) |
| Player firing (bursts, pellets, falloff) | `src/weapons/firing.js`, `src/game/loop.js` |
| Pulse grenade | `src/weapons/grenades.js` (`NADES.pulse`, `pulseBody`) |
| AI | `src/modes/ctf/agent.js` (`prim`, `pw`, `held()`, `shootPellets`, bursts, pulse throws); `src/modes/ctf/rules.js` (lab pickups, `G.labs`, `opts.perTeam`) |
| Simulation | `tools/tune.js` (lab knobs, locks, `TEAM`, the new measures) |
| Tests | `tests/scenarios.test.js` (lab weapons, pulse, melee, labs off by default and online); `tests/maps.test.js` (every mod and pair validates; pickups stand clear) |
