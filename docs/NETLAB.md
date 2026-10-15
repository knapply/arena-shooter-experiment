# Network lab

The network lab runs separate game instances (each its own browser process) that form a room and play real matches with automated players, then measures how the netcode behaved. Nothing leaves the machine.

```bash
node tools/net-lab.js                                   # 4 instances, every mode (arena, ctf, slayer, ffa, oddball), good links
node tools/net-lab.js --n 8 --profile bad --migrate     # 8 instances on bad links, then close the host and time the takeover
node tools/net-lab.js --profile all                     # good, wifi, bad, asym and spikes in turn
node tools/net-lab.js --modes ctf,oddball --secs 90     # some modes, longer matches
node tools/net-lab.js --transport webrtc                # real WebRTC between the browsers, local signalling server
node tools/net-lab.js --render                          # real three.js (THREE_PATH) instead of the stub renderer
node tools/net-lab-compare.js <before-dir> <after-dir>  # a before/after table of two runs
```

Reports (JSON and markdown) go to `tools/out/net-lab/`. `tests/netlab.test.js` runs a CI-sized lab: 3 instances on bad links, arena and capture the flag for 20 s each, then the host leaves.

## How it works

- **Instances** (`tests/lib/netlab.js`): one Chromium process per player, running the game from `index.html` with the stub renderer (or real three.js with `--render`). Instance 0 hosts the room and the others join with its code. Pages may only load local files and 127.0.0.1.
- **Transports.** `relay` (the default): `tests/stubs/lab-peer.js` stands in for PeerJS and sends everything over a local WebSocket to the lab's relay, which delivers each message through its link's simulated network. Unreliable channels lose and reorder; reliable channels never lose but pay a retransmit delay and keep their order. `webrtc`: real WebRTC data channels, signalled by a local PeerJS server (the `peer` package, `?peerhost=` in the page address) with no STUN or TURN servers; profiles then apply on each sender (`KAHOST.net.setSim`), the same on all its links.
- **Profiles** (per direction of each link): good (15 ms ±3), wifi (30 ms ±15, 1% loss, a 60 ms hiccup every 4 s, 4 Mbit/s), bad (75 ms ±25, 3% loss, 1.5 Mbit/s), asym (the last instance on bad links, the rest good), spikes (30 ms ±10, bursts of loss, 200 ms spikes every 3 s).
- **Players** (`tests/stubs/lab-bot.js`): run at the objective (the enemy flag, home with it, the skull, the nearest enemy), fight whoever they can see (aim with a little error, strafe, melee up close, grenades) and use the movement kit (sprint, slide, jump, thrust, ground pound), through the game's input actions (`KA.input`) and view angles. A carrier walks, as the carry rules require.
- **Recording** (also lab-bot.js): every instance records where it is (its truth; a host also its AI), where it draws everyone else, its playback stats, kills as it saw them and the match state, all on `Date.now()` (one machine, one clock), plus frames and garbage collections. The game counts traffic by message type (`KAHOST.net.traffic`) and time in net code (`KAHOST.prof`, nesting-aware: `total` is the outermost time).

## What it measures

| measure | how |
|---|---|
| delay, position error, pops | for each observer and pilot: the delay that best fits what is drawn to the truth (on the mean squared error), the median and 95th percentile error at that delay, and frame-to-frame moves that differ from the truth's by over 0.5 m. Respawns are left out, and so is the 1.2 s after any instance stalls (a frame over 150 ms: its CPU, not the network; a stalled host relays nothing, so what it relays freezes and catches up). The report counts the stalls and the share left out |
| update rate and jitter, interpolation delay | each remote's playback buffer (packet gap, jitter, delay) |
| bandwidth | bytes and messages per second each way, by kind (fast messages by name; presence by room, and by field) |
| hit registration | claims sent vs applied (by the host, or by victims in the arena); every rejection of these honest players is a false rejection, with the hit check's reason |
| kill to display | from the first instance that showed a kill to each of the others |
| desyncs | a client's score, flags or skull matching no host state of the last 1.5 s |
| host migration | close the host's browser; time until one instance hosts and every other follows it (arena: the room) |
| CPU and garbage | net code ms per frame by part, script time per second (DevTools metrics), heap drops (collections per minute, MB/s freed) |

## Results: 4 instances, 40 s per mode, every profile

Before is main at 61d0299 with the lab's instrumentation; after is this branch. Values are before → after. Migration times in the before column include closing the old host's browser (the lab now times from the start of the close). "fail" in the before column was the lab clicking Play before the menu offered to join, which starts a second match (the lab now waits for Join). Delay, error, pops and desyncs move by noise between runs. The capture the flag p95 errors near 1 m (before and after alike) were the lab's own: it fitted each pilot's delay on the median error, and an AI that mostly stands guard fits any delay, so the lab picked 0 and counted its moves as error; it now fits on the mean squared error (that pilot: 1.2 m → 0.09 m). the bandwidth, kill-to-display and migration changes are well outside it.

| profile | mode | host up KB/s | client up KB/s | delay ms | p95 err m | pops/min | false rejects | kill→display p50 ms | desync | migration ms | GC/min (host) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| asym | arena | 89.9 → 8.6 | 13.6 → 3.7 | 170 → 170 | 0.07 → 0.08 | 0.0 → 0.0 | 0/27 → 0/24 | 117 → 63 | – → – | 207 → 163 | 143 → 131 |
| asym | ctf | 143.3 → 23.6 | 7.4 → 1.0 | 180 → 170 | 0.08 → 0.23 | 0.0 → 0.0 | 0/7 → 0/11 | 83 → 49 | 0.000 → 0.000 | 1682 → 482 | 233 → 213 |
| asym | slayer | 150.1 → 24.8 | 8.1 → 1.0 | 180 → 180 | 0.07 → 0.10 | 0.5 → 0.3 | 0/14 → 1/16 | 83 → 34 | 0.038 → 0.017 | 1696 → 495 | 209 → 212 |
| asym | ffa | 165.6 → 23.6 | 9.6 → 1.0 | 180 → 180 | 0.07 → 0.07 | 0.2 → 0.2 | 1/21 → 0/16 | 83 → 48 | 0.023 → 0.044 | 1690 → 510 | 224 → 225 |
| asym | oddball | 162.8 → 25.6 | 8.3 → 1.0 | 180 → 180 | 0.08 → 0.08 | 0.5 → 0.2 | 1/15 → 1/16 | 67 → 34 | 0.055 → 0.055 | 1719 → 492 | 231 → 215 |
| bad | arena | 93.2 → 8.6 | 13.0 → 3.7 | 180 → 170 | 0.09 → 0.09 | 0.0 → 0.0 | 0/32 → 0/28 | 199 → 162 | – → – | 203 → 5445 | 120 → 104 |
| bad | ctf | 136.0 → 23.8 | 8.2 → 1.0 | 190 → 190 | 0.91 → 1.15 | 0.6 → 0.8 | 0/11 → 0/15 | 166 → 117 | 0.000 → 0.000 | 1747 → 587 | 236 → 227 |
| bad | slayer | 154.2 → 23.5 | 7.8 → 1.0 | 190 → 190 | 0.12 → 0.10 | 0.2 → 0.3 | 0/13 → 1/13 | 183 → 118 | 0.011 → 0.013 | 1805 → 590 | 221 → 227 |
| bad | ffa | 162.4 → 24.5 | 9.0 → 1.0 | 190 → 190 | 0.09 → 0.11 | 0.4 → 0.4 | 0/12 → 0/14 | 166 → 117 | 0.008 → 0.036 | 1962 → 5236 | 225 → 216 |
| bad | oddball | 154.5 → 25.4 | 8.8 → 1.0 | 190 → 190 | 0.12 → 0.11 | 0.4 → 0.1 | 2/19 → 0/12 | 166 → 117 | 0.025 → 0.019 | 1989 → 639 | 233 → 194 |
| good | arena | 89.5 → 8.4 | 11.4 → 3.7 | 80 → 80 | 0.03 → 0.04 | 0.0 → 0.0 | 0/24 → 0/29 | 48 → 47 | – → – | 58 → 65 | 113 → 120 |
| good | ctf | 135.5 → 25.7 | 6.6 → 1.0 | 100 → 110 | 0.06 → 0.67 | 0.3 → 0.2 | 0/8 → 0/13 | 50 → 34 | 0.000 → 0.000 | 1626 → 387 | 237 → 224 |
| good | slayer | 150.8 → 25.0 | 7.7 → 1.0 | 100 → 100 | 0.07 → 0.09 | 0.1 → 0.5 | 0/13 → 1/18 | 50 → 33 | 0.015 → 0.017 | 1634 → 396 | 234 → 204 |
| good | ffa | 147.5 → 23.1 | 7.5 → 1.0 | 100 → 110 | 0.05 → 0.07 | 0.4 → 0.1 | 0/8 → 0/23 | 48 → 34 | 0.040 → 0.057 | 1589 → 408 | 228 → 206 |
| good | oddball | 146.2 → 26.4 | 8.2 → 1.0 | 100 → 110 | 0.07 → 0.08 | 0.1 → 0.3 | 0/11 → 0/16 | 50 → 34 | 0.099 → 0.085 | 1620 → 417 | 221 → 210 |
| spikes | arena | 84.6 → 8.2 | 12.0 → 3.6 | 120 → 120 | 0.31 → 0.31 | 2.6 → 2.5 | 0/24 → 0/25 | 66 → 65 | – → – | 98 → 88 | 113 → 126 |
| spikes | ctf | 146.9 → 25.7 | 6.8 → 1.0 | 140 → 140 | 0.30 → 0.41 | 2.1 → 2.7 | 0/10 → 0/9 | 100 → 66 | 0.000 → 0.000 | 1671 → 465 | 213 → 239 |
| spikes | slayer | 152.4 → 24.0 | 8.4 → 1.0 | 140 → 140 | 0.30 → 0.37 | 3.0 → 3.4 | 0/17 → 0/13 | 101 → 50 | 0.008 → 0.015 | 2017 → 491 | 230 → 203 |
| spikes | ffa | 168.3 → 23.7 | 9.7 → 1.0 | 140 → 140 | 0.31 → 0.35 | 3.5 → 1.2 | 0/20 → 0/19 | 100 → 64 | 0.008 → 0.023 | 5639 → 462 | 221 → 233 |
| spikes | oddball | 153.2 → 26.2 | 7.7 → 1.0 | 140 → 140 | 0.42 → 0.34 | 2.4 → 3.2 | 2/15 → 1/18 | 99 → 49 | 0.032 → 0.066 | fail → 438 | 216 → 224 |
| wifi | arena | 92.9 → 8.5 | 13.7 → 3.6 | 120 → 120 | 0.06 → 0.07 | 0.0 → 0.0 | 0/21 → 0/30 | 65 → 108 | – → – | 103 → 123 | 111 → 117 |
| wifi | ctf | 138.9 → 23.9 | 7.7 → 1.0 | 140 → 140 | 0.83 → 0.88 | 0.0 → 0.8 | 0/13 → 0/12 | 98 → 65 | 0.000 → 0.013 | 1866 → 449 | 221 → 251 |
| wifi | slayer | 163.4 → 24.7 | 9.2 → 1.0 | 140 → 140 | 0.13 → 0.13 | 0.3 → 0.1 | 0/18 → 2/18 | 84 → 52 | 0.006 → 0.019 | 1732 → 462 | 231 → 209 |
| wifi | ffa | 160.7 → 22.7 | 9.1 → 1.0 | 140 → 140 | 0.12 → 0.11 | 0.2 → 0.0 | 1/19 → 0/11 | 84 → 66 | 0.015 → 0.025 | 1679 → 410 | 200 → 201 |
| wifi | oddball | 153.5 → 26.2 | 8.6 → 1.0 | 140 → 140 | 0.16 → 0.10 | 0.1 → 0.0 | 3/16 → 0/16 | 83 → 66 | 0.068 → 0.034 | 1640 → 430 | 225 → 203 |

## What changed (each measured above)

1. **Presence deltas** (transport). Presence was the whole object on every send, up to 4 KB, about 10 to 15 times a second, relayed to everyone by the host. Now only changed fields go (a plain object such as the host's snapshot sends only its changed fields); joiners and a new host get everything in full. Host upload in the team modes fell from about 135–170 KB/s to 23–26 KB/s and the arena host's from 85–93 to 8.5; clients' from 7–14 to 1–3.7 KB/s.
2. **Movement once a second in presence.** It rides the fast channel at 30–40 Hz, but presence repeated it on every send. Now presence refreshes it once a second as a fallback (arena players and CTF clients), and the CTF host refreshes its snapshot's per-agent movement fields once a second. With deltas, unchanged rows cost nothing. Power weapon countdowns are whole seconds while over 5 s.
3. **News goes out at once.** A CTF host sends presence as soon as it has kills, flag events or hits to deliver (at most every 33 ms) instead of waiting for the next 1/15 s tick. Kill to display: good 50 → 33 ms, bad ~166 → ~117 ms.
4. **Faster takeover.** A CTF client whose host left the room promotes the successor after 300 ms instead of 1.5 s (a host that is only quiet still gets the 8 s timeout), and the room's backup holds a call that arrives before it noticed the host left instead of refusing it (a refusal cost a 2.5 s timeout and a retry). Match takeover: about 1.6–2 s → 0.4–0.6 s.
5. **Two hosts resolve.** If two players take over the same match at once, the one with the lower peer id keeps it and the other joins them; a client whose host stops hosting looks for a successor first.
6. **False rejections.** Claims with a checked ray no longer also need a line of sight from where the host draws the shooter (a little late, so that view cut corners); explosions are no longer refused past 14 m from the thrower (rockets and long throws were), on the host and on a victim's client; hitscan ranges are per weapon.

## Recommendations

- **Garbage.** Hosts collect about 200 times a minute (15–20 MB/s churn), clients about 140. Net code is a small part of it (about 0.2 ms a frame); the rest is the game's per-frame allocations (AI, effects, playback sampling). A pass with the DevTools allocation profiler would pay off on low-end phones.
- **Spikes.** Under latency spikes remote players pop 2–3 times a minute. The playback delay adapts slowly (5% a packet); growing it quickly on a late burst and shrinking it slowly would trade a little delay for fewer pops.
- **8 players.** The fast mesh grows with the square of the players (ctfMove alone is about 8 KB/s per client from the host). Measure `--n 8` before adding interest management (lower rates for far or unseen pilots).
- **Real WebRTC host loss.** The relay closes a gone host's links at once; WebRTC notices a dead peer only when its data channel closes, which can take seconds. Measure `--transport webrtc --migrate`.
- **The menu join race.** Clicking Play while the menu still says Host starts a second match in the room (the lab hit it on bad links). The menu could hold Play for a moment after joining a room, or offer to join the host's match when one appears.
