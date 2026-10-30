/**
 * Layout persistence behind one small interface: load() -> widgets array,
 * save(widgets) -> { success: boolean, error? }.
 *
 * LocalLayoutStore is the default: localStorage, keyed by the current
 * identity. getUserKey is a callback (not a snapshot) so the key follows
 * a Microsoft sign-in: an MSAL account gets its own layout, a guest gets
 * a stable per-browser local id. FirebaseLayoutStore wraps FirebaseService
 * and keys by the Firebase Auth UID, which is what Firestore rules can
 * actually check (see firestore.rules at the repo root).
 */

export class LocalLayoutStore {
    constructor(getUserKey, storage = null) {
        this.getUserKey = typeof getUserKey === 'function' ? getUserKey : () => 'local';
        this.storage = storage;
    }

    _storage() {
        if (this.storage) {
            return this.storage;
        }
        try {
            return typeof localStorage !== 'undefined' ? localStorage : null;
        } catch {
            return null;
        }
    }

    key() {
        const userKey = this.getUserKey() || 'local';
        return `intranet-dashboard:layout:${userKey}`;
    }

    async load() {
        const storage = this._storage();
        if (!storage) {
            return [];
        }
        try {
            const raw = storage.getItem(this.key());
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    async save(widgets) {
        const storage = this._storage();
        if (!storage) {
            return { success: false, error: 'No storage available' };
        }
        try {
            storage.setItem(this.key(), JSON.stringify(widgets));
            return { success: true };
        } catch (error) {
            return { success: false, error };
        }
    }
}

export class FirebaseLayoutStore {
    constructor(firebaseService) {
        this.firebaseService = firebaseService;
    }

    async load() {
        return this.firebaseService.loadLayout();
    }

    async save(widgets) {
        return this.firebaseService.saveLayout(widgets);
    }
}
