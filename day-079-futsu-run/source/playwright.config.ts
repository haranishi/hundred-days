import { defineConfig } from "@playwright/test";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3017";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL,
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROME_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      args: [
        "--enable-webgl",
        ...(process.env.PLAYWRIGHT_SOFTWARE_GL === "1"
          ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
          : []),
      ],
    },
    trace: "retain-on-failure",
  },
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          url: "http://127.0.0.1:3017",
          reuseExistingServer: !process.env.CI,
          timeout: 60000,
        },
      }),
});
