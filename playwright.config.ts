import { defineConfig } from '@playwright/test';

export default defineConfig({
 testDir: './tests',
 testMatch: '**/*.spec.mjs',
 use: {
  baseURL: 'http://127.0.0.1:5173',
  launchOptions: {
   ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
   args: ['--no-sandbox']
  }
 },
 webServer: {
  command: 'npm run dev -- --host 127.0.0.1',
  url: 'http://127.0.0.1:5173',
  reuseExistingServer: false,
  // Test accounts must ignore configured Supabase credentials, without making requests.
  env: { PUBLIC_PREVIEW_MODE: 'true', PUBLIC_SUPABASE_URL: 'https://preview-test.supabase.co', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_test' }
 },
 projects: [
  { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } }
 ]
});
