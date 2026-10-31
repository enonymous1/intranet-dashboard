import { Config } from '../config/config.js';
import { firebaseModuleUrl } from '../config/versions.js';
import { LAYOUT_SCHEMA_VERSION } from '../core/layout.js';

/**
 * Firebase adapter, used only when a Firebase config is injected
 * (see Config). It is initialized explicitly by the app, never in a
 * constructor, and a failed or missing config simply means "not ready" —
 * the app falls back to local storage instead of blocking on it.
 *
 * Layouts are stored at artifacts/<appId>/users/<uid>/dashboard/layout
 * and keyed by the Firebase Auth UID, so firestore.rules can enforce
 * that a user only reads and writes their own document. Auth here is
 * anonymous by default, or a custom token via window.INTRANET_AUTH_TOKEN.
 * The old realtime subscription was dropped deliberately: the dashboard
 * loads once and saves on demand, which is all a single-user layout needs.
 */
export class FirebaseService {
    constructor() {
        this.app = null;
        this.db = null;
        this.auth = null;
        this.initialized = false;
        this.userId = null;
        this._fns = null;
    }

    async initialize() {
        const config = Config.getFirebaseConfig();
        if (!config) {
            return false;
        }
        try {
            const { initializeApp } = await import(firebaseModuleUrl('firebase-app.js'));
            const { getAuth, signInAnonymously, signInWithCustomToken } = await import(firebaseModuleUrl('firebase-auth.js'));
            const { getFirestore, doc, setDoc, getDoc } = await import(firebaseModuleUrl('firebase-firestore.js'));

            this.app = initializeApp(config);
            this.db = getFirestore(this.app);
            this.auth = getAuth(this.app);
            this._fns = { doc, setDoc, getDoc };

            const token = typeof window !== 'undefined' && typeof window.INTRANET_AUTH_TOKEN === 'string'
                ? window.INTRANET_AUTH_TOKEN
                : null;
            const credential = token
                ? await signInWithCustomToken(this.auth, token)
                : await signInAnonymously(this.auth);
            this.userId = credential.user.uid;
            this.initialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize Firebase:', error);
            this.initialized = false;
            this.userId = null;
            return false;
        }
    }

    isReady() {
        return this.initialized && !!this.db && !!this.userId;
    }

    getUserId() {
        return this.userId;
    }

    _docRef() {
        return this._fns.doc(this.db, `artifacts/${Config.getAppId()}/users/${this.userId}/dashboard`, 'layout');
    }

    async loadLayout() {
        if (!this.isReady()) {
            return [];
        }
        try {
            const snapshot = await this._fns.getDoc(this._docRef());
            if (snapshot.exists() && Array.isArray(snapshot.data().widgets)) {
                return snapshot.data().widgets;
            }
            return [];
        } catch (error) {
            console.error('Error loading layout:', error);
            return [];
        }
    }

    async saveLayout(widgets) {
        if (!this.isReady()) {
            return { success: false, error: 'Firebase not initialized' };
        }
        try {
            await this._fns.setDoc(this._docRef(), {
                widgets,
                lastModified: new Date().toISOString(),
                version: LAYOUT_SCHEMA_VERSION,
            });
            return { success: true };
        } catch (error) {
            console.error('Error saving layout:', error);
            return { success: false, error };
        }
    }
}
