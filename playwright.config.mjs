import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const executablePath = process.env.CHROME_PATH || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
export default defineConfig({
  testDir: './tests/browser', testMatch: '*.spec.mjs', fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4178', headless: true, launchOptions: { executablePath, args: ['--no-sandbox'] } },
  webServer: { command: 'node tests/browser/server.mjs', url: 'http://127.0.0.1:4178', reuseExistingServer: false },
});
