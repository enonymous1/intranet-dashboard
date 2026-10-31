import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalLayoutStore } from '../dashboard-app/js/services/layout-store.js';

function fakeStorage() {
    const map = new Map();
    return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, value),
        _map: map,
    };
}

test('local store round-trips a layout under the identity key', async () => {
    const storage = fakeStorage();
    const store = new LocalLayoutStore(() => 'msal-user-1', storage);
    assert.equal(store.key(), 'intranet-dashboard:layout:msal-user-1');
    const widgets = [{ id: 'w-1', type: 'info', w: 4, h: 2, options: { title: 'Hi' } }];
    assert.equal((await store.save(widgets)).success, true);
    // Load normalizes (adds default x/y), as the dashboard always does
    // before rendering — the round-trip is through parseLayout, not raw JSON.
    assert.deepEqual(await store.load(), {
        widgets: [{ id: 'w-1', type: 'info', x: 0, y: 0, w: 4, h: 2, options: { title: 'Hi' } }],
        corrupt: false,
    });
});

test('saved data is a versioned envelope, not a bare array', async () => {
    const storage = fakeStorage();
    const store = new LocalLayoutStore(() => 'u', storage);
    await store.save([{ id: 'w-1', type: 'info', w: 4, h: 2 }]);
    const raw = JSON.parse(storage.getItem(store.key()));
    assert.equal(raw.version, 1);
    assert.ok(Array.isArray(raw.widgets));
});

test('legacy bare-array layouts (v1.0/v1.1) still load', async () => {
    const storage = fakeStorage();
    const store = new LocalLayoutStore(() => 'u', storage);
    storage.setItem(store.key(), JSON.stringify([{ id: 'w-1', type: 'info', w: 4, h: 2 }]));
    assert.deepEqual(await store.load(), {
        widgets: [{ id: 'w-1', type: 'info', x: 0, y: 0, w: 4, h: 2, options: {} }],
        corrupt: false,
    });
});

test('different identities get different layouts', async () => {
    const storage = fakeStorage();
    const a = new LocalLayoutStore(() => 'user-a', storage);
    const b = new LocalLayoutStore(() => 'user-b', storage);
    await a.save([{ id: 'a', type: 'info', w: 4, h: 2 }]);
    assert.deepEqual(await b.load(), { widgets: [], corrupt: false });
});

test('corrupt stored data loads empty, flags corrupt, and keeps a backup', async () => {
    const storage = fakeStorage();
    storage.setItem('intranet-dashboard:layout:local', '{not json');
    const store = new LocalLayoutStore(() => 'local', storage);
    assert.deepEqual(await store.load(), { widgets: [], corrupt: true });
    assert.equal(
        storage.getItem('intranet-dashboard:layout:local:corrupt-backup'),
        '{not json',
    );
    const empty = new LocalLayoutStore(() => 'nobody', fakeStorage());
    assert.deepEqual(await empty.load(), { widgets: [], corrupt: false });
});
