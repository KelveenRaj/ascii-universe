# Adding a place

A place is two things: a **scene** (how it's drawn) and a **body** (what it is, with sourced facts).
The engine does the rest: ASCII glyphs, palettes, bloom, CRT, copy as text, labels, quality, the
camera, the settings panel, the info card, URLs and warps. `src/scenes/milky-way/` is the smallest
complete example.

## 1. The scene

Make `src/scenes/<id>/` with:

- **A fragment shader** that fills the scene buffer, one texel per character cell:
  - R: brightness (HDR, linear)
  - G: background stars, or −1 for pure-black void such as a shadow
  - B: material index
  - A: `steps` debug value

  `src/engine/scene/SceneModule.ts` has the details. `#include /src/shaders/lib/noise.glsl` and
  `stars.glsl` give you noise and a starfield.

- **`materials.ts`:** one colour ramp per kind of stuff the shader paints (B = its index), plus the
  sky colours. Under the natural palette each material keeps its own colours. Terminal palettes
  recolour everything.

- **`camera.ts`:** presets (keys 1–9; the first is where you arrive) and distance limits, in the
  scene's own units.

- **`params.ts`:** the knobs. The settings panel builds itself from this schema, and values are
  saved per scene.

- **A pass class** implementing `SceneInstance`:
  - `render()` draws into `frame.target`.
  - `labels()` is optional. Give a label a `target` body id and clicking it warps there.
  - `hudRows()` returns the HUD lines (say the units, e.g. `KLY`).

- **`index.ts`** exporting the `SceneModule`.

Then add it to `SCENES` in `src/scenes/registry.ts` under its id.

## 2. The body

Add `src/content/bodies/<id>.ts` and list it in `src/content/catalog.ts`:

- `sceneId` is the scene from step 1.
- `parent` is where it sits (the navigator and Backspace use it).
- Facts each cite a source.

Check every number against its source while writing it. `tests/content.test.ts` fails if a fact
has no source, a source is unused, or a link isn't https.

## 3. Check it

- `npm test`
- `npm run test:visual` (add a view of the new place to `e2e/visual.e2e.ts`, then
  `npm run test:visual:update` once to record it)
- Open `#/<id>` in the dev server.

## Adding a tour

A tour is an entry in `src/content/tours.ts`: steps of `{ bodyId, prompt, facts }`, where `facts` are
labels of that body's own cited facts. The tour never states a number itself, so it can't drift from
the sources; `tests/tours.test.ts` checks every label exists. It appears in the TOURS menu on its own.
