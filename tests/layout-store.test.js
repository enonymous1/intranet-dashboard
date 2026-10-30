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
    assert.deepEqual(await store.load(), widgets);
});

test('different identities get different layouts', async () => {
    const storage = fakeStorage();
    const a = new LocalLayoutStore(() => 'user-a', storage);
    const b = new LocalLayoutStore(() => 'user-b', storage);
    await a.save([{ id: 'a', type: 'info', w: 4, h: 2 }]);
    assert.deepEqual(await b.load(), []);
});

test('corrupt or missing stored data loads as an empty layout', async () => {
    const storage = fakeStorage();
    storage.setItem('intranet-dashboard:layout:local', '{not json');
    const store = new LocalLayoutStore(() => 'local', storage);
    assert.deepEqual(await store.load(), []);
    const empty = new LocalLayoutStore(() => 'nobody', fakeStorage());
    assert.deepEqual(await empty.load(), []);
});
