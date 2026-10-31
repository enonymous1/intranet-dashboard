import { STORAGE_KEYS } from '../core/constants.js';
import { parseLayout, serializeLayoutEnvelope } from '../core/layout.js';

/**
 * Layout persistence behind one small interface:
 *   load() -> { widgets: Array, corrupt: boolean }
 *   save(widgets) -> { success: boolean, error? }
 *
 * The result object (not a bare array) exists so callers can tell
 * "nothing saved" apart from "saved but unreadable" — the old load()
 * returned [] for both, so a corrupt entry was silently replaced by
 * defaults and then overwritten by the next save, losing the layout
 * with no message and no backup.
 *
 * LocalLayoutStore is the default: localStorage, keyed by the current
 * identity. getUserKey is a callback (not a snapshot) so the key follows
 * a Microsoft sign-in: an MSAL account gets its own layout, a guest gets
 * a stable per-browser local id. FirebaseLayoutStore wraps FirebaseService
 * and keys by the Firebase Auth UID, which is what Firestore rules can
 * actually check (see firestore.rules at the repo root).
 *
 * Both stores save the versioned envelope from core/layout.js, not a
 * bare array, so a future format change can migrate on load.
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
        return `${STORAGE_KEYS.layoutPrefix}${userKey}`;
    }

    async load() {
        const storage = this._storage();
        if (!storage) {
            return { widgets: [], corrupt: false };
        }
        let raw;
        try {
            raw = storage.getItem(this.key());
        } catch {
            return { widgets: [], corrupt: false };
        }
        if (!raw) {
            return { widgets: [], corrupt: false };
        }
        try {
            const parsed = JSON.parse(raw);
            return { widgets: parseLayout(parsed), corrupt: false };
        } catch {
            // Keep the corrupt entry under a backup key before anything
            // overwrites it; the dashboard tells the user and loads defaults.
            try {
                storage.setItem(`${this.key()}${STORAGE_KEYS.corruptBackupSuffix}`, raw);
            } catch {
                // Backup is best-effort; the corrupt flag still reaches the UI.
            }
            return { widgets: [], corrupt: true };
        }
    }

    async save(widgets) {
        const storage = this._storage();
        if (!storage) {
            return { success: false, error: 'No storage available' };
        }
        try {
            storage.setItem(this.key(), JSON.stringify(serializeLayoutEnvelope(widgets)));
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
        // FirebaseService returns [] both for "nothing saved" and for a
        // Firestore error (it logs the error), so corrupt cannot be
        // distinguished here the way the local store distinguishes it.
        // That limitation is documented, not hidden: a Firebase error
        // still surfaces in the console, and the dashboard loads defaults.
        return { widgets: await this.firebaseService.loadLayout(), corrupt: false };
    }

    async save(widgets) {
        return this.firebaseService.saveLayout(widgets);
    }
}
