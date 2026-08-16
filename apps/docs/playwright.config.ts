import { defineConfig, devices } from "@playwright/test";

/**
 * Behaviour tests run in a real browser, against the real docs site.
 *
 * NOT jsdom. jsdom has no layout and a simulated focus model, which makes it
 * useless for the only questions worth asking here — is this reachable by
 * keyboard, is the focus ring actually visible, does the collapsed rail expose
 * a name. Those are precisely the assertions that pass in jsdom and fail for a
 * user.
 *
 * Chromium because KOC is a Windows/Edge organisation (SharePoint, Tahoma
 * legacy) and Edge is Chromium. Testing WebKit here would be testing a browser
 * no KOC user has.
 */
/**
 * KOC_DOCS_PORT exists for worktree sessions. `reuseExistingServer` matches by
 * URL only — with two checkouts of this repo on one machine, a worktree running
 * tests on the default port would silently reuse the OTHER checkout's dev
 * server and test that checkout's code, passing or failing on files the session
 * never touched. Setting a distinct port makes the tests hit this checkout.
 */
const PORT = Number(process.env.KOC_DOCS_PORT ?? 4180);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : [["list"]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // The docs site IS the test surface — every component renders there already,
  // so there is no separate story harness to keep in sync with the components.
  webServer: {
    command: PORT === 4180 ? "npm run dev" : `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
