# Kinetic Arena

[![Views](https://hits.sh/github.com/knapply/arena-shooter-experiment.svg?label=views&color=46d6ff&labelColor=1b2329)](https://hits.sh/github.com/knapply/arena-shooter-experiment/)

A fast, movement-focused sci-fi arena shooter that runs entirely in the browser. Drop in from orbit, then thrust, slide, clamber, hover and ground-pound through a symmetric arena, fight practice drones solo, or play 4v4 Capture the Flag with friends over a direct peer-to-peer connection. No install, no accounts, no downloads.

**▶ Play:** https://knapply.github.io/arena-shooter-experiment/

[![Kinetic Arena trailer](media/trailer-preview.gif)](https://knapply.github.io/arena-shooter-experiment/media/trailer.mp4)

**🔊 [Watch the full trailer with sound](https://knapply.github.io/arena-shooter-experiment/media/trailer.mp4)** · every frame captured straight from the game engine, with an original soundtrack synthesized in the browser. The game menu's **Watch trailer** button plays the same video.

---

## Contents
- [Features](#features)
- [Game modes](#game-modes)
- [Playing with friends](#playing-with-friends)
  - [Relay servers for strict networks](#relay-servers-for-strict-networks)
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
- [Credits](#credits)
- [License](#license)

---

## Features
- **Full movement kit:** sprint, slide, thruster dash, ledge clamber, crouch-jump, aerial stabilize, aimed ground pound and shoulder charge, with consistent timing you can learn
- **Shields and health:** recharging shields that flash on impact, with headshot rules that reward finishing cracked opponents
- **Four weapons with fixed kill times:** a precision magnum (5-shot perfect kill in about a second), an automatic pulse carbine, and two power weapons, a sniper rifle and a rocket launcher, that take turns at the map's central power spawn. Precision weapons have no random spread
- **Grenades:** bouncing frags and sticky plasmas
- **Drop pods:** you respawn by falling 200 m out of the sky in a pod: its nose glows white-hot and it trails a re-entry burn of flame, embers and smoke that the whole map can see, then it slams into the ground, blows its doors off and lets you out (land on someone and they're done). The longer fall costs no extra time: the pod launches earlier, so you're back exactly as soon as before. Steer it a little on the way down to pick your landing spot (in CTF, only around your own base), or press Jump to skip the pod camera. The HUD and reticle stay out of the way until you land. Classic in-place spawns are one setting away
- **Safe spawns:** every spawn point is scored against enemy sight lines, nearby enemies and fights in the last few seconds, so you don't appear in someone's crosshair. Spawn protection ends as soon as you fire
- **Loot what falls:** the dead drop their weapon and grenades. Grenades and ammo for guns you already carry are picked up by walking over them; anything else is a manual pickup, so you choose what to carry
- **Friendly fire, on by default:** teammates' rounds, rockets and grenades hurt you too, and a teamkill costs a point. Switch it off in the settings
- **Bodies are solid:** pilots collide with each other, so you can body-block a doorway or a flag carrier
- **The flag is a two-handed carry:** pick it up like a weapon, carry it in both hands, and you can't shoot while you hold it (swap to a weapon to drop it)
- **Sandbox settings:** every movement, weapon and grenade number that matters (run and sprint speed, acceleration, air control, jump, gravity, thrust, damage, fire rates, spread, bloom, rocket speed and blast, grenade throw, bounce, fuse and radius) is a slider, with defaults chosen by simulated matches ([docs/TUNING.md](docs/TUNING.md)). Online, everyone plays by the host's sandbox
- **Destructible cover:** dozens of breakable crates, barricades and walls on both maps. They chip as they take damage (chunks come off where they're hit) before they collapse. Tunable or fully disabled, and they rebuild over time
- **Free-for-all matches:** first to 15 kills, with practice drones when it's quiet
- **Capture the Flag:** 4v4 on a mirrored map, with AI filling every empty slot
- **Kill cam:** after you die, see the last few seconds through your killer's eyes
- **Melee that reads:** a blow from behind kills outright; otherwise the first blow always takes the shield down and a second kills. You see a swing arc when anyone strikes, and your own blow punches the camera
- **Readable fights:** arcs around the crosshair point at whoever is hitting you; positional footsteps, thrusts and landings are loud up close; shield hits, shield breaks, headshots and kills each have their own hit marker and sound, and the target flashes
- **Power weapon loop:** the HUD counts down to the power spawn's next weapon, an enemy grabbing the sniper or rockets is called out, and anyone holding one is marked through walls
- **Flag clarity:** a named waypoint on every flag carrier, a score bar that says who has each flag, and distinct sounds and announcer lines for taken, dropped and returned
- **Match stats:** hold Tab for a sortable table of every pilot (AI included): kills, deaths, assists, K/D, damage, accuracy, headshots, medals, spree, power weapon held, and captures, returns, carries and flag time in CTF, with team totals
- **Results screen:** after Play of the Game, the winner and score, your match (kills by weapon, accuracy, best spree, damage, medals), awards (MVP, most damage, best accuracy, top flag runner), a timeline of the big moments, and Play again, Change mode or Leave
- **Play of the Game:** every match ends with a cinematic replay of its best moment (multikills, sprees, clutch captures)
- **Match intros:** a five-second flyover of the map, both teams at their spawns, the objective and the power weapon
- **HUD:** clean, angular glass panels: grenades top left (each type's icon and count, the selected one lit, and the key or D-pad that swaps them, following the device you're using and your bindings), shield over hull top middle, both weapons and the ammo counter (magazine and reserve) top right, the motion tracker bottom left. It scales with the HUD size setting, fits a phone, and gets out of the way during pod drops and kill cams
- **Motion tracker:** a 25 m radar showing enemies only while they sprint, thrust or hover (stabilize in the air); walking, crouching and firing keep you off it. Teammates always show, dimmer. It sits bottom left by default, or in whichever spot you choose, at the size you choose, and in capture the flag it takes the minimap's place while you play
- **Pings:** mark an enemy, weapon or place for your team; AI teammates respond to them. You have one mark at a time: a new ping replaces your last. Double-tap ping to mark danger at your reticle, enemy or not: a red warning with its own sound and callout, and AI teammates keep clear of it while the nearest two watch it
- **Grenades switch themselves:** run out of one type and the next type you still have comes up
- **Medals:** multikills, sprees, Perfect (a minimum-shot kill with no misses), headshots, revenge and more, with announcer callouts
- **AI with the full arsenal:** bots carry the carbine and the magnum like you, switch with your switch time, and pick the magnum at range and to finish a pilot whose shields are down
- **Four bot skill levels:** Recruit (the gentle default for your first match: slow to react, loose aim, short sight, few dodges and grenades), Normal, Heroic and Legendary, for the practice drones and CTF bots alike
- **AI that learns:** bot teams adapt strategy, lane choice and fighting style across matches, and talk to each other in team comms
- **AI that only knows what it sees:** bots notice you in their field of view, when they hear gunfire or someone sprinting close by, when you shoot them, or when a teammate calls you out. No wallhacks
- **AI vs AI spectating:** a director camera that cuts to the big moments in slow motion, a free tactical camera, a live intel panel and background training
- **Online play:** peer-to-peer rooms with a 5-character code or invite link, up to 8 players, with direct player-to-player links, smooth remote movement under real-world lag, and host migration
- **Controller support:** Xbox-style controllers with remapping, aim assist, response curves and vibration
- **Deep settings:** graphics presets plus 50+ individual options, full keyboard and controller rebinding, and export/import of settings as a file
- **Cinematic trailer:** an 88-second in-engine trailer, built shot by shot: anamorphic letterbox, depth of field with rack focus, a split-tone grade, dusk, daylight and night lighting moods, speed ramps into slow motion and a frozen-time finale, with a few seconds here and there played in first person with the real HUD, all scored to an original synthesized soundtrack. It is recorded from a separate trailer build, so none of it adds to the game's download
- **Animation:** articulated 32-bone pilots (two-segment spine, clavicles, two-joint fingers and thumbs, toes, hip armor and a sprung antenna) in heavy powered armor (broad layered pauldrons, a full-face helmet with one wraparound gold visor, a thick chest plate and high collar, layered leg plates and armored boots), moving in a low, forward fighting stance with the gun up, with distance-synced strides, heel strike and toe-off, hip-led strafing and backpedaling, hands that close around whatever they hold, breathing and weight shifts at rest, feet that plant on stairs and ledges, spring-driven lean, landing compression, hit flinches, recoil and momentum-based death falls. Runs and sprints have a real flight phase (both feet off the ground), knee drive, heel kick and shoulders that counter-rotate against the hips. Jumps push off, tuck and reach for the ground. Slides drop low, lead leg out and the gun up. Other players visibly raise their guns to aim down sights, and reloads show the magazine out and in, a palm slap and the charging handle or slide racked
- **Sci-fi maps with color-coded zones:** structural ribs, metal trims, vents, light bands and floor guide lights on every wall, contact shadows where walls meet the floor, composite crates and plated floors, under a ringed planet, a nebula and a lit megacity skyline. Each arena quadrant glows its own color, and team maps wear their team's color on each half, so you always know where you are. Dust drifts in the light, searchlights sweep the sky over the city, and the light strips breathe
- **Procedural audio and announcer:** synthesized weapon and movement sounds, with spoken callouts using your browser's speech engine

## Game modes

| Mode | Players | Description |
|---|---|---|
| **Arena** | 1–8 | Free-for-all on Proving Grounds. First to 15 kills (or the most kills after 10 minutes) wins, then Play of the Game and the results screen. Practice drones fill in when it's quiet. |
| **Capture the Flag** | 1–8 humans, 8 total | 4v4 on Twin Foundry. Bring the enemy flag to your stand while yours is home. First to 3 captures wins, with an 8-minute time limit. Humans take a bot's slot on their team. |
| **AI vs AI** | Spectator | Two learning AI teams play CTF. Speed controls (1×/2×/4×), a director camera that varies its shots and slows down for captures and multikills, follow cameras, and a tactical camera you can turn and zoom (drag, wheel, pinch or controller). The intel panel shows each team's strategy odds and evolved play style. "Train 10 matches" runs headless matches in the background. |
| **Trailer** | Spectator | An 88-second cinematic cut of the game: the squad burns in from orbit in drop pods and you ride yours down from the cockpit, three rules of the arena (with first-person stretches: a thruster dodge, a clamber over a blast gate), an action montage with the rocket launcher and a scoped sniper shot, every mode live (capture the flag, Team Slayer, oddball with its skull dropping in by pod, free-for-all), a supply drop, the simulations that tune every number, online play, and a frozen-time finale, synced to an original score. |

## Playing with friends
1. Open the game and click **Host a room**. You'll get a 5-character code.
2. Click **Copy invite** and send the link, or just send the code.
3. Friends open the link (it joins automatically) or enter the code and click **Join**.
4. Deploy into the Arena together, or have one person start **Play CTF** while everyone else picks a team and clicks **Join match**.

Notes:
- **Every player connects directly to every other player** for movement, so what you see of a friend doesn't detour through the host. The host relays the rest (names, scores, hits, flags).
- **If the host leaves, the room carries on.** The host keeps a backup (the player with the best connection); everyone moves to the backup automatically, and it takes over the room code so friends can still join. A CTF match in progress is taken over by a player in it, with the score and clock intact.
- **The host sees a "Hand host to …" button** when another player would make a better host (lower worst-case ping to everyone), and can hand the room over in one click.
- In CTF, the host runs the AI, flags and score for everyone.
- Switch teams any time with **J**, **D-pad up**, or the pause menu.
- Everyone needs an internet connection. Very strict networks (some workplaces, some mobile carriers) can block direct connections; see [relay servers](#relay-servers-for-strict-networks).

### Relay servers for strict networks
If players can't connect directly, a relay (TURN) server fixes it. Add your relay's details to the page address before hosting or joining, for example:

```
https://knapply.github.io/arena-shooter-experiment/?turn=turns:USER:PASSWORD@relay.example.com:443
```

Several can be listed with commas. Any standard TURN service works (self-hosted coturn or a hosted provider). Everyone in the room should use the same address.

## Controls
All bindings can be changed in **Settings → Keys / Controller**.

| Action | Keyboard / mouse | Controller |
|---|---|---|
| Move | WASD / arrow keys | Left stick |
| Look | Mouse | Right stick |
| Jump · clamber · skip a cinematic | Space | A |
| Crouch · slide · ground pound (hold in air) · crouch-jump (hold in air) | C / Left Ctrl | B |
| Sprint | Left Shift | Left stick click |
| Thrust | Q | LB |
| Fire | Left click | RT |
| Aim · zoom · stabilize in air | Right click | LT |
| Melee · charge (while sprinting) | F / Mouse 4 | Right stick click |
| Reload | R | X |
| Pick up weapon (hold) | E | X (hold) |
| Throw grenade | G / Mouse 5 | RB |
| Swap grenade type | T | D-pad left / right |
| Ping (enemy, weapon or place; double-tap: danger) | Z / middle click | D-pad down |
| Weapon slot 1 / 2 | 1 / 2 | |
| Switch weapon | Mouse wheel | Y |
| Roster (hold) | Tab | View |
| Switch team (CTF) | J | D-pad up |
| Performance overlay / network panel | F3 / F4 | |
| Pause | Esc | Menu |

Touch controls appear automatically on touchscreen devices.

## Weapons and combat rules

| Weapon | Role | Magazine | Best kill | Notes |
|---|---|---|---|---|
| **M9 magnum** | Default, precision | 12 + 36 reserve | 5 shots, 1.04 s | Semi-auto, no random spread. Smart-scope zoom (1.8×). |
| **VK-7 pulse carbine** | Automatic | 32 + 96 reserve | 12 shots, 1.1 s | Holographic sight (1.4×). Spread and bloom; steady damage at mid range. |
| **SRS-9 sniper rifle** | Power weapon | 4 + 8 reserve | 1 headshot / 2 body shots | No random spread. Two zoom levels (5× / 10×). |
| **HX-2 rocket launcher** | Power weapon | 2 + 4 reserve | 1 direct hit, or the blast | Rockets fly at 32 m/s and burst on contact; the 4.2 m blast falls off with distance, breaks cover and can kill you too. |

No weapon has endless ammo: the starting guns carry about what a pilot fires in a long life (the 95th percentile of simulated lives, [docs/TUNING.md](docs/TUNING.md)), so you rarely run dry, but drops and ammo pickups matter. An empty gun with nothing to reload clicks and brings up your other weapon.

The power spawn at map center alternates between the sniper rifle and the rocket launcher: each time one is taken, the other comes back 90 s later.

The full kill-time table is generated from the weapon data: [docs/SANDBOX.md](docs/SANDBOX.md). Players and AI use the same numbers.

Combat rules:
- **Headshot bonus only applies once shields are down.** The sniper is the exception.
- **Friendly fire is on by default.** AI teammates hold fire while you're in their line of fire.
- **Precision weapons go exactly where the reticle is**, moving or airborne. Their recoil is a visual kick that returns to center before your next shot.
- **Perfect medal:** a kill in a precision weapon's minimum shots with no misses.
- **Taking damage while zoomed** knocks scoped weapons out of zoom, or makes your aim jerk on low-zoom weapons.
- **The reticle turns red** when an enemy is under it and within the weapon's effective range.
- **A shoulder charge is an instant kill** on a target with no shields.
- **Ground pound** damage falls off with distance from the impact. A landing marker shows where and how wide it will hit.
- **Sticking a plasma grenade** to someone is lethal.
- No fall damage.
- The announcer calls out the sniper spawning and the 30-second warning.

## Movement
- **Sprint** is fast but you can't shoot, and it pauses shield recharge.
- **Strafing** is as fast as running forward, and reversing direction bites harder than speeding up: a full left-right flip takes about 0.15 s, quick enough to make someone miss.
- **Aiming** a low-zoom scope keeps 90% of your speed; a sniper scope slows you more.
- **Slide** by crouching out of a sprint or a thrust (a thrust-slide is the fastest way across the map). Jumping out of a slide carries its speed into the air.
- **Thrust** dashes in any direction, on the ground or in the air, with a cooldown arc on the HUD.
- **Clamber** auto-mantles onto ledges you jump toward, including mid-thrust and at angles.
- **Crouch-jump:** holding crouch in the air tucks your legs and lets you clamber ledges about half a meter higher. The tall pillars in the arena have a ledge whose 6 m perch only a crouch-jump reaches.
- **Stabilize** by aiming in mid-air to hover briefly.
- **Ground pound** by holding crouch in the air to charge, then releasing to slam where you're aiming.
- Movement runs on a fixed 120 Hz physics step with interpolation, plus jump, crouch and thrust input buffering and coyote time, so it feels consistent at any frame rate. The movement "feel contract" (speeds, timings, heights) is covered by automated tests.

## The AI
CTF bots are built to be competitive, not scripted:
- **Roles:** attack, defend, mid control, escort, chase, flag return, carry. Roles are reassigned dynamically as the flags change hands.
- **Team communication:** callouts for enemy positions, cracked targets to focus, flag status, grenades and the sniper.
- **Pings:** when a teammate pings, the two nearest AI teammates head there; a pinged enemy is shared with the whole team. A danger mark keeps every AI teammate's route clear of it, and the two nearest hold short of it and watch it for a few seconds.
- **Combat:** reaction time, aim error, sight range, dodging and grenade use depend on the skill level (Recruit / Normal / Heroic / Legendary). They carry the carbine and the magnum with a magazine and a reserve each (the player's loads), take the magnum at mid and long range and to finish a cracked target, switch instead of reloading mid-fight, and aim the magnum more tightly the better they are. They lead moving targets, predict strafe reversals, dodge with thrust, ground-pound from above, throw frags at clusters and stick plasmas.
- **Learning:** each team keeps a model of its opponent. It tracks strategy win odds (Thompson sampling), where attacks come from, how often enemies change strafe direction, and preferred fight range. Play-style traits (aggression, dodge, patience and so on) evolve between matches. What they learn is saved in your browser and carries over between sessions. Training runs on a background thread.
- **Navigation:** grid A* pathfinding, built from the map and updated when cover is destroyed.

## Settings
Settings are saved in your browser automatically and can be exported to or imported from a JSON file. The search box at the top finds any setting (or key binding) across every tab, and every setting explains what it does and what it costs.

- **Graphics:** quality presets (Low → Ultra), render scale, upscaling, dynamic resolution, frame rate target, anti-aliasing (FXAA / MSAA), sharpening, reflections, shadows, bloom, surface detail, texture filtering, particles, draw distance, brightness, saturation, vignette, film grain, field of view, FPS counter, performance overlay, network panel
- **Mouse:** sensitivity, aiming sensitivity, invert Y, smoothing, raw input, hold/toggle for sprint, crouch and aim
- **Controller:** look and aim sensitivity, response curve, deadzones, turn acceleration, aim assist strength, invert Y, vibration, full button remapping
- **Gameplay:** friendly fire, spawn style (drop pods or classic), motion tracker (on or off, its corner and its size), kill cam, match intros, reticle color and size, HUD size, camera bob, screen shake, speed lines, hit sounds
- **Sandbox:** movement, weapon and grenade tuning (see [docs/TUNING.md](docs/TUNING.md) for what each number does and how the defaults were picked). A host's sandbox applies to everyone in their room for as long as they're in it; your own saved values come back when you leave
- **Labs:** prototype weapons (burst rifle, scattergun, arc beam, pulse grenade), a lighter melee rule and Twin Foundry layout changes, all off by default and offline only ([docs/PROPOSALS.md](docs/PROPOSALS.md) has what each does and what the simulations found)
- **Audio:** master, effects and announcer volume, announcer pace
- **Destruction:** off / explosives only / full, cover toughness, debris amount, rebuild timer

## Tech overview
- **One self-contained HTML file.** The shipped `index.html` runs straight from disk or any static host. It is built from modular source in `src/` (see [Development](#development)). A second generated file, `sim-worker.js`, runs AI training in the background when the page is served over http(s).
- **Rendering:** [three.js](https://threejs.org/) r186 on WebGL 2 with linear-space color management, and a custom post-processing pipeline: half-float render target, bloom, then a composite with ACES tone mapping, FXAA, contrast-adaptive sharpening, saturation, vignette and grain. Static map geometry and character parts are merged by material, which keeps a full CTF scene well under a thousand draw calls. It falls back automatically if a shader fails to compile and has an exposure safety check.
- **Characters:** 32-bone rigs, rigidly skinned into one mesh per material and shared by every pilot, so a fully articulated pilot costs about ten draw calls.
  - Locomotion is motion capture: walk, jog, run, sprint, side steps, backpedal, crouched walks, idle and a jump with its landing, retargeted onto the rig and packed into about 24 KB (14-bit keys, each predicted from the two before it). A blend space over speed and direction (relative to where the pilot aims) mixes them on one shared phase; strides lengthen, cadence quickens and stances shorten to match the game's speeds, and the hips turn toward the travel while the torso keeps aiming. A small state machine cross-fades idle, moving, crouched, airborne and landing.
  - Planted feet lock to the ground (tests check they drift under 3 cm a stride at every speed and direction), follow stairs and ledges, and step when a pilot turns on the spot.
  - Procedural layers on top: two-bone IK arms holding the weapon or flag, aiming down sights, reloads, melee, recoil, flinch, a head that looks at the aim point, breathing that deepens after a run, and springs for lean into acceleration and turns. Deaths topple in the direction of momentum and the killing blow. About 10 µs of animation per pilot per frame.
- **Physics:** custom capsule-vs-box collision and raycasting, with a fixed 120 Hz step.
- **Maps and modes as data.** Each map is a plain document (geometry, spawns, flags, pickups, lanes, bounds) that is validated, built and mirrored automatically, and match intros are generated from it. Modes are declared with a small framework (rules, scoring, HUD, spawn logic), so Free-for-All, CTF and the sandbox share one match loop.
- **Networking:** [PeerJS](https://peerjs.com/) WebRTC data channels in a full mesh. Movement travels on unordered, unreliable fast channels as compact binary messages (40 per second in Arena, 30 in CTF); events and setup use a reliable channel. A versioned message registry defines every packet, and peers check protocol versions when they join.
  - Remote players are drawn from a playback buffer with clock-offset estimation and an adaptive delay, so movement stays smooth through jitter and packet loss.
  - Hits are lag-compensated: the host rewinds the target to where the shooter saw it, checks range, line of sight and the shot ray, then applies damage.
  - A backup host is chosen in advance. If the host leaves or goes silent, the backup takes over the match, including CTF score, flags and AI, and can hand the role to a better-connected player.
  - When a direct link can't be made, traffic falls back to a relay through the host, or through an optional TURN server.
- **Recording and replays:** the simulation is seeded and every match records its inputs and events, which drive the kill cam, Play of the Game and highlight clips. An events stream feeds the HUD, announcer, stats and replays from one place.
- **Save data:** settings, keybinds and AI learning are stored as versioned documents with migrations, so updates never wipe your setup.
- **Trailer:** the cut is a list of shots, each a function of time, so it plays live (clocked by the music) or steps frame by frame for video capture. First-person stretches run the real game loop for the player's own pilot with scripted input, so the HUD, viewmodel, scope, motion tracker and pod cockpit are exactly the game's. Pilots are real game bodies following routes that are steered every physics step; any collision with a wall at speed is logged, and the tests fail if a pilot runs into one or the camera ends up inside the level. Cutscenes get a cinematic post look on top of the normal pipeline: depth of field from the depth buffer (weighted so sharp subjects don't bleed into the blur), a split-tone grade, lens fringing and anamorphic streaks.
- **Audio:** every sound is synthesized with the Web Audio API, including the trailer score (choir formant synthesis, drums, bass, pads, lead, string tremolo, bells and sub drops, no samples), which can also render offline to a file. Live, notes are created just before they sound so the audio thread keeps real time. The announcer uses the Speech Synthesis API.
- **Input:** an action-mapping layer over keyboard, mouse, Gamepad API and touch.
- **Map dressing:** maps are plain boxes for collision and navigation; a dressing pass adds ribs, trims, vents, light bands, guide lights and contact shadows, seeded so a map always looks the same, then merges everything by material. A map's whole dressing costs a handful of draw calls.
- **No WebAssembly, on purpose.** Simulation, AI and physics take well under a millisecond per frame in JavaScript (CI checks this), so a WebAssembly port would add build complexity and download size without a visible gain. Frame time is GPU-bound: the wins there come from fewer draw calls (merging, shared skinned meshes) and shader work, which is where the graphics effort went.

External resources loaded at runtime:
- three.js 0.186.1 from jsDelivr (its ES module build, imported by a small module script; the version is pinned in `src/manifest.json`)
- PeerJS 1.5.4 from jsDelivr (with unpkg as a fallback), only when you host or join a room
- Google Fonts

## Browser support and performance
- Best on current desktop **Chrome, Edge or Firefox**. Safari works, but its pointer lock and gamepad support are less consistent.
- Any GPU from the last several years handles the High preset. Use **Low** or lower the render scale on integrated graphics.
- Game logic costs well under 1 ms per frame on a typical laptop. If you see stutter, the GPU settings are the place to look.
- The whole game is about 475 KB (about 175 KB compressed). Draw calls and triangle counts are held to fixed budgets that CI checks on every push.
- Enable the FPS counter in **Settings → Graphics** to see frame rate and current render resolution, or the network panel to see ping, loss and playback delay.

## Privacy and security
- **No accounts, analytics, ads or tracking.** Nothing is sent anywhere unless you host or join a room.
- Settings, keybinds and AI learning data are stored in your browser's local storage only.
- **When you join a room, your IP address is visible to the other players in it**, as with any peer-to-peer WebRTC connection. Only play with people you'd share that with. If you use a TURN relay, the relay operator can see that you connected, but not your gameplay contents beyond what WebRTC encryption exposes.
- The public PeerJS server is used only to introduce players to each other. It sees room codes and connection metadata, not gameplay.
- All network input is treated as untrusted. Messages are decoded against a fixed schema, values are clamped and validated, names are sanitized, room messages are size- and rate-limited, and the host verifies hit reports before applying damage.

## Known limitations
- There are no dedicated servers. A player's browser hosts the match; if it leaves, the backup host takes over, but a very poor host connection still affects everyone until a handover.
- There is no matchmaking or server browser. Rooms are invite-only by code.
- Some restrictive networks block peer-to-peer connections. A relay through the host covers most cases; the rest need a TURN server, which you have to supply (see [Relay servers](#relay-servers-for-strict-networks)).
- Play of the Game is chosen on each player's machine from what it saw, so two players can occasionally see different picks.
- After a CTF host migration, the AI continues with the new host's own learned data.
- Background AI training needs the page served over http(s). From a file on disk it runs on the main thread between matches instead.
- It's tuned for a small group. The maximum room size is 8.

## Development
The game is developed as modules and built into the single `index.html` that GitHub Pages serves.

```
src/        engine, rendering, world, characters, weapons, UI, networking, maps and game modes
tests/      headless AI matches, scenarios, browser and network tests, render and visual checks
tools/      dev server, verify script, trailer recorder and previewer, rig animation previews, sandbox tuning simulations, unused-code check
docs/       ARCHITECTURE.md, EXECUTION.md (what runs when), EXTENDING.md (adding maps, modes, weapons, HUD), TUNING.md,
            NEXT_STEPS.md (ideas), PROPOSALS.md (prototyped weapons and map changes, with simulations), a generated module index and the sandbox kill-time table
build.mjs   bundles src/ into index.html and sim-worker.js
```

```bash
npm install && npx playwright install chromium
npm run dev                    # dev server with rebuild on change
bash tools/verify.sh           # everything below, in order: run before every push

node build.mjs                 # build index.html and sim-worker.js
node build.mjs --check         # verify the build matches src/ (CI runs this)
npm run lint && npm run typecheck
node tests/sim.test.js         # full AI-vs-AI matches, headless
node tests/scenarios.test.js   # movement feel, kill times, hit registration, CTF rules
node tests/messages.test.js    # wire format round trips
node tests/store.test.js       # save data migrations
node tests/maps.test.js        # map validation and overlaps
node tests/perf.test.js        # size, draw call and triangle budgets
node tests/browser.test.js     # gameplay, settings and online rooms
node tests/net.test.js         # mesh, host migration and smoothness on a simulated bad network
node tools/tune.js             # sandbox tuning: simulated matches on every CPU core (LOCK=magnum etc. for single-weapon runs)
THREE_PATH=three.module.min.js node tests/render.test.js   # every graphics preset renders a normal frame
THREE_PATH=three.module.min.js node tests/visual.test.js   # compare scenes against tests/visual baselines
VISUAL_UPDATE=1 THREE_PATH=three.module.min.js node tests/visual.test.js   # accept new baselines
```

Working on the HUD:

```bash
THREE_PATH=three.module.min.js node tools/hud-preview.js [out-dir]   # first person at desktop and phone sizes: keyboard and controller hints, low ammo, a danger mark, CTF
```

Working on character animation:

```bash
THREE_PATH=three.module.min.js node tools/rig-preview.js gait    # contact sheet: a run, a sprint and a jump
THREE_PATH=three.module.min.js node tools/rig-preview.js poses   # idle, aiming down sights, melee, reload
THREE_PATH=three.module.min.js node tools/rig-preview.js moves   # the armor up close, crouch, slide, death
```

Working on the trailer (it lives in a separate build, `node build.mjs --trailer` → `out/trailer.html`, which these tools make for you):

```bash
node tools/trailer-preview.js check                       # simulate the whole cut: wall bumps, camera clipping, event log
THREE_PATH=three.module.min.js node tools/trailer-preview.js stills 12,20.5,60   # a contact sheet of frames
THREE_PATH=three.module.min.js node tools/trailer-preview.js clip 11 16          # a small video of a stretch, with the score
THREE_PATH=three.module.min.js node tools/record-trailer.js      # re-record media/trailer.mp4 and the preview GIF
```

Add `?dev` to the page address (or use `npm run dev`), then press the backquote key for the developer console: time scale, teleport, god mode, bad-network simulation and the network panel. Type `help` for the full list.

Every push runs the full suite in GitHub Actions. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how modules connect and where each roadmap item lands.

## Roadmap
- A map editor, with map import and export
- Career stats across matches
- Syncing maps and replays with a folder on your computer
- More modes (Slayer teams, King of the Hill, Oddball) on the mode framework
- A playable team deathmatch (Slayer) on the arena: the AI already plays it for the balance simulations
- See [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) for a longer list of ideas across gameplay, graphics, sound and engineering, and [docs/PROPOSALS.md](docs/PROPOSALS.md) for prototyped weapons and map changes with simulation results
- A WebGPU renderer
- Desktop packaging

## Credits
Character motion comes from the [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu/) (Carnegie Mellon University; the database was created with funding from NSF EIA-0196217), by way of B. Hahne's BVH conversion. The takes used are listed in `src/data/anim-clips.js`, which `tools/mocap/convert.js` generates from them.

## License
No license has been chosen yet. All rights reserved.
