# VR Drone Defender

A browser-based wave-shooter built with **Three.js + WebXR**. Defend your base from drone swarms across 12 waves and three boss fights — playable directly in the **Meta Quest 3** browser with no install required.

## Play it

**[Launch on GitHub Pages](https://niklas-1999.github.io/Drone-Defender/)**

Open in your **Meta Quest 3 browser**, tap **Enter VR**, and you're in. Also fully playable on desktop with mouse + keyboard.

---

## Gameplay

You operate a stationary gun turret. Waves of drones converge on your base — destroy them before they reach you. The game spans **12 waves** split into three cycles, each ending with a boss fight. Survive all three cycles to win.

### Wave structure

| Cycle | Waves | Environment |
|---|---|---|
| 1 | 1-1 · 1-2 · 1-3 · **Boss 1** | Day |
| 2 | 2-1 · 2-2 · 2-3 · **Boss 2** | Evening |
| 3 | 3-1 · 3-2 · 3-3 · **Boss 3** | Night |

### Drones

| Type | HP | Points |
|---|---|---|
| Scout | 1 | 100 |
| Warrior | 3 | 250 |
| Titan | 8 | 500 |

### Bosses

| Boss | Description |
|---|---|
| **Boss 1** | Fast-moving drone. Zips around the arena and fires homing missiles. Three phases with increasing fire rate. |
| **Boss 2** | Orbital platform. Fires missiles and is protected by shield drones. Destroy the shield drones each phase to expose it. 2 shields → 3 → 4. |
| **Boss 3** | Giant purple robot. Rises from the ground. Shoot the glowing shoulder targets (Phase 1), then the neck (Phase 2). In Phase 3 the head detaches and flies around the arena — destroy shield orbs to expose it. |

---

## Controls

### Desktop

| Action | Input |
|---|---|
| Lock mouse / aim | Click anywhere |
| Shoot | Hold left click |
| Reload | `R` |
| EMP | `E` |
| Shop: buy upgrade | `1`–`9` |
| Shop: continue | `0` or `Space` |
| Cheat menu | `` ` `` (backtick) |

### Meta Quest 3 (VR)

| Action | Input |
|---|---|
| Aim | Point right controller |
| Shoot | Right index trigger (hold) |
| Grab turret | Right grip |
| Reload | Left index trigger |
| EMP | X button |
| Shop / cheat menu | Y button |

---

## Shop upgrades

Between every wave a shop opens. Spend earned money on:

| Upgrade | Effect |
|---|---|
| Ammo Capacity | +15 ammo per level (5 levels) |
| Fire Rate | +25% speed per level (5 levels) |
| Reload Speed | −0.5 s reload time per level (4 levels, max = instant) |
| Auto Turret L / R | Deploy an auto-targeting side turret |
| Turret Rate | Increase auto turret fire speed (3 levels) |
| Buy EMP | Unlock EMP pulse ability |
| EMP Cooldown | −3 s cooldown per level (5 levels) |
| EMP Stun Duration | +0.5 s stun per level (5 levels) |

Earn a **no-damage bonus** ($50 + $10 per wave) for surviving a wave without taking a hit.

---

## Tech stack

| Layer | Technology |
|---|---|
| 3D rendering | [Three.js r169](https://threejs.org/) (ES modules via CDN) |
| VR support | WebXR Device API via `THREE.WebXRManager` |
| Audio | Web Audio API (procedural SFX) + MP3 music tracks |
| Input | Pointer Lock API (desktop) + XR Gamepad API (VR) |
| Haptics | WebXR Haptic Actuators |
| Deployment | GitHub Pages (static, zero build step) |

No bundler, no build step — pure ES modules.

---

## Project structure

```
├── index.html
├── css/
│   └── style.css
├── assets/
│   ├── Music/          # Period-based music + victory track
│   └── Soundeffects/   # Gun reload, empty click
└── js/
    ├── main.js         # Entry point
    ├── game.js         # Game loop, wave/boss/shop coordination
    ├── scene.js        # Environment: terrain, base, sky transitions (day/evening/night)
    ├── turret.js       # Player gun: aiming, firing, timed reload
    ├── drone.js        # Drone types: Scout / Warrior / Titan
    ├── waves.js        # Wave spawner with scaling difficulty
    ├── boss.js         # Boss 1 (drone) + Boss 2 (orbital) + ShieldOrb
    ├── boss3.js        # Boss 3 (giant robot): rise animation, 3 phases, detaching head
    ├── shop.js         # Between-wave upgrade shop (canvas UI)
    ├── emp.js          # EMP pulse ability
    ├── autoturret.js   # Auto-targeting side turrets
    ├── projectiles.js  # Swept-sphere CCD collision for all projectiles
    ├── particles.js    # Fire/spark/explosion particle system
    ├── audio.js        # Procedural Web Audio SFX + MP3 music player
    ├── ui.js           # HTML HUD + in-world VR canvas HUD
    └── input.js        # Desktop mouse/keyboard + XR controller input
```

---

## Local development

ES modules require an HTTP server:

```bash
npx serve .
```

Then open `http://localhost:3000`.

> VR mode requires HTTPS and a connected headset. Use GitHub Pages for VR testing.

---

## License

MIT
