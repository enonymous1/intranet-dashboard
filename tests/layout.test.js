import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeWidget, serializeLayout, parseLayout, createWidgetId,
} from '../dashboard-app/js/core/layout.js';

test('a full widget round-trips: type, geometry and options survive', () => {
    const widget = {
        id: 'w-1', type: 'info', x: 2, y: 1, w: 4, h: 2,
        options: { title: 'Hello', content: 'World' },
    };
    const [roundTripped] = serializeLayout([widget]);
    assert.deepEqual(roundTripped, widget);
});

test('unknown types are dropped and geometry is clamped, not fatal', () => {
    const parsed = parseLayout([
        { id: 'a', type: 'nope', w: 4, h: 2 },
        { id: 'b', type: 'chart', w: 99, h: 0 },
        null,
        'not an object',
    ]);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].type, 'chart');
    assert.equal(parsed[0].w, 12);
    assert.equal(parsed[0].h, 1);
});

test('missing ids are generated and are unique', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createWidgetId()));
    assert.equal(ids.size, 50);
    const [widget] = serializeLayout([{ type: 'welcome', w: 6, h: 2 }]);
    assert.ok(widget.id.startsWith('widget-'));
});

test('non-array input parses to an empty layout', () => {
    assert.deepEqual(parseLayout(null), []);
    assert.deepEqual(parseLayout({ widgets: [] }), []);
});

test('versioned envelope parses, and legacy bare arrays still parse', () => {
    const widget = { id: 'w-1', type: 'info', w: 4, h: 2, options: { title: 'Hi' } };
    const normalized = { ...widget, x: 0, y: 0 };
    assert.deepEqual(parseLayout({ version: 1, widgets: [widget] }), [normalized]);
    assert.deepEqual(parseLayout([widget]), [normalized]);
});
