import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

// Mirror what the api process gets locally — pulls STRIPE_API_KEY,
// CORS_ORIGINS, etc. from apps/api/.env into our own process so the
// global-teardown can talk to Stripe and so the webServer-spawned
// api inherits the same config when not already running. CI sets
// these via the workflow env block instead and never finds the file.
const here = dirname(fileURLToPath(import.meta.url))
const localEnv = resolve(here, '..', 'apps', 'api', '.env')

if (existsSync(localEnv)) {
  process.loadEnvFile(localEnv)
}

const CI = Boolean(process.env['CI'])

const WEB_URL = process.env['E2E_WEB_URL'] ?? 'http://localhost:5174'
const API_URL = process.env['E2E_API_URL'] ?? 'http://localhost:3000'

// Single worker — the smoke suite shares one Postgres database and uses
// `truncateAll()` in beforeEach. Parallelism would race those truncations
// across workers. If we ever scale past ~30 tests, switch to per-worker
// databases (DB_NAME=template_e2e_w<N>) and bump workers.
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Sweep any e2e- rows an interrupted prior run left behind, so every
  // run starts from a clean slate. See global-setup.ts.
  globalSetup: './global-setup.ts',
  // After the whole suite finishes, delete the e2e- rows + Stripe test
  // customers this run created. See global-teardown.ts.
  globalTeardown: './global-teardown.ts',

  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],

  // Boots api + web via the root `pnpm dev:e2e` script. Separate health
  // probes so a failed web build doesn't get masked by a working api.
  // Locally we reuse a running dev server for fast iteration; CI always
  // spins fresh.
  webServer: [
    {
      command: 'pnpm --filter @template-sass/api dev',
      cwd: '..',
      url: `${API_URL}/health`,
      reuseExistingServer: !CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe'
    },
    {
      command: 'pnpm --filter @template-sass/web dev',
      cwd: '..',
      url: WEB_URL,
      reuseExistingServer: !CI,
      timeout: 60_000,
      stdout: 'pipe',
      stderr: 'pipe'
    }
  ]
})
