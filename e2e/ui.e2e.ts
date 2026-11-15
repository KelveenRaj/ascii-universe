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
    await expect(hud).toContainText('NATURAL'); // default palette: each material's own colours
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

/** The info card and its URL hash. */
test.describe('info card', () => {
  const settings = { quality: 'low', attractMode: false };

  test('I opens it, Esc closes it, and the hash follows', async ({ page }) => {
    await openWith(page, settings, '/#/sgr-a-star');
    await expect(page).toHaveURL(/#\/sgr-a-star$/);
    await page.keyboard.press('i');
    const card = page.getByTestId('info-panel');
    await expect(card).toContainText('SAGITTARIUS A*');
    await expect(card).toContainText('4.30 MILLION SUNS');
    await expect(
      card.getByRole('link', { name: /Event Horizon Telescope Results/ }),
    ).toHaveAttribute('href', /^https:\/\//);
    await expect(page.getByLabel('Status')).toHaveCount(0); // the card takes the HUD's corner
    await expect(page).toHaveURL(/#\/sgr-a-star\/info$/);

    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await expect(page.getByLabel('Status')).toBeVisible();
    await expect(page).toHaveURL(/#\/sgr-a-star$/);
  });

  test('a link to #/sgr-a-star/info opens it, and the INFO button closes it', async ({ page }) => {
    await openWith(page, settings, '/#/sgr-a-star/info');
    const card = page.getByTestId('info-panel');
    await expect(card).toBeVisible();
    await page.getByRole('button', { name: 'INFO', exact: true }).click();
    await expect(card).toHaveCount(0);
    await expect(page).toHaveURL(/#\/sgr-a-star$/);
  });

  test('editing the hash by hand works, and unknown places fall back home', async ({ page }) => {
    await openWith(page, settings, '/#/nowhere');
    await expect(page).toHaveURL(/#\/milky-way$/);
    await page.evaluate(() => (window.location.hash = '#/sgr-a-star/info'));
    await expect(page.getByTestId('info-panel')).toContainText('SAGITTARIUS A*');
  });
});

/** The Milky Way hub and warping between scenes. Warps are short here: reduced motion is on. */
test.describe('hub and warps', () => {
  const settings = { quality: 'low', attractMode: false };
  const hud = (page: Page) => page.getByLabel('Status');

  test('starts at the Milky Way, with its own HUD, card and settings', async ({ page }) => {
    await openWith(page, settings);
    await expect(page).toHaveURL(/#\/milky-way$/);
    await expect(hud(page)).toContainText('KLY');
    await page.keyboard.press('i');
    await expect(page.getByTestId('info-panel')).toContainText('BARRED SPIRAL');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    const panel = page.getByLabel('Settings');
    await expect(panel).toContainText('MILKY WAY');
    await expect(panel.getByText('SPIN', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'FACE-ON', exact: true })).toBeVisible();
  });

  test('WARP goes to Sgr A*, Backspace comes back, browser Back returns', async ({ page }) => {
    await openWith(page, settings);
    await page.getByRole('button', { name: 'WARP > SGR A*' }).click();
    await expect(page).toHaveURL(/#\/sgr-a-star$/);
    await expect(hud(page)).toContainText('Rs', { timeout: 30_000 });
    await expect(page.getByLabel('Navigator')).toContainText('MILKY WAY');

    await page.locator('canvas').click({ position: { x: 5, y: 5 } }); // focus the page
    await page.keyboard.press('Backspace');
    await expect(page).toHaveURL(/#\/milky-way$/);
    await expect(hud(page)).toContainText('KLY', { timeout: 30_000 });

    await page.goBack();
    await expect(page).toHaveURL(/#\/sgr-a-star$/);
    await expect(hud(page)).toContainText('Rs', { timeout: 30_000 });
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

/** Slingshot at Sgr A*: start from the navigator, launch with Space, a round ends, Esc quits. */
test.describe('slingshot', () => {
  const settings = { quality: 'low', attractMode: false };
  const panel = (page: Page) => page.getByTestId('game-panel');

  test('PLAY starts the game, the HUD makes way for its readout', async ({ page }) => {
    await openWith(page, settings, '/#/sgr-a-star');
    await page.getByRole('button', { name: 'PLAY > SLINGSHOT' }).click();
    await expect(page).toHaveURL(/#\/sgr-a-star\/game\/slingshot$/);
    await expect(panel(page)).toContainText('TURN');
    await expect(page.getByRole('status')).toContainText('SLINGSHOT');
    await expect(page.getByLabel('Status')).toHaveCount(0);
    await expect(page.getByLabel('Navigator')).toHaveCount(0);
  });

  test('a round plays out and Esc quits back to the scene', async ({ page }) => {
    test.setTimeout(240_000);
    await openWith(page, settings, '/#/sgr-a-star/game/slingshot');
    await expect(panel(page)).toContainText('SPEED');
    await page.locator('canvas').click({ position: { x: 5, y: 5 } }); // focus the page
    await page.keyboard.press('Space');
    await expect(panel(page)).toContainText('SHIP');
    // the default shot swings round and escapes; slow under software rendering
    await expect(page.getByRole('status')).toContainText('SLINGSHOT!', { timeout: 180_000 });
    await expect(page.getByRole('status')).toContainText('NEW BEST');

    await page.keyboard.press('Space');
    await expect(panel(page)).toContainText('TURN');
    await expect(panel(page)).not.toContainText('BEST0');

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/#\/sgr-a-star$/);
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByLabel('Status')).toContainText('Rs');
  });

  test('on-screen buttons aim and launch', async ({ page }) => {
    await openWith(page, settings, '/#/sgr-a-star/game/slingshot');
    await expect(panel(page)).toContainText('0.45 c');
    await page.getByRole('button', { name: 'Faster' }).click();
    await expect(panel(page)).toContainText('0.46 c');
    await page.getByRole('button', { name: 'GO', exact: true }).click();
    await expect(panel(page)).toContainText('SHIP');
    await page.getByRole('button', { name: 'QUIT', exact: true }).click();
    await expect(page).toHaveURL(/#\/sgr-a-star$/);
  });
});

/** The open world: launching from the Navigator, flying, landing. */
test.describe('open world', () => {
  const settings = { quality: 'low', attractMode: false };

  test('FLY launches into open space, W flies, Esc lands back where you were', async ({ page }) => {
    await openWith(page, settings, '/#/sgr-a-star');
    await page.getByRole('button', { name: 'FLY > OPEN SPACE' }).click();
    await expect(page).toHaveURL(/#\/world$/);
    const flight = page.getByTestId('flight-panel');
    await expect(flight).toContainText('THROTTLE', { timeout: 30_000 });
    await expect(page.getByLabel('Navigator')).toHaveCount(0);
    await expect(page.getByLabel('Status')).toHaveCount(0);

    await page.locator('canvas').click({ position: { x: 5, y: 5 } }); // focus the page
    await page.keyboard.down('KeyW');
    await expect(flight).not.toContainText('THROTTLE0%', { timeout: 10_000 });
    await page.keyboard.up('KeyW');
    await expect(flight.getByText('0 LY/S')).toHaveCount(0, { timeout: 15_000 });

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/#\/sgr-a-star$/);
    await expect(page.getByLabel('Status')).toContainText('Rs', { timeout: 30_000 });
  });

  test('#/world opens straight into flight, and your spot is saved', async ({ page }) => {
    await openWith(page, settings, '/#/world');
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
});
