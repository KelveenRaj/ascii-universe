# Restructure plan: from black hole to ASCII universe

Where this is going: an explorable ASCII universe. You start out at the Milky Way and travel to things
in it (Sgr A\*, stars, planets, nebulae). Every place has a fact card, and there are arcade minigames
built on the same renderer.

Where it is now: one very polished black hole. The ASCII display pipeline (glyphs, bloom, CRT,
palettes, copy as text, auto quality) is already general-purpose, but it's wired to the black hole
in a few places, and those are what need untangling:

| Coupling                                                                                                                                                  | Where                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Engine creates `ScenePass` (the black hole) directly and also owns keyboard shortcuts, dev URL params and settings wiring                                 | `src/renderer/Engine.ts` (432 lines)                   |
| The scene texture's channels mean black-hole things (R = disk, G = stars or −1 for shadow, B = redshift), and the ASCII and readback code depends on that | `blackhole.frag`, `lib/glyphmap.glsl`, `ascii.frag`    |
| One brightness→colour palette for the whole screen, so a blue planet next to an orange star isn't possible                                                | `palette/lut.ts`, `ascii.frag`                         |
| Settings mix display options (ramp, CRT, quality) with black-hole physics (disk radii, beaming)                                                           | `state/settings.ts`, `ui/SettingsPanel.tsx`            |
| Camera presets, limits (min distance 2.6 r_s) and the 1/2/3 keys are black-hole-specific                                                                  | `camera/CameraController.ts`, `camera/InputManager.ts` |
| Units are Schwarzschild radii, which means nothing outside a black hole                                                                                   | everywhere                                             |

The idea is to split the code into an **engine** that knows nothing about space, **scenes** that
each render one place, **content** that describes the places and their facts, and **modes**
(explore, info, game) on top.

## Target structure

```
src/
  engine/                     space-agnostic, could render ASCII anything
    Engine.ts                 renderer, loop, lifecycle, context loss. Hosts one active scene
    display/                  DisplayPipeline: bloom → ascii/present → crt, readback, grid, glyph atlas, palette atlas
    camera/                   CameraController (orbit), FlyController (later), InputManager
    quality/                  QualityGovernor, device tier
    overlay/                  TextLayer: CPU-written character grid composited in the ASCII pass
    SceneModule.ts            the contract every scene implements (below)
  scenes/
    black-hole/               everything Sgr A*: blackhole.frag, disk/stars glsl, geodesic.ts, params, presets
    milky-way/                galaxy overview (later)
    star/ planet/             reusable "kind" scenes, parameterised by catalog data (later)
    registry.ts               scene id → lazy import()
  content/
    schema.ts                 Body type: id, name, kind, sceneId + params, parent, facts[], sources[]
    bodies/sgr-a-star.ts      one file per body, plain data
    catalog.ts                lookup + tree (galaxy → system → body)
  modes/
    explore/                  default mode: camera + HUD + navigator
    info/                     infographic/fact card panel
    games/                    minigame framework + games/<name>/
  state/                      display settings, per-scene params, ui, stats, navigation (+ URL sync)
  ui/                         shared retro components (Panel, Section, controls, Dialog, HUD pieces)
  shaders/lib/                shared GLSL (noise, tonemap, glyphmap)
```

`renderer/` becomes `engine/`, and black-hole-specific files move to `scenes/black-hole/`. Tests
follow the same split.

## The key contracts

**SceneModule.** This is what makes adding places cheap. Roughly:

```ts
interface SceneModule<P> {
  id: string;
  params: ParamSchema<P>; // drives the settings panel section + persistence + defaults
  camera: { presets; limits; units: string; defaultPose };
  create(ctx: SceneContext): SceneInstance<P>; // ctx = renderer, scene target size, shared textures
}
interface SceneInstance<P> {
  render(frame: FrameInfo, params: P): void; // writes the scene buffer
  setSize(w, h, aspect, starRows): void;
  hudStats?(): Record<string, string>; // e.g. inclination for the black hole
  dispose(): void;
}
```

The Engine only ever calls this interface. Scenes are loaded with `import()` so each place is its own
chunk.

**Scene buffer format.** One documented layout that every scene writes and the display pipeline
reads, replacing the black-hole-specific channels:

| Channel | Meaning                                                                            |
| ------- | ---------------------------------------------------------------------------------- |
| R       | luminance (HDR, linear), which picks the glyph                                     |
| G       | material/palette row (0–255 / 255): which colour ramp this cell uses               |
| B       | flags: void (pure black, like the shadow), star point, hoverable/pickable id later |
| A       | free per-scene value for debug views (step heatmap, redshift…)                     |

**Palette atlas.** The single 256×1 LUT becomes a 256×N texture: one row per material (EHT disk,
G-type star, Earth ocean, Jupiter bands, nebula Hα…). The global palette switch (green phosphor,
amber, mono) still works by overriding every row. That keeps the "whole screen is one terminal
colour" retro mode while letting the default mode show real colours per body.

**TextLayer.** A cols×rows `Uint8Array` of character codes + colour row, uploaded as a tiny texture
and drawn by the ASCII pass in the same grid as the scene. It's used for body labels floating in
space, target brackets, warp effects, and all minigame sprites and score text. One feature, three
uses.

**Navigation state.** `{ location: bodyId, mode: 'explore' | 'info' | 'game', gameId? }` in a store,
synced to the URL hash (`#/milky-way/sgr-a-star`, `#/sgr-a-star/game/slingshot`) so links are
shareable and back/forward works. No router library needed yet.

## Getting around the universe

There are two ways to move between places:

1. **Discrete warps (recommended first).** Each place is its own scene, with its own units and
   camera. You pick a destination in the navigator (or click a label) and an ASCII warp transition
   (streaking glyphs, CRT roll) covers the swap. It's simple, fast, and every scene can tune its own
   look.
2. **Seamless zoom.** You fly continuously from galaxy to star to planet. That needs a floating origin,
   log-depth handling, level-of-detail blending between renderers and huge-scale data. It's a big
   project; it's worth doing only once several scenes exist, and the scene contract above doesn't
   block it later.

Start with 1. Order of scenes to add after the refactor: **Milky Way overview** (the hub, with Sgr
A\* at the centre, so the existing scene becomes "zoom into the core") → **a star** (the Sun:
limb-darkened sphere + granulation noise + corona) → **planets** (one sphere shader driven by
catalog params: bands, clouds, rings) → nebulae/pulsars later.

## Infographics

- Facts live in `content/bodies/*.ts` as typed data, never in components: value, unit, a short
  plain-English comparison ("4 million Suns"), and a source link for each fact. A unit test checks
  every body validates against the schema and every fact has a source.
- The info panel is a retro "data terminal" overlay: ASCII bar charts and size comparisons drawn
  with the same glyph look (it can use the TextLayer or plain DOM with the pixel font, whichever
  reads better). Opening it can slow the camera into a slow orbit as a backdrop.
- First card: Sgr A\* (mass, distance, size of the shadow, the 2022 EHT image, how we know it's
  there from stellar orbits). Check every number against its source while writing it.

## Minigames

- A `Game` interface: `start(ctx)`, `update(dt, input)`, `draw(textLayer)`, `dispose()`, plus a
  score/state store for the React overlay (title, game over, high score in localStorage). Games run
  inside the same Engine, with the scene as the backdrop and the TextLayer as their sprite layer. They
  get input through an input context so explore controls switch off while a game runs.
- First game, which reuses what's already here: **Slingshot**. You set the angle and speed, then
  fling a probe around the black hole on the edge-on view, with the disk arcing behind it. Massive
  particles follow their own equation of motion, so add a timelike-orbit integrator next to
  `geodesic.ts` (which only handles light). A slow probe falling in from far away can't
  swing back out once its closest approach dips below r = 2. Faster probes can skim closer, toward
  the photon sphere at 1.5, and nothing orbits stably inside the ISCO (r = 3). The closer you skim,
  the bigger the bend and the more time dilation you rack up. Score is the deflection angle plus
  "years lost" to time dilation, and the round is lost if the probe crosses the horizon. The probe and
  its trail are drawn with the TextLayer; the HUD shows the onboard clock vs the outside clock. Later games per
  scene: asteroid dodging in a planet's rings, a "chart the stars" constellation game in the Milky
  Way view.

## Migration milestones

Each one is a separate commit/PR, and the first three must change **nothing visible**.

0. **Safety net.** Add Playwright screenshot tests using the existing dev URL params
   (`?preset=eht&t=12&crt=0…`) for 4–5 fixed views. These are the before/after reference for the
   refactor.
1. **Extract the display pipeline.** Move bloom/ascii/present/crt/readback/grid/atlas/lut out of
   `Engine.ts` into `engine/display/DisplayPipeline`. Move keyboard shortcuts into a keybinding
   registry (commands, so the help overlay can list them from the same source) and dev params into
   their own file. Engine ends up around 150 lines.
2. **Scene contract.** Add `SceneModule`, move the black hole into `scenes/black-hole/`, and have the
   Engine host it through the interface. Camera presets/limits come from the scene.
3. **Split settings.** Display settings stay global. Black-hole params become a per-scene store
   generated from its `ParamSchema`, and the settings panel renders that section from the schema.
   Bump the persist version and migrate old saved settings so nobody loses theirs.
4. **Scene buffer + palette atlas.** Switch to the generic channel layout and the N-row palette.
   The black hole writes material row "EHT" and the screenshots still match.
5. **TextLayer.** Add the overlay grid and use it first for a label on Sgr A\*.
6. **Content + navigation + info panel.** Add the catalog, navigation store + URL hash and the info
   panel, with Sgr A\* as the first card.
7. **Second scene: Milky Way hub**, with warp transition to Sgr A\*. This is the real test of the
   abstractions. Fix the contract here if it fights back.
8. **Minigame framework + Slingshot.**

After 8, adding a place should mostly be: a scene (or reuse a kind like `planet` with new params) +
a content file + palette rows.

## Smaller cleanups to do along the way

- Name units per scene (r_s for the black hole, AU for systems, light-years for the galaxy) and show
  them in the HUD from the scene.
- Keep `geodesic.ts` and `blackhole.frag`'s step length in sync with a shared constants test (the
  comment says "must match"; make a test enforce it).
- Lazy-load scenes and games so the first load stays small.
- Update README's structure section and add a short `docs/adding-a-scene.md` once milestone 7 lands.

## Decisions

- **Travel: warps.** Discrete scenes with an ASCII warp transition. Seamless zoom is parked until
  there are several scenes.
- **Colour: real per-body colours by default.** The palette atlas carries a row per material. The
  existing palettes (green phosphor, amber, mono…) stay as a "terminal mode" override.
- **First minigame: Slingshot**, in the spirit of the Interstellar-style flyby. It uses its own names
  and art, not the film's.
