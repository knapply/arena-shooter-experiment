# Sandbox tuning

Every number in **Settings → Sandbox** (movement, weapons, grenades) can be changed, and online everyone in a room plays by the host's values. This page explains how the defaults were chosen and how to test a change.

## The goal

Defaults should keep the game **accessible** (fights last long enough to react to, grenades don't kill their throwers, nobody needs perfect aim to contribute) while giving it the **highest skill ceiling** we can find: a better player should win more of their fights, and by a margin that grows with skill.

## How it is measured

`tools/tune.js` plays headless capture-the-flag matches with the real simulation (physics, weapons, grenades, rockets, the full AI) and varies one sandbox number at a time around its default. The AI reads the same data as players, so a change to the carbine or to movement changes how the AI fights too. Two kinds of match per variant:

| Match | What it shows |
|---|---|
| **Skill:** Legendary AI vs Normal AI (sides swapped every other match) | **skill share**, the fraction of kills the better team gets. Higher means skill decides more fights. |
| **Even:** Normal vs Normal | **time to kill** (median time from the first hit on a pilot to their death), kills per minute, the share of kills from grenades, grenade self-kills and teamkills. These stand for how the game feels to everyone. |

Each variant plays the same seeded matches as the baseline, so differences come from the setting, not from luck in which matches were drawn. Results were checked on more than one set of seeds before a default changed. How big an effect has to be is measured in each run with null controls (below).

```bash
node tools/tune.js                                  # sweep every knob
MATCHES=16 MINUTES=4 SEED=700 node tools/tune.js sbAccel   # more matches, a different seed set
TRY="sbAccel=80,90" node tools/tune.js sbAccel      # try specific values
LOCK=magnum node tools/tune.js sbMagDmg sbMagRate   # every AI pilot uses only the magnum
LOCK=carbine,magnum,sniper,rocket,nades KNOBS=none node tools/tune.js   # each single-weapon baseline
```

Every match is an independent job, spread over one worker thread per CPU core (`JOBS=n` to change); results are identical to a single-threaded run because each match is seeded on its own. `LOCK` gives every AI pilot one weapon with endless ammo (`carbine`, `magnum`, `sniper`, `rocket`, or `nades` for grenades only) and turns off power spawns, death drops and other grenades, so a weapon's own numbers can be tuned in isolation. `MAP=arena` runs everything as team deathmatch on the arena instead of capture the flag on Twin Foundry. Results are written to `tools/out/tune.json` (`OUT=name.json`); `node tools/tune-merge.js merged.json a.json b.json` combines runs (each row keeps its seed set, lock and skill change against its own baseline). The **Tune** GitHub Actions workflow (run by hand) does the same sweep as a matrix of knob groups and seed sets and commits the merged result to the `tune-results` branch.

### Null controls

Matches are chaotic: any change, however small, reshuffles every match, so a single baseline is one draw from a distribution. Each run therefore also plays four **null controls**, run speed nudged by ±0.0001 to ±0.0002 m/s, which cannot matter to play but reshuffle the matches like a real change does. The baseline and the controls give the noise for that seed set, and a variant's effect is measured against their mean. A default changes only when an effect has the same sign on every seed set, stands clear of the noise on each, holds in the weapon's own single-weapon run where it has one, and doesn't cost accessibility (time to kill, grenade self-kills, teamkills).

```bash
CTRL="sbRun=6.4001,6.3999,6.4002,6.3998"
for s in 100 700 1300; do MATCHES=48 MINUTES=4 SEED=$s TRY="$CTRL" OUT=big-$s.json node tools/tune.js; done
```

### Reproducibility (fixed in this pass)

Two bugs made a match depend on what was played before it in the same process, so identical settings gave different numbers (and a replayed seed could differ after other matches): cover restored at a match reset went back at the end of the collision list (ray and collision ties are decided by its order), and the AI's walkable grid patched after cover broke reopened cells the map build had pruned as unreachable (wall tops), permanently. Both now restore exactly; `tests/sim.test.js` replays a seed after two other matches that break cover.

## Results (after the AI got magnums)

The AI now carries the magnum (with skill-scaled aim) and aims from its own eyes (it measured range from the map centre before), so the numbers moved: Legendary vs Normal skill share is **0.839 to 0.843** (null noise ±0.002 to ±0.005 with 48 matches per kind), time to kill for Normal vs Normal about **3.0 s**, 14.8 kills per minute, 14% of kills from grenades. Three seed sets (100, 700, 1300), 48 matches of 4 minutes per kind, about 25 minutes on 32 cores.

Full matches (effect on skill share against the null mean, per seed set):

| Setting | Tried | Effect on skill share | Other effects | Decision |
|---|---|---|---|---|
| Sprint speed | 8.2, 9.8 | 8.2: +0.010, +0.013, +0.010; 9.8: mixed | none | Kept at 9. Every variant in this pass sits about +0.004 above the controls on average (the controls under-spread a little), so the real effect is under 0.01, and slower sprinting makes the maps feel bigger for everyone. Worth a playtest, not a default change. |
| Thrust speed | 14, 20 | 20: +0.014, +0.016, +0.009; 14: mixed | 20 shortens time to kill slightly | Kept at 17, same reasoning: about +0.01 after the common shift, and movement is better judged by playtesting (see the limits below). |
| Ground acceleration, air control, jump, gravity | as before | mixed signs across seed sets | none consistent | Kept. |
| Carbine damage | 8, 10 | 10: +0.011, +0.007, +0.008 in full matches, but −0.004 on average carbine-only | 10 shortens time to kill by 0.1 to 0.3 s | Kept at 9. The weapon's own run disagrees, and faster kills cost accessibility. |
| Carbine fire interval, spread, bloom | as before | mixed | 0.09 raises kills per minute | Kept. |
| Magnum damage | 18, 22 | 22: +0.011, +0.003, +0.007 in full matches; −0.005 magnum-only; 18: none | none | Kept at 20: no effect in its own run. |
| Magnum fire interval | 0.22, 0.3 | 0.22: +0.013, +0.013, +0.010 in full matches; +0.007, +0.007, −0.005 magnum-only | 0.22 would make the perfect kill 0.88 s | Kept at 0.26: not consistent in its own run, and the 1.04 s perfect kill is part of the accessibility goal. |
| Sniper body damage, fire interval | 50, 70; 0.5, 0.75 | within noise | 50 needs three body shots and lowers kills per minute | Kept at 60 and 0.62. |
| Rocket splash, radius | 120, 180; 3.4, 5 | radius 5: −0.017, +0.007, −0.016 rockets-only (and −0.006, 0, +0.002 in full matches) | radius 5 roughly doubles rocket teamkills | Kept at 150 and 4.2; 5 is worse on every count. |
| Grenade throw, bounce, fuse, radius | as before | mixed in full and grenades-only runs | 4.2 radius: fewer self-kills and teamkills, fuse 1.8: more grenade kills | Kept; no setting moved skill share consistently. |

Single-weapon baselines (Legendary vs Normal, every pilot with one weapon): **magnum 0.91**, carbine 0.80, sniper 0.79, grenades only 0.55, rockets only 0.53. The magnum is the skill weapon (landing every shot is what wins), the carbine is forgiving, and the power weapons and grenades are the great equalisers, as intended: in a full match they are rare, and skill share there is 0.84.

**Recruit** (the default for a first bot match) is genuinely easy: in Recruit-vs-better matches the better team gets **70% of kills against Normal, 83% against Heroic and 94% against Legendary** (0.704/0.707, 0.826/0.831, 0.936/0.946 on two seed sets), and Recruit pilots throw a tenth as many grenades (2% of kills from grenades in Recruit vs Recruit, against 14% for Normal). In Recruit vs Recruit, time to kill is 2.3 to 2.4 s once a fight starts, because Recruits engage late and close; they see 42 m instead of 75 and dodge a third as often.

No default changed in that pass.

## Pass three: both maps, the skill ceiling and picking the game up

The goal for this pass: smooth and responsive, easy to pick up, and a very high skill ceiling. Two pairings per map now: **Legendary vs Normal** (the skill ceiling: how much the better side wins) and **Normal vs Recruit** (picking it up: how a new player's fights go, with Recruit vs Recruit as the even matches, so time to kill is the beginner's). Strafe reversal, thrust cooldown and slide boost joined the swept knobs.

**Sweep:** every knob on both maps (team deathmatch on the arena, capture the flag on Twin Foundry), both pairings, seed sets 100 and 700, 24 matches of each kind per variant (4 minutes), 4 null controls per run. Null noise was ±0.004 to ±0.016 on skill share. Baselines: Legendary takes 78% of the kills against Normal on the arena and 85% on Twin Foundry; Normal takes 67 to 68% against Recruit on the arena and 70% on Twin Foundry. Recruit vs Recruit time to kill is 1.4 s on the arena and 2.5 s on Twin Foundry (Normal vs Normal 2.1 s and 3.1 s).

Three settings moved skill share the same way in most of the 8 cells (2 maps × 2 pairings × 2 seed sets): air control 24 (6 of 8), frag fuse 2.6 (7 of 8) and strafe reversal 120 (6 of 8). They were re-run on new seed sets (1300 and 1900, 32 matches per kind) with neighbouring values, plus grenades-only runs for the fuse:

| Setting | Confirmation (8 cells, new seeds) | Other effects | Decision |
|---|---|---|---|
| **Frag fuse 2.6** (was 2.2) | skill share +0.003, −0.001 / 0, +0.018 / +0.002, +0.007 / +0.013, +0.010: 14 of 16 cells positive over both rounds, about +0.007 on average (small, about one null spread) | **arena teamkills down in all 8 cells** (−7 to −31 per run), self-kills slightly down; grenades-only: arena +0.026, +0.022, Twin Foundry mixed (−0.025, +0.006) | **Changed to 2.6.** It nudges the skill ceiling up and makes frags fairer to play around: more time to get out of a grenade's way (and to punish someone who doesn't) without making them weaker at the centre. 2.4 behaved alike on skill share but not on teamkills; 2.8 was mixed. |
| Air control 24 | −0.003, −0.007 / −0.006, 0 / +0.001, +0.004 / −0.013, +0.037 | 21 and 27 no better | Kept at 18: the first round's effect did not repeat. |
| Strafe reversal 120 | +0.002, +0.004 / +0.004, +0.007 / −0.006, +0.001 / −0.003, −0.003 | none | Kept at 95: within noise. |
| Everything else (first round) | mixed signs | frag radius 5.8 nearly doubles teamkills on the arena | Kept. |

Movement knobs stay where they are: nothing in movement repeated across seeds, and how movement *feels* (responsiveness, smoothness) is something simulated pilots cannot judge. The step-up and clamber fix in this pass (stairs never clamber) is a feel change the simulation does not measure.

## All modes: team deathmatch on the arena as well as capture the flag

The free-for-all arena's own AI (the practice drones) only fights you, so the arena is measured with the CTF AI playing **team deathmatch** there: 4 v 4 on Proving Grounds, no flags, kills score (`MAP=arena`; see "A map" in [EXTENDING.md](EXTENDING.md)). The arena is small and open around its core: fights there are faster (time to kill 2.1 s, 30 kills per minute) and closer than on Twin Foundry (3.1 s, 14.7 per minute). Simulated matches run the full 4 minutes (no score limit), and kills per minute now use the minutes actually played (capture the flag can end early).

Every knob was swept on both maps with three seed sets (100, 700, 1300), 48 matches of each kind per variant, with null controls; Legendary vs Normal skill share is 0.77 to 0.78 on the arena and 0.84 on Twin Foundry (null noise ±0.003 to ±0.009).

| Setting | Arena (team deathmatch) | Twin Foundry (CTF) | Decision |
|---|---|---|---|
| **Frag blast radius 4.2** (was 5.2) | skill +0.020, +0.003, +0.008; self-kills −25, −59, −35; teamkills −74, −162, −78; grenade kills share −2 points | skill +0.012, +0.010, +0.008 (all clear of the noise); teamkills down on two of three sets | **Changed to 4.2.** The only setting that raised skill share on all six seed sets across both modes, and it makes grenades kinder to their throwers and teammates (an accessibility gain, not a cost). Grenades-only runs agree on average (+0.008, mixed sign). Frags are still lethal at the centre (105). |
| Magnum fire interval 0.22 | +0.013, +0.008, +0.009 | +0.013, +0.013, −0.006 | Kept at 0.26: not consistent on Twin Foundry or magnum-only, and the 1.04 s perfect kill is part of the accessibility goal. |
| Sprint 8.2, thrust 20 | within noise | +0.005 to +0.010, same sign | Kept: small, not seen on the arena; movement is for playtesting. |
| Everything else | mixed signs | mixed signs | Kept. |

**Recruit on the arena:** Normal takes 66 to 68% of the kills against Recruit (Legendary 94%, measured on Twin Foundry).

## Earlier results (before the AI carried magnums)

Baseline skill share was 0.716 to 0.728 depending on the seed set, with a median time to kill of about 3.5 s for Normal AI (Normal AI misses a lot; humans kill faster).

| Setting | Tried | Effect on skill share | Other effects | Decision |
|---|---|---|---|---|
| Ground acceleration | 50, 80, 90 (default was 70) | 80/90: +0.026, +0.020, +0.003 on three seed sets; 50: none | none on time to kill or grenades | **Raised to 80.** Snappier starts and stops reward strafe timing and feel more responsive to new players too. 90 measured the same as 80, so the smaller change wins. |
| Air control | 12, 21, 22, 24 | 24: +0.011, +0.013; 21 and 22: −0.001, −0.010 | none | Kept at 18. No consistent effect. |
| Run speed | 5.8, 6.7, 7.0 | +0.009 to +0.014 at 6.7 to 7 | faster runs shorten time to kill a little | Kept at 6.4: inside the noise, and map timings (rotations, flag runs) are built around it. |
| Sprint speed | 8.2, 9.8 | within ±0.005 | more grenade self-kills at 9.8 | Kept at 9. |
| Jump strength | 6.8, 8.0 | none | none | Kept at 7.4 (the crouch-jump perch in the arena depends on it). |
| Gravity | 20, 22, 26, 28 | none | 26: fewer grenade self-kills, longer time to kill | Kept at 24. |
| Thrust speed | 14, 20 | within ±0.008 | none | Kept at 17. |
| Carbine damage | 8, 9.5, 10 | 10: +0.024 then +0.005 (not repeatable) | 8 lengthens time to kill and raises grenade kills; 10 shortens it | Kept at 9: a faster kill time costs accessibility for no reliable gain. |
| Carbine fire interval | 0.09, 0.115 | none | 0.09 raises kills per minute | Kept at 0.1. |
| Carbine spread and bloom | 0.008 to 0.016, 0.002 to 0.007 | both directions +0.011 to +0.019 (noise) | none | Kept. |
| Frag fuse | 1.8, 2.6 | **−0.034 and −0.022** | 2.6 lowers kills per minute | Kept at 2.2, a clear local best. |
| Frag blast radius | 4.2, 5.8 | 4.2: −0.007; 5.8: −0.017 | 5.8: self-kills 18 vs 14, more teamkills; 4.2: self-kills 5 | Kept. 5.8 is worse on every count. |
| Grenade throw speed | 16, 22 | within ±0.004 | 22: more grenade kills (spammier); 16: fewer self-kills | Kept at 19. |
| Frag bounciness | 0.25, 0.3, 0.46, 0.5 | 0.3: +0.017 then +0.001; 0.5: −0.009 | none | Kept at 0.38. |

The magnum's numbers were first set from the kill-time table in [SANDBOX.md](SANDBOX.md): the 5-shot, 1.04 s perfect kill is long enough to react to and short enough that landing every shot is what wins. The AI carries it too (carbine and magnum, each with its own magazine; it switches with the player's switch time and picks the magnum at mid and long range and to finish a pilot whose shields are down, with aim and trigger pace set by skill level in `AI_SKILL`, `data/modes.js`), so the simulations measure it like the carbine. The power weapons are rare enough in a match that their numbers barely move these statistics; they were set by hand (one-shot kills that reward the aim or the read, with a slow fire rate and small magazines).

## Limits of the method

The AI's skill levels differ in reaction time and aim error, so the simulations measure how much **aim and reaction** decide fights. Movement skill (strafe timing, thrust dodges, slide jumps) is something the AI only partly expresses, so movement settings are better judged by playtesting with the sliders. The sandbox tab exists for exactly that.
