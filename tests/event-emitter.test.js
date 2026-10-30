import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from '../dashboard-app/js/core/event-emitter.js';

test('on/emit delivers data, once fires a single time, off unsubscribes', () => {
    const emitter = new EventEmitter();
    const seen = [];
    emitter.on('ping', (data) => seen.push(data));
    emitter.once('single', (data) => seen.push(data));
    emitter.emit('ping', 1);
    emitter.emit('single', 2);
    emitter.emit('single', 3);
    assert.deepEqual(seen, [1, 2]);

    const handler = (data) => seen.push(data);
    emitter.on('ping', handler);
    emitter.off('ping', handler);
    emitter.emit('ping', 4);
    // Only the original listener fired: 4, not 4 twice.
    assert.deepEqual(seen, [1, 2, 4]);
    assert.equal(emitter.emit('never-heard', 5), false);
});
