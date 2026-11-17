// Smoke tests (e2e/*.e2e.ts). Two targets:
//   npx playwright test --project=web       browser build with the sample library; starts its own server
//   npx playwright test --project=desktop   a running kipple.exe; set KIPPLE_CDP (scripts/test-build.ps1 does it)
// Locally on Windows the web target uses the installed Edge, so no browser download is needed.
import { defineConfig } from "@playwright/test";

const PORT = 4174;
const desktop = !!process.env.KIPPLE_CDP;

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  outputDir: "e2e-results",
  // One app window in the desktop target, so tests take turns.
  workers: desktop ? 1 : undefined,
  fullyParallel: !desktop,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  use: { trace: "retain-on-failure" },
  // Only the target that matches the environment, so a plain `npx playwright test` does the right thing.
  projects: desktop
    ? [{ name: "desktop", use: { trace: "off" } }]
    : [
        {
          name: "web",
          use: {
            baseURL: `http://localhost:${PORT}/app/`,
            viewport: { width: 1400, height: 900 },
            channel: process.platform === "win32" && !process.env.CI ? "msedge" : undefined,
          },
        },
      ],
  webServer: desktop
    ? undefined
    : {
        // CI has just built the web app in an earlier step.
        command: `${process.env.CI ? "" : "npm run build:web && "}npx vite preview --mode web --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/app/`,
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
