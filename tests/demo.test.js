import test from 'node:test';
import assert from 'node:assert/strict';
import { Config } from '../dashboard-app/js/config/config.js';
import { serializeLayout } from '../dashboard-app/js/core/layout.js';
import { EventEmitter } from '../dashboard-app/js/core/event-emitter.js';
import { AuthenticationModule } from '../dashboard-app/js/modules/auth-module.js';

test('the demo account is fictional, local-only, and clearly marked demo', () => {
    const demo = Config.getDemoUser();
    assert.equal(demo.name, 'Demo User');
    assert.equal(demo.username, 'demo@example.com');
    assert.equal(demo.isDemo, true);
});

test('the sample layout is valid, complete, and carries its own chart data', () => {
    const layout = Config.getDemoLayout();
    const serialized = serializeLayout(layout);
    assert.equal(serialized.length, layout.length);
    assert.ok(serialized.length >= 5);
    const types = serialized.map((w) => w.type);
    assert.ok(types.includes('welcome'));
    assert.ok(types.includes('chart'));
    assert.ok(types.includes('lineChart'));
    assert.ok(types.includes('pieChart'));
    const bar = serialized.find((w) => w.type === 'chart');
    assert.deepEqual(bar.options.chartConfig.data.labels, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    const welcome = serialized.find((w) => w.type === 'welcome');
    assert.ok(welcome.options.title.includes('Demo User'));
});

test('demo sign-in and exit work with no document and no MSAL config', () => {
    const emitter = new EventEmitter();
    const events = [];
    emitter.on('userLogin', (account) => events.push(['login', account.username]));
    emitter.on('userLogout', () => events.push(['logout']));
    const auth = new AuthenticationModule(emitter);
    assert.equal(auth.isConfigured, false);
    assert.equal(auth.isDemo(), false);

    const demo = auth.signInAsDemo();
    assert.equal(demo.username, 'demo@example.com');
    assert.equal(auth.isDemo(), true);
    assert.equal(auth.isAuthenticated(), true);
    assert.equal(auth.getCurrentUser().name, 'Demo User');

    auth.exitDemo();
    assert.equal(auth.isDemo(), false);
    assert.equal(auth.isAuthenticated(), false);
    assert.equal(auth.getCurrentUser(), null);
    assert.deepEqual(events, [['login', 'demo@example.com'], ['logout']]);
});
