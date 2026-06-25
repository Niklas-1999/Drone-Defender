# 🛡️ VR Drone Defender

A browser-based WebVR wave-shooter built with **Three.js + WebXR**. Defend your base core from endless drone swarms — playable directly in the **Meta Quest 3** browser with no app install required.

## 🎮 Play it

👉 **[Launch on GitHub Pages](https://niklas-1999.github.io/Drone-Defender/)**

Open that link in your **Meta Quest 3 browser**, tap **Enter VR**, and you're in. Also fully playable on desktop with mouse + keyboard.

---

## 🕹️ Gameplay

You operate a **stationary defence turret** on an alien outpost. Waves of drones converge on your base core from all directions — destroy them before they reach it. Each wave is larger and faster than the last.

| Element | Description |
|---|---|
| **Base Core** | The glowing crystal you protect. Losing it ends the game. |
| **Scout** | Fast, fragile — 1 hit, 100 pts |
| **Warrior** | Medium speed, 3 hits, 250 pts |
| **Titan** | Slow but heavily armoured — 8 hits, 500 pts |

---

## 🎯 Controls

### Desktop
| Action | Input |
|---|---|
| Lock mouse / aim | Click anywhere |
| Shoot | Left click or `Space` |
| SCAN ability | `1` |
| EMP ability | `2` |
| Defence Turret | `3` |

### Meta Quest 3 (VR)
| Action | Input |
|---|---|
| Aim | Point right controller |
| Shoot | Right index trigger |
| SCAN ability | **X** button (left controller) |
| EMP ability | **Y** button (left controller) |
| Defence Turret | Left grip / squeeze |

---

## ⚡ Special Abilities

| Ability | Effect | Cooldown |
|---|---|---|
| **SCAN** | Highlights all drones and reveals HP bars for 5 s | 30 s |
| **EMP Pulse** | Stuns all drones for 4 s and deals 2 damage each | 45 s |
| **Defence Turret** | Deploys an auto-targeting support gun for 10 s | 60 s |

---

## 🚀 Deploying to GitHub Pages

1. Fork or clone this repo
2. Go to **Settings → Pages**
3. Set source to **Deploy from branch → main → / (root)**
4. Visit `https://<your-username>.github.io/<repo-name>/`

WebXR requires **HTTPS**, which GitHub Pages provides automatically.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| 3D rendering | [Three.js r169](https://threejs.org/) |
| VR support | WebXR Device API via `THREE.WebXRManager` |
| Audio | Web Audio API (procedural, no audio files) |
| Input | Pointer Lock API (desktop) + XR GamepadAPI (VR) |
| Haptics | WebXR Haptic Actuators |
| Deployment | GitHub Pages (static, zero build step) |

No bundler, no build step — pure ES modules loaded from CDN. Works offline after first load thanks to browser module caching.

---

## 📁 Project Structure

```
├── index.html          # App shell + HUD markup
├── css/
│   └── style.css       # Dark sci-fi UI theme
└── js/
    ├── main.js         # Entry point
    ├── game.js         # Central coordinator & game loop
    ├── scene.js        # Environment: terrain, base core, rocks, stars
    ├── turret.js       # Player gun model, aiming, raycasting, muzzle flash
    ├── drone.js        # Drone class (Scout / Warrior / Titan)
    ├── waves.js        # Wave spawner with scaling difficulty
    ├── abilities.js    # Scan, EMP pulse, defence turret logic
    ├── particles.js    # Tracer lines, explosions, EMP rings
    ├── audio.js        # Procedural Web Audio sound effects
    ├── ui.js           # HTML HUD + in-world VR canvas HUD
    └── input.js        # Desktop mouse/keyboard + XR controller input
```

---

## 💻 Local Development

ES modules require an HTTP server — just open with **VS Code Live Server** or run:

```bash
npx serve .
```

Then visit `http://localhost:5500` (or whichever port Live Server uses).

> VR mode requires HTTPS and a connected headset. Use GitHub Pages for VR testing.

---

## 📄 License

MIT — feel free to fork, mod, and build on top of it.
