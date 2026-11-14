import { expect, test, type Page } from '@playwright/test';

/** Saves `state` as old-format (v1) settings before the app loads, then waits for boot. */
async function openWith(page: Page, state: Record<string, unknown>) {
  await page.addInitScript((saved) => {
    window.localStorage.setItem(
      'ascii-universe:settings',
      JSON.stringify({ state: saved, version: 1 }),
    );
  }, state);
  await page.goto('/');
  await page.locator('#boot-screen').waitFor({ state: 'detached', timeout: 30_000 });
}

/** The React UI built from the active scene: HUD rows, panel sections, help text, preset keys. */
test.describe('scene UI', () => {
  test.beforeEach(async ({ page }) => {
    await openWith(page, { quality: 'low', attractMode: false });
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
  await openWith(page, { quality: 'low', attractMode: false, diskSpeed: 12.5, starDensity: 0.85 });
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
