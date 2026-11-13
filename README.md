# [PHOSPHORUS](https://luke-a-wendt.github.io/phosphorus/)

Eight minimal arcade games behind curved green glass. **PHOSPHOR** draws its games, menus, settings, and calibration patterns into the same 256 × 192 monochrome raster.

## Open and play

The home page is black with one glowing **OPEN PHOSPHOR** button. Click it to enter fullscreen. Everything else is inside the monitor.

Use **WASD or the arrow keys** for movement and **Space** as the action button. Select a game with up/down, then press Space. Press Space after a game ends to restart.

| Game | Movement | Action button |
| --- | --- | --- |
| Tetris | Left/right move; up rotates; down lowers | Hard drop |
| Pong | Up/down move the paddle | Serve |
| Breakout | Left/right move the paddle | Launch |
| Asteroids | Left/right turn; up thrusts | Fire; hold for repeated shots |
| Space Invaders | Left/right move | Fire; hold for repeated shots |
| Snake | Directions steer; reversing into yourself is blocked | Hold to move faster |
| Lunar Lander | Left/right tilt; up also thrusts | Hold to thrust |
| Scorched Tanks | Left/right aim; up/down adjust power | Fire |

Snake grows as it eats. Lunar Lander requires a gentle, level landing with both feet on the pad; fuel and lives are limited. Scorched Tanks is a simplified turn-based artillery duel against the computer, with wind, destructible terrain, and blast damage.

High scores stay in your browser. Losing focus pauses a game; the action button resumes it.

## Back navigation

The menu hint is **ESC BACK**. Escape and the mobile ESC button have the same behavior:

| Current screen | One Escape goes to |
| --- | --- |
| Game | Root menu |
| Display settings | Root menu |
| Calibration test | Display settings, retaining the selected row |
| Root menu | Black home page, exiting fullscreen |

Returning to the home page resets every display setting to its default. Display settings last only for the current visit inside the monitor. High scores are retained.

In browsers that permit keyboard locking, nested back navigation stays in native fullscreen. If a browser reserves Escape, the app preserves the previous screen in an expanded page view; browser controls may return. Holding Escape can activate the browser's fullscreen escape hatch. Browser Back also steps through the app while it is open.

## Settings and calibration

Select **Display settings** from the root menu. The controls are phosphor pixels rendered behind the glass; there are no HTML settings panels or pop-up windows.

Use up/down to select a setting, left/right to adjust it, and Space to activate it. The list scrolls as you move. **Display test** is available only from settings. Space cycles its grid/levels, beam/focus, and motion/decay patterns; Escape returns to settings.

- **Ambient light** ranges from a dark room to an illuminated room, raising the textured phosphor surface's black level along with reflected light.
- **Reflection** controls environmental glare independently. Environments are **Off**, **Soft room**, **Daylight**, **Desk light**, **Observer**, and **Mixed light**. The observer is a faint procedural silhouette; no camera is used.
- Beam intensity, afterglow, light scatter, scanlines, curvature, glass depth, and stable display are adjustable. **Reset settings** restores defaults immediately.

At zero ambient light, room reflections and ambient phosphor illumination disappear. The Off environment removes environmental reflections while preserving ambient illumination of the phosphor coating. Stable display initially follows the device's reduced-motion preference.

## Mobile

Play in **landscape**. Portrait displays a rotate-to-play prompt and pauses gameplay. The left circular joystick springs back to its center when released; the right circular button is the action. The top-left **ESC** button is always available inside the monitor, including at the root menu and rotation prompt. Movement and action support simultaneous touches.

The 4:3 display uses the full available landscape height, limited by viewport width. Controls overlay the screen when space is tight rather than reserving margins that shrink it.

Native fullscreen and landscape locking are requested where supported. Otherwise, the app fills the available page viewport. An embedded viewer's header, status bar, or edit overlay belongs to the host app; open the site directly in your browser for the fullest view.

## The display

The games use a **256 × 192**, **4:3** source image with square pixels before glass distortion. Game geometry and boundaries use this landscape playfield directly.

The dependency-free WebGL2 renderer combines:

- A 60 Hz progressive timing model with 262 total lines, 192 active scanlines, and blanking.
- Scan-timed excitation and integrated fast/slow phosphor decay in floating-point history buffers.
- Brightness-dependent Gaussian beam reconstruction, horizontal bandwidth, and edge focus.
- Fixed phosphor texture behind a separate glass surface.
- Finite-thickness curved glass, ray intersections, Snell refraction, Fresnel reflection/transmission, and path-dependent absorption.
- Faint internal reflections, surface marks, and subtle procedural room lighting.
- Multiple scales of light scatter and glow, monochrome green emission, and no RGB shadow mask.

There is no monitor housing or bezel. This is a **physically informed visual model**, not a calibrated reproduction of a measured tube. Material and phosphor parameters are modeled choices. It does not simulate individual electrons, detailed deflection circuitry, permanent burn-in, or measured emission spectra. Asteroids uses this raster rather than a historical vector display.

A simpler Canvas fallback keeps the games playable without WebGL2 or floating-point targets, with reduced glass optics.

## Run locally

No dependencies or build step. From the ZIP folder containing `index.html`:

```sh
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000). Use HTTP because the app uses JavaScript modules. The maintained development repository keeps browser files in `dist/`; serve that folder there. The GitHub Pages ZIP puts them at its root.

## Deploy to GitHub Pages

Extract the ZIP contents into the repository root, including `.nojekyll`. Commit and push, then choose **Settings → Pages → Deploy from a branch → main → /(root)**.

All asset paths are relative. No keys, backend, framework, or package installation is needed. The ZIP excludes private development-site credentials and hosting metadata. Destination hosting controls access separately.

## Tests

With Node.js installed:

```sh
npm test
```

Tests cover game progression and collisions, Tetris visibility after line clears, native landscape geometry, new-game physics and turns, menu and joystick input, settings controls, calibration, and nested fullscreen/back navigation.

## Files

| File | Purpose |
| --- | --- |
| `app.js` | Launcher, session lifecycle, navigation, input, and rendering loop |
| `interface.js` | Pixel launcher lettering and CRT root menu |
| `controls.js` | Input-source merging, joystick mapping, menu navigation |
| `fullscreen.js` | Native fullscreen, keyboard locking, and expanded-view fallback |
| `settings-screen.js` | Pixel settings navigation and rendering |
| `display-settings.js` | Defaults and numeric validation |
| `calibration.js` | Grid, beam, and motion test patterns |
| `games.js` | Five original games, bitmap font, and game registry |
| `extra-games.js` | Snake, Lunar Lander, and Scorched Tanks |
| `crt.js` | Scan, phosphor, glass, reflection, and glow rendering |
| `style.css` | Black launcher, fullscreen layout, minimal touch controls |

## License

[MIT](LICENSE). Original code and pixel graphics; no ROMs or extracted assets. Classic game names identify gameplay inspirations.
