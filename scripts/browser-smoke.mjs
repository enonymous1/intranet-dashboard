// Browser smoke test: the acceptance criterion for the layout.
// Loads dashboard-app/ in a real headless Chromium and asserts the
// rendered DOM — not the source text. This is the test that would have
// caught the v1.1.0 GridStack bug (reversed init arguments), which
// node:test cannot see because it never runs a browser.
//
// Usage:
//   node scripts/browser-smoke.mjs [--root dashboard-app] [--preset guest|demo|dark]
//   CHROME_BIN=/path/to/chrome node scripts/browser-smoke.mjs
//
// Two runs, both with a preset mode so the first-visit dialog does not
// cover the widgets:
//   1. GridStack run: container must be gs-12 (not fallback-grid) and
//      the three guest widgets must carry gs-x/gs-y/gs-w/gs-h
//      (0,0,6,2), (6,0,6,2), (0,2,12,4), in order.
//   2. Fallback run: the same app served with the GridStack script tag
//      removed must render .fallback-grid with inline widths
//      50%, 50%, 100% (i.e. the fallback is a real layout, not overlap).
// The sidebar must contain five registry-generated widget buttons.
//
// Requires a Chromium/Chrome binary: CHROME_BIN, or `chrome` /
// `google-chrome` / `chromium` on PATH, or the usual Windows install path.
// No npm dependencies: the script drives Chrome's --dump-dom directly.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
function argValue(flag, fallback) {
    const i = args.indexOf(flag);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const serveRoot = resolve(root, argValue('--root', 'dashboard-app'));
const preset = argValue('--preset', 'guest');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function presetScript() {
    if (preset === 'demo') {
        return '<script>try{localStorage.setItem("intranet-dashboard:mode","demo")}catch(e){}</script>';
    }
    if (preset === 'dark') {
        return '<script>try{localStorage.setItem("intranet-dashboard:mode","guest");localStorage.setItem("dashboard-theme","dark")}catch(e){}</script>';
    }
    return '<script>try{localStorage.setItem("intranet-dashboard:mode","guest")}catch(e){}</script>';
}

function serve(fallback) {
    return createServer((req, res) => {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = join(serveRoot, urlPath === '/' ? 'index.html' : urlPath);
        if (!file.startsWith(serveRoot) || !existsSync(file)) {
            res.writeHead(404); res.end('not found'); return;
        }
        let text = readFileSync(file, 'utf8');
        if (file.endsWith('index.html')) {
            text = text.replace('<script type="module" src="js/app.js">', `${presetScript()}\n    <script type="module" src="js/app.js">`);
            if (fallback) {
                text = text.replace(/<script[^>]*gridstack-all\.js[^>]*><\/script>\n?/, '');
            }
        }
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(text);
    });
}

function findChrome() {
    const candidates = [
        process.env.CHROME_BIN,
        'chrome', 'google-chrome', 'chromium', 'chromium-browser',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ].filter(Boolean);
    for (const candidate of candidates) {
        try {
            if (candidate.includes('/') || candidate.includes('\\')) {
                if (existsSync(candidate)) return candidate;
            } else {
                execFileSync(process.platform === 'win32' ? 'where' : 'which', [candidate], { stdio: 'pipe' });
                return candidate;
            }
        } catch { /* try next */ }
    }
    return null;
}

// Async on purpose: spawnSync would block this process's event loop,
// which is also the HTTP server Chrome is trying to load from — a
// deadlock that manifests as an empty dump after the timeout.
function dumpDom(chrome, url) {
    return new Promise((resolve, reject) => {
        const child = spawn(chrome, [
            '--headless', '--disable-gpu', '--no-sandbox',
            '--window-size=1280,900', '--virtual-time-budget=15000', '--dump-dom', url,
        ]);
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', (code) => {
            if (process.env.SMOKE_DEBUG) {
                console.error(`dump: code=${code} stdout_len=${stdout.length} stderr=${stderr.slice(0, 300)}`);
            }
            if (code !== 0 && !stdout) {
                reject(new Error(`Chrome failed (exit ${code}): ${stderr.slice(0, 500)}`));
            } else {
                resolve(stdout);
            }
        });
    });
}

function fail(message) {
    console.error(`SMOKE FAIL: ${message}`);
    process.exitCode = 1;
}

async function main() {
    const chrome = findChrome();
    if (!chrome) {
        console.error('SMOKE FAIL: no Chromium/Chrome binary found — set CHROME_BIN to its path');
        process.exit(1);
    }
    const server = serve(false);
    const fallbackServer = serve(true);
    await new Promise((r) => server.listen(0, r));
    await new Promise((r) => fallbackServer.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const fallbackBase = `http://localhost:${fallbackServer.address().port}/`;
    try {
        // Run 1: GridStack.
        const dom = await dumpDom(chrome, base);
        if (!dom.includes('Intranet Dashboard')) {
            fail(`GridStack run: page did not load from ${base} (served root: ${serveRoot})`);
        }
        const container = dom.match(/class="([^"]*grid-stack[^"]*)"/)?.[1] ?? '';
        if (!container.includes('gs-12')) fail(`GridStack run: container class is "${container}", expected gs-12`);
        if (container.includes('fallback-grid')) fail('GridStack run: container has fallback-grid, GridStack did not initialize');
        const geometry = [...dom.matchAll(/gs-x="(\d+)"[^>]*gs-y="(\d+)"[^>]*gs-w="(\d+)"[^>]*gs-h="(\d+)"/g)]
            .map((m) => m.slice(1).map(Number));
        // Attribute order in the dumped DOM is not guaranteed, so also
        // accept the same values in any order within each item tag.
        const geometryAlt = [...dom.matchAll(/<div[^>]*class="[^"]*grid-stack-item[^"]*"[^>]*>/g)]
            .map((m) => ['gs-x', 'gs-y', 'gs-w', 'gs-h'].map((k) => {
                const v = m[0].match(new RegExp(`${k}="(\\d+)"`));
                return v ? Number(v[1]) : null;
            }))
            .filter((g) => g.every((v) => v !== null));
        const got = geometry.length === 3 ? geometry : geometryAlt;
        const expected = [[0, 0, 6, 2], [6, 0, 6, 2], [0, 2, 12, 4]];
        if (JSON.stringify(got) !== JSON.stringify(expected)) {
            fail(`GridStack run: widget geometry is ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
        } else {
            console.log('ok   GridStack run: gs-12, geometry (0,0,6,2) (6,0,6,2) (0,2,12,4)');
        }
        const buttons = (dom.match(/add-widget-btn/g) || []).length;
        if (buttons < 5) fail(`Sidebar: found ${buttons} add-widget buttons, expected at least 5`);
        else console.log(`ok   Sidebar: ${buttons} widget buttons (registry-generated)`);
        if (!dom.includes('id="signinChoiceDialog"')) fail('Sign-in choice dialog element missing');
        else console.log('ok   Sign-in choice dialog element present');

        // Run 2: fallback (GridStack script removed).
        const fdom = await dumpDom(chrome, fallbackBase);
        const fcontainer = fdom.match(/class="([^"]*grid-stack[^"]*)"/)?.[1] ?? '';
        if (!fcontainer.includes('fallback-grid')) fail(`Fallback run: container class is "${fcontainer}", expected fallback-grid`);
        else console.log('ok   Fallback run: fallback-grid present');
        const widths = [...fdom.matchAll(/<div class="grid-stack-item" style="width: ([^;"]+);?"/g)].map((m) => m[1]);
        if (JSON.stringify(widths) !== JSON.stringify(['50%', '50%', '100%'])) {
            fail(`Fallback run: item widths are ${JSON.stringify(widths)}, expected ["50%","50%","100%"]`);
        } else {
            console.log('ok   Fallback run: item widths 50%, 50%, 100%');
        }
    } finally {
        server.close();
        fallbackServer.close();
    }
    if (process.exitCode !== 1) console.log('SMOKE PASS');
}

main().catch((error) => {
    console.error(`SMOKE FAIL: ${error.message}`);
    process.exit(1);
});
