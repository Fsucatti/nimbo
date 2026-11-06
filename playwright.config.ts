import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests on the built site, served the way Cloudflare serves it. Every weather,
 * map and place service is answered from saved fixtures, so the tests never use the network.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  use: { baseURL: "http://localhost:8790", channel: "msedge", trace: "retain-on-failure", locale: "en-GB", timezoneId: "America/Argentina/Buenos_Aires" },
  webServer: {
    command: "npx wrangler dev --port 8790",
    url: "http://localhost:8790",
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], viewport: { width: 1280, height: 800 } }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "msedge" }, grep: /@mobile/ },
  ],
});
