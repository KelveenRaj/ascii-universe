import { describe, expect, it } from 'vitest';
import { AUTO_TIERS, QualityGovernor } from '@/engine/quality/QualityGovernor';

/** Feeds `seconds` worth of frames at a steady frame time; returns how many tier changes happened. */
function run(g: QualityGovernor, frameMs: number, seconds: number): number {
  let changes = 0;
  for (let t = 0; t < seconds * 1000; t += frameMs) if (g.sample(frameMs)) changes++;
  return changes;
}

describe('quality governor', () => {
  it('stays put at a steady 60 fps', () => {
    const g = new QualityGovernor();
    expect(run(g, 16.7, 30)).toBe(0);
    expect(g.level).toBe(0);
  });

  it('steps down when the frame rate is low, cheapest last', () => {
    const g = new QualityGovernor();
    run(g, 40, 3);
    expect(g.level).toBe(1);
    run(g, 40, 60);
    expect(g.level).toBe(AUTO_TIERS.length - 1);
    for (let i = 1; i < AUTO_TIERS.length; i++) {
      expect(AUTO_TIERS[i].steps).toBeLessThan(AUTO_TIERS[i - 1].steps);
    }
  });

  it('ignores a single slow second (a hitch)', () => {
    const g = new QualityGovernor();
    run(g, 16.7, 2);
    run(g, 40, 1);
    run(g, 16.7, 2);
    expect(g.level).toBe(0);
  });

  it('ignores long gaps like tab switches', () => {
    const g = new QualityGovernor();
    for (let i = 0; i < 20; i++) g.sample(5000);
    expect(g.level).toBe(0);
  });

  it('steps back up after sustained headroom', () => {
    const g = new QualityGovernor(3);
    run(g, 16.7, 7);
    expect(g.level).toBe(3);
    run(g, 16.7, 2);
    expect(g.level).toBe(2);
  });

  it('backs off when an upgrade immediately causes a drop', () => {
    const g = new QualityGovernor(1);
    run(g, 16.7, 8); // upgrade to 0 after 8 s
    expect(g.level).toBe(0);
    run(g, 40, 2); // too slow right away → back to 1, next upgrade waits 16 s
    expect(g.level).toBe(1);
    run(g, 16.7, 12);
    expect(g.level).toBe(1);
    run(g, 16.7, 5);
    expect(g.level).toBe(0);
  });

  it('reset returns to the starting tier', () => {
    const g = new QualityGovernor(2);
    run(g, 40, 10);
    g.reset();
    expect(g.level).toBe(2);
  });
});
