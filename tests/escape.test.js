import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, sanitizeIconClass } from '../dashboard-app/js/core/escape.js';

test('escapeHtml neutralizes markup and attribute break-outs', () => {
    assert.equal(
        escapeHtml('<script>alert("x")</script>'),
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
    assert.equal(escapeHtml("a & b 'c'"), 'a &amp; b &#39;c&#39;');
    assert.equal(escapeHtml(null), '');
});

test('sanitizeIconClass rejects class strings with quotes or markup', () => {
    assert.equal(sanitizeIconClass('fas fa-info-circle'), 'fas fa-info-circle');
    assert.equal(sanitizeIconClass('x" onclick="evil()'), 'fas fa-info-circle');
    assert.equal(sanitizeIconClass(''), 'fas fa-info-circle');
    assert.equal(sanitizeIconClass('a'.repeat(200)), 'fas fa-info-circle');
});
