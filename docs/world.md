# The open world

Exploration mode (`#/world`, or **FLY** at the top right) puts you in your own ASCII ship in the
Milky Way. You can fly anywhere in the disk and jump to the two places that matter, Sol and
Sgr A*, and fly freely inside each. The generated stars are background scenery: they are drawn but
can't be targeted or entered. This page covers how it fits together, for working on it.

The screen furniture is shared with infographics mode: the minimap (`ui/Minimap.tsx`) follows the
ship, and a click in the galaxy sends a `warp` request (target and jump); the info card
(`ui/InfoPanel.tsx`) follows `WorldHud.contact`, the catalog id of the real body you're close to
(`contact()` in `WorldHost` and each `InnerLayer`). Generated stars have no card.

## Layers

The galaxy is too big for one coordinate space, so the world is split into **layers**. Each layer
has its own units and its own scene:

| Layer    | Units                                      | Scene          | Code                     |
| -------- | ------------------------------------------ | -------------- | ------------------------ |
| galaxy   | kly from the core                          | `world-galaxy` | `WorldHost` (open space) |
| landmark | r_s around Sgr A*                          | `black-hole`   | `BlackHoleLayer`         |
| landmark | au around the Sun (distances log-squeezed) | `solar-system` | `SolarLayer`             |

Flying inside a layer is continuous. Changing layer sets `worldStore.sceneId`, and the engine plays
its usual warp to the new scene. The flight itself carries on through the warp.

You enter a place by flying close or arriving from a jump. You leave by crossing its edge or pressing
J; you then come out in open space a little way off (`exitKly`), facing away.

Positions are float64 on the CPU and camera-relative in the shaders (camera at the origin), so
precision holds at any distance.

Each layer brings its own:

- `tuning` (cruise and boost speeds)
- chase `rig`
- `dustRadius`
- `spawn`
- targets
- `sceneFrame`
- occluders (spheres the ship hides behind)
- HUD rows

`SolarLayer` reuses the
explore scene (`SolarSystemPass`) and tells it the date and the body you're near through
`WorldFrame.solar`. Its range runs from Neptune's orbit down to a few thousand km above a surface, so
it uses three optional layer hooks: `tick` (the layer's own clock, so the planets move), `adapt`
(speed, chase distance and dust follow your altitude over the nearest body) and `formatSpeed`
(km/s, then light-speeds). `?date=YYYY-MM-DD` fixes the date, as in explore; the true-distances
param doesn't apply in flight.

## Generation

`src/world/gen/` is deterministic. The same inputs always give the same galaxy.

- **`density.ts`:** the large-scale shape (disk, bar, arms), ported from the galaxy shader.
- **`sector.ts`:** sectors are 0.05 kly cubes with a Poisson star count scaled by density. Each star
  gets a class, colour, planet count and a name from `names.ts`.
- **`planets.ts`:** a star's planets and rings. Sol is hand-built.

Every system id carries the generator version (`g1:…`). If the generator ever changes, ship it as
`g2` next to `g1`, so saved discoveries keep pointing at the stars they were made at.
`tests/worldGen.test.ts` snapshots the output, so you'll notice an accidental change.

Landmarks are real objects at their real places, in `src/world/landmarks.ts`.

## Flying

| File                    | What it does                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `flight/FlightModel.ts` | Chill arcade flight: the throttle sets a cruise speed and the ship eases to it, so letting go brakes on its own. Boost multiplies cruise. |
| `flight/ChaseCamera.ts` | Third-person chase view.                                                                                                                  |
| `flight/HyperJump.ts`   | Turn to the target, a few seconds of time-scaled travel, then arrive (and enter if it's a place).                                         |
| `flight/FlightInput.ts` | Keys and drag-to-steer.                                                                                                                   |
| `flight/pad.ts`         | The touch buttons, as virtual keys.                                                                                                       |

The touch buttons (throttle, boost, stop, target) only show on touch screens (`pointer: coarse`).
Steering on touch is dragging, the same as with a mouse.

## Your ship

A ship is a hull, wings and an engine from `src/world/ship/parts.ts`, plus a colour, a name and a
trail.

Parts are tiny drawings in the ship's own axes. `compose.ts` lays them out for all 10 views: 8 side
directions plus front and rear. Adding a part means:

1. Add its id to `design.ts`.
2. Add a drawing to `parts.ts`.

`tests/ship.test.ts` checks the result for every combination:

- every view exists and is centred
- it's at most 3 cells from the centre
- it only uses glyphs the font has
- the exhaust never overlaps the ship

Ship colours are 12 text swatches (`TEXT_SWATCHES` in `TextLayer.ts`). They're true colours under
the natural palette and shades of the ramp under the terminal palettes.

## The pilot profile

Everything about a pilot lives in one `PilotProfileV1` (`src/profile/schema.ts`):

- callsign
- ship
- last location
- discoveries
- stats

It loads and saves through a `ProfileRepo`. Today that's `LocalProfileRepo` (localStorage). Saves
are debounced, and also go out straight away when you close the hangar, land, or hide the tab.

The shape is ready for a server: a guest `playerId`, a `rev` for conflict checks and
`pilot.claimed` for a username later. Swapping in an API repo doesn't touch callers. On a conflict,
the store merges and keeps both sides' discoveries.

First flight opens the **NEW PILOT** dialog (`src/ui/Onboarding.tsx`) with a suggested callsign and
the controls card. **?** brings the controls back while flying.

## Events

`track(name, props)` in `src/profile/EventSink.ts` drops everything for now. Point `setEventSink`
at a real sink once the game is hosted.

| Event            | Props                              |
| ---------------- | ---------------------------------- |
| `world_launch`   |                                    |
| `world_land`     | `place`                            |
| `world_enter`    | `id`                               |
| `world_jump`     | `to`, `ly`                         |
| `world_discover` | `kind`, `id`                       |
| `pilot_created`  |                                    |
| `hangar_open`    |                                    |
| `ship_saved`     | `hull`, `wings`, `engine`, `color` |

## Dev URLs

In dev builds you can start from a fixed spot, which the screenshot tests use:

- `?wpos=x,y,z&wyaw=deg&wpitch=deg` sets the start pose, in the layer's units.
- `&wplace=id` starts inside a place, with no warp.
- `&wtarget=id` preselects a target.
- `t=` freezes the clock.

For example, Saturn up close:

```
/?t=12&wplace=sol&wpos=-20.5,0.6,-8.55&wyaw=90&crt=0#/world
```
