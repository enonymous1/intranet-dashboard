// Verify (or print) the SRI hashes for the pinned CDN scripts.
// Usage:
//   node scripts/update-sri.mjs --check   # fail if index.html / auth-module.js
//                                          # hashes do not match the pinned versions
//   node scripts/update-sri.mjs           # print the correct hashes for a bump
// Requires direct internet access (CI and a normal dev machine have it;
// the sandbox proxy is not used by Node's fetch, so this will fail there
// for network reasons, not for a hash mismatch — the error message says so).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CDN_VERSIONS } from '../dashboard-app/js/config/versions.js';

const root = join(fileURLToPath(new URL('..', import.meta.url)));

const ASSETS = [
    {
        name: 'GridStack CSS',
        url: `https://cdn.jsdelivr.net/npm/gridstack@${CDN_VERSIONS.gridstack}/dist/gridstack.min.css`,
        file: 'dashboard-app/index.html',
    },
    {
        name: 'GridStack JS',
        url: `https://cdn.jsdelivr.net/npm/gridstack@${CDN_VERSIONS.gridstack}/dist/gridstack-all.js`,
        file: 'dashboard-app/index.html',
    },
    {
        name: 'Chart.js',
        url: `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/${CDN_VERSIONS.chartjs}/chart.umd.min.js`,
        file: 'dashboard-app/index.html',
    },
    {
        name: 'MSAL',
        url: `https://alcdn.msauth.net/browser/${CDN_VERSIONS.msal}/js/msal-browser.min.js`,
        file: 'dashboard-app/js/modules/auth-module.js',
    },
];

async function sha384(url) {
    let response;
    try {
        response = await fetch(url);
    } catch (error) {
        throw new Error(`network fetch failed for ${url} (${error.message}) — this script needs direct internet access`);
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    return `sha384-${createHash('sha384').update(buffer).digest('base64')}`;
}

const checkOnly = process.argv.includes('--check');
let failed = false;
for (const asset of ASSETS) {
    const expected = await sha384(asset.url);
    const text = readFileSync(join(root, asset.file), 'utf8');
    const present = text.includes(expected);
    if (checkOnly) {
        if (present) console.log(`ok   ${asset.name} ${expected}`);
        else {
            failed = true;
            console.error(`MISMATCH ${asset.name}: pinned file hashes to ${expected}, but ${asset.file} does not contain it — bump CDN_VERSIONS and re-pin, or restore the hash`);
        }
    } else {
        console.log(`${asset.name} (${asset.url})\n  ${expected}  ${present ? '(already in file)' : '(NOT in file — update it)'}`);
    }
}
if (checkOnly && failed) process.exit(1);
