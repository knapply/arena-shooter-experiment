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

Every match is an independent job, spread over one worker thread per CPU core (`JOBS=n` to change); results are identical to a single-threaded run because each match is seeded on its own. `LOCK` gives every AI pilot one weapon with endless ammo (`carbine`, `magnum`, `sniper`, `rocket`, or `nades` for grenades only) and turns off power spawns, death drops and other grenades, so a weapon's own numbers can be tuned in isolation. `MAP=arena` runs everything as team deathmatch on the arena instead of capture the flag on Twin Foundry. Results are written to `tools/out/tune.json` (`OUT=name.json`); `node tools/tune-merge.js merged.json a.json b.json` combines runs (each row keeps its seed set, lock and skill change against its own baseline). The **Tune** GitHub Actions workflow does the same sweep as a matrix of knob groups and seed sets, plus a job of null controls. It runs by hand and every Monday (with the defaults: 16 matches of 4 minutes per kind, capture the flag). `node tools/tune-summary.js merged.json` lists every knob value whose effect on skill share clears the noise (the baseline and its controls) on every seed set with the same sign, and those that clear it on some; the workflow writes that as the run's job summary and commits it with the merged result to the `tune-results` branch.

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

- **The zoom eases** (since retimed from footage: see "Classic feel" below) in over 0.15 s and out over 0.1 s (cubic ease-out, in log zoom so the sniper's 5x to 10x step takes as long as 1x to 2x). It used to chase the target at a fixed rate, which never quite settled and felt soft at the end. The sprint, slide and thrust widening of the view gives way as the scope comes up instead of popping off.
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

## Classic feel: pacing measured from footage

This pass measured the reference arena shooters' movement and aiming from their multiplayer footage rather than from what players and developers say about it, and compared the result with this game.

### How it was measured

About 3.6 hours of first-person multiplayer video was used (22 videos, mostly 60 fps): professional league POVs, top-rank ranked play in slayer, CTF, strongholds, doubles and free-for-all, and movement-technique tutorials. Every video was scanned from start to end, and each event (zoom, thrust, slide, clamber, sprint-to-fire, kill, jump) was timed to the frame on 60 fps contact sheets: 789 events. Two passes ran over every frame automatically:

- **Turn rate:** the frame-to-frame image shift, converted to degrees per second with the reference's 78° field of view (412,000 frames).
- **Zoom:** the frame-to-frame image scale.

**Speed** needs a scale, which first-person video doesn't give directly. Two Forge runs over a measured 2,048-unit track, timed by their author to the frame, give run and sprint speed in Forge units. The floor seams in the base run's video, fitted to the projection of a moving camera, give the camera's eye height in the same units: 6.03 units, from 23 seams with an interquartile range of 5.89 to 6.09. Speeds are compared as eye heights per second, so the body sizes of the two games cancel out.

| | Reference (median; IQR or range; samples) | This game before this pass |
|---|---|---|
| Run | 26.0 units/s = **4.31 eye heights/s** | 6.4 m / 1.62 m = 3.95 |
| Sprint | 33.8 units/s = **5.61 eye heights/s** | 9 / 1.62 = 5.56 |
| Sprint ÷ run | **1.30** | 1.41 |
| Sprint wind-up to full speed | 0.83 s (2) | instant |
| Zoom in | magnum 0.05 s (91), rifles 0.083 s (42), sniper 0.083 s (49), automatics 0.10 s (25); magnification builds evenly | 0.15 s, front-loaded |
| Zoom out, including a descope | 0.03 to 0.05 s | 0.1 s |
| Thrust while scoped | drops the scope on its first frame (4 of 4) | kept the scope |
| Thrust burst (visible) | 0.13 s (0.10 to 0.17; 132) | 0.24 s |
| Thrust cooldown | at least 4 s (gaps of 4 to 8 s) | 2.2 s |
| Slide, out of a thrust | 0.47 s (0.47 to 0.50; 11) | 0.8 s |
| Clamber | 0.60 s (0.57 to 0.67; 20); about 1 s on tall ledges | about 0.26 s |
| Standing jump, time in the air | 1.30 to 1.38 s (3) | 0.62 s |
| Weapon up after a sprint | 0.15 s (0.12 to 0.18; 20) | can fire at once |
| Camera head bob | none visible; the weapon sways instead | a step bob |
| Magnum fire interval | 0.28 s (data-mined); players spam at about 0.32 s (19) | 0.26 s |
| Turn rate in sustained turns | median 177°/s, 90th percentile 337°/s | controller: 183°/s, about 350°/s with the hold boost |

Not measured: jump height, thrust distance, how fast a strafe reverses, and ground pound and stabilize timings. The footage never held an opponent in a still enough shot. The floatier-jump numbers below assume the reference jump reaches about as high, for its body, as this one.

In short, the reference runs a little quicker for its size and sprints about as fast, so the gap between the two is smaller. Its scopes are close to instant. Its jumps are about twice as floaty. Its thrust is a short burst with a long recharge, its slides are short and its clambers are slow. The camera stays level while the weapon sways.

### Presentation (direct; the feel tests pass)

- **Zoom timing per weapon.** The zoom takes 0.06 s on the magnum, 0.08 s on the burst rifle, 0.09 s on the sniper and 0.1 s on the others. Magnification builds nearly linearly, settling only at the very end, and letting go or being knocked out takes 0.05 s. The gun still leads the optic to the eye.
- **A thrust drops the scope** on its first frame; aim again to come back in.
- **The camera barely bobs.** The step bob is down to about a quarter (0.6 cm walking, 1.2 cm sprinting) and the sprint roll to a third. The weapon's own sway carries the stride.

### The simulation numbers

New knobs, each at today's value so nothing else moved:

- `sbSprintRamp`: sprint wind-up.
- `sbSlideT`: slide length.
- `sbClamber`: clamber time, as a multiple of the default.
- `sbFloat`: a floatier jump that reaches the same apex. Air time 1 s is gravity 9.1 with jump 4.56; 1.33 s is gravity 5.2 with jump 3.43.
- `sbClassic`: the whole preset below.

Each of these is also a Sandbox setting: Sprint wind-up, Slide length, Clamber time, Sprint-to-fire delay, Scoped move speed and Stabilize time. Jump strength and gravity now go low enough for the floatier jump.

Method as in pass four: four mode-and-map cells (capture the flag on Twin Foundry; slayer, free-for-all and oddball on the arena), both pairings (Legendary vs Normal, Normal vs Recruit), and four null controls per run.

- **Round one:** seed sets 100 and 700, 24 matches of each kind (16 readings per variant). Null noise was ±0.007 to ±0.038.
- **Round two:** seed sets 1300 and 1900, 48 matches of each kind.

Round two's null noise was ±0.003 to ±0.014. Effects are on skill share against the mean of the baseline and its controls. "Positive" counts readings above it; "clear" counts readings outside the noise.

| Variant | Round one (100, 700) | Round two (1300, 1900) | Time to kill, kills/min (both rounds) | Decision |
|---|---|---|---|---|
| Run 7 m/s (sprint ÷ run 1.29) | −0.004; 6 of 15 positive, 5 clear | not run | −0.1 to −0.3 s in most cells | Kept at 6.4. No consistent effect, and fights get shorter. |
| Sprint wind-up 0.8 s | +0.006; 10 of 16, 4 clear | +0.003; 11 of 16, 5 clear | −0.03 / +0.04 s; −0.35 kills/min | Kept at 0 (instant). It leans positive but stays within the noise. A playtest candidate. |
| Floatier jump, 1 s in the air | −0.001; 8 of 16 | not run | small | Kept. |
| Floatier jump, 1.33 s in the air | −0.0004; 9 of 16 | not run | about +0.05 s; −0.4 kills/min | Kept. Neutral to the AI, and a large change in feel: for a playtest. |
| Slide 0.5 s | −0.004; 7 of 16, none clear | not run | small | Kept at 0.8. |
| Clamber ×2.3 | +0.007; 12 of 16, 3 clear | +0.0005; 7 of 16 | small | Kept at 1. Round one's lean didn't repeat. |
| Thrust cooldown 4 s | +0.004; 9 of 16, 5 clear | −0.001; 9 of 16 | +0.3 kills/min; teamkills up in round two | Kept at 2.2, as in every pass. |
| Sprint-to-fire 0.15 s | +0.006; 9 of 16, 7 clear | +0.004; 9 of 16, 6 clear | −0.06 / 0 s | Kept at 0. Mixed signs per cell; the earlier passes leaned negative. |
| No slowdown scoped (1.0) | −0.0005; 5 of 16 | not run | small | Kept at 0.9. |
| Magnum interval 0.28 s | +0.002; 8 of 16 | not run | small | Kept at 0.26. The 1.04 s perfect kill stays. |
| **The whole Classic feel preset** | −0.0004; 8 of 16, 4 clear | −0.0006; 6 of 16, 6 clear | **−0.10 s and −0.10 s; −0.76 and −0.81 kills/min**; teamkills and self-kills slightly down | Ships as a Sandbox preset, not as the defaults (below). |

### Decision, and the Sandbox preset

No default changes. No knob moved skill share the same way on both rounds, and the reference pacing as a whole is neutral to skill share: the simulated pilots win or lose by aim and reaction, as before. It does change the shape of a match. Fights are about 0.1 s shorter once they start, because the faster run brings opponents closer. There are about 0.8 fewer kills a minute, because the longer thrust recharge, the slide, the wind-up and the slower clamber all take time out of rotations. By this page's rule a shorter time to kill counts against accessibility, so the reference values are offered to play rather than imposed. The movement knobs are also exactly the kind of change the simulation can't judge (see "Limits of the method"), so the next step is to playtest the preset.

**Settings → Sandbox → Presets** has two buttons. **Defaults** puts every Sandbox number back. **Classic feel** sets these:

- run 7 m/s (sprint stays 9)
- sprint wind-up 0.8 s
- jump 3.4 m/s with gravity 5.2: the same apex, 1.33 s in the air
- slide 0.5 s
- clamber ×2.3
- thrust cooldown 4 s
- 0.15 s from sprint to fire
- no slowdown with low-zoom optics
- magnum interval 0.28 s

Online, the host's preset is the room's, like any Sandbox value. It is a playtest of the reference's pacing as a whole; the knobs can be mixed by hand from there.

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

## Every mode, every rule (pass four)

Every mode now runs headless with its own measures, on both maps where the mode supports them: capture the flag (Twin Foundry), Team Slayer, free-for-all (eight AI pilots, every one for themselves) and Team Oddball (Proving Grounds and Twin Foundry). This pass swept every sandbox knob again, and for the first time the rules the Sandbox tab doesn't expose. It also used the simulations to find each map's dead zones, dominant spots and spawn traps, and changed the maps where that helped.

### New in tools/tune.js

```bash
MODE=oddball MAP=arena node tools/tune.js ruRegenDelay ruShield     # any mode on any map
LIMITS=1 MINUTES=10 KNOBS=none node tools/tune.js                  # real score limits: who wins, lead changes
MIX=1 MODE=slayer MAP=arena KNOBS=none node tools/tune.js          # one Legendary pilot + three Normal vs four Normal
TEAM=3 node tools/tune.js     PILOTS=6 MODE=ffa node tools/tune.js  # team and free-for-all sizes
HEAT=1 OUT=h.json node tools/tune.js && node tools/heat-report.js tools/out/h.json   # map heat
```

- **Rule knobs** (`ru*`, `sp*`):
  - shield and health;
  - recharge delay and rate;
  - melee and shoulder-charge cooldowns, and the carrier one-hit rule (`ruCarryHit 0`: a carrier's swing follows the normal melee rule);
  - the AI's grenade count and throw cooldown;
  - power-weapon respawn times, starting reserves, respawn delay and drop pods;
  - the dropped flag's return time and the dropped skull's reset time;
  - the spawn-safety weights.

  These numbers aren't in the Sandbox tab, so `tune.js` sets them through hooks that patch the simulation in its own process. Shipped code is untouched, and at its defaults every hook reproduces the game exactly (checked by replaying seeds in all three kinds of mode).
- **New measures:**
  - how long carriers hold the flag or skull, and how each carry ends (capture, killed, dropped);
  - whether the side leading at half time won (with `LIMITS`) and how often the lead changed hands;
  - the spread of kills across pilots, and the top pilot's margin;
  - with `HEAT=1`, where pilots stood, died and killed from (2 m cells and the maps' callout zones), and the deaths within 3 s of spawning at each spawn point.
- **`tools/heat-report.js`** turns heat into:
  - per zone: time share against area share, and kills made from the zone against deaths in it;
  - the share of the walkable floor nobody uses;
  - the deadliest standing spots;
  - the spawn traps.

### Method

Each cell is one mode on one map. For each, there were two seed sets (100, 700) of 48 matches of each kind (Legendary vs Normal for skill share, Normal vs Normal for everything else), 4 minutes each, with four null controls (run-speed nudges of ±0.0001 m/s). A variant's effect is against the mean of the five null results, and its noise is the largest null deviation. Seven mode-and-map cells × two seed sets gives 14 readings per variant. Anything changed was confirmed on two more seed sets (1300, 1900), against Recruits (Recruit even matches; Normal vs Recruit), and in every cell.

### Where each mode starts (before this pass)

| Mode, map | Skill share | Noise | Time to kill | Kills/min | Other |
|---|---|---|---|---|---|
| CTF, Twin Foundry | 0.851 | ±0.014 | 2.77 s | 15.0 | 19% of flag carries end in a capture; the median carry lasts 5.1 s; the side leading at half time wins 95% of matches, and the lead changes 0.06 times a match |
| Slayer, arena | 0.795 | ±0.010 | 2.08 s | 30.6 | half-time leader wins 72%, 3.0 lead changes |
| Slayer, Twin Foundry | 0.774 | ±0.010 | 2.27 s | 25.1 | half-time leader wins 73%, 3.3 lead changes |
| Free-for-all, arena | 0.730 | ±0.006 | 2.78 s | 34.1 | **5.4% of deaths within 3 s of spawning**; the top pilot wins by 1.75 kills on average |
| Free-for-all, Twin Foundry | 0.715 | ±0.010 | 2.68 s | 32.4 | **4.1% spawn deaths**; 46% of the time is spent in the two bases |
| Oddball, arena | 0.911 | ±0.008 | 2.11 s | 25.4 | the better team holds the skull 96.8% of the time; 28 changes of hands a match; carries last 4.3 s; 2.0 lead changes |
| Oddball, Twin Foundry | 0.896 | ±0.017 | 2.12 s | 21.5 | holds 97.7%; 22 changes of hands; 1.8 lead changes |

Oddball is the most skill-decisive mode, and free-for-all the least. Capture the flag is decided by its first capture.

Some rules never come into play in these simulations:

- The AI returns every dropped flag by touch before the 15 s reset, so the return time changed nothing.
- The AI never uses the shoulder charge, so its cooldown changed nothing.
- No AI carrier drops a flag by sprinting.

### Rules (14 readings each; "positive" counts readings with a higher skill share, "clear" those outside the noise)

| Setting (default) | Tried | Skill share | Other effects | Decision |
|---|---|---|---|---|
| **Recharge delay (4 s)** | 3 | **+0.007, positive 11/14, clear 7/14**; confirmed on two more seed sets: +0.007, positive 10/14, every Slayer reading positive and clear (+0.011 to +0.018) | **fights 0.12 to 0.14 s longer**; fewer grenade self-kills and teamkills; CTF capture rate +2 to +3 points; against Recruits, fights 0.08 s longer, fewer self-kills and teamkills | **Changed to 3 s.** It raises the skill ceiling and gives everyone more time to react: better pilots recover between fights, and a pilot under fire still has to break away. 2.5 measured the same (+0.009); 3.5 half as much; 5 the opposite (−0.006). |
| Shield (70) | 55, 85 | 55: **+0.015, positive 14/14**; 85: −0.012, positive 1/14 | 55: fights 0.13 s shorter, grenade self-kills +10, teamkills +13 | Kept. A smaller shield raises the ceiling more than anything else, but it shortens every fight; that's the accessibility cost the rules here don't pay. Worth a playtest as a "hardcore" playlist. |
| Respawn delay (5 to 6 s) | +2, −2 s | +2: +0.014, positive 11/14; −2: **−0.024, positive 0/14** | +2: 3.7 fewer kills a minute, **CTF capture rate +10 points**, carries 1 to 2 s longer | Kept. Longer waits snowball fights, and a 7 to 8 s wait doesn't feel responsive. For capture the flag alone, +2 s is the strongest lever found for captures (see below). |
| Health (45) | 35, 55 | 35: 0.000; 55: −0.007 | 35: self-kills +13, teamkills +19 | Kept. |
| Shield recharge rate (48/s) | 32, 64 | 64: +0.002; 32: −0.003 | none | Kept. |
| Carrier one-hit melee (on) | off | −0.005 | **CTF capture rate −7 to −12 points; Oddball changes of hands +8 to +13 a match**; carries 2 s shorter | Kept: it's what lets a carrier survive at all. |
| Starting reserves (×1) | ×0.5, ×2 | ×0.5: **−0.015, clear 10/14**; ×2: +0.005 | ×0.5: Oddball hold share −0.5 to −1.8 points | Kept. Running dry is a coin flip that hurts the better side, and the current loads are already rarely exhausted. |
| Melee cooldown (0.75 s) | 0.55, 1 | 0.000, −0.003 | none | Kept. |
| AI grenades (×1), throw cooldown (×1) | ×0.5, ×1.5; ×0.6, ×1.5 | all within ±0.004 | faster throws: self-kills +13, teamkills +31 | Kept. |
| Power respawn times (×1) | ×0.67, ×1.5 | 0.000 | none | Kept. |
| Drop pods (simulations use in-place spawns) | pods on | +0.005, positive 11/14 | 2.4 fewer kills a minute (the pod's own spot choice) | No change (it's the player's setting). |
| Spawn safety: sight, nearness and fight weights | ½× and 2× | all within ±0.003 | none | Kept. |
| Flag return (15 s), skull reset (15 s), charge cooldown (1.3 s) | 10/25, 8/25, 1/1.8 | no effect (identical matches) | see above | Kept. |

**On top of the AI pass.** The recharge delay was checked again on a local merge of this branch with the AI pass (map memory, adaptive bots, the magnum rhythm, hunters that hold range; not on main yet). Going back to 4 s there gives:

- skill share **−0.006, lower in 11 of 14 readings**, every Slayer and Oddball reading lower;
- fights 0.19 s shorter;
- 7 more grenade self-kills and 16 more teamkills.

So 3 s holds with the new AI too. That AI raises skill share a lot by itself (Slayer on the arena 0.80 → 0.87, Oddball 0.94, free-for-all 0.78), so every baseline here moves when it lands.

### The Sandbox tab, in every mode

Every sandbox knob was swept again in all seven cells (54 variants). None moved skill share by more than +0.003 on average, and none was positive in more than 11 of 14 readings. The movement, weapon and grenade defaults are at a local optimum in every mode, not just the two the earlier passes measured. The magnum's 0.3 s interval (−0.007, clear 7/14) and the slower thrust cooldown (−0.004) confirm the current values from the other side. Nothing changed.

### Team size, free-for-all size, mixed skill, the oddball time to win

| | Measured | Read |
|---|---|---|
| **Team size** (4 v 4 default) | CTF: 2 v 2 skill 0.872 to 0.879, 3 v 3 0.857 to 0.874, 4 v 4 0.846 to 0.857; flag carries ending in a capture 48%, 30%, 20%. Slayer: within 0.01 at every size. Oddball: 2 v 2 0.78 to 0.83, 3 v 3 0.86 to 0.89, 4 v 4 0.89 to 0.92 | Smaller CTF teams capture far more and are at least as skill-decisive. Oddball needs full teams to reward the better team as much. |
| **Free-for-all size** (8 pilots) | spawn deaths: 4 pilots 1%, 6 pilots 2%, 8 pilots 4 to 6%, 10 pilots 9 to 10%; skill share 0.70 to 0.77 at every size | Crowding, not skill, is what changes. The spread spawns below bring 8 pilots down to 1.5% (Twin Foundry) and 3.4% (arena). Six pilots would be calmer still; worth a playtest. |
| **Mixed teams** (one Legendary + three Normal vs four Normal) | better team's kill share: Slayer 0.56 to 0.60, CTF 0.62, Oddball 0.66 to 0.69 (skull hold 0.76 to 0.79); two Legendaries: 0.64 to 0.80; three: 0.72 to 0.87 | One strong pilot carries Oddball most and Slayer least. |
| **Oddball time to win** (120 s) | 60 s: 1.2 lead changes, hold share 0.94 to 0.96; 90 s: 1.6; 120 s: 1.8 to 2.1; 180 s: 2.2 to 2.5, hold share 0.96 to 0.98 | Longer games have more comebacks and are more skill-decided. 120 s balances match length against both. Kept. |

### Maps: what the heat showed, and what changed

Full readings, dead zones and the layout ideas not taken are in [PROPOSALS.md](PROPOSALS.md) (M11 to M15). In short:

- **Oddball spots.** On the arena, the skull's one spot east of centre left the west lane and both western corners nearly empty (west lane 4.5% of the time on 10.6% of the floor; the NW and SW corners 1% each). Every drop, the first included, now picks one of three spots the same distance from both teams, never the same twice running. On the arena those are the core's roof and the alcoves behind the east and west pillars; on Twin Foundry, the mid tower's roof and both catwalks, which nothing else brings anyone to.
  - Skill share: +0.011, +0.016, +0.011 (arena) and +0.002, +0.006, +0.021 (Twin Foundry), clear of the noise on all six.
  - On the arena the west lane doubles to 8.6% and the western corners reach 4%, and lead changes go up (1.9 to 2.0, 2.1 to 2.3).
  - On Twin Foundry, lead changes fall (1.8 to 1.3).
- **Free-for-all spawns, Twin Foundry.** Free-for-all used both bases' spawns, so 46% of the time went into the bases, the mid tower saw nobody, and 4.1% of deaths came within 3 s of spawning. Twelve spots over the bases, wings, catwalks and mid:
  - bases fall to 11% of the time;
  - spawn deaths 4.1% → 1.5% on three seed sets;
  - skill share +0.032, +0.034, +0.032, all clear.
- **Free-for-all spawns, arena.** The open spots at (±22, 0) in the east and west lanes caused 35% of all spawn deaths. With them replaced by the alcoves behind the pillars and four quiet corners (15 spots in all, up from 11), spawn deaths fall from 5.2 to 5.4% to 3.2 to 3.5% on both seed sets, and skill share is unchanged (+0.002, +0.003). A version with only the four corners moved the deaths to the corners without reducing them: it is the number of choices that helps.
- **Tried and dropped: spawn fronts.** Turning the arena's team spawn sides a quarter every 60 s (so the fight moves round the map) cost Oddball −0.017 and −0.019 and did nothing for Slayer.

### After this pass (the shipped game, two seed sets each)

| Mode, map | Skill share | Time to kill | Kills/min | Other |
|---|---|---|---|---|
| CTF, Twin Foundry | 0.851 → **0.863** | 2.77 → 2.99 s | 15.0 → 14.7 | 18% of carries end in a capture; 0.1 lead changes |
| Slayer, arena | 0.795 → **0.802** | 2.08 → 2.13 s | 30.6 → 30.3 | 3.05 lead changes |
| Slayer, Twin Foundry | 0.774 → **0.781** | 2.27 → 2.36 s | 25.1 → 24.9 | 3.17 lead changes |
| Free-for-all, arena | 0.730 → **0.737** | 2.78 → 2.91 s | 34.1 → 32.6 | spawn deaths 5.4% → **3.4%** |
| Free-for-all, Twin Foundry | 0.715 → **0.747** | 2.68 → 2.84 s | 32.4 → 30.0 | spawn deaths 4.1% → **1.5%** |
| Oddball, arena | 0.911 → **0.939** | 2.11 → 2.34 s | 25.4 → 24.0 | hold share 0.968 → 0.982; 2.1 lead changes |
| Oddball, Twin Foundry | 0.896 → **0.933** | 2.12 → 2.31 s | 21.5 → 20.5 | hold share 0.977 → 0.983; 1.3 lead changes |

Skill share is up in every cell, and every fight is a little longer, which gives everyone more time to react.

### Re-checked with the AI pass (on main)

The AI pass (map memory, adaptive bots, the magnum rhythm, hunters that hold range) landed just before this pass. All three decisions were re-run on the merged main. Each one was undone as a knob against the shipped game: `ruRegenDelay=4`, and `modOneSkull` / `modOldSpawns`, map mods that restore the layouts from before this pass. The setup matched: the same modes, maps and pairings, seed sets 100 and 700, 48 matches of each kind, four null controls. **All three hold; nothing was reverted.**

| Undo | Skill share (against the shipped game) | Other effects |
|---|---|---|
| Recharge delay back to 4 s | **−0.006**, lower in 11 of 14 readings; every Slayer and Oddball reading lower | fights 0.19 s shorter, grenade self-kills +7, teamkills +16. Normal vs Recruit: **−0.014**, lower in 7 of 7; Recruit fights 0.16 s shorter |
| One skull spot | **−0.016, −0.020, −0.023, −0.032**: lower and clear of the noise in all four readings | fights 0.17 s shorter; the better team's share of skull time down by up to 1 point; 1 to 3 more changes of hands a match; fewer lead changes on the arena (2.1 to 1.7 and 2.0 to 2.0) |
| Old free-for-all spawns | **−0.003, −0.006, −0.004, −0.006**: lower in all four readings | arena spawn deaths 1.0% → 1.7 to 1.9%; on Twin Foundry the new AI already avoids most spawn deaths (0.4 to 0.7% either way) |

The new AI raises every baseline:

- Slayer: 0.865 on the arena, 0.837 on Twin Foundry.
- Free-for-all: 0.77 to 0.78.
- Oddball: 0.93 to 0.94.
- CTF is unchanged at 0.85.

**For the AI side:** in arena Oddball, wherever the skull starts, one side of the arena takes 55 to 70% of pilot time and the other side is nearly empty. The carrier runs to a favourite hold spot and the fight follows it. This happens with one skull spot as well as three, so it comes from the hold-spot choice, not the layout.

### For a playtest, not a default

- **Oddball is now very skill-decided** (the better team holds the skull 98% of the time). That's right for a competitive mode, but harsh on new players; matchmaking or the adaptive difficulty matters most here.
- **Capture the flag is decided by its first capture.** The lead changes about once in ten matches. A 2 s longer respawn in CTF raises the capture rate by 10 points; so does playing 3 v 3, by about 9 points (2 v 2: 27). A back entrance to each flag room (PROPOSALS M7) is the layout answer.
- **A 55 shield** for a hardcore playlist (skill share +0.015 in every reading, fights 0.13 s shorter).
- **Six-pilot free-for-all** (spawn deaths 2% before the spread spawns).
- **Movement** is still judged best by playtesting (below).

## Recruit against a new player

Playtest: "the bots are way too good on Recruit... they absolutely crush me." The simulations had only ever played bots against bots, so this pass adds a model of a new human player and tunes the low levels against it.

**The novice** (`NOVICE=1 DIFF=recruit node tools/tune.js`): one pilot on team 0 reacts in 0.42 s, turns at 3 rad/s, aims wide (aim error 0.08), never strafes in a fight, uses no movement tech, and only melees with someone in its face. Each run reports its K/D, kills and deaths a minute, median life, how often two or more pilots hurt it in the 3 s before a death (focus), and how it dies. Every mode, 24 matches of 4 minutes per level, seed sets 100 and 700. Target: an even fight against Recruit (K/D 0.8 to 1.2), and Normal a clear but fair step up.

**Why Recruit crushed a new player:**
- **Every bot wanted a 4 m fight.** A fresh brain's preferred range ties across its distance buckets and fell to the closest one, so bots walked straight into melee range: melee was 34 to 41% of the novice's deaths against Recruit (72% in oddball).
- **Recruit's numbers were sharp for a person:** it turned at 5 rad/s (faster than a new player tracks), reacted in 0.5 s and dodged.
- **Recruit bots ganged up** on a cracked target at full strength ("finish him" calls).
- **Adaptive bots could climb above the pick** after wins.

**What changed** (Heroic and Legendary unchanged):
- New `AI_SKILL` fields: `minRange` (the closest they like to fight from: Recruit 10 m, Normal 8 m), `melee` (eagerness to melee and charge: Recruit 0.5, Normal 0.5, the top levels 1) and `focus` (ganging up on a called target: Recruit 0.4, Normal 0.6).
- Recruit: reaction 0.5 → 0.58 s, aim error 0.055 → 0.068, turn 5 → 4, sight 42 → 40 m, dodge 0.3 → 0.2, fewer grenades.
- Normal, a step between: reaction 0.32 → 0.42 s, aim error 0.035 → 0.05, turn 7 → 5.5, sight 75 → 60 m, dodge 1 → 0.7, grenades 1 → 0.7.
- Every level, against a flag or skull carrier: close to 5 m and shoot, outside the carrier's one-hit swing.
- Adaptive bots: the picked skill is the ceiling. A loss eases them 0.4 of a level (down to a new Trainee level below Recruit, never offered as a pick), a win brings them back 0.25 toward the pick.

**The novice's K/D, before and after** (seed sets 100 / 700):

| Mode | Against Recruit, before | after | Against Normal, before | after |
|---|---|---|---|---|
| Team Slayer (arena) | 0.59 | **0.86 / 0.91** | 0.31 | 0.45 / 0.41 |
| Free-for-all (arena) | 0.38 | **0.96 / 0.72** | 0.26 | 0.45 / 0.38 |
| Capture the flag | 0.56 | **0.82 / 1.16** | 0.32 | 0.60 / 0.53 |
| Oddball (arena) | 0.55 | **1.20 / 1.45** | 0.36 | 0.87 / 0.85 |

The novice now lives longer against Recruit (median life 14 to 24 s against 9 to 17 s before), and melee is 19 to 47% of its deaths rather than 34 to 72% (oddball's skull carriers still swing). Oddball is a little easy against Recruit; it is the noisiest mode, and the novice gets the most out of the skull's one-hit melee. Focus (two or more attackers before a death) is 0.4 to 0.8 at every level, as much a property of 4 v 4 as of the bots.

**The bot ladder stays ordered** (share of kills the better level takes, seed set 100, 16 matches): Normal over Recruit 0.75 / 0.68 / 0.67 / 0.74 (Slayer / free-for-all / capture the flag / oddball), Heroic over Normal 0.83 / 0.77 / 0.80 / 0.92, Legendary over Heroic 0.71 / 0.67 / 0.73 / 0.85. With Normal softer, the biggest step is now Normal to Heroic.

## Limits of the method

The AI's skill levels differ in reaction time and aim error, so the simulations measure how much **aim and reaction** decide fights. Movement skill (strafe timing, thrust dodges, slide jumps) is something the AI only partly expresses, so movement settings are better judged by playtesting with the sliders. The sandbox tab exists for exactly that.
