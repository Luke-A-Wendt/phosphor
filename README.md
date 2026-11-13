# [PHOSPHORUS](https://luke-a-wendt.github.io/phosphorus/)

Five small arcade games on a 160 × 192 monochrome green raster. No monitor housing, no textures or downloaded assets, no external dependencies, and no build step.

## Play

Choose Tetris, Pong, Breakout, Asteroids, or Space Invaders. Press **Space** or click **Start game**. Use **P** to pause, **R** to restart, **F** for fullscreen, and **1–5** to switch games. Arrow keys or WASD move. Touch controls appear on touch devices.

| Game | Controls |
| --- | --- |
| Tetris | Left/right move, up or X rotate clockwise, Z counterclockwise, down soft drop, Space hard drop |
| Pong | Up/down or pointer move the paddle; Space serves; first to seven wins |
| Breakout | Left/right or pointer move the paddle; Space launches; three lives |
| Asteroids | Left/right rotate, up thrust, hold Space to fire |
| Space Invaders | Left/right move, hold Space to fire |

High scores and display settings are saved locally in this browser. Nothing is sent to a server. Losing focus pauses an active game. Games are intentionally minimal independent implementations, with original pixel graphics rather than ROMs, extracted sprites, or copied game code.

## GitHub Pages: use the ZIP

1. Extract **the contents** of `phosphor-github-pages.zip` into your repository root. `index.html` must be at the root, not inside an extra enclosing folder. Include `.nojekyll`.
2. Commit and push to your `main` branch.
3. In the repository's **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then **main** and **/(root)**. Save.
4. Open the Pages URL GitHub provides when deployment completes.

All URLs are relative, so project paths such as `https://username.github.io/repository/` work. No npm install, API keys, environment variables, cloud service, or framework is required. The ZIP does not contain the private development site's hosting metadata or credentials. Its source is editable directly.

Official setup reference: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

The private development deployment's access controls belong to its host. They are not included in this static GitHub Pages export; configure access on any destination separately.

## Run locally

Serve the folder containing `index.html` with a static HTTP server, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Opening the file with `file://` will not work reliably because the app uses JavaScript modules. In the development source repository, serve `dist/` instead (`python3 -m http.server 8000 --directory dist`).

Run the dependency-free gameplay tests with `npm test` or `node --test tests/*.test.mjs` using a current Node.js release. Node is only needed for tests, not for hosting.

## The display model

The games draw grayscale light intensities into an offscreen canvas of exactly **160 × 192** samples. That raster is displayed at **4:3**, so its samples are deliberately non-square. All game text, shapes, and scores pass through the same raster renderer. The surrounding controls are regular HTML for readability and accessibility.

The WebGL2 pipeline uses:

1. **Raster excitation.** A 60 Hz progressive raster with 262 total timing lines and 192 active lines. Per-sample excitation follows its scan time, including vertical blanking. The scan state is accumulated in floating-point ping-pong buffers.
2. **Temporal integration.** Fast and slow exponential phosphor components with illustrative 1.7 ms and 25 ms default decay constants. Each browser frame analytically integrates the decay and any excitation pulses during its exposure interval. This avoids pretending that a visibly slow scan bar represents a 15.72 kHz sweep.
3. **Beam reconstruction.** A continuous horizontal bandwidth model and Gaussian vertical beam profile at display resolution. Beam width varies with brightness and edge position. The gaps between lines arise from the beam profile rather than a black-stripe overlay. No RGB shadow mask is applied to a monochrome tube.
4. **Optical scatter.** Two blur scales for tight glow and wider halation, composed with the direct emission.
5. **Faceplate optics.** A curved screen mapping, an approximate refracted view of the phosphor through the faceplate, angle-dependent reflection, faint internal ghosting, mild edge defocus, procedural room reflection, and a green-tinted ambient surface. There is no modeled outer monitor.
6. **Output.** A green-only emission palette, soft intensity rolloff, subtle fixed phosphor granularity, and very small temporal noise. Render targets are capped at a 1400-pixel width and 2× device pixel ratio.

**This is a physically informed visual approximation, not a calibrated simulator of a named historical CRT.** Decay curves, color, focus, and glass parameters are illustrative. It does not simulate individual electrons, measured phosphor spectra, volumetric glass scattering, exact deflection-coil behavior, permanent burn-in, or a camera sensor. A modern display cannot reproduce a CRT's temporal behavior or light spectrum exactly. The procedural reflection does not use a camera or reflect your actual room. Asteroids' lines are rasterized, rather than driven as a historical vector CRT.

**Display settings** exposes beam intensity, afterglow, scatter, scanline definition, curvature, and glass strength. A calibration pattern includes a grid, moving trace, intensity steps, and alternating lines. **Stable display** suppresses temporal grain; the operating system's reduced-motion preference sets its initial value.

WebGL2 and floating-point render targets are preferred. If unavailable, a labeled Canvas 2D fallback offers a simpler green display with trails and scanlines. It does not reproduce the advanced glass and integrated beam model.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Accessible controls and display shell |
| `style.css` | Responsive green-and-black layout |
| `app.js` | Input, game loop, settings, calibration and local scores |
| `games.js` | Five games and a tiny bitmap font |
| `crt.js` | WebGL2 phosphor and glass renderer, with fallback |
| `tests/games.test.mjs` | Gameplay transitions and monochrome rendering checks |

The maintained development source stores browser files under `dist/`. The portable ZIP flattens those files to its root for GitHub Pages.

## License

The original code in this project is supplied under the MIT license in `LICENSE`. Classic game names identify gameplay inspirations; no affiliation with the original publishers is claimed.
