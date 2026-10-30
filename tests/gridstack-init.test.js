import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const moduleSrc = fs.readFileSync(new URL('../dashboard-app/js/modules/dashboard-module.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../dashboard-app/css/custom.css', import.meta.url), 'utf8');

describe('GridStack init (regression: v1.1.0 live-site layout bug)', () => {
    it('calls GridStack.init with options first, selector second (GridStack 10 API)', () => {
        assert.match(moduleSrc, /GridStack\.init\(Config\.getGridStackConfig\(\), '\.grid-stack'\)/);
        assert.doesNotMatch(moduleSrc, /GridStack\.init\('\.grid-stack',/);
    });
    it('treats a null grid from init as a failure, not as a working grid', () => {
        assert.match(moduleSrc, /if \(!this\.grid\)/);
    });
    it('fallback CSS puts items back in normal flow (overrides GridStack position:absolute)', () => {
        assert.match(css, /\.grid-stack\.fallback-grid > \.grid-stack-item \{[^}]*position: relative/);
        assert.match(css, /\.grid-stack\.fallback-grid > \.grid-stack-item > \.grid-stack-item-content \{[^}]*position: relative/);
        assert.match(css, /\.grid-stack\.fallback-grid > \.grid-stack-item > \.grid-stack-item-content \{[^}]*width: 100%/);
    });
});
