/**
 * Configuration. Nothing live is hardcoded here.
 *
 * The original shipped a real Firebase project's config as the fallback
 * and left MSAL as YOUR_CLIENT_ID placeholders, so the app was both
 * leaking a project identifier and broken out of the box. Here both
 * integrations are opt-in and null by default:
 *
 *   <script>
 *     window.INTRANET_FIREBASE_CONFIG = { apiKey, authDomain, projectId, appId };
 *     window.INTRANET_MSAL_CONFIG = { clientId, authority };
 *     window.INTRANET_APP_ID = 'my-app';
 *   </script>
 *
 * ...placed before js/app.js. With neither set, the app runs fully
 * locally: layouts save to localStorage and sign-in is simply hidden.
 * A JSON string is accepted for the two object configs as well.
 */

function readWindowObject(name) {
    try {
        if (typeof window === 'undefined') {
            return null;
        }
        const value = window[name];
        if (value == null) {
            return null;
        }
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return parsed && typeof parsed === 'object' ? parsed : null;
            } catch {
                return null;
            }
        }
        return typeof value === 'object' ? value : null;
    } catch {
        return null;
    }
}

function readWindowString(name) {
    try {
        if (typeof window === 'undefined') {
            return null;
        }
        const value = window[name];
        return typeof value === 'string' && value ? value : null;
    } catch {
        return null;
    }
}

export class Config {
    /**
     * Firebase config, or null when not configured. A config missing any
     * required field is treated as not configured, never partially used.
     */
    static getFirebaseConfig() {
        const config = readWindowObject('INTRANET_FIREBASE_CONFIG');
        if (!config) {
            return null;
        }
        const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
        if (required.some((key) => typeof config[key] !== 'string' || !config[key])) {
            return null;
        }
        const result = {
            apiKey: config.apiKey,
            authDomain: config.authDomain,
            projectId: config.projectId,
            appId: config.appId,
        };
        if (typeof config.storageBucket === 'string' && config.storageBucket) {
            result.storageBucket = config.storageBucket;
        }
        if (typeof config.messagingSenderId === 'string' && config.messagingSenderId) {
            result.messagingSenderId = config.messagingSenderId;
        }
        return result;
    }

    /** MSAL config, or null when not configured (including placeholders). */
    static getMsalConfig() {
        const config = readWindowObject('INTRANET_MSAL_CONFIG');
        if (!config || typeof config.clientId !== 'string' || !config.clientId) {
            return null;
        }
        if (config.clientId === 'YOUR_CLIENT_ID') {
            return null;
        }
        return {
            auth: {
                clientId: config.clientId,
                authority: typeof config.authority === 'string' && config.authority
                    ? config.authority
                    : 'https://login.microsoftonline.com/common',
                redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
            },
            cache: {
                cacheLocation: 'sessionStorage',
                storeAuthStateInCookie: false,
            },
        };
    }

    /** Application ID used as the Firestore document namespace. */
    static getAppId() {
        return readWindowString('INTRANET_APP_ID') || 'intranet-dashboard';
    }

    /** GridStack options. */
    static getGridStackConfig() {
        return {
            float: true,
            cellHeight: 70,
            minRow: 1,
            acceptWidgets: true,
            removable: false,
            resizable: {
                handles: 'e, se, s, sw, w',
            },
        };
    }

    /** Default widgets (ids are generated when they are added). */
    static getDefaultWidgets() {
        return [
            { type: 'welcome', w: 6, h: 2, x: 0, y: 0, options: {} },
            { type: 'info', w: 6, h: 2, x: 6, y: 0, options: {} },
            { type: 'chart', w: 12, h: 4, x: 0, y: 2, options: {} },
        ];
    }
}
