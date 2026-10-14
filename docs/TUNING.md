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

### After the fire-rate fix

Automatic weapons used to lose the part of a frame (or a 30 Hz AI step) each shot came late by, so the AI fired its 0.1 s carbine at 7.0 rounds a second instead of 10. With that fixed (the AI now fires at 9.4, the rest being pauses to re-aim), the baselines moved a little: Legendary vs Normal skill share 0.857 on Twin Foundry and 0.79 on the arena (up about 0.005 to 0.01), Normal vs Normal time to kill 3.0 s and 2.07 s (down about 0.05 to 0.1 s). The carbine was re-swept (damage 8 and 8.5, fire interval 0.11 and 0.12, bloom 0.006; full matches and carbine-only, both maps, seed sets 100 and 700, 24 matches per kind, null controls): nothing moved skill share the same way on both seed sets except damage 8.5 on the carbine-only arena, which lowered it (−0.021, −0.017). **Kept:** the carbine numbers were tuned for players, who always fired at the real rate.

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

## Movement and scoping, compared with reference arena shooters

The reference arena shooters this game's kit follows (thrust, slide, clamber, ground pound, charge, stabilize, sprint, precision pistols and rifles) were studied for how their movement and scoping feel and why they play competitively. What their developers and competitive players describe:

- **Scoping is a view, not a stance.** No move-speed penalty while zoomed and no hip-fire penalty; zoom tightens automatic weapons a little and precision weapons not at all. The point is to make scoping a choice you flick in and out of, not a commitment.
- **Getting shot always knocks you out of the scope, and there is no aim flinch.** The descope is the readable "you are being shot" cue, and your aim is never moved for you.
- **Small gap between walking and sprinting; sprint has a cost.** Sprinting holds back shield recharge and lowers the gun, so arriving in a fight sprinting is a disadvantage. Strafe acceleration was deliberately raised for quicker, more responsive strafing.
- **Thrust is a read-and-punish dodge**, on a long cooldown (around twice this game's), and it adds to your momentum rather than replacing it.
- **Stabilize** (aiming in the air) hovers you for a few seconds.
- **Competitive structure:** equal starts (the same loadout for everyone), power weapons and power-ups on fixed timers you can control, perfect kills of four or five trigger pulls (about 1.0 to 1.5 s) that don't vary with luck, and cues you can read (red reticle in range, shield pop, the descope, thrust sounds).

Most of this already holds here: no spread on the precision weapons, a fixed perfect kill (the magnum's 5 shots in 1.04 s), timed power spawns, equal starts, sprint holding back shield recharge, and a descope on damage for the magnum, sniper and rockets.

### What changed

**Presentation (no simulation needed; the feel tests pass unchanged):**

- **The zoom eases** in over 0.15 s and out over 0.1 s (cubic ease-out, in log zoom so the sniper's 5x to 10x step takes as long as 1x to 2x). It used to chase the target at a fixed rate, which never quite settled and felt soft at the end. The sprint, slide and thrust widening of the view gives way as the scope comes up instead of popping off.
- **The gun comes up to the eye with the zoom.** The viewmodel's hip-to-aim pose follows the same ease, a little ahead of it, so the sights are at the eye before the optic finishes. The sniper's model gives way to its scope once the zoom is 60% in.
- **The optic overlay fades in** over the last three quarters of the zoom and settles from slightly large; it fades out the same way, so a descope reads as being knocked out. The crosshair fades and tightens as it goes. A soft click plays on scoping in, stepping a zoom level and dropping out.
- **Look speed follows the zoom** as it eases, so the first frames of a scope don't lurch (mouse and controller).
- **Every scope descopes on damage,** the carbine's 1.4x included (it used to flinch the aim instead). That makes it one rule for every weapon: shot while scoped, you're out. At the hip a hit still nudges the aim slightly.

**Simulation:**

- **The AI moves at the player's speed while aiming.** It aimed at 72% of run speed with every weapon (the sniper-scope rate) while players move at 90% with low-zoom optics. Now both use `TUNE.adsMove` (0.9) and `TUNE.scopeMove` (0.72, sniper). This is a fix, like the fire-rate fix; its effect is the reverse of the `sbAdsMove=0.72` row below (within noise).
- New sweepable knobs, all at their old values so nothing else moved: `sbAdsMove` (low-zoom aim speed), `sbStab` (stabilize hover time, `TUNE.stab`), and `sbRaise` (`TUNE.raise`, time to bring the gun up after a sprint before it can fire, players and AI alike; 0 = off).

### Measured

Both maps (team deathmatch on the arena, capture the flag on Twin Foundry), both pairings (Legendary vs Normal, Normal vs Recruit), with 4 null controls each run. Round one: seed sets 100 and 700, 24 matches per kind, null spread ±0.010 to ±0.023. Round two: seed sets 1300 and 1900, 48 matches per kind, null spread ±0.004 to ±0.015. Baselines with the AI fix: Legendary takes 79% of the kills against Normal on the arena and 85% on Twin Foundry; Normal takes 69% against Recruit on the arena and 71% on Twin Foundry. Normal vs Normal time to kill 2.0 s and 3.0 s.

| Setting | Round one (8 cells) | Round two (8 cells) | Decision |
|---|---|---|---|
| Raise time 0.15 s after a sprint | −0.006 on average, 6 of 8 negative | −0.004, 6 of 8 negative (5 clear of the noise) | **Not adopted.** The reference cost of entering a fight sprinting lowers skill share here. 0.3 s was worse (−0.013, 8 of 8 negative). Kept in the code at 0 for later playtests. |
| Raise time 0.3 s | −0.013, 8 of 8 negative | not run | Not adopted. |
| Aim speed 1.0 (no scoping penalty, as in the references) | −0.005, 2 of 8 positive | −0.003, 2 of 8 positive, mixed signs | **Kept at 0.9.** No consistent effect, a slight lean negative. |
| Aim speed 0.72 (the AI's old rule) | −0.003, mixed | not run | Kept at 0.9 (the fix). |
| Stabilize 2 s (references: a few seconds) | +0.006, 6 of 8 positive, none clear | 1.8 and 2.4: +0.0003, identical rows | **Kept at 1.3.** The AI stops hovering after about a second, so the knob can't be measured: anything above 1.8 s plays the same. A playtest question. |
| Thrust cooldown 3 s (references: about twice ours) | −0.002, mixed | not run | Kept at 2.2, as in earlier passes. |

Time to kill, kills per minute, grenade self-kills and teamkills moved within their noise for every row.

### Not done, and why

- **Thrust that adds to your momentum** instead of replacing it: a change to what the dodge is, and the AI's dodge only partly expresses it. Worth prototyping behind a Labs flag and playtesting.
- **A longer thrust cooldown:** within noise in every pass. The references' longer cooldown makes thrust easier to read and punish; try 3 to 4 s in the Sandbox tab before changing it.
- **Removing the hip flinch:** the references have none. Ours is small (at most 0.06 rad, gone within about a third of a second) and only applies at the hip. A playtest question.
- **Red reticle range growing while scoped** (the references extend aim assist range when zoomed): only a cue here, since this game's precision weapons don't fall off. Left alone.
- **A sprint-to-fire delay** (above): measured, and it costs skill share.

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

## Ammo: reserves from rounds fired per life

No weapon has endless reserve ammo. The starting guns carry about what a pilot fires in a long life, so running dry is rare but possible, and death drops and ammo pickups matter. `tools/tune.js` reports `lifeShots`: rounds fired with each weapon over each whole life (spawn to death; lives cut off by the end of a match are left out), as the median, 95th and 99th percentile and the number of lives. Measured with the old endless reserves, 16 matches of 5 minutes per setting (4 v 4, normal skill unless named):

| Setting | Carbine p50 / p95 / p99 | Magnum p50 / p95 / p99 | Lives |
|---|---|---|---|
| Capture the flag, seed 100 | 32 / 116 / 203 | 12 / 45 / 67 | 1102 |
| Capture the flag, seed 700 | 32 / 106 / 162 | 12 / 43 / 74 | 1089 |
| Capture the flag, Recruit | 32 / 102 / 160 | 10 / 42 / 69 | 815 |
| Capture the flag, Heroic | 18 / 77 / 150 | 12 / 37 / 84 | 1302 |
| Capture the flag, Legendary | 3 / 32 / 59 | 12 / 32 / 61 | 1728 |
| Arena team deathmatch | 15 / 49 / 75 | 4 / 14 / 22 | 2222 |
| Arena 2 v 2 | 18 / 55 / 76 | 3 / 12 / 21 | 990 |
| Arena duels (1 v 1) | 21 / 52 / 63 | 4 / 13 / 16 | 360 |

Capture the flag at normal skill has the longest lives and the most shooting, so its 95th percentile sets the loads, rounded to whole magazines: **carbine 32 + 96 reserve (128 rounds), magnum 12 + 36 reserve (48)**. The lab rifles were measured with `LOCK` (every pilot holds only that gun, so these overstate a life that also has the magnum): burst rifle p95 221 rounds, arc beam p95 512. They get **burst 36 + 180 (216)** and **beam 50 + 300 (350)**: the beam's reserve stays under what a dropped weapon can carry online (a weapon drop's rounds travel as fixed-point numbers up to 327), and in normal play it shares a life with the magnum. Power weapons keep their loads (sniper 4 + 8, rockets 2 + 4, scattergun 6 + 12). The practice drones and the CTF AI carry the same reserves and reload from them; a dry gun means switching, and an AI pilot down to its last magazine detours to a dropped gun of the kind it carries. The `LOCK` simulations keep endless ammo: they measure a weapon, not a life.

With the finite reserves in place the same capture-the-flag runs come out within noise of before (kills per minute 15.0 against 15.4, skill share 0.848 against 0.854), and the arena is unchanged: a normal life very rarely runs out.

## AI pass: the skill ladder per mode, and the AI's new habits

Every mode measured with `MODE=… node tools/tune.js` (capture the flag on Twin Foundry, Team Slayer, free-for-all and oddball on the arena), both pairings, seed sets 100 and 700, 16 matches of each kind (4 minutes), with 4 null controls (run speed nudged by ±0.0001 to ±0.0002 m/s). Effects are against the mean of the baseline and its controls. Free-for-all has eight pilots with the two levels alternating, so its "skill" is the better half's share of the kills.

**The skill ladder** (share of kills the better level takes; oddball also the better team's share of the time holding the skull):

| Mode | Legendary vs Normal | Normal vs Recruit | Normal vs Normal |
|---|---|---|---|
| Capture the flag | 0.854, 0.850 (null ±0.010, ±0.005) | 0.695, 0.699 (±0.020) | time to kill 2.6 to 3.0 s, 15 kills a minute, 0.8 to 1.1 captures in 4 minutes |
| Team Slayer | 0.847, 0.847 (±0.011, ±0.009) | 0.740, 0.743 (±0.016, ±0.004) | 3.2 to 3.3 s, 22 a minute |
| Free-for-all | 0.769, 0.768 (±0.008, ±0.012) | 0.654, 0.653 (±0.017, ±0.021) | 3.8 to 3.9 s, 25 a minute |
| Oddball | 0.909, 0.921 (±0.011, ±0.005); holding 0.96 to 0.98 | 0.749, 0.730 (±0.014, ±0.015); holding 0.81 to 0.82 | 2.1 s, 26 a minute, the skull changes hands 27 to 29 times |

Oddball shows skill the most: the better team both wins the fights and keeps the skull (a carrier can't shoot, so the fight around them decides who holds it). Free-for-all shows it the least: with eight pilots, who is fighting whom is more luck.

**The AI's new habits** (`CTF.AI`, each turned off with a knob to measure it):

| Habit | Knob | Effect on skill share (L/N; N/R, two seed sets each) | Other effects | Decision |
|---|---|---|---|---|
| A hunter in a fight keeps its range instead of charging in (`holdRange`) | `aiHoldRange 0` | Team Slayer **+0.052, +0.053; +0.095, +0.110**, free-for-all **+0.037, +0.032; +0.055, +0.054** (with it on) | without it 38 to 42% of kills were melee (15 to 17% with it), time to kill 2.0 to 2.8 s (3.2 to 3.9 s with it) | **On.** The same sign in all 8 cells and well clear of the noise: fights are decided by aim instead of everyone running into melee range. Capture the flag has no hunters (identical runs); oddball is within noise. |
| The magnum's perfect-kill rhythm at Legendary (`rhythm`, `AI_SKILL.rhythm`) | `aiRhythm 0` | capture the flag +0.007, −0.011; Slayer −0.002, −0.008; free-for-all +0.018, +0.010; oddball −0.002, +0.003 (with it on) | Legendary only, so Normal vs Recruit is unchanged | **On.** Within about one null spread: the AI already lands most magnum shots at Legendary, so pacing to the exact rate when landing and holding a moment after a miss shows little. It is the behaviour a good player has, and costs nothing. |
| Map memory (`memory`): hunting where fights happen, the skull carrier holding away from them | `aiMemory 1` (two earlier matches on the map learned first) | capture the flag +0.002, −0.005; **+0.030, +0.020**; Slayer +0.013, +0.002; −0.036, +0.004; free-for-all +0.012, −0.007; +0.023, −0.006; oddball **−0.027, −0.056; −0.024, −0.012** | oddball: the better team holds the skull a little less (0.95 against 0.96 to 0.98) | **On in rendered matches** (both teams use it). Mixed elsewhere; in oddball it helps the weaker team more (the carrier stays away from where fights were, which is where the better team wins them). |
| Watching known sight lines while moving (`preAim`, needs memory) | `aiPreAim 0` (with `AIMEM=1`) | capture the flag 0.000, Slayer −0.001, free-for-all −0.008, oddball +0.003 | first version (attackers and escorts too): captures in capture the flag fell from 1.5 to 0.88 a match (they stopped sprinting to look around) | **On for hunters, defenders and mid only.** Re-measured on seed sets 1300 and 1900: captures 1.13 and 1.06 a match, inside the null range (0.88 to 1.31), skill share within noise. |

Adaptive difficulty (`adaptBots`) is a player setting, not a simulation knob: offline matches move the bots a third of a level after each result, so a player who wins two in a row from Normal meets Heroic−. The levels in between interpolate `AI_SKILL` (`CTF.skillAt`).

## Limits of the method

The AI's skill levels differ in reaction time and aim error, so the simulations measure how much **aim and reaction** decide fights. Movement skill (strafe timing, thrust dodges, slide jumps) is something the AI only partly expresses, so movement settings are better judged by playtesting with the sliders. The sandbox tab exists for exactly that.
