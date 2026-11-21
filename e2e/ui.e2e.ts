import { expect, test, type Page } from '@playwright/test';

/** Saves `state` as old-format (v1) settings before the app loads, then waits for boot. */
async function openWith(page: Page, state: Record<string, unknown>, path = '/') {
  await page.addInitScript((saved) => {
    window.localStorage.setItem(
      'ascii-universe:settings',
      JSON.stringify({ state: saved, version: 1 }),
    );
  }, state);
  await page.goto(path);
  await page.locator('#boot-screen').waitFor({ state: 'detached', timeout: 30_000 });
}

/** The React UI built from the active scene (Sgr A*): HUD rows, panel sections, help, preset keys. */
test.describe('scene UI', () => {
  test.beforeEach(async ({ page }) => {
    await openWith(page, { quality: 'low', attractMode: false }, '/#/sgr-a-star');
  });

  test('HUD shows the scene rows', async ({ page }) => {
    const hud = page.getByLabel('Status');
    await expect(hud).toContainText('DIST');
    await expect(hud).toContainText('Rs');
    await expect(hud).toContainText('INCL');
  });

  test('settings panel has the scene presets', async ({ page }) => {
    await page.keyboard.press('Tab');
    for (const label of ['EDGE-ON', 'EHT', 'TOP']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
  });

  test('settings panel shows the scene params section', async ({ page }) => {
    await page.keyboard.press('Tab');
    const panel = page.getByLabel('Settings');
    await expect(panel).toContainText('SAGITTARIUS A*');
    for (const label of ['DISK SPEED', 'BEAMING', 'STARS', 'PAUSE']) {
      await expect(panel.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(panel.getByText('DISK INNER', { exact: true })).toHaveCount(0); // hidden param
  });

  test('help lists the scene presets', async ({ page }) => {
    await page.keyboard.press('?');
    await expect(page.getByText('EDGE-ON / EHT / TOP')).toBeVisible();
    await expect(page.getByText('1 2 3', { exact: true })).toBeVisible();
  });

  test('number keys switch presets', async ({ page }) => {
    const hud = page.getByLabel('Status');
    await page.locator('canvas').click({ position: { x: 5, y: 5 } }); // focus the page
    await page.keyboard.press('3'); // top-down: distance 30, inclination 0°
    await expect(hud).toContainText('30.0 Rs', { timeout: 15_000 });
    await expect(hud).toContainText('0°');
  });
});

test('old v1 saved settings keep their black hole values', async ({ page }) => {
  await openWith(
    page,
    { quality: 'low', attractMode: false, diskSpeed: 12.5, starDensity: 0.85 },
    '/#/sgr-a-star',
  );
  await page.keyboard.press('Tab');
  const panel = page.getByLabel('Settings');
  await expect(panel.getByLabel('DISK SPEED')).toHaveValue('12.5');
  await expect(panel.getByLabel('STARS')).toHaveValue('0.85');

  const saved = await page.evaluate(() => ({
    settings: JSON.parse(window.localStorage.getItem('ascii-universe:settings') ?? '{}'),
    params: JSON.parse(window.localStorage.getItem('ascii-universe:scene-params') ?? '{}'),
  }));
  expect(saved.settings.version).toBe(2);
  expect('diskSpeed' in saved.settings.state).toBe(false);
  expect(saved.params.state.values['black-hole'].diskSpeed).toBe(12.5);
});

/** The info card (open by default in infographics mode) and its URL hash. */
test.describe('info card', () => {
  const settings = { quality: 'low', attractMode: false };

  test('is open on arrival, X hides it, the chip and I bring it back, and the hash follows', async ({
    page,
  }) => {
    await openWith(page, settings, '/#/sgr-a-star');
    const card = page.getByTestId('info-panel');
    await expect(card).toContainText('SAGITTARIUS A*');
    await expect(card).toContainText('4.30 MILLION SUNS');
    await expect(page).toHaveURL(/#\/sgr-a-star$/);

    // a peek first on a small screen, the full card with MORE (sources included)
    if (!(await card.getByRole('link').count()))
      await card.getByRole('button', { name: 'MORE' }).click();
    await expect(
      card.getByRole('link', { name: /Event Horizon Telescope Results. I./ }),
    ).toHaveAttribute('href', /^https:\/\//);

    await card.getByRole('button', { name: 'Close the info card' }).click();
    await expect(card).toHaveCount(0);
    await expect(page).toHaveURL(/#\/sgr-a-star\/clear$/);
    await page.getByTestId('info-chip').click();
    await expect(card).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await page.keyboard.press('i');
    await expect(card).toBeVisible();
  });

  test('a link to #/sgr-a-star/clear opens with the card hidden', async ({ page }) => {
    await openWith(page, settings, '/#/sgr-a-star/clear');
    await expect(page.getByTestId('info-panel')).toHaveCount(0);
    await expect(page.getByTestId('info-chip')).toBeVisible();
  });

  test('editing the hash by hand works, and unknown places fall back home', async ({ page }) => {
    await openWith(page, settings, '/#/nowhere');
    await expect(page).toHaveURL(/#\/milky-way$/);
    await page.evaluate(() => (window.location.hash = '#/sgr-a-star'));
    await expect(page.getByTestId('info-panel')).toContainText('SAGITTARIUS A*');
  });
});

/** The Milky Way home screen and warping with the minimap. Warps are short: reduced motion is on. */
test.describe('home and warps', () => {
  const settings = { quality: 'low', attractMode: false };
  const hud = (page: Page) => page.getByLabel('Status');

  test('starts at the Milky Way, with its card, map and settings', async ({ page }) => {
    await openWith(page, settings);
    await expect(page).toHaveURL(/#\/milky-way$/);
    await expect(hud(page)).toContainText('KLY');
    await expect(page.getByTestId('info-panel')).toContainText('BARRED SPIRAL');
    await expect(page.getByTestId('minimap')).toContainText('MILKY WAY');
    await page.keyboard.press('Tab');
    const panel = page.getByLabel('Settings');
    await expect(panel).toContainText('MILKY WAY');
    await expect(panel.getByText('SPIN', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'FACE-ON', exact: true })).toBeVisible();
  });

  test('the minimap warps to Sgr A*, Backspace comes back, browser Back returns', async ({
    page,
  }) => {
    await openWith(page, settings);
    await page.getByRole('button', { name: 'Go to SGR A*' }).click();
    await expect(page).toHaveURL(/#\/sgr-a-star$/);
    await expect(hud(page)).toContainText('Rs', { timeout: 30_000 });

    await page.locator('canvas').click({ position: { x: 5, y: 5 } }); // focus the page
    await page.keyboard.press('Backspace');
    await expect(page).toHaveURL(/#\/milky-way$/);
    await expect(hud(page)).toContainText('KLY', { timeout: 30_000 });

    await page.goBack();
    await expect(page).toHaveURL(/#\/sgr-a-star$/);
    await expect(hud(page)).toContainText('Rs', { timeout: 30_000 });
  });

  test('the Solar System has its own map, with a way back and a body to pick', async ({ page }) => {
    await openWith(page, settings, '/#/solar-system');
    const map = page.getByTestId('minimap');
    await expect(map).toContainText('SOLAR SYSTEM');
    await map.getByRole('button', { name: 'Go to EARTH' }).click();
    await expect(page).toHaveURL(/#\/earth$/);
    await expect(page.getByTestId('info-panel')).toContainText('EARTH');
    await page.getByRole('button', { name: '< GALAXY' }).click();
    await expect(page).toHaveURL(/#\/milky-way$/);
  });

  test('clicking the SGR A* label warps there', async ({ page }) => {
    await openWith(page, settings);
    await expect(hud(page)).toContainText('KLY');
    // Sgr A* is at the galactic centre, which the first view looks straight at
    const box = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).toHaveURL(/#\/sgr-a-star$/);
    await expect(hud(page)).toContainText('Rs', { timeout: 30_000 });
  });
});

/** Guided tours, sharing a view, and flying straight to a body. */
test.describe('tours, sharing and fly here', () => {
  const settings = { quality: 'low', attractMode: false };

  test('a tour walks its steps with cited facts, and Esc ends it', async ({ page }) => {
    await openWith(page, settings);
    await page.getByRole('button', { name: 'Guided tours' }).click();
    await page.getByText('A WALK OUT FROM THE SUN').click();
    const card = page.getByTestId('info-panel');
    await expect(page).toHaveURL(/#\/sun$/);
    await expect(card).toContainText('TOUR 1/5');
    await expect(card).toContainText('695,700 KM');
    await card.getByRole('button', { name: 'NEXT' }).click();
    await expect(page).toHaveURL(/#\/mercury$/);
    await expect(card).toContainText('TOUR 2/5');
    await card.getByRole('button', { name: 'BACK' }).click();
    await expect(page).toHaveURL(/#\/sun$/);
    await page.keyboard.press('Escape');
    await expect(card).not.toContainText('TOUR');
  });

  test('a tour ends when you pick somewhere else on the map', async ({ page }) => {
    await openWith(page, settings, '/#/solar-system');
    await page.getByRole('button', { name: 'Guided tours' }).click();
    await page.getByText('WHERE ARE WE?').click();
    await expect(page.getByTestId('info-panel')).toContainText('TOUR 1/3');
    await page.getByTestId('minimap').getByRole('button', { name: 'Go to EARTH' }).click();
    await expect(page.getByTestId('info-panel')).not.toContainText('TOUR');
  });

  test('a shared link opens the same place from the same angle', async ({ page }) => {
    await openWith(page, settings, '/#/earth?v=40,20,3');
    await expect(page.getByTestId('info-panel')).toContainText('EARTH');
    await expect(page).toHaveURL(/#\/earth$/); // tidied once read
  });

  test('FLY HERE puts the ship at the body, with its card', async ({ page }) => {
    await openWith(page, settings, '/#/saturn');
    await page.getByRole('button', { name: /Switch to exploration mode/ }).click();
    await expect(page).toHaveURL(/#\/world$/);
    await page.getByTestId('onboarding').waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: 'LAUNCH' }).click();
    await expect(page.getByTestId('flight-panel')).toContainText('SOL', { timeout: 60_000 });
    await expect(page.getByTestId('info-panel')).toContainText('SATURN', { timeout: 60_000 });
  });
});

/** A new pilot's first flight opens on the callsign dialog: take the suggested callsign. */
async function launchPilot(page: Page) {
  await page.getByTestId('onboarding').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'LAUNCH' }).click();
  await expect(page.getByTestId('onboarding')).toHaveCount(0);
}

const savedPilot = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('ascii-universe:pilot') ?? '{}'));

/** Exploration mode: launching with FLY, flying, landing. */
test.describe('open world', () => {
  const settings = { quality: 'low', attractMode: false };

  test('a new pilot picks a callsign once, and Esc launches instead of landing', async ({
    page,
  }) => {
    await openWith(page, settings, '/#/world');
    const box = page.getByLabel('Callsign');
    await expect(box).toHaveValue(/^[A-Z]+-\d\d$/, { timeout: 30_000 }); // a suggestion
    await box.fill('star fox 9');
    await expect(box).toHaveValue('STAR FOX 9');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/world$/);
    await expect.poll(async () => (await savedPilot(page)).pilot?.callsign).toBe('STAR FOX 9');

    // the controls card is still there under ?
    await page.getByRole('button', { name: '?' }).click();
    await expect(page.getByRole('dialog')).toContainText('THROTTLE UP / DOWN');
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(page.getByTestId('flight-panel')).toContainText('CORE', { timeout: 30_000 });
    await expect(page.getByTestId('onboarding')).toHaveCount(0);
  });

  test('the hangar changes your ship, and it is saved', async ({ page }) => {
    await openWith(page, settings, '/#/world');
    await launchPilot(page);
    await expect(page.getByTestId('flight-panel')).toContainText('CORE', { timeout: 30_000 });
    await page.getByRole('button', { name: 'HANGAR' }).click();
    const hangar = page.getByTestId('hangar');
    await expect(hangar).toBeVisible();
    // a showroom, not a modal: a side panel beside your real ship, the flight parked behind it
    const panel = page.getByRole('dialog', { name: 'HANGAR' });
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('ship-preview')).toHaveCount(0);
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThan(1280 / 2); // down the right, leaving the ship in view
    await expect(page.getByTestId('flight-panel')).toContainText(/THROTTLE[\s▮▯]*0%/);

    await page.getByTitle('Next hull').click();
    await expect(page.getByTestId('pick-hull')).toHaveText('ARROW');
    await page
      .getByRole('radiogroup', { name: 'Ship colour' })
      .getByRole('radio', { name: 'cyan' })
      .click();
    await page.getByLabel('Ship name').fill('night owl');
    await expect(page.getByLabel('Ship name')).toHaveValue('NIGHT OWL');

    await page.keyboard.press('Escape'); // closes the hangar, doesn't land
    await expect(hangar).toHaveCount(0);
    await expect(page).toHaveURL(/#\/world$/);
    // closing the hangar saves straight away
    await expect
      .poll(
        async () => {
          const saved = await page.evaluate(() => localStorage.getItem('ascii-universe:pilot'));
          const ship = JSON.parse(saved ?? '{}').ship ?? {};
          return [ship.hull, ship.color, ship.name];
        },
        { timeout: 15_000 },
      )
      .toEqual(['arrow', 'cyan', 'NIGHT OWL']);
  });

  test('FLY launches into open space, W flies, Esc lands back where you were', async ({ page }) => {
    await openWith(page, settings, '/#/sgr-a-star');
    await page.getByRole('button', { name: 'Exploration mode' }).click();
    await expect(page).toHaveURL(/#\/world$/);
    await launchPilot(page);
    const flight = page.getByTestId('flight-panel');
    await expect(flight).toContainText('THROTTLE', { timeout: 30_000 });
    await expect(page.getByLabel('Status')).toHaveCount(0);

    await page.locator('canvas').click({ position: { x: 5, y: 5 } }); // focus the page
    await page.keyboard.down('KeyW');
    await expect(flight).not.toContainText(/THROTTLE[\s▮▯]*0%/, { timeout: 10_000 });
    await page.keyboard.up('KeyW');
    await expect(flight.getByText('0 LY/S')).toHaveCount(0, { timeout: 15_000 });

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/#\/sgr-a-star$/);
    await expect(page.getByLabel('Status')).toContainText('Rs', { timeout: 30_000 });
  });

  test('#/world opens straight into flight, and your spot is saved', async ({ page }) => {
    await openWith(page, settings, '/#/world');
    await launchPilot(page);
    await expect(page.getByTestId('flight-panel')).toContainText('CORE', { timeout: 30_000 });
    await page.getByRole('button', { name: 'LAND' }).click();
    await expect(page).toHaveURL(/#\/milky-way$/);
    // the engine lands (and saves) on its next frame
    await expect
      .poll(
        async () => {
          const saved = await page.evaluate(() => localStorage.getItem('ascii-universe:pilot'));
          return JSON.parse(saved ?? '{}').location?.loc?.layer;
        },
        { timeout: 15_000 },
      )
      .toBe('galaxy');
  });

  test('click Sol on the minimap, jump there, and it goes in your discoveries', async ({
    page,
  }) => {
    await openWith(page, settings, '/#/world');
    await launchPilot(page);
    const flight = page.getByTestId('flight-panel');
    await expect(flight).toContainText('CORE', { timeout: 30_000 });
    // generated stars are background only: the map offers just the two real places
    await expect(page.getByTestId('minimap').getByRole('button')).toHaveCount(2);
    await page.getByRole('button', { name: 'Jump to SOL' }).click();
    await expect(page.getByTestId('world-message')).toContainText(
      /(JUMPING TO|ARRIVED:|DISCOVERED) SOL/,
      { timeout: 90_000 },
    );

    // a jump takes you straight in, and the Solar System's card comes up with contact
    await expect(flight).toContainText('SOL', { timeout: 60_000 });
    await expect(page.getByTestId('info-panel')).toContainText('SOLAR SYSTEM');
    await expect(page.getByTestId('minimap')).toContainText('SOLAR SYSTEM');
    await page.getByRole('button', { name: 'LEAVE' }).click();
    // ...and LEAVE takes you back out to open space
    await expect(flight).toContainText('OPEN SPACE', { timeout: 30_000 });
    await expect(flight).toContainText('CORE');

    await page.getByRole('button', { name: 'LAND' }).click();
    await expect
      .poll(
        async () => {
          const saved = await page.evaluate(() => localStorage.getItem('ascii-universe:pilot'));
          const p = JSON.parse(saved ?? '{}');
          return [p.stats?.jumps, typeof p.discoveries?.landmarks?.sol];
        },
        { timeout: 15_000 },
      )
      .toEqual([1, 'string']);
  });
});

/** Flying on a phone: drag steers (as with a mouse), the on-screen buttons do the rest. */
test.describe('open world on a touch screen', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('the touch buttons throttle up, and stop', async ({ page }) => {
    await openWith(page, { quality: 'low', attractMode: false }, '/#/world');
    await page.getByTestId('onboarding').waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: 'LAUNCH' }).tap();
    const flight = page.getByTestId('flight-panel');
    await expect(flight).toContainText('THROTTLE', { timeout: 30_000 });
    await expect(page.getByTestId('touch-pads')).toBeVisible();

    // a real finger held down, not a tap: the buttons act while held
    const hold = async (name: string, ms: number) => {
      const b = (await page.getByRole('button', { name }).boundingBox())!;
      const cdp = await page.context().newCDPSession(page);
      const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
      await page.waitForTimeout(ms);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await hold('Throttle up (W)', 1500);
    await expect(flight).not.toContainText(/THROTTLE[\s▮▯]*0%/);
    await hold('Stop (X)', 300);
    await expect(flight).toContainText(/THROTTLE[\s▮▯]*0%/);
  });
});
