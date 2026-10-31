/**
 * Pinned third-party versions — the single place a CDN upgrade is made.
 *
 * index.html and auth-module.js still carry the URLs and SRI hashes
 * (static HTML and a dynamically injected script cannot read this file
 * before they run), so this manifest is the source of truth that
 * scripts/update-sri.mjs checks those files against. Bump a version
 * here AND run `npm run sri` to print the new hashes; do not hand-edit
 * a hash in index.html or auth-module.js without updating this file.
 *
 * Firebase is intentionally not SRI-pinned: its modules are loaded via
 * dynamic import(), which cannot carry an integrity attribute the way a
 * classic script can, so Firebase relies on version pinning alone and
 * is only ever loaded when a config is injected.
 */
export const CDN_VERSIONS = Object.freeze({
    gridstack: '10.1.2',
    chartjs: '4.4.1',
    msal: '2.14.2',
    firebase: '11.6.1',
});

export function firebaseModuleUrl(module) {
    return `https://www.gstatic.com/firebasejs/${CDN_VERSIONS.firebase}/${module}`;
}

export function msalScriptUrl() {
    return `https://alcdn.msauth.net/browser/${CDN_VERSIONS.msal}/js/msal-browser.min.js`;
}
