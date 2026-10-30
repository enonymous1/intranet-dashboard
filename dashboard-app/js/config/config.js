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

    /**
     * The demo account. Deliberately fictional and local-only: it is not
     * a Microsoft account, it never touches MSAL or Firebase, and it is
     * never sent anywhere. It exists so a visitor can try the dashboard
     * without signing in for real.
     */
    static getDemoUser() {
        return {
            name: 'Demo User',
            username: 'demo@example.com',
            homeAccountId: 'demo-user',
            isDemo: true,
        };
    }

    /**
     * Sample dashboard for demo mode: every widget carries its own
     * options, so the charts render sample data instead of the generic
     * defaults, and the layout round-trips through save/load unchanged.
     * All figures are fictional.
     */
    static getDemoLayout() {
        return [
            {
                type: 'welcome', w: 6, h: 2, x: 0, y: 0,
                options: {
                    title: 'Welcome, Demo User!',
                    message: 'This is a sample dashboard. Drag widgets, save the layout, then reset it — nothing leaves this browser.',
                },
            },
            {
                type: 'info', w: 6, h: 2, x: 6, y: 0,
                options: {
                    title: 'Team updates (sample)',
                    content: 'Fictional sample: 3 new requests this week, 2 in review, 1 waiting on approval.',
                },
            },
            {
                type: 'chart', w: 6, h: 4, x: 0, y: 2,
                options: {
                    title: 'Tasks completed (sample)',
                    chartConfig: {
                        type: 'bar',
                        data: {
                            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                            datasets: [{ label: 'Tasks', data: [4, 7, 5, 8, 6] }],
                        },
                    },
                },
            },
            {
                type: 'lineChart', w: 6, h: 4, x: 6, y: 2,
                options: {
                    title: 'Visitors (sample)',
                    data: {
                        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                        datasets: [{ label: 'Visitors', data: [120, 150, 130, 180, 170, 210] }],
                    },
                },
            },
            {
                type: 'pieChart', w: 6, h: 4, x: 0, y: 6,
                options: {
                    title: 'Project share (sample)',
                    data: {
                        labels: ['Alpha', 'Beta', 'Gamma'],
                        datasets: [{ data: [45, 30, 25] }],
                    },
                },
            },
            {
                type: 'info', w: 6, h: 4, x: 6, y: 6,
                options: {
                    title: 'About this demo',
                    content: 'You are signed in as a local demo account, not a Microsoft account. Use "Exit demo" in the header to leave demo mode, or "Reset to defaults" in the sidebar to restore this sample layout.',
                },
            },
        ];
    }
}
