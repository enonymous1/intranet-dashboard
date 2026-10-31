/**
 * Shared constants: the single definition of every bare string that used
 * to be copy-pasted across modules.
 *
 * Why this file exists: a typo in a localStorage key or an event name
 * fails silently — EventEmitter.emit() returns false for an event nobody
 * hears, and every caller used to ignore that return value. With the
 * strings here, a rename is one edit, and a typo is a ReferenceError at
 * import time instead of a silently dead feature.
 */

export const STORAGE_KEYS = Object.freeze({
    /** Remembered sign-in choice: 'demo' | 'real' | 'guest'. */
    mode: 'intranet-dashboard:mode',
    /** Stable per-browser guest id, minted on first use. */
    localUser: 'intranet-dashboard:local-user',
    /** Theme preference: 'light' | 'dark'. */
    theme: 'dashboard-theme',
    /** Layout keys are `${layoutPrefix}${identity}` (see LayoutStore). */
    layoutPrefix: 'intranet-dashboard:layout:',
    /** Suffix for the backup copy kept when a saved layout is corrupt. */
    corruptBackupSuffix: ':corrupt-backup',
});

export const EVENTS = Object.freeze({
    appReady: 'appReady',
    userLogin: 'userLogin',
    userLogout: 'userLogout',
    authError: 'authError',
    themeChanged: 'themeChanged',
    recreateCharts: 'recreateCharts',
    widgetAdded: 'widgetAdded',
    widgetRemoved: 'widgetRemoved',
    tabVisible: 'tabVisible',
});
