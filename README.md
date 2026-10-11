# Kinetic Arena

[![Views](https://hits.sh/github.com/knapply/arena-shooter-experiment.svg?label=views&color=46d6ff&labelColor=1b2329)](https://hits.sh/github.com/knapply/arena-shooter-experiment/)

A fast, movement-focused arena shooter that runs entirely in the browser. Thrust, slide, clamber, hover and ground-pound through a symmetric arena, fight practice drones solo, or play 4v4 Capture the Flag with friends over a direct peer-to-peer connection. No install, no accounts, no downloads.

**▶ Play:** https://knapply.github.io/arena-shooter-experiment/

[![Kinetic Arena trailer](media/trailer-preview.gif)](https://knapply.github.io/arena-shooter-experiment/media/trailer.mp4)

**🔊 [Watch the full trailer with sound](https://knapply.github.io/arena-shooter-experiment/media/trailer.mp4)** · captured straight from the game, with an original soundtrack synthesized in the browser. Or press **Watch trailer** in the game menu to play it live.

---

## Contents
- [Features](#features)
- [Game modes](#game-modes)
- [Playing with friends](#playing-with-friends)
- [Controls](#controls)
- [Weapons and combat rules](#weapons-and-combat-rules)
- [Movement](#movement)
- [The AI](#the-ai)
- [Settings](#settings)
- [Tech overview](#tech-overview)
- [Browser support and performance](#browser-support-and-performance)
- [Privacy and security](#privacy-and-security)
- [Known limitations](#known-limitations)
- [Development](#development)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features
- **Full movement kit:** sprint, slide, thruster dash, ledge clamber, aerial stabilize, ground pound and shoulder charge
- **Shields and health:** recharging shields that flash on impact, with headshot rules that reward finishing cracked opponents
- **Three weapons:** a precision magnum (the default), an automatic pulse carbine, and a sniper rifle power weapon that spawns at map center
- **Grenades:** bouncing frags and sticky plasmas
- **Destructible cover:** tunable or fully disabled, rebuilds over time
- **Capture the Flag:** 4v4 on a mirrored map, with AI filling every empty slot
- **AI that learns:** bot teams adapt strategy, lane choice and fighting style across matches, and talk to each other in team comms
- **AI vs AI simulation:** watch two AI teams play with a director camera, live intel panel and headless training
- **Online play:** peer-to-peer rooms with a 5-character code or invite link, up to 8 players
- **Controller support:** Xbox-style controllers with remapping, aim assist, response curves and vibration
- **Deep settings:** graphics presets plus 50+ individual options, full keyboard and controller rebinding, and export/import of settings as a file
- **Cinematic trailer:** a one-minute in-engine trailer with letterboxed cinematography, slow motion and an original choir-and-synthwave score, playable from the menu
- **Animation:** procedural characters with distance-synced strides, hip-led strafing and backpedaling, feet that plant on stairs and ledges, spring-driven lean, landing compression, hit flinches, recoil and momentum-based death falls
- **Movement tutorial:** a narrated, self-playing walkthrough of every movement and combat mechanic
- **Procedural audio and announcer:** synthesized weapon and movement sounds, with spoken callouts using your browser's speech engine

## Game modes

| Mode | Players | Description |
|---|---|---|
| **Arena** | 1–8 | Free-for-all on Foundry Basin. Practice drones fill in when it's quiet. |
| **Capture the Flag** | 1–8 humans, 8 total | 4v4 on Twin Foundry. Bring the enemy flag to your stand while yours is home. First to 3 captures wins, with an 8-minute time limit. Humans take a bot's slot on their team. |
| **AI vs AI** | Spectator | Two learning AI teams play CTF. Speed controls (1×/2×/4×), director, follow and tactical cameras, plus an intel panel showing each team's strategy odds and evolved play style. Includes a headless "Train 10 matches" button. |
| **Trailer** | Spectator | A one-minute cinematic cut of the game with an original score, synced to the music. |
| **Movement tutorial** | Spectator | A scripted walkthrough of every movement and combat mechanic, with the keys for each. |

## Playing with friends
1. Open the game and click **Host a room**. You'll get a 5-character code.
2. Click **Copy invite** and send the link, or just send the code.
3. Friends open the link (it joins automatically) or enter the code and click **Join**.
4. Deploy into the Arena together, or have one person start **Play CTF** while everyone else picks a team and clicks **Join match**.

Notes:
- The person who hosts the room relays everyone's connection. **If the host closes their tab, the room ends.** Have whoever has the best connection host.
- In CTF, the person who starts the match runs the simulation (AI, flags, score) for everyone.
- Switch teams any time with **J**, **D-pad up**, or the pause menu.
- Everyone needs an internet connection. Very strict networks (some workplaces, some mobile carriers) can block direct peer-to-peer connections.

## Controls
All bindings can be changed in **Settings → Keys / Controller**.

| Action | Keyboard / mouse | Controller |
|---|---|---|
| Move | WASD / arrow keys | Left stick |
| Look | Mouse | Right stick |
| Jump · clamber | Space | A |
| Crouch · slide · ground pound (hold in air) | C / Left Ctrl | B |
| Sprint | Left Shift | Left stick click |
| Thrust | Q | LB |
| Fire | Left click | RT |
| Aim · zoom · stabilize in air | Right click | LT |
| Melee · charge (while sprinting) | F / Mouse 4 | Right stick click |
| Reload | R | X |
| Pick up weapon (hold) | E | X (hold) |
| Throw grenade | G / Mouse 5 | RB |
| Swap grenade type | T | D-pad left / right |
| Weapon slot 1 / 2 | 1 / 2 | |
| Switch weapon | Mouse wheel | Y |
| Roster (hold) | Tab | View |
| Switch team (CTF) | J | D-pad up |
| Pause | Esc | Menu |

Touch controls appear automatically on touchscreen devices.

## Weapons and combat rules

| Weapon | Role | Magazine | Notes |
|---|---|---|---|
| **M9 magnum** | Default, precision | 12 | Semi-auto. Smart-scope zoom (1.8×). Rewards headshots on unshielded targets. |
| **VK-7 pulse carbine** | Automatic | 32 | Holographic sight (1.4×). Steady damage at mid range. |
| **SRS-9 sniper rifle** | Power weapon | 4 + 8 reserve | Spawns at map center, respawns 90 s after pickup. Two zoom levels (5× / 10×). One-shot headshot at any shield level. |

Combat rules:
- **Headshot bonus only applies once shields are down.** The sniper is the exception.
- **Taking damage while zoomed** knocks scoped weapons out of zoom, or makes your aim jerk on low-zoom weapons.
- **The reticle turns red** when an enemy is under it and within the weapon's effective range.
- **A shoulder charge is an instant kill** on a target with no shields.
- **Ground pound** damage falls off with distance from the impact. A landing marker shows where and how wide it will hit.
- **Sticking a plasma grenade** to someone is lethal.
- No fall damage.
- The announcer calls out the sniper spawning and the 30-second warning.

## Movement
- **Sprint** is fast but pauses shield recharge once your shields are under about 70%.
- **Slide** by crouching out of a sprint or a thrust.
- **Thrust** dashes in any direction, on the ground or in the air, with a cooldown arc on the HUD.
- **Clamber** auto-mantles onto ledges you jump toward, including mid-thrust and at angles.
- **Stabilize** by aiming in mid-air to hover briefly.
- **Ground pound** by holding crouch in the air to charge, then releasing to slam.
- Movement runs on a fixed 120 Hz physics step with interpolation, plus jump, crouch and thrust input buffering and coyote time, so it feels consistent at any frame rate.

## The AI
CTF bots are built to be competitive, not scripted:
- **Roles:** attack, defend, mid control, escort, chase, flag return, carry. Roles are reassigned dynamically as the flags change hands.
- **Team communication:** callouts for enemy positions, cracked targets to focus, flag status, grenades and the sniper.
- **Combat:** reaction time and aim error depend on difficulty (Normal / Heroic / Legendary). They lead moving targets, predict strafe reversals, dodge with thrust, ground-pound from above, throw frags at clusters and stick plasmas.
- **Learning:** each team keeps a model of its opponent. It tracks strategy win odds (Thompson sampling), where attacks come from, how often enemies change strafe direction, and preferred fight range. Play-style traits (aggression, dodge, patience and so on) evolve between matches. What they learn is saved in your browser and carries over between sessions.
- **Navigation:** grid A* pathfinding that updates when cover is destroyed.

## Settings
Settings are saved in your browser automatically and can be exported to or imported from a JSON file.

- **Graphics:** quality presets (Low → Ultra), render scale, upscaling, dynamic resolution, frame rate target, anti-aliasing (FXAA / MSAA), sharpening, reflections, shadows, bloom, surface detail, texture filtering, particles, draw distance, brightness, saturation, vignette, film grain, field of view, FPS counter
- **Mouse:** sensitivity, aiming sensitivity, invert Y, smoothing, raw input, hold/toggle for sprint, crouch and aim
- **Controller:** look and aim sensitivity, response curve, deadzones, turn acceleration, aim assist strength, invert Y, vibration, full button remapping
- **Gameplay:** reticle color and size, HUD size, camera bob, screen shake, speed lines, hit sounds
- **Audio:** master, effects and announcer volume, announcer pace
- **Destruction:** off / explosives only / full, cover toughness, debris amount, rebuild timer

## Tech overview
- **One self-contained HTML file.** The shipped `index.html` runs straight from disk or any static host. It is built from modular source in `src/` (see [Development](#development)).
- **Rendering:** [three.js](https://threejs.org/) r128 on WebGL with linear-space color management, and a custom post-processing pipeline: half-float render target → bloom → composite with ACES tone mapping, FXAA, contrast-adaptive sharpening, saturation, vignette and grain. It falls back automatically if a shader fails to compile and has an exposure safety check.
- **Characters:** procedural rigs with two-bone IK for elbows and knees. The gait cycle advances by distance travelled so feet never skate, hips turn toward the direction of travel while the torso keeps aiming, feet raycast the ground, and damped springs drive lean, bank, landing compression, flinch and recoil. Deaths topple in the direction of momentum and the killing blow.
- **Physics:** custom capsule-vs-box collision and raycasting, with a fixed 120 Hz step.
- **Networking:** [PeerJS](https://peerjs.com/) (WebRTC data channels) in a star topology. The room host relays presence snapshots, and the CTF host is authoritative for AI, flags and score. Clients send state and hit reports, which the host checks for plausibility (range, line of sight, per-weapon damage caps and rate budgets).
- **Audio:** every sound is synthesized with the Web Audio API, including the trailer score (choir formant synthesis, drums, bass, pads and lead, no samples), which can also render offline to a file. The announcer uses the Speech Synthesis API.
- **Input:** an action-mapping layer over keyboard, mouse, Gamepad API and touch.
- **No WebAssembly.** The game logic is JavaScript on the main thread, and the GPU is used for rendering.

External resources loaded at runtime:
- three.js r128 from cdnjs
- PeerJS 1.5.4 from jsDelivr (with unpkg as a fallback), only when you host or join a room
- Google Fonts

## Browser support and performance
- Best on current desktop **Chrome, Edge or Firefox**. Safari works, but its pointer lock and gamepad support are less consistent.
- Any GPU from the last several years handles the High preset. Use **Low** or lower the render scale on integrated graphics.
- Game logic costs well under 1 ms per frame on a typical laptop. If you see stutter, the GPU settings are the place to look.
- Enable the FPS counter in **Settings → Graphics** to see frame rate and current render resolution.

## Privacy and security
- **No accounts, analytics, ads or tracking.** Nothing is sent anywhere unless you host or join a room.
- Settings, keybinds and AI learning data are stored in your browser's local storage only.
- **When you join a room, your IP address is visible to the other players in it**, as with any peer-to-peer WebRTC connection. Only play with people you'd share that with.
- The public PeerJS server is used only to introduce players to each other. It sees room codes and connection metadata, not gameplay.
- All network input is treated as untrusted. Values are clamped and validated, names are sanitized, room messages are size- and rate-limited, and the host verifies hit reports before applying damage.

## Known limitations
- If the room host leaves, the room ends. There is no host migration.
- There are no dedicated servers. The host's connection and machine set the experience for everyone.
- There is no matchmaking or server browser. Rooms are invite-only by code.
- Some restrictive networks block peer-to-peer connections, and there is no relay (TURN) server yet.
- It's tuned for a small group. The maximum room size is 8.

## Development
The game is developed as modules and built into the single `index.html` that GitHub Pages serves.

```
src/        engine, rendering, world, characters, weapons, UI, networking and game modes
tests/      headless AI matches, browser tests, real-WebGL render checks
docs/       ARCHITECTURE.md (how modules connect, roadmap mapping) and a generated module index
build.mjs   bundles src/ into index.html
```

```bash
node build.mjs                 # build index.html
node build.mjs --check         # verify index.html matches src/ (CI runs this)
node tests/sim.test.js         # two full AI-vs-AI matches, headless
npm install && npx playwright install chromium
node tests/browser.test.js     # gameplay, settings and online rooms over a simulated network
THREE_PATH=three.min.js node tests/render.test.js   # every graphics preset renders a normal frame
```

Every push runs the build check and all three test suites in GitHub Actions. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how modules connect and where each roadmap item lands.

## Roadmap
- Host migration and an optional relay server for restrictive networks
- More maps and modes (Slayer, King of the Hill, Oddball)
- Skinned character models with motion-captured animation layered under the procedural system
- Moving AI and physics into a Web Worker and/or WebAssembly
- A WebGPU renderer
- Desktop packaging

## License
No license has been chosen yet. All rights reserved.
