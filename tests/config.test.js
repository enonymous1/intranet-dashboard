import test from 'node:test';
import assert from 'node:assert/strict';
import { Config } from '../dashboard-app/js/config/config.js';

test('no Firebase or MSAL config by default, so the demo runs locally', () => {
    assert.equal(Config.getFirebaseConfig(), null);
    assert.equal(Config.getMsalConfig(), null);
});

test('an incomplete Firebase config is treated as not configured', () => {
    globalThis.window = { INTRANET_FIREBASE_CONFIG: { apiKey: 'x' } };
    try {
        assert.equal(Config.getFirebaseConfig(), null);
    } finally {
        delete globalThis.window;
    }
});

test('a complete injected Firebase config is accepted, placeholders are not', () => {
    globalThis.window = {
        INTRANET_FIREBASE_CONFIG: {
            apiKey: 'demo-key', authDomain: 'demo.firebaseapp.com',
            projectId: 'demo', appId: '1:1:web:abc',
        },
        INTRANET_MSAL_CONFIG: { clientId: 'YOUR_CLIENT_ID' },
    };
    try {
        assert.equal(Config.getFirebaseConfig().projectId, 'demo');
        assert.equal(Config.getMsalConfig(), null);
    } finally {
        delete globalThis.window;
    }
});

test('default widgets are all valid types with sane geometry', () => {
    for (const widget of Config.getDefaultWidgets()) {
        assert.ok(['welcome', 'info', 'chart'].includes(widget.type));
        assert.ok(widget.w >= 1 && widget.w <= 12);
        assert.ok(widget.h >= 1);
    }
    assert.equal(Config.getAppId(), 'intranet-dashboard');
});
