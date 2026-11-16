import { defineConfig } from '@playwright/test';

// PW_PORT lets parallel checkouts run the suite side by side
const PORT = Number(process.env.PW_PORT) || 5199;

/**
 * Visual regression tests: fixed camera views rendered through the real pipeline, compared against
 * committed screenshots. WebGL is forced onto SwiftShader (CPU), so results don't depend on the GPU
 * or driver. Uses the locally installed Chrome; set PW_CHANNEL to use another (e.g. "msedge").
 *
 *   npm run test:visual            compare against the baselines
 *   npm run test:visual:update     re-record the baselines (only after an intended visual change)
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 60_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? 'chrome',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
