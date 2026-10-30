/**
 * Simple event emitter for inter-module communication.
 * Provides a pub/sub pattern so modules stay loosely coupled.
 * Unchanged in spirit from the original; kept dependency-free.
 */
export class EventEmitter {
    constructor() {
        this.events = {};
        this.maxListeners = 50;
    }

    on(event, callback, options = {}) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        if (!this.events[event]) {
            this.events[event] = [];
        }
        if (this.events[event].length >= this.maxListeners) {
            console.warn(`Max listeners (${this.maxListeners}) exceeded for event: ${event}`);
        }
        this.events[event].push({
            callback,
            once: options.once || false,
            context: options.context || null,
        });
        return this;
    }

    once(event, callback) {
        return this.on(event, callback, { once: true });
    }

    emit(event, data) {
        if (!this.events[event]) {
            return false;
        }
        // Copy: listeners may unsubscribe while iterating.
        const listeners = [...this.events[event]];
        listeners.forEach((listener) => {
            try {
                if (listener.context) {
                    listener.callback.call(listener.context, data);
                } else {
                    listener.callback(data);
                }
                if (listener.once) {
                    this.events[event].splice(this.events[event].indexOf(listener), 1);
                }
            } catch (error) {
                console.error(`Error in event listener for '${event}':`, error);
            }
        });
        return true;
    }

    off(event, callback) {
        if (!this.events[event]) {
            return this;
        }
        if (!callback) {
            delete this.events[event];
            return this;
        }
        this.events[event] = this.events[event].filter(
            (listener) => listener.callback !== callback,
        );
        if (this.events[event].length === 0) {
            delete this.events[event];
        }
        return this;
    }

    eventNames() {
        return Object.keys(this.events);
    }

    listenerCount(event) {
        return this.events[event] ? this.events[event].length : 0;
    }

    removeAllListeners() {
        this.events = {};
    }
}
