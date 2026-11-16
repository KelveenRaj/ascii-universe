import { expect, test, type Page } from '@playwright/test';

/**
 * Locks the current look so refactors can prove they changed nothing. Each view uses the dev URL
 * params (frozen disk time, fixed camera) plus fixed saved settings, so every frame is identical:
 * fixed quality (auto quality would react to frame rate), no attract mode, no CRT flicker.
 */
const FIXED_SETTINGS = {
  quality: 'high',
  attractMode: false,
  flicker: false,
  glyphScale: 0,
  columns: 0,
  supersample: 2,
  labels: false, // the original baselines; label views below turn them on
};

/** @param place body id for the hash, i.e. which scene the view is of */
async function open(
  page: Page,
  query: string,
  settings: Record<string, unknown> = {},
  place = 'sgr-a-star',
) {
  await page.addInitScript(
    (state) => {
      window.localStorage.setItem('ascii-universe:settings', JSON.stringify({ state, version: 1 }));
    },
    { ...FIXED_SETTINGS, ...settings },
  );
  await page.goto(`/?t=12&${query}#/${place}`);
  // the boot screen goes away once the real glyph font has been drawn
  await page.locator('#boot-screen').waitFor({ state: 'detached', timeout: 30_000 });
  // hide the React UI so only the WebGL output is compared
  await page.addStyleTag({ content: 'main > :not(canvas) { visibility: hidden !important; }' });
  await page.waitForTimeout(500);
}

const VIEWS: Array<{
  name: string;
  query: string;
  settings?: Record<string, unknown>;
  place?: string;
}> = [
  { name: 'interstellar', query: 'preset=interstellar' },
  { name: 'eht', query: 'preset=eht' },
  { name: 'top-down-no-crt', query: 'preset=topDown&crt=0' },
  { name: 'close-up-blocks-green', query: 'preset=interstellar&dist=9&ramp=blocks&palette=green' },
  { name: 'smooth', query: 'preset=interstellar&ascii=0&crt=0' },
  { name: 'debug-redshift', query: 'preset=eht&view=redshift' },
  { name: 'no-bloom-scale2', query: 'preset=interstellar&bloom=0&scale=2&mask=1' },
  { name: 'labels-edge-on', query: 'preset=interstellar', settings: { labels: true } },
  { name: 'labels-eht', query: 'preset=eht&crt=0', settings: { labels: true } },
  {
    name: 'labels-far-green',
    query: 'preset=eht&dist=90&palette=green',
    settings: { labels: true },
  },
  // the Milky Way hub
  { name: 'hub-overview', query: 'preset=overview', place: 'milky-way' },
  {
    name: 'hub-face-on-labels',
    query: 'preset=faceOn&crt=0',
    settings: { labels: true },
    place: 'milky-way',
  },
  { name: 'hub-edge-on', query: 'preset=edgeOn', place: 'milky-way' },
  // Slingshot's aim screen: the game picks the camera, so no preset here
  { name: 'game-slingshot-aim', query: 'crt=0', place: 'sgr-a-star/game/slingshot' },
  // the open world: parked above the Sun's spot looking at the core, and turned along the disk
  { name: 'world-sun-to-core', query: 'wpos=0,0.02,27&crt=0', place: 'world' },
  { name: 'world-along-arm', query: 'wpos=8,0.3,20&wyaw=60&wpitch=-8', place: 'world' },
  // inside places: Saturn and its rings in the Solar System, and Sgr A* from its own layer
  {
    name: 'world-saturn',
    query: 'wplace=sol&wpos=-20.5,0.6,-8.55&wyaw=90&crt=0',
    place: 'world',
  },
  { name: 'world-sgr-a-star', query: 'wplace=sgr-a-star&wpos=0,5,48&wpitch=-4', place: 'world' },
  // the Solar System on a fixed date
  {
    name: 'solar-overview',
    query: 'date=2026-01-01&crt=0',
    settings: { labels: true },
    place: 'solar-system',
  },
  { name: 'solar-earth', query: 'date=2026-01-01&crt=0', place: 'earth' },
  { name: 'solar-jupiter', query: 'date=2026-01-01&crt=0', place: 'jupiter' },
  { name: 'solar-saturn', query: 'date=2026-01-01&crt=0', place: 'saturn' },
];

for (const view of VIEWS) {
  test(`view: ${view.name}`, async ({ page }) => {
    await open(page, view.query, view.settings, view.place);
    await expect(page).toHaveScreenshot(`${view.name}.png`);
  });
}

test('copy as text matches', async ({ page }) => {
  await open(page, 'preset=interstellar&crt=0');
  await page.keyboard.press('c');
  const text = await page.locator('pre').first().textContent();
  expect(text?.length ?? 0).toBeGreaterThan(1000);
  expect(text).toMatchSnapshot('copy-as-text.txt');
});

test('copy as text includes labels', async ({ page }) => {
  await open(page, 'preset=eht&crt=0', { labels: true });
  await page.keyboard.press('c');
  const text = (await page.locator('pre').first().textContent()) ?? '';
  expect(text).toContain('SGR A*');
  for (const corner of ['┌', '┐', '└', '┘']) expect(text).toContain(corner);
});
