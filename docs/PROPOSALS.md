# Proposals: new weapons and map changes

Ideas to make the game more dynamic and competitive, the ones worth building prototyped behind flags, and simulations of each. The goal throughout: easy to pick up, an extremely high skill ceiling, and play that feels smooth and responsive.

Everything here is **off by default**. Turn prototypes on in **Settings → Labs** (offline matches only; online rooms always play the shipped game) or in simulation with `tools/tune.js` knobs (below). No existing default was changed.

## Summary

| Idea | What it is | Headline sim result | Recommendation |
|---|---|---|---|
| **Scattergun pads** (map + weapon) | A scattergun on each Twin Foundry wing platform, 60 s respawn | 9 to 10% of kills; pilots in the mid lane 53% → 47% (on all six seed sets; 37% at Legendary); kills 0.16 to 0.19 s faster; skill share −0.002 to −0.011 (5 of 6 seed sets negative) | **Ship as option** (Labs), playtest as a default candidate |
| **Pulse grenade** | Strips shields in 5 m (thrower's too), jams thrust 2.5 s, no damage | Fights end 0.06 to 0.24 s sooner; grenade kills −2 points; skill share within noise on CTF and in duels, a small consistent −0.006 on the arena | **Ship as option**, playtest |
| **Lighter melee** (rule) | A melee blow takes at most 40 shield, not all of it | Melee's share of kills unchanged (48% arena); fights last +0.10 to +0.23 s, **+0.44 s for Recruits on CTF** | **Ship as option**, worth a default-tuning look for accessibility |
| **Burst rifle** | 3-round precision bursts, four bursts kill (1.14 s) | Popular (15% of time held on CTF, 26% in duels); neutral on skill share in every mode | **Ship as option**; the AI cannot express its skill, so playtest |
| **High ring** (arena) | Bridges and spans that link every high platform round the arena | Neutral (skill share mixed sign, kills per minute unchanged) | **Ship as option** (movement playtest) |
| **Arc beam** | Continuous tracking beam | Underpowered: 5.6 to 6 s median kill on CTF alone; skill share 0.77 alone (below the carbine) | **Rework** (5 damage per tick tested better) or drop |
| **Scattergun in the power rotation** | A third weapon in the centre rotation | Invisible: 0.2% of time held, 1% of kills | **Rework** into the pads (above) |
| **Crossover doors** (Twin Foundry) | A doorway through each wing wall | No measurable effect (lanes, captures, skill share all within noise) | **Drop**, or rework as a back entrance (open question) |
| **Split power** (Twin Foundry) | Rockets move to the wing platforms | Rocket kills ×3, teamkills +7 to +15%, fights 0.18 to 0.21 s faster, skill share mixed | **Drop** (the pads do the same job better) |
| **Blast gates** (both maps) | Armoured walls rise out of the floor on a fixed cycle: four round the arena's core in turn, one across each half of Twin Foundry's mid lane | Twin Foundry: pilots in mid 53% → 39%, captures +11 to +37%, but skill share −0.003 to −0.017 (all six negative) and fights 0.05 to 0.33 s shorter. Arena and duels: within noise | **Ship as option** (Labs); the strongest lane-spread result so far, at about a point of skill share |
| **Core pillars** (arena) | Four pillars off the core's corners | Skill share **−0.016 to −0.025** (clear of noise on all six seed sets and every skill pairing) | **Drop** |

Existing behaviour found along the way (no change made; for the defaults-tuning pass):

1. **The AI fires automatic weapons 25% slower than players.** The simulation steps at 30 Hz and an AI pilot's fire cooldown is reset, not carried over, so the carbine (0.1 s interval) fires every 4 steps: 7.5 rounds per second against a player's 10. Every simulated carbine number is from a weaker carbine than the one players hold. The fix is one line in `Agent.shoot` (add the interval to the cooldown instead of setting it), but it moves every baseline, so it belongs in the tuning pass.
2. **Melee is the most common way to die on the arena at low skill:** 78% of kills at Recruit, 47% to 48% at Normal, 30% at Heroic, 14% at Legendary (CTF: 54%, 23%, 9%, 3%; the per-difficulty figures are from the first run). It is mostly finishing blows (see Lighter melee), so the lever is how eagerly the AI closes to melee range, not melee damage.
3. **Capture the flag stalls as skill rises:** captures per 4-minute match fall from 1.35 (Recruit) to 0.77 to 0.80 (Normal), 0.50 (Heroic) and 0.21 (Legendary). Defence wins at high skill on Twin Foundry. Neither the doors nor split power fixed it, so it is the main open map problem (see M7, the back entrance).
4. **Spawn deaths jump at Legendary on the arena:** 5.8% of deaths within 3 s of spawning, against 1.0% at Normal and 0.2% on Twin Foundry.

## How to try them

**In the game:** Settings → Labs. Weapons and the pulse grenade apply from your next respawn. The Twin Foundry changes (doors, split power, scattergun pads) apply from the next capture-the-flag match. Split power and the pads use the same two platforms, so pick one. Blast gates apply from the next match on both maps, the free-for-all arena included (they are built into both maps and stay sunk while the lab is off). The other arena changes (high ring, core pillars) are simulation-only for now: the free-for-all arena is built once at load and shared with online players, so it would need a rebuild path first.

**In simulation:**

```bash
node tools/tune.js labBurst labScatter labBeam labPulse labMelee labWeapons modDoors modSplit modPads
MAP=arena node tools/tune.js labWeapons labMelee modRing modPillars        # team deathmatch on the arena
node tools/tune.js labGates                                               # blast gates (MAP=arena too)
GATES=1 node tools/tune.js labGateOpen labGateShut labGateOnly             # gates on: their cycle, subsets
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
- **Defaults, and a replication:** the full-match runs and the weapon locks were run twice. The first time was on the defaults before main's tuning pass three (frag fuse 2.2 s). The second time was on pass three (frag fuse 2.6 s, merged into this branch). The tables and the numbers per seed set below are from the **second run (2.6 s fuse)**, unless a line says otherwise. Where the first run disagreed, the text says so; "six seed sets" means both runs together. The difficulty sweep and the skill pairs (Recruit, Heroic, Legendary; Heroic vs Normal, Normal vs Recruit), the beam and burst damage tests, and the first lighter-melee and pads runs are from the first run only.
- **Determinism:** with every lab off, a seeded match is identical to the code before this work (checked by replaying the same seed on both), and `tests/sim.test.js` still replays seeds exactly.

### Baselines (null mean over three seed sets)

| | Skill share (L vs N) | Noise | Time to kill (quartiles) | Kills/min | Grenade kills | Spawn deaths | Other |
|---|---|---|---|---|---|---|---|
| CTF, Twin Foundry | 0.851 | ±0.007 to 0.013 | 1.7 / 3.2 / 5.0 s | 14.4 | 12.9% | 0.2% | 0.80 captures per match, 19.5 s from grab to capture; lanes 23 / 53 / 24% |
| Team deathmatch, arena | 0.793 | ±0.005 to 0.007 | 1.1 / 2.1 / 3.3 s | 29.5 | 15% | 0.9% | melee 48% of kills |
| Duel, arena | 0.778 | ±0.014 to 0.028 | 0.9 / 1.9 / 3.0 s | 4.7 | 14% | 1.7% | melee 46% of kills |

### Single-weapon skill share (Legendary vs Normal; two seed sets)

The Normal vs Recruit column is from the first run (2.2 s fuse); the first run's Legendary vs Normal numbers were within 0.02 of these.

| Weapon | CTF | Arena | Normal vs Recruit (CTF / arena) | Median time to kill, Normal vs Normal (CTF) |
|---|---|---|---|---|
| Magnum | 0.902, 0.916 | 0.911, 0.897 | 0.750 / 0.821 | 2.65 s |
| Burst rifle (lab) | 0.820, 0.833 | 0.808, 0.807 | 0.688 / 0.729 | 4.1 s |
| Carbine | 0.807, 0.803 | 0.794, 0.795 | 0.688 / 0.733 | 4.2 s |
| Arc beam (lab) | 0.773, 0.763 | 0.775, 0.768 | 0.662 / 0.717 | 5.6 to 6.0 s |
| Scattergun (lab) | 0.651, 0.651 | 0.668, 0.668 | 0.618 / 0.654 | 2.3 s |

For reference (docs/TUNING.md): sniper 0.79, rockets 0.53, grenades only 0.55.

## Weapons

### W1. MR-3 burst rifle (prototyped)

**What:** a primary (it takes the carbine's slot) firing 3-round bursts, 0.06 s between rounds, a burst every 0.36 s. Precision (no spread): every round goes where the reticle is at that instant. 8 body, 22 head once shields are down. Four bursts kill: **11 rounds, 1.14 s** if the last two are headshots; 15 rounds, 1.56 s body only. 2x zoom, 36 rounds, endless reserve. Pickups by each base (Twin Foundry) and on the arena's east and west sides, 30 s respawn.

**Why:** the magnum is the skill weapon, but it is a sidearm with click timing. The burst rifle is a primary that rewards **tracking through a burst** (three chances to stay on a strafing target in 0.12 s) and burst pacing. Pick-up-and-play: hold the trigger and it keeps bursting; with no spread, what you see is what you hit.

**Results:**

| | Skill share effect (seeds 100 / 700 / 1300) | Kills | Time held | Other |
|---|---|---|---|---|
| CTF | −0.002, +0.007, +0.019 (noise ±0.007 to 0.013) | 10.5% | 14.5% | time to kill −0.05 s |
| Arena | −0.004, −0.006, −0.003 (none clear) | 2.8% | 3.5% | teamkills −6% |
| Duel | +0.015, −0.003, −0.027 (noise ±0.014 to 0.028) | 13.6% | 26% | none |

- The first run (2.2 s fuse) agreed: CTF +0.009, −0.003, +0.003; arena +0.002, +0.004, 0.000.
- Alone: 0.82 to 0.83 skill share, between the carbine (0.80) and the magnum (0.91), with a carbine-like kill time.
- Damage 7 or 9 instead of 8 made no consistent difference (−0.015 to +0.013 across maps and seeds; first run).
- The AI picks it up eagerly when it passes one, so it is popular. It does not change how much skill decides a match.

**Recommendation: ship as an option and playtest.** The simulation can't see the skill this weapon is built for. The AI's aim error is drawn fresh for every round, so a burst is three independent shots, not a track. Humans will separate on it more than the AI does.

**Open questions:** Does it crowd out the magnum (both are precision weapons)? It took 5 points of held time from the magnum on CTF (55% → 50%). Should it be a spawn loadout option instead of a pickup?

### W2. SG-12 scattergun (prototyped)

**What:** a power weapon. 9 pellets of 14 in a 0.05 cone, full damage to 5 m, falling to a quarter by 16 m. One shot kills up close; two at mid range. 0.8 s pump, 6 shells plus 12. No headshot bonus. The AI draws it inside 13 m and puts it away beyond (with the switch time).

**Why:** there is no close-range power option. Counterplay is readable: range (the falloff), the pump (a 0.8 s window), and a loud boom with a mechanical rack. Easy to pick up (point and shoot up close); the ceiling is positioning, the pump timing, and for the other side, spacing.

**Results:**

- **In the power rotation** (sniper, rocket, scattergun at the centre): invisible. 0.2% of time held, 1.2% of kills, nothing outside the noise. A third rotation slot only comes round once a match.
- **Alone:** skill share 0.65 to 0.67. An equaliser, like the existing power weapons (sniper 0.79, rockets 0.53).
- **On the wing pads:** see M3. Its natural home.

**Recommendation: rework** from the rotation into the pads (M3).

### W3. AR-1 arc beam (prototyped)

**What:** a continuous beam: 4 damage per tick, 20 ticks a second (80 per second), no spread, no headshots. Falloff from 22 m to 40% by 40 m. Vents (reloads) after 2.5 s. Pickups on each Twin Foundry wing and on two arena corner platforms.

**Why:** tracking, holding the reticle on a strafing pilot, is the hardest aim skill and the one this game's movement (strafe reversals, thrust dodges) tests best. Nothing rewards it today. It is easy to read: damage on target is continuous, and misses show instantly.

**Results:** underpowered.

- **Alone:** median time to kill 5.6 to 6.0 s on CTF (the carbine is 4.2), skill share 0.76 to 0.78.
- **In full matches:** pilots hold it (11.5% of time in duels) but rarely kill with it (0.8%). Skill share on CTF −0.006, 0.000, −0.001; in duels +0.006, −0.012, −0.011 (inside the noise).
- **Rework tests (single weapon, first run):** 5 per tick gives arena +0.019 and +0.025 and CTF +0.003 and +0.010, with time to kill 0.3 to 0.7 s shorter. 6 per tick is no better.
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
| CTF | +0.002, +0.005, −0.002 | −0.15 s | −2.5 points | captures −0.08 per match (noise ±0.3) |
| Arena | −0.007, −0.005, −0.007 (two of three clear) | −0.06 s | −2.0 points | teamkills −7% |
| Duel | −0.013, +0.006, −0.014 (noise ±0.014 to 0.028) | −0.24 s | −4.3 points | |
| Pairs (CTF, first run) | Heroic vs Normal +0.009; Normal vs Recruit −0.010 | | | |

- The first run gave the same picture: CTF −0.010, +0.006, +0.008; arena −0.005, −0.006, −0.007; duels +0.004, +0.011, +0.020.
- Fewer grenade kills: pilots throw a pulse where they would have thrown a plasma.
- The only consistent signal is a small arena negative (six of six seed sets, about −0.006, at the edge of the noise).

**Recommendation: ship as an option and playtest.** Its value is in human combos the AI only half uses. The AI throws it, but doesn't time a magnum headshot to the strip.

**Open questions:** Should the thrower be immune (more accessible, less risk-reward)? Should it come from pickups instead of the spawn loadout?

### W5. Lighter melee (prototyped; found during the sims)

**What:** today the first melee blow on a shielded pilot takes **all** of their remaining shield, and the second kills, so two blows kill anyone. With the lab on, a blow takes at most 40 shield. Blows from behind, and blows on a pilot whose shield is gone, still kill.

**Why:** melee was 47% of arena kills, with a low skill share (0.68, against 0.86 for the magnum).

**Results:**

- **Melee's share of kills doesn't move:** 48% to 48% on the arena, 24% to 23% on CTF. Melee kills are finishing blows on pilots the guns already opened.
- **Fights last longer:** +0.10 s (CTF), +0.14 s (arena), +0.23 s (duels). The first run agreed (+0.08, +0.13, +0.24).
- **The biggest gain is at Recruit level (first run):** +0.44 s on CTF and +0.24 s on the arena. That is exactly where getting rushed is most common.
- **Skill share:** mixed sign everywhere: CTF −0.001, +0.006, +0.004; arena −0.006, +0.007, −0.012; duels −0.004, +0.008, +0.017. Arena Heroic vs Normal was +0.015 (noise ±0.013; first run).

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

**Results:** nothing moved. Skill share −0.005, +0.005, +0.006 (first run: −0.008, −0.006, −0.001). Lane use 53% in mid, unchanged. Captures −0.05 per match (first run +0.03), time to capture +0.9 s, time to kill unchanged. At Legendary (first run), time to capture fell 6 s on one seed set, but captures did not rise.

**Recommendation: drop as built.** The real open problem is that capture the flag stalls at high skill (finding 3). Rework the idea as a flag-room back entrance (M7), which adds attack routes where defence is winning.

### M2. Twin Foundry: split power (prototyped)

**What:** the tower's power spawn stops rotating (sniper only). The rockets move to the two wing platforms, one each side, 150 s respawn.

**Why:** spread the power fights over three positions instead of one.

**Results:**

- Rocket kills rise from 2.3% to 7.0%, sniper kills from 2.8% to 4.2%.
- Teamkills +7% (first run +15%).
- Time to kill −0.18 s (first run −0.21 s).
- Skill share −0.004, −0.018, +0.008 (first run −0.007, −0.003, −0.009).
- Captures +0.08 per match (noise).

**Recommendation: drop.** More rockets means more equalising and more friendly fire. The scattergun pads (M3) do the same job of drawing fights to the wings, with fewer teamkills.

### M3. Twin Foundry: scattergun pads (prototyped)

**What:** a scattergun on each wing platform (the raised walkways at x = ±24.5), 60 s respawn. The tower keeps its sniper and rocket rotation.

**Why:** a contested close-range power position on each wing, away from the long lines. It gives the wings a reason to be fought over, gives the scattergun a home where its counterplay (range) is natural, and rewards map control and timing.

**Results:**

- **Kills:** the scattergun takes 9.4% of kills (first run 9.8%).
- **Lane use:** mid falls from 53% to 47% on every seed set of both runs (47.6, 47.0, 46.3% against 53.5, 52.3, 52.8%); the wings go from 23/24% to 27/26%. At Heroic, mid is 50% to 41%; at Legendary, 45.5% to 37% (first run).
- **Speed:** fights are 0.16 s faster (first run 0.19 s). Teamkills are unchanged (first run −15%).
- **Captures:** +0.03 per match (noise); +0.31 at Heroic (first run).
- **Skill share:** −0.009, −0.013, +0.017 (two of three clear, mixed sign); the first run gave −0.007, −0.012, −0.013. Five of six seed sets are negative, averaging about −0.006, as expected for a power weapon. Heroic vs Normal +0.011 and Normal vs Recruit +0.006 (both inside ±0.03; first run).

**Recommendation: ship as an option, and playtest as the default.** It is the one change that measurably makes Twin Foundry more dynamic: fights spread across all three lanes, and more so as skill rises. The cost is the usual one for a power weapon, about a point of skill share.

**Open questions:** Should the respawn be 60 or 90 s? Should one pad hold a scattergun and the other a sniper? Should the pads also go on the arena's side balconies?

### M4. Arena: high ring (prototyped)

**What:** 20 thin slabs (tops at 2.4 and 2.5 m, walkable underneath) that bridge each corner platform to the balconies beside it and close the gap between the two balconies on each wall. The arena's whole perimeter can be run up high.

**Why:** movement routes and verticality. High ground you can rotate along instead of camp.

**Results:** neutral. Skill share −0.011, +0.003, +0.005 (first run +0.001, 0.000, −0.005). Time to kill unchanged, kills per minute unchanged, teamkills −2% (first run +4%). Heroic vs Normal −0.010 and Normal vs Recruit −0.016 (noise ±0.013 and ±0.014; first run).

**Recommendation: ship as an option, for a movement playtest.** The AI doesn't value high ground or movement routes beyond pathing, so this is exactly the kind of change the simulation cannot judge (TUNING.md, "Limits of the method"). It needs the free-for-all arena to build from map documents with mods first.

### M5. Arena: core pillars (prototyped)

**What:** four 1.4 m pillars, 4.6 m tall, off the core's corners at (±8, ±8).

**Why:** break the core top's long lines to the corner lanes.

**Results:** consistently bad.

- Skill share **−0.016, −0.024, −0.017**, clear of the noise on all three seed sets (first run −0.022, −0.015, −0.025, also all clear). Heroic vs Normal −0.016, Normal vs Recruit −0.014 (first run).
- Duels 0.000, −0.021, +0.006 (first run −0.008, −0.021, −0.007).
- Fights are 0.15 s faster (0.24 s in duels), and teamkills are up 11%.
- Close-corner ambushes favour whoever is already there, not who aims better.

**Recommendation: drop.**

### M10. Blast gates (prototyped)

**What:** heavy armoured walls (4.6 m, 0.8 m thick, hazard chevrons) that rise out of a slot in the floor and sink back on a fixed cycle: open 10 s, rising 2.5 s, shut 8 s, sinking 2.5 s (23 s). A klaxon and flashing stripes warn 1.5 s before a gate moves either way, the hydraulics rumble while it moves and it lands with a thud (positional, `sfxAt`). A sunk gate's striped top stays flush with the floor, so you can see where a wall will come up, and the motion tracker shows a raised or warning gate as a bar.

- **Arena:** four gates round the ring about the core, a quarter cycle apart, so the shut side goes round the core: north and south between the core stairs and the barricade (cutting the long east-west lines at |z| 11 to 17), east and west in two leaves either side of the slab (cutting the north-south lines at |x| 8 to 17).
- **Twin Foundry:** one gate across the mid lane between the wing walls on each half (z = ±17.6), twins, shut together. When mid closes, play moves out to the wings; when it opens, back.

**How it works** (`world/gates.js`): a gate's state is a pure function of the match clock (`gateLift(g, t)`; `phase` staggers them, and every gate is open before its first cycle). Headless matches, replays, kill cams (they draw the gates as they were) and an online client following the host clock all agree with no messages. Leaves are ordinary collision boxes that move in place, so movement, bullets, grenades, rockets, blast line of sight and AI sight all see them as they rise. A rising gate never lifts or traps anyone: a pilot inside a leaf is moved out to the side they were on (`gateShove`, at the start of every `Body.step`), and nobody can step up onto a moving one. The AI's grid counts a gate as shut from 2 s before it starts to rise until it is fully down (patched like broken cover), agents re-plan the moment that changes, and attackers drop their lane bias while their lane's gate is shut. With the lab off the gates stay sunk and a seeded match is identical to one on the code before them.

**Results** (three seed sets, 48 matches per kind, null controls; effect against the null mean):

| | Skill share | Time to kill | Captures per match | Lanes (left / mid / right) | Other |
|---|---|---|---|---|---|
| Twin Foundry, Legendary vs Normal | −0.007, −0.015, −0.017 (noise ±0.005 to 0.010) | −0.17, −0.33, −0.16 s | 0.92 → 1.08, 0.78 → 0.92, 0.71 → 0.88 | 24/53/23 → 29/39/32 (every seed set) | time to capture unchanged |
| Twin Foundry, Normal vs Recruit | −0.003, −0.004, −0.015 (noise ±0.010 to 0.018) | −0.05, −0.17, −0.09 s | 1.39 → 1.54, 1.26 → 1.71, 1.23 → 1.69 | 21/57/21 → 30/41/29 | |
| Arena team deathmatch, L vs N | −0.006, −0.005, +0.001 (±0.003 to 0.010) | 0, +0.02, +0.06 s | | | kills per minute −0.7 to −1.2; spawn deaths 1.0% → 0.8% |
| Arena team deathmatch, N vs R | 0.000, −0.015, −0.010 (±0.009 to 0.017) | +0.05, −0.02, 0 s | | | |
| Duels, L vs N | +0.002, +0.027, +0.001 (±0.009 to 0.019) | −0.01, −0.08, +0.01 s | | | spawn deaths 1.3% → 1.1%, 2.5%, 2.3% |
| Duels, N vs R | +0.003, +0.007, −0.012 (±0.006 to 0.021) | +0.05, −0.04, −0.09 s | | | |

- **The first layout gated the wings too** (a gate across each wing on each half, the three lanes a third of a cycle apart). It was bad on every count on Twin Foundry: skill share −0.054 to −0.057 (Legendary vs Normal) and −0.025 to −0.034 (Normal vs Recruit), fights 0.43 to 0.49 s shorter, captures down 30 to 50%, and **mid use up** from 53% to 63%: with a wing shut more than half the time, everyone went mid. Mid gates alone (one seed set) took mid to 39%; wing gates alone took it to 81%.
- **Timing** (mid gates, one seed set, Legendary vs Normal): open 7 or 14 s, shut 5 or 11 s, and the two mid gates half a cycle apart instead of together all measured within the noise of the default (skill share 0.827 to 0.845). 10 / 2.5 / 8 is kept: it measured best and reads well (a gate is up about a third of the time).

**Recommendation: ship as an option (Labs), and playtest on Twin Foundry.** It is the strongest lane-spread result so far (better than the scattergun pads: mid 39% against 47%) and it gets captures moving, which is the main open map problem (finding 3). It does not meet the bar for a default: skill share is a little lower on all six Twin Foundry runs (about a point, like the pads), and fights are shorter, which costs the accessibility goal. Cutting long sightlines takes away the fights where aim decides most (see the core pillars, M5). On the arena it is neutral.

**Open questions:** Should a mid gate close only one half at a time, so the attacking side alternates? Should the warning be longer for new players? Would a gate that only rises to chest height (cover, not a wall) keep the lane spread without the skill cost? Online, the gates follow the host clock already in capture the flag; the free-for-all arena needs the host's match clock in presence (and a protocol bump) before they can ship online.

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
| Blast gates | `src/world/gates.js` (cycle, collision, `gateShove`), `src/render/gate-fx.js` (look, sounds), `gates` in `src/data/maps.js`; AI: `cellCalc` in `src/modes/ctf/nav.js`, `navTo` in `agent.js`, `costFn` in `brain.js` |
| Settings | `src/core/settings.js` (`LAB_DEFS`, the Labs tab); `src/game/sandbox.js` (`applyLabs`) |
| Player firing (bursts, pellets, falloff) | `src/weapons/firing.js`, `src/game/loop.js` |
| Pulse grenade | `src/weapons/grenades.js` (`NADES.pulse`, `pulseBody`) |
| AI | `src/modes/ctf/agent.js` (`prim`, `pw`, `held()`, `shootPellets`, bursts, pulse throws); `src/modes/ctf/rules.js` (lab pickups, `G.labs`, `opts.perTeam`) |
| Simulation | `tools/tune.js` (lab knobs, locks, `TEAM`, the new measures) |
| Tests | `tests/scenarios.test.js` (lab weapons, pulse, melee, labs off by default and online); `tests/maps.test.js` (every mod and pair validates; pickups stand clear) |
