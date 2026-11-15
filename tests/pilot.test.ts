import { describe, expect, it } from 'vitest';
import { CALLSIGN_MAX } from '@/profile/migrate';
import { flightPad } from '@/world/flight/pad';
import { suggestCallsign } from '@/world/pilot';
import { cleanName } from '@/world/ship/design';

describe('new pilots', () => {
  it('get a ready-made callsign that survives cleaning', () => {
    for (let i = 0; i < 200; i++) {
      const name = suggestCallsign();
      expect(name).toMatch(/^[A-Z]+-\d\d$/);
      expect(cleanName(name, CALLSIGN_MAX)).toBe(name);
    }
    expect(suggestCallsign(() => 0)).toBe('NOVA-10');
  });
});

describe('the touch flight pad', () => {
  it('holds keys until released, and hands each press out once', () => {
    flightPad.hold('KeyW', true);
    expect(flightPad.isHeld('KeyW')).toBe(true);
    flightPad.hold('KeyW', false);
    expect(flightPad.isHeld('KeyW')).toBe(false);

    flightPad.press('KeyT');
    flightPad.press('KeyJ');
    expect(flightPad.takePresses()).toEqual(['KeyT', 'KeyJ']);
    expect(flightPad.takePresses()).toEqual([]);

    flightPad.hold('ShiftLeft', true);
    flightPad.press('KeyT');
    flightPad.clear();
    expect(flightPad.isHeld('ShiftLeft')).toBe(false);
    expect(flightPad.takePresses()).toEqual([]);
  });
});
