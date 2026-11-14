import { expect, test } from '@playwright/test';

/** The React UI built from the active scene: HUD rows, preset buttons, help text, preset keys. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'ascii-universe:settings',
      JSON.stringify({ state: { quality: 'low', attractMode: false }, version: 1 }),
    );
  });
  await page.goto('/');
  await page.locator('#boot-screen').waitFor({ state: 'detached', timeout: 30_000 });
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
