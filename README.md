# [PHOSPHOR](https://luke-a-wendt.github.io/phosphor/)

Eight minimal arcade games behind curved green glass. **PHOSPHOR** draws its games, menus, settings, and calibration patterns into the same 256 × 192 monochrome raster.

<img width="1441" height="1079" alt="image" src="https://github.com/user-attachments/assets/f9afccd4-5c64-415e-b8a2-425de6ca7cac" />

## Open and play

The home page is one black, full-page button. The glowing prompt says **CLICK HERE** on desktop or **TAP HERE** on touch devices. Click or tap anywhere on the page to enter fullscreen. The prompt uses the same green phosphor raster and bloom renderer as the PHOSPHOR menu title, on a black background. The prompt stays centered in the visible page viewport as browser bars change. Everything else is inside the monitor.

Use **arrow keys (or WASD)** for movement and **Enter** as the action button. Select a game with up/down, then press Enter. Press Enter after a game ends to restart.

| Game | Movement | Enter |
| --- | --- | --- |
| Tetris | Left/right move; up rotates; down lowers | Hard drop |
| Pong | Up/down move the paddle | Serve |
| Breakout | Left/right move the paddle | Launch |
| Asteroids | Left/right turn; up thrusts | Fire; hold for repeated shots |
| Invaders | Left/right move | Fire; hold for repeated shots |
| Snake | Directions steer; reversing into yourself is blocked | Hold to move faster |
| Lander | Left/right tilt; up also thrusts | Hold to thrust |
| Tanks | Left/right aim; up/down adjust power | Fire |

Snake grows as it eats. Lander requires a gentle, level landing with both feet on the pad; fuel and lives are limited. Tanks is a simplified turn-based artillery duel against the computer, with wind, destructible terrain, and blast damage. Its opponent begins with an uncertain range estimate, then corrects later shots from its actual previous impact and changes in wind. A first-shot hit is possible, but the opponent usually needs to calibrate.

High scores stay in your browser. Losing focus pauses a game; the action button resumes it.

## Back navigation

The menu hint is **ESC BACK**. Escape and the mobile ESC button have the same behavior:

| Current screen | One Escape goes to |
| --- | --- |
| Game | Root menu |
| Settings | Root menu |
| Calibration test or Controls | Settings, retaining the selected row |
| Root menu | Black home page, exiting fullscreen |

Returning to the home page resets every display setting to its default. Settings last only for the current visit inside the monitor. High scores are retained.

In browsers that permit keyboard locking, nested back navigation stays in native fullscreen. If a browser reserves Escape, the app preserves the previous screen in an expanded page view; browser controls may return. Holding Escape can activate the browser's fullscreen escape hatch. Browser Back also steps through the app while it is open.

## Settings and calibration

Select **Settings** from the root menu. The controls are phosphor pixels rendered behind the glass; there are no HTML settings panels or pop-up windows.

Use up/down to select a setting, left/right to adjust it, and Enter to activate it. The list scrolls as you move. **Display test** is available only from settings, at the top of the list. Enter cycles its grid/levels, beam/focus, and motion/decay patterns; Escape returns to settings.

- **Controls** (browser only) opens a glowing keyboard diagram of WASD, arrows, E, Enter, numpad Enter, Space, Q, and Escape. Held movement/action keys light up; Escape or Q returns to Settings.
- **Tint** selects the monochrome hue across the full color wheel. The default is cyan at 190 degrees; glow, line/spot decay and glass tones follow the selected tint. Reset settings or exit to Home restores the default cyan.
- **Ambient light** ranges from a dark room to an illuminated room, raising the textured phosphor surface's black level along with reflected light.
- **Reflection** controls environmental glare independently. Environments are **Off**, **Soft room**, **Daylight**, **Desk light**, **Observer**, and **Mixed light**. The observer is a faint procedural silhouette; no camera is used.
- Beam intensity, afterglow, light scatter, scanlines, curvature, glass depth, and stable display are adjustable. **Reset settings** restores defaults immediately.

At zero ambient light, room reflections and ambient phosphor illumination disappear. The Off environment removes environmental reflections while preserving ambient illumination of the phosphor coating. Stable display initially follows the device's reduced-motion preference.

## Mobile

PHOSPHOR uses a landscape-only layout. If native orientation lock is unavailable, the complete interface turns sideways while the phone is upright, without a rotation prompt. A matched set of generated, photorealistic Amiga-style keycaps replaces the joystick: an inverted-T arrow cluster at bottom left, a vertical Enter key at bottom right, and **ESC** at top left. All six were generated together with the same overhead view, dim soft lighting, well-worn grey-beige material, and complete key edges. Pressing a key slightly reduces its apparent size and compresses its shadow into a fixed dark well. Slide between arrows or press movement and action together; cancellation and focus loss release all keys. ESC remains available at the root menu.

The 4:3 display uses the full available height whenever it can fit alongside usable controls. Keys expand to consume the remaining horizontal space, with equal 8-pixel clearance from the right arrow to the glass and from the glass to the action key. This offsets the monitor right by default. The mobile-only **Arrow Keys** setting, between Keyboard Sounds and Reset Settings, selects **Left** or **Right**. Choosing Right places the arrow cluster on the right and Enter on the left, shifting the monitor left while preserving every key size, spacing, press effect, and sound. ESC stays in exactly the same position. Reset Settings or exiting to the launcher restores Left. For example, a 780 × 312 CSS-pixel viewport fits a 416 × 312 display and 81.5-pixel keys. On narrower screens, keys retain 44-pixel touch targets and the display reduces to fit. Extra space on unusually wide screens stays outside the control groups. Safe-area insets are respected.

Native fullscreen and landscape locking are requested where supported. Otherwise, the app fills the available page viewport. An embedded viewer's header, status bar, or edit overlay belongs to the host app; open the site directly in your browser for the fullest view.

## Sound and power

The screen warms in over two visible seconds with a thermal cathode response. Warm-up and its sound wait until fullscreen entry has settled and the screen is visible in either orientation. Hidden pages pause warm-up. Power timing follows elapsed visible time independently of the game timestep, so dropped frames do not stretch it away from the sound. Shutdown lasts 1.8 seconds: vertical deflection bows and collapses into a lingering line, horizontal deflection contracts it, and a residual phosphor spot fades. Finite beam width keeps the line visible while the glass stays stationary. These timings are deliberately slowed to make the modeled sequence easier to see; Stable display uses a gentle fade instead and is selected explicitly in Settings; the default power sequence is the same on desktop and mobile. Back can complete shutdown even when startup was waiting for fullscreen.

Sound is synthesized locally with Web Audio: a subdued relay movement, decaying degauss hum, quiet flyback whine, cabinet hum, and a low, springy damped release with staggered resonances and a gradual onset. Keyboard presses vary slightly in pitch, resonance, timing, and noise. Games have individual effects, including impacts, shots, scoring, lander/ship thrust, and invader steps. Tetris plays an original synthesized arrangement of the traditional melody **Korobeiniki**.

Lander and Asteroids use restrained, sustained filtered noise for thrust, with Asteroids mixed lower, with a short release when thrust stops. Tanks has a brief cannon report and a separate impact with a brief noise burst followed by roughly four seconds of normalized bass and gravelly midrange rumble, with soft saturation and irregular swells that remain audible above phone-speaker rolloff. Invaders has a four-pulse march triggered by each formation movement, so its tempo follows the surviving aliens and wave speed; the passing saucer has its own continuous wobble. Pong and Breakout use short square-wave hits, with separate Tetris and Snake feedback. These are original procedural approximations of arcade sound characteristics, rather than samples taken from the games.

Inside Settings, **Music**, **Game sounds**, **Keyboard Sounds**, and **Monitor Sounds** independently range from 0% (mute) to 100%. Music and Game sounds default to 100%. Sound controls appear at the bottom in Music, Game Sounds, Monitor Sounds, Keyboard Sounds order, followed by Arrow Keys on mobile, then Reset Settings. Keyboard Sounds and key-depression audio are mobile-only. Desktop keyboard input is silent. Both default to 50%, calibrated for clearly audible effects, with additional volume available above 50%. Volumes reset with the display when returning home. Pause and hidden tabs stop game audio; music plays only during active Tetris. Sound begins after opening the app, subject to browser/device audio permissions. Fresh gestures recover suspended or interrupted audio contexts, closed contexts are recreated, and power sounds wait until the audio clock is running. Lander thrust/crash and tank fire/explosions include midrange layers for smaller speakers.

The audio and power sequences are physically informed approximations, not recordings or measurements of a particular CRT or keyboard. No copyrighted game recordings or external audio downloads are used.

## The display

The games use a **256 × 192**, **4:3** source image with square pixels before glass distortion. Game geometry and boundaries use this landscape playfield directly.

The dependency-free WebGL2 renderer combines:

- A 60 Hz progressive timing model with 262 total lines, 192 active scanlines, and blanking.
- Scan-timed excitation and integrated fast/slow phosphor decay in floating-point or encoded 16-bit-light history buffers.
- Brightness-dependent Gaussian beam reconstruction, horizontal bandwidth, and edge focus.
- Fixed phosphor texture behind a separate glass surface.
- Finite-thickness curved glass, ray intersections, Snell refraction, Fresnel reflection/transmission, and path-dependent absorption.
- Faint internal reflections, surface marks, and subtle procedural room lighting.
- A molded, sloping inner bezel with a gently bowed glass opening, tight interior corners, joined planar faces, narrow edge chamfers, and a dark contact seam. Fine grain, small surface pits, and rough dielectric reflections give the recess a worn material finish. Nearby phosphor emission lights the recess locally; weaker light arrives from the rest of the screen. Its reflections follow the selected tint and power sequence. The inset fits within the existing footprint, without a monitor cabinet; mobile key size and placement are unchanged.
- Multiple scales of light scatter and glow, monochrome green emission, and no RGB shadow mask.

There is no monitor housing or bezel. This is a **physically informed visual model**, not a calibrated reproduction of a measured tube. Material and phosphor parameters are modeled choices. It does not simulate individual electrons, detailed deflection circuitry, permanent burn-in, or measured emission spectra. Asteroids uses this raster rather than a historical vector display.

WebGL2 devices without floating-point render targets use encoded RGBA8 buffers with the same raster, glass, and power shaders. A simpler Canvas fallback remains for devices without WebGL2, with reduced glass optics and the same power timing and content-dependent line collapse.

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

Tests cover game progression and collisions, Tetris visibility after line clears, native landscape geometry, new-game physics and turns, menu and touch-key input, settings controls, calibration, sound lifecycle, and nested fullscreen/back navigation.

## Files

| File | Purpose |
| --- | --- |
| `app.js` | Launcher, session lifecycle, navigation, input, and rendering loop |
| `interface.js` | Pixel launcher lettering and CRT root menu |
| `controls.js` | Input-source merging and menu navigation |
| `touch-keys.js` | Multitouch keycaps, slide transitions, and release handling |
| `viewport-layout.js` | Visible-viewport geometry, full-height CRT, and maximum mobile key sizes |
| `audio.js` | Procedural keyboard, monitor, game audio, and Tetris music |
| `power-sequence.js` | Warm-up and shutdown timing |
| `fullscreen.js` | Native fullscreen, keyboard locking, and expanded-view fallback |
| `controls-screen.js` | Browser keyboard diagram and live key highlights |
| `settings-screen.js` | Pixel settings navigation and rendering |
| `display-settings.js` | Defaults and numeric validation |
| `calibration.js` | Grid, beam, and motion test patterns |
| `games.js` | Five original games, bitmap font, and game registry |
| `extra-games.js` | Snake, Lander, and Tanks |
| `crt.js` | Scan, phosphor, glass, reflection, and glow rendering |
| `style.css` | Black launcher, fullscreen layout, minimal touch controls |
| `key-*.webp` | Generated photorealistic keycaps used by the mobile keyboard |
| `KEYCAP-SOURCES.txt` | Keycap generation and extraction details |
| `assets/key-atlas.png` | Original generated keycap atlas |
| `assets/key-atlas-prompt.txt` | Complete image-generation prompt |
| `scripts/prepare-keycaps.py` | Reproducible extraction from the retained atlas |

## License

[MIT](LICENSE) for the original code and pixel graphics. Classic game names identify gameplay inspirations; no ROMs or extracted game assets are included.

The current keycap artwork was AI-generated for PHOSPHOR and is included with the project. It is not a photograph of a physical keyboard. See [KEYCAP-SOURCES.txt](KEYCAP-SOURCES.txt) for the retained atlas, prompt, and extraction details. The earlier third-party photographic key crops are no longer used.
