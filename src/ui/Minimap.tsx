import { useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { ARMS, armRadius, armSpan } from '@/scenes/milky-way/layout';
import { SOLAR_BODIES } from '@/scenes/solar-system/bodies';
import { layoutAt } from '@/scenes/solar-system/layout';
import { navigationStore } from '@/state/navigation';
import { worldStore, type MapBody, type WorldMap } from '@/state/world';
import commonStyles from '@/ui/common.module.css';
import { cx } from '@/ui/cx';
import styles from '@/ui/Minimap.module.css';
import { LANDMARKS, MAP_GALAXY_EXTENT } from '@/world/landmarks';
import { SOL_MAP_EXTENT } from '@/world/layers';
import { inSolarSystem } from '@/world/places';

type Scope = WorldMap['scope'];

interface MapView {
  scope: Scope;
  extent: number;
  bodies: MapBody[];
  /** Highlighted body: the one you're looking at, or targeting. */
  selected: string | null;
  ship: WorldMap['ship'] | null;
  /** Dots respond to clicks. */
  live: boolean;
}

const HALF = 46;
const SCOPE_LABEL: Record<Scope, string> = {
  galaxy: 'MILKY WAY',
  sol: 'SOLAR SYSTEM',
  hole: 'SGR A*',
};

/** The galaxy's real spiral arms (Reid et al. 2019, as the galaxy scene draws them), in kly. */
const ARM_PATHS: Array<{ id: string; pts: number[][] }> = ARMS.map((arm) => {
  const [lo, hi] = armSpan(arm);
  const pts: number[][] = [];
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const betaDeg = lo + ((hi - lo) * i) / n;
    const beta = (betaDeg * Math.PI) / 180;
    const r = armRadius(arm, betaDeg);
    pts.push([r * Math.sin(beta), r * Math.cos(beta)]);
  }
  return { id: arm.id, pts };
});

/** Bodies for the galaxy scope when not flying: the two places you can visit. */
const GALAXY_PLACES: MapBody[] = LANDMARKS.map((l) => ({
  id: l.bodyId ?? l.id,
  name: l.name,
  x: l.pos[0],
  z: l.pos[2],
}));

/** What to draw while looking at a body in infographics mode. */
function viewForBody(bodyId: string, solBodies: MapBody[]): MapView {
  if (inSolarSystem(bodyId)) {
    return {
      scope: 'sol',
      extent: SOL_MAP_EXTENT,
      bodies: solBodies,
      selected: bodyId === 'moon' ? 'earth' : bodyId === 'solar-system' ? null : bodyId,
      ship: null,
      live: true,
    };
  }
  return {
    scope: 'galaxy',
    extent: MAP_GALAXY_EXTENT,
    bodies: GALAXY_PLACES,
    selected: bodyId === 'milky-way' ? null : bodyId,
    ship: null,
    live: true,
  };
}

/**
 * The minimap, top right: where you are in the universe. In infographics mode it is also how you
 * warp (click a place); in exploration mode it follows your ship, and a click in the galaxy sets
 * the course to that place and jumps there.
 */
export function Minimap() {
  const world = useStore(navigationStore, (s) => s.world);
  const bodyId = useStore(navigationStore, (s) => s.bodyId);
  const hud = useStore(worldStore, (s) => s.hud);
  const [hover, setHover] = useState<string | null>(null);
  const solBodies = useMemo<MapBody[]>(() => {
    const placed = layoutAt(new Date(), false);
    return SOLAR_BODIES.filter((b) => b.id !== 'moon').map((b) => ({
      id: b.id,
      name: b.name.toUpperCase(),
      x: placed[b.id].pos[0],
      z: placed[b.id].pos[2],
    }));
  }, []);

  let view: MapView;
  if (!world) view = viewForBody(bodyId, solBodies);
  else if (hud) {
    view = {
      scope: hud.map.scope,
      extent: hud.map.extent,
      bodies: hud.map.bodies,
      selected: hud.map.target,
      ship: hud.map.scope === 'hole' ? null : hud.map.ship,
      // inside Sgr A* there is nothing to pick; elsewhere a click targets (in the galaxy: jumps)
      live: hud.map.scope !== 'hole',
    };
  } else {
    view = {
      scope: 'galaxy',
      extent: MAP_GALAXY_EXTENT,
      bodies: GALAXY_PLACES,
      selected: null,
      ship: null,
      live: false,
    };
  }

  const pick = (b: MapBody) => {
    if (!view.live) return;
    if (!world) navigationStore.getState().goTo(b.id);
    else if (view.scope === 'galaxy') worldStore.getState().request({ type: 'warp', id: b.id });
    else worldStore.getState().request({ type: 'target', id: b.id });
  };
  const back = !world && view.scope === 'sol';
  const px = (v: number) => Math.max(-HALF, Math.min(HALF, (v / view.extent) * HALF));
  const caption =
    hover ??
    (view.selected ? (view.bodies.find((b) => b.id === view.selected)?.name ?? null) : null);

  return (
    <nav
      className={cx(commonStyles.frame, styles.map)}
      aria-label="Minimap"
      data-ui
      data-testid="minimap"
    >
      <div className={styles.head}>
        <span className={styles.scope}>{SCOPE_LABEL[view.scope]}</span>
        {back && (
          <button
            type="button"
            className={styles.back}
            onClick={() => navigationStore.getState().goTo('milky-way')}
            title="Back to the Milky Way (Backspace)"
          >
            &lt; GALAXY
          </button>
        )}
      </div>
      <svg
        className={styles.svg}
        viewBox="-50 -50 100 100"
        role="group"
        aria-label={`Map of the ${SCOPE_LABEL[view.scope]}`}
      >
        {view.scope === 'galaxy' && (
          <g className={styles.arms}>
            {ARM_PATHS.map(({ id, pts }) => (
              <polyline
                key={id}
                points={pts
                  .map(([x, z]) => `${(x / view.extent) * HALF},${(z / view.extent) * HALF}`)
                  .join(' ')}
              />
            ))}
          </g>
        )}
        {view.scope === 'sol' &&
          view.bodies
            .filter((b) => b.id !== 'sun')
            .map((b) => (
              <circle
                key={b.id}
                className={styles.orbit}
                cx={0}
                cy={0}
                r={(Math.hypot(b.x, b.z) / view.extent) * HALF}
              />
            ))}
        {view.scope === 'hole' && <circle className={styles.hole} cx={0} cy={0} r={5} />}
        {view.scope === 'galaxy' && <circle className={styles.core} cx={0} cy={0} r={3} />}
        {view.bodies.map((b) => {
          const on = b.id === view.selected;
          const label = `${world && view.scope === 'galaxy' ? 'Jump to' : 'Go to'} ${b.name}`;
          return (
            <g
              key={b.id}
              className={cx(styles.body, on && styles.on, view.live && styles.live)}
              transform={`translate(${px(b.x)} ${px(b.z)})`}
              role={view.live ? 'button' : undefined}
              tabIndex={view.live ? 0 : undefined}
              aria-label={view.live ? label : undefined}
              onClick={() => pick(b)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pick(b);
                }
              }}
              onPointerEnter={() => setHover(b.name)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(b.name)}
              onBlur={() => setHover(null)}
            >
              <circle className={styles.hit} r={7} />
              <circle
                className={styles.dot}
                r={b.id === 'sun' || b.id === 'solar-system' ? 3 : 2.2}
              />
              {on && <circle className={styles.ring} r={5} />}
              <title>{b.name}</title>
            </g>
          );
        })}
        {view.ship && (
          <g
            className={styles.ship}
            transform={`translate(${px(view.ship.x)} ${px(view.ship.z)}) rotate(${(Math.atan2(view.ship.hz, view.ship.hx) * 180) / Math.PI})`}
            data-testid="map-ship"
          >
            <polygon points="5,0 -3.5,3 -2,0 -3.5,-3" />
          </g>
        )}
      </svg>
      <div className={styles.caption} aria-live="polite">
        {caption ?? (view.ship ? 'YOU' : ' ')}
      </div>
    </nav>
  );
}
