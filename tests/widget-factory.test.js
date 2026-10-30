import test from 'node:test';
import assert from 'node:assert/strict';
import { WidgetFactory } from '../dashboard-app/js/modules/widget-factory.js';

test('widget titles and content are escaped, never raw HTML', () => {
    const html = WidgetFactory.createWidget(
        'info', null, { title: '<b>Hi</b>', content: '<img src=x onerror=alert(1)>' }, 'w-1',
    );
    assert.ok(!html.includes('<b>Hi</b>'));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;b&gt;Hi&lt;/b&gt;'));
    assert.ok(html.includes('data-widget-id="w-1"'));
});

test('a supplied widget id is preserved, so save/load round-trips identity', () => {
    const html = WidgetFactory.createWidget('welcome', { name: 'Ada' }, {}, 'keep-me');
    assert.ok(html.includes('data-widget-id="keep-me"'));
    assert.ok(html.includes('Welcome, Ada!'));
});

test('all five widget types are offered, including line and pie charts', () => {
    const ids = WidgetFactory.getAvailableWidgetTypes().map((t) => t.id);
    assert.deepEqual(ids, ['welcome', 'info', 'chart', 'lineChart', 'pieChart']);
    assert.ok(WidgetFactory.createWidget('lineChart', null, {}, 'l1').includes('lineChart-l1'));
    assert.ok(WidgetFactory.createWidget('pieChart', null, {}, 'p1').includes('pieChart-p1'));
});

test('unknown types render a safe fallback, not a crash', () => {
    const html = WidgetFactory.createWidget('mystery', null, {}, 'u1');
    assert.ok(html.includes('Unknown Widget'));
    assert.ok(html.includes('mystery'));
    const evil = WidgetFactory.createWidget('<script>alert(1)</script>', null, {}, 'u2');
    assert.ok(!evil.includes('<script>alert'));
    assert.ok(evil.includes('&lt;script&gt;'));
});

test('validation accepts a good config and rejects bad geometry and types', () => {
    assert.equal(WidgetFactory.validateWidgetConfig({ type: 'chart', w: 4, h: 2 }).isValid, true);
    assert.equal(WidgetFactory.validateWidgetConfig({ type: 'chart', w: 13, h: 2 }).isValid, false);
    assert.equal(WidgetFactory.validateWidgetConfig({ type: 'nope', w: 4, h: 2 }).isValid, false);
    assert.equal(WidgetFactory.validateWidgetConfig(null).isValid, false);
});
