# Intranet Dashboard

A customizable, user-personalized dashboard web app. Add widgets, drag them around, save the layout, switch themes — and run the whole demo with no account, no keys, and no backend.

![Stack](https://img.shields.io/badge/stack-vanilla%20JS%20%2B%20GridStack%20%2B%20Chart.js-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## What it does

- **Drag-and-drop dashboard** powered by GridStack, with a plain-layout fallback if GridStack fails to load (offline, blocked CDN) — widgets still render, add, remove, and save.
- **Five widget types:** welcome, info box, bar chart, line chart, pie chart. The original's sidebar only offered three; line and pie existed in code but were unreachable.
- **Layouts that actually round-trip.** A saved layout stores each widget's id, type, geometry, *and* options (titles, info text, chart settings). The original saved only type and geometry, so customization was lost on reload.
- **Saving that works with no account.** Layouts save to localStorage by default, keyed by Microsoft account when signed in, otherwise by a stable per-browser guest id. Signing in changes the key, so each account gets its own layout.
- **Dark/light theme** that persists in localStorage, follows the OS by default, and syncs across tabs. Theme changes recreate charts only — the original reloaded the whole dashboard, discarding unsaved drags.
- **Optional Microsoft sign-in (MSAL) and optional Firebase/Firestore persistence**, both injected at runtime and both off by default. With neither configured, sign-in is hidden and the app is a pure local demo.
- **Demo mode, chosen by the visitor.** On first visit a dialog offers three paths — try the demo, sign in with Microsoft, or continue as a guest — and never attempts a real sign-in on its own.

## Run it

```bash
cd dashboard-app
python3 -m http.server 8000
# Open http://localhost:8000
```

Or from the repo root: `npm start`. Opening `index.html` directly via `file://` will break ES-module loading in most browsers; use an HTTP server.

## Demo mode

On first visit, before anything else happens, a dialog asks how the visitor wants to sign in:

- **Try the demo** — signs in as a local, fictional demo account ("Demo User", `demo@example.com`) and loads a sample dashboard: welcome card, team updates, tasks-per-day bar chart, visitors line chart, and project-share pie chart, all with fictional figures. Nothing is a Microsoft account, no redirect happens, no token is issued, and nothing leaves the browser. Demo layouts save under the `demo` identity in localStorage (`intranet-dashboard:layout:demo`), so a saved demo layout is still there on the next demo visit.
- **Sign in with Microsoft** — only attempted when the visitor clicks it, and disabled entirely in the dialog when MSAL is not configured (with a note saying so), so a visitor is never sent into a broken login flow.
- **Continue as guest** — generic defaults, layouts save under a per-browser guest id.

The choice is remembered in localStorage (`intranet-dashboard:mode`), so the dialog appears once. Switching any time: the header has a **Try demo / Exit demo** button, and Login with Microsoft when configured. In demo mode a "Demo mode" badge shows in the header, the name reads "Demo User (demo)", and **Reset to defaults** in the sidebar restores the sample layout instead of the generic defaults.

No build step, no dependencies to install. Tests run with Node 20+:

```bash
npm test        # node:test suite
npm run check   # node --check on every module
```

## Configure (optional)

Add a script **before** `js/app.js` in `dashboard-app/index.html`:

```html
<script>
  window.INTRANET_FIREBASE_CONFIG = {
    apiKey: '…', authDomain: '….firebaseapp.com',
    projectId: '…', appId: '1:…:web:…'
  };
  window.INTRANET_MSAL_CONFIG = {
    clientId: '…', authority: 'https://login.microsoftonline.com/…'
  };
  window.INTRANET_APP_ID = 'my-app';
</script>
```

Notes on the two integrations:

- **Firebase:** layouts move to Firestore at `artifacts/<appId>/users/<uid>/dashboard/layout`, keyed by the Firebase Auth UID (anonymous by default, or a custom token via `window.INTRANET_AUTH_TOKEN`). Apply `firestore.rules` at the repo root first — it restricts each document to its own UID. Without those rules, a published Firebase config lets anyone read or overwrite any user's layout. If Firebase is unreachable, the app falls back to local storage after an 8-second cap instead of failing.
- **MSAL:** only the login/logout buttons use it; no Microsoft 365 data is fetched (the original's token helper was never called either). MSAL stays on the 2.14 line on purpose — moving to v3 needs a live Azure app registration to verify against.
- **Security:** no credentials are hardcoded anywhere in this repo. Widget titles, info text, and notification messages are HTML-escaped, and icon class names are allow-listed, so a saved layout cannot inject markup. CDN scripts that load as classic scripts (GridStack, Chart.js, MSAL when used) carry SRI hashes.

## Project layout

```
dashboard-app/
  index.html
  css/custom.css
  js/
    app.js                    # startup: services, then modules, then UI (never blocks on Firebase/MSAL)
    config/config.js          # null-by-default Firebase/MSAL config, defaults, GridStack options
    core/
      event-emitter.js        # pub/sub between modules
      escape.js               # HTML escaping + icon sanitizing
      layout.js               # widget identity, validation, serialization (tested)
    modules/
      auth-module.js          # optional MSAL, awaited init, session via getAllAccounts()
      dashboard-module.js     # widget registry, GridStack + fallback rendering, save/load
      theme-module.js         # dark/light, localStorage, OS preference, cross-tab sync
      widget-factory.js       # widget HTML, all five types, escaped fields
    services/
      chart-service.js        # Chart.js 4 wrapper, theme-aware colors, missing-Chart guard
      firebase-service.js     # optional Firestore load/save, explicit init
      layout-store.js         # localStorage store + Firebase store behind one interface
firestore.rules               # per-user layout rules (see above)
tests/                        # node:test: config, escape, layout, factory, store, emitter
```

## What changed from the original (mp-intranet)

The original was a single 2025 commit: vanilla JS, GridStack, Chart.js, MSAL, and Firebase, with jQuery, Bootstrap 4, and AdminLTE 3 for the shell. This version keeps the module structure and rewrites the rest:

- **Dropped jQuery, Bootstrap, and AdminLTE** for a small vanilla stylesheet. The page is now one GridStack stylesheet, one Chart.js script, and the modules.
- **Fixed the grid loading.** The original imported GridStack from a `gridstack.mjs` path that does not exist in the GridStack 10.1.2 package (verified against the package file list), so the grid module failed to load. GridStack now loads as a classic script (`dist/gridstack-all.js`, SRI-pinned), with a fallback layout if it fails.
- **Fixed startup.** The original blocked up to 10 seconds on Firebase readiness and then replaced the page with an error screen — its "local-only fallback" was unreachable when Firebase itself failed. Startup now never blocks on Firebase or MSAL.
- **Fixed identity and persistence** (see above): layouts keyed consistently, full widget options saved, unique widget ids, no duplicate-id sidebar bug.
- **Fixed escaping** of widget and notification content.
- **Bumped Chart.js 3.7 → 4.4.1** and dropped the removed `Chart.helpers` API. GridStack stays at 10.1.2 and Firebase at 11.6.1, both SRI- or dynamically pinned.
- **Added** MIT license, LF `.gitattributes`, `package.json` with `npm test` / `npm run check`, a `node:test` suite, CI on Node 20/22, and GitHub Pages deploy via the official Pages actions (replacing the archived peaceiris action). The old realtime Firestore subscription was removed: load-on-start plus save-on-demand is all a single-user layout needs.
- **Removed** the original's hardcoded live Firebase project config and the `MyCompany` footer. Nothing in this repo points at a real project or tenant.

## Deploy to GitHub Pages

Push to `main`, then repo Settings → Pages → Source **GitHub Actions**. The `pages.yml` workflow tests, then publishes `dashboard-app/`. The published demo runs locally in the visitor's browser with no keys — Firebase and MSAL stay off unless you inject a config into your own hosting copy.

## Not yet verified live

- First CI run after push, and the Pages deploy itself.
- Rendering in a real browser against the live CDNs (GridStack drag, Chart.js drawing, the sign-in choice dialog and demo mode), and a real MSAL sign-in against a live Azure app registration — these need a browser and a tenant this sandbox does not have. What *is* verified here: the full `node:test` suite (including demo sign-in and the sample layout), `node --check` on every module, and a local HTTP smoke test serving the app (see the delivery notes).

## License

MIT. See [LICENSE](LICENSE).
