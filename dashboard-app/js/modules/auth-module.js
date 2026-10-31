import { Config } from '../config/config.js';
import { EVENTS } from '../core/constants.js';
import { msalScriptUrl } from '../config/versions.js';

/**
 * Microsoft (MSAL) authentication, optional.
 *
 * Two races in the original are fixed here: MSAL used to be initialized
 * from the constructor without awaiting, so an early auth event could be
 * dropped, and the session was restored by a sessionStorage username
 * lookup. Now initialize() is awaited by the app, the MSAL script is
 * loaded on demand (only when a config exists), and the session is
 * restored from getAllAccounts(). With no MSAL config, this module is a
 * no-op guest: login is hidden by the app and nothing throws.
 * MSAL stays on the 2.14 line deliberately — a v3 move needs a live Azure
 * app registration to verify against, which this repo does not ship.
 */
export class AuthenticationModule {
    constructor(eventEmitter) {
        this.eventEmitter = eventEmitter;
        this.msalInstance = null;
        this.currentUser = null;
        this.isInitialized = false;
        this.isConfigured = false;
        this._isDemo = false;
        this._config = Config.getMsalConfig();
    }

    async initialize() {
        if (!this._config) {
            this.updateUIForGuest();
            return false;
        }
        this.isConfigured = true;
        try {
            if (typeof msal === 'undefined') {
                await this._loadMsalScript();
            }
            if (typeof msal === 'undefined') {
                throw new Error('MSAL failed to load');
            }
            this.msalInstance = new msal.PublicClientApplication(this._config);
            await this.msalInstance.initialize();
            this.isInitialized = true;
            const response = await this.msalInstance.handleRedirectPromise();
            if (response && response.account) {
                this.updateUIAfterLogin(response.account);
            } else {
                const accounts = this.msalInstance.getAllAccounts();
                if (accounts.length > 0) {
                    this.updateUIAfterLogin(accounts[0]);
                } else {
                    this.updateUIForGuest();
                }
            }
            return true;
        } catch (error) {
            console.error('Failed to initialize MSAL:', error);
            this.eventEmitter.emit(EVENTS.authError, { error, type: 'initialization' });
            this.updateUIForGuest();
            return false;
        }
    }

    _loadMsalScript() {
        return new Promise((resolve, reject) => {
            if (typeof document === 'undefined') {
                reject(new Error('No document available'));
                return;
            }
            const script = document.createElement('script');
            script.src = msalScriptUrl();
            script.integrity = 'sha384-ggh+EF1aSqm+Y4yvv2n17KpurNcZTeYtUZUvhPziElsstmIEubyEB6AIVpKLuZgr';
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('MSAL script failed to load'));
            document.head.appendChild(script);
        });
    }

    async login() {
        if (!this.isInitialized) {
            console.error('MSAL not initialized');
            return;
        }
        try {
            await this.msalInstance.loginRedirect({ scopes: ['User.Read'], prompt: 'select_account' });
        } catch (error) {
            console.error('Login error:', error);
            this.eventEmitter.emit(EVENTS.authError, { error, type: 'login' });
        }
    }

    async logout() {
        if (!this.isInitialized) {
            console.error('MSAL not initialized');
            return;
        }
        try {
            const accounts = this.msalInstance.getAllAccounts();
            const account = accounts.length > 0 ? accounts[0] : null;
            // UI updates only after a successful redirect: updating
            // first would claim logged-out while the session survives
            // if the redirect fails.
            await this.msalInstance.logoutRedirect({
                account,
                postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : undefined,
            });
            this.updateUIForGuest();
        } catch (error) {
            console.error('Logout error:', error);
            this.eventEmitter.emit(EVENTS.authError, { error, type: 'logout' });
        }
    }

    /**
     * Sign in as the local demo account (Config.getDemoUser()). This is
     * not a Microsoft sign-in: no redirect, no token, no network call.
     * The dashboard reloads for the demo identity, so it loads the
     * sample layout (or a previously saved demo layout) instead of the
     * guest defaults. Safe to call with no document (tests, Node).
     */
    signInAsDemo() {
        const demo = Config.getDemoUser();
        this.updateUIAfterLogin(demo);
        return demo;
    }

    /** Leave demo mode and return to guest. No-op when not in demo. */
    exitDemo() {
        if (!this._isDemo) {
            return;
        }
        this.updateUIForGuest();
    }

    isDemo() {
        return this._isDemo === true;
    }

    updateUIAfterLogin(account) {
        this.currentUser = account;
        this._isDemo = account.isDemo === true;
        if (typeof document !== 'undefined') {
            const nameEl = document.getElementById('userName');
            if (nameEl) {
                const displayName = account.name || account.username || 'User';
                nameEl.textContent = this._isDemo ? `${displayName} (demo)` : displayName;
            }
            const loginBtn = document.getElementById('loginBtn');
            const logoutBtn = document.getElementById('logoutBtn');
            // In demo mode the real login stays available (when
            // configured) so a visitor can switch to a real sign-in;
            // logout is meaningless for a local demo account, so the
            // header's "Exit demo" button handles leaving demo instead.
            if (loginBtn) loginBtn.hidden = this._isDemo ? !this.isConfigured : true;
            if (logoutBtn) logoutBtn.hidden = this._isDemo ? true : false;
        }
        this.eventEmitter.emit(EVENTS.userLogin, account);
    }

    updateUIForGuest() {
        this.currentUser = null;
        this._isDemo = false;
        if (typeof document !== 'undefined') {
            const nameEl = document.getElementById('userName');
            if (nameEl) nameEl.textContent = 'Guest';
            const loginBtn = document.getElementById('loginBtn');
            const logoutBtn = document.getElementById('logoutBtn');
            if (loginBtn) loginBtn.hidden = !this.isConfigured;
            if (logoutBtn) logoutBtn.hidden = true;
        }
        this.eventEmitter.emit(EVENTS.userLogout);
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

    /**
     * Silent token acquisition only. The old fallback to
     * acquireTokenRedirect claimed to return a token, but a redirect
     * navigates away from the page, so that return value was never
     * observable — callers must treat a null here as "interactive
     * sign-in required", not as a failed token fetch. There are
     * currently no callers: no Graph data is fetched by this app.
     */
    async getAccessToken(scopes = ['User.Read']) {
        if (!this.isInitialized || !this.currentUser) {
            return null;
        }
        try {
            const response = await this.msalInstance.acquireTokenSilent({
                scopes,
                account: this.currentUser,
            });
            return response.accessToken;
        } catch (error) {
            console.error('Error acquiring token (interactive sign-in required):', error);
            return null;
        }
    }

    getUserProfile() {
        if (!this.currentUser) {
            return null;
        }
        return {
            id: this.currentUser.homeAccountId,
            username: this.currentUser.username,
            name: this.currentUser.name,
            email: this.currentUser.username,
        };
    }
}
