import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.mjs',
  webServer: { command: 'npm start', url: 'http://127.0.0.1:4197' },
  use: {
    baseURL: 'http://127.0.0.1:4197',
    actionTimeout: 8000,
    launchOptions: { executablePath: process.env.RECIPE_LAB_CHROMIUM },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
