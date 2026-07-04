import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

const appHost = "127.0.0.1";
const appPort = 4173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://${appHost}:${appPort}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --host ${appHost} --port ${appPort}`,
    url: `http://${appHost}:${appPort}`,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
