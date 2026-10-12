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

Each variant plays the same seeded matches as the baseline, so differences come from the setting, not from luck in which matches were drawn. Results were checked on more than one set of seeds before a default changed. The run-to-run noise on skill share is about ±0.02, so smaller effects are treated as no effect.

```bash
node tools/tune.js                                  # sweep every knob (~10 min on two cores)
MATCHES=16 MINUTES=4 SEED=700 node tools/tune.js sbAccel   # more matches, a different seed set
TRY="sbAccel=80,90" node tools/tune.js sbAccel      # try specific values
```

Results are written to `tools/out/tune.json`.

## Results

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

The magnum is only used by players (the AI carries the carbine and picks up the power weapons), so its numbers come from the kill-time table in [SANDBOX.md](SANDBOX.md) instead: the 5-shot, 1.04 s perfect kill is long enough to react to and short enough that landing every shot is what wins. The power weapons are rare enough in a match that their numbers barely move these statistics; they were set by hand (one-shot kills that reward the aim or the read, with a slow fire rate and small magazines).

## Limits of the method

The AI's skill levels differ in reaction time and aim error, so the simulations measure how much **aim and reaction** decide fights. Movement skill (strafe timing, thrust dodges, slide jumps) is something the AI only partly expresses, so movement settings are better judged by playtesting with the sliders. The sandbox tab exists for exactly that.
