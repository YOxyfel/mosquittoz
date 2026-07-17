# Mosquittoz website

Static promotional site and playable browser field test for **Mosquittoz**.

The site deliberately contains only optimized in-engine renders and original HTML/CSS/JavaScript. It does not publish the Unreal project, source FBXs, raw textures, or packaged game build.

## Local preview

Serve this directory over HTTP so browser module and asset behavior matches GitHub Pages:

```powershell
python -m http.server 4173 --directory D:\999.Personal\Mosquitto\Website
```

Then open `http://127.0.0.1:4173/`.

## Deployment

GitHub Pages serves the `main` branch root at:

`https://yoxyfel.github.io/mosquittoz/`

All asset paths are repository-relative so the project works under the `/mosquittoz/` Pages base path.

## Field test controls

- `WASD` or arrow keys: steer
- `Q` / `E`: rise / descend
- `Shift`: boost
- `Ctrl`: brake
- Hold `Space` or `F`: feed near the bite zone
- `Esc`: pause

Pointer steering and touch controls are also supported.
