import { SectorCache, sectorOf, type SectorCoord, type StarSystem } from '@/world/gen/sector';
import { LANDMARKS, type Landmark } from '@/world/landmarks';
import { distance, type Vec3d } from '@/world/math';

/** Something you can point at, label and jump to: a procedural star system or a real landmark. */
export interface Target {
  id: string;
  name: string;
  kind: string;
  pos: Vec3d;
  lum: number;
  material: number;
  system?: StarSystem;
  landmark?: Landmark;
}

const fromSystem = (s: StarSystem): Target => ({
  id: s.id,
  name: s.name,
  kind: `${s.starClass}-CLASS STAR${s.planets ? `, ${s.planets} PLANET${s.planets > 1 ? 'S' : ''}` : ''}`,
  pos: s.pos,
  lum: s.lum,
  material: s.material,
  system: s,
});

const fromLandmark = (l: Landmark): Target => ({
  id: l.id,
  name: l.name,
  kind: l.kind,
  pos: l.pos,
  lum: l.lum,
  material: l.material,
  landmark: l,
});

const LANDMARK_TARGETS = LANDMARKS.map(fromLandmark);

/**
 * The star systems around the ship (the 5×5×5 sectors it's in the middle of, ~125 light-years
 * each way) plus every landmark, wherever it is. Regenerated only when the ship crosses into
 * another sector.
 */
export class Neighbourhood {
  private readonly cache = new SectorCache();
  private sector: SectorCoord | null = null;
  private local: Target[] = [];

  update(pos: Vec3d): void {
    const s = sectorOf(pos);
    if (
      this.sector &&
      s[0] === this.sector[0] &&
      s[1] === this.sector[1] &&
      s[2] === this.sector[2]
    ) {
      return;
    }
    this.sector = s;
    this.local = this.cache.around(pos).map(fromSystem);
  }

  /** Procedural systems nearby, nearest first. */
  nearestSystems(pos: Vec3d, n: number): Target[] {
    return this.local
      .map((t) => ({ t, d: distance(t.pos, pos) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, n)
      .map((e) => e.t);
  }

  get landmarks(): readonly Target[] {
    return LANDMARK_TARGETS;
  }

  /** Any target by id: a landmark, or a nearby system. */
  find(id: string): Target | undefined {
    return LANDMARK_TARGETS.find((t) => t.id === id) ?? this.local.find((t) => t.id === id);
  }
}
