// Capture the docs/ screenshots (manual dev tool, not part of CI).
// Serves dashboard-app/ over HTTP, presets the sign-in mode/theme via
// an injected script, and screenshots each variant with headless Chrome.
//   CHROME_BIN=/path/to/chrome node scripts/capture-screenshots.mjs
// Writes docs/screenshots/{demo-light,demo-dark,fallback}.png and, from
// the first-visit dialog variant, the first frame of demo-tour.gif is
// the dialog screenshot — regenerate the GIF from the four PNGs with
// any image tool if you change the layout (see the review's §5).
// Requires direct internet access for the CDN scripts, like the live site.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const serveRoot = join(root, 'dashboard-app');
const outDir = join(root, 'docs', 'screenshots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const VARIANTS = [
    { name: 'demo-light', preset: 'localStorage.setItem("intranet-dashboard:mode","demo")', fallback: false },
    { name: 'demo-dark', preset: 'localStorage.setItem("intranet-dashboard:mode","demo");localStorage.setItem("dashboard-theme","dark")', fallback: false },
    { name: 'fallback', preset: 'localStorage.setItem("intranet-dashboard:mode","guest")', fallback: true },
];

function findChrome() {
    const candidates = [process.env.CHROME_BIN, 'chrome', 'google-chrome', 'chromium',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
    for (const candidate of candidates) {
        try {
            if (candidate.includes('/') || candidate.includes('\\')) {
                if (existsSync(candidate)) return candidate;
            } else {
                execFileSync(process.platform === 'win32' ? 'where' : 'which', [candidate], { stdio: 'pipe' });
                return candidate;
            }
        } catch { /* next */ }
    }
    return null;
}

function screenshot(chrome, url, path) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(chrome, [
            '--headless', '--disable-gpu', '--no-sandbox',
            '--window-size=1280,900', '--virtual-time-budget=15000',
            `--screenshot=${path}`, url,
        ]);
        child.on('error', reject);
        child.on('close', (code) => (code === 0 ? resolvePromise() : reject(new Error(`Chrome exited ${code}`))));
    });
}

async function main() {
    const chrome = findChrome();
    if (!chrome) {
        console.error('No Chromium/Chrome binary found — set CHROME_BIN');
        process.exit(1);
    }
    const server = createServer((req, res) => {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = join(serveRoot, urlPath === '/' ? 'index.html' : urlPath);
        if (!file.startsWith(serveRoot) || !existsSync(file)) {
            res.writeHead(404); res.end('not found'); return;
        }
        let text = readFileSync(file, 'utf8');
        if (file.endsWith('index.html')) {
            // The active variant is selected per-request by a query
            // parameter (?variant=demo-light) — see the loop below, which
            // screenshots each URL in turn.
            const variantName = new URL(req.url, 'http://localhost').searchParams.get('variant');
            const variant = VARIANTS.find((v) => v.name === variantName) || VARIANTS[0];
            text = text.replace('<script type="module" src="js/app.js">',
                `<script>try{${variant.preset}}catch(e){}</script>\n    <script type="module" src="js/app.js">`);
            if (variant.fallback) {
                text = text.replace(/<script[^>]*gridstack-all\.js[^>]*><\/script>\n?/, '');
            }
        }
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(text);
    });
    await new Promise((r) => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    try {
        for (const variant of VARIANTS) {
            const path = join(outDir, `${variant.name}.png`);
            await screenshot(chrome, `${base}?variant=${variant.name}`, path);
            console.log(`captured ${path}`);
        }
    } finally {
        server.close();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
