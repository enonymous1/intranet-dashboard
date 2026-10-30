import { Config } from '../config/config.js';

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
            this.eventEmitter.emit('authError', { error, type: 'initialization' });
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
            script.src = 'https://alcdn.msauth.net/browser/2.14.2/js/msal-browser.min.js';
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
            this.eventEmitter.emit('authError', { error, type: 'login' });
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
            this.updateUIForGuest();
            await this.msalInstance.logoutRedirect({
                account,
                postLogoutRedirectUri: typeof window !== 'undefined' ? window.location.origin : undefined,
            });
        } catch (error) {
            console.error('Logout error:', error);
            this.eventEmitter.emit('authError', { error, type: 'logout' });
        }
    }

    updateUIAfterLogin(account) {
        this.currentUser = account;
        if (typeof document !== 'undefined') {
            const nameEl = document.getElementById('userName');
            if (nameEl) nameEl.textContent = account.name || account.username || 'User';
            const loginBtn = document.getElementById('loginBtn');
            const logoutBtn = document.getElementById('logoutBtn');
            if (loginBtn) loginBtn.hidden = true;
            if (logoutBtn) logoutBtn.hidden = false;
        }
        this.eventEmitter.emit('userLogin', account);
    }

    updateUIForGuest() {
        this.currentUser = null;
        if (typeof document !== 'undefined') {
            const nameEl = document.getElementById('userName');
            if (nameEl) nameEl.textContent = 'Guest';
            const loginBtn = document.getElementById('loginBtn');
            const logoutBtn = document.getElementById('logoutBtn');
            if (loginBtn) loginBtn.hidden = !this.isConfigured;
            if (logoutBtn) logoutBtn.hidden = true;
        }
        this.eventEmitter.emit('userLogout');
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

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
            console.error('Error acquiring token:', error);
            try {
                const response = await this.msalInstance.acquireTokenRedirect({
                    scopes,
                    account: this.currentUser,
                });
                return response.accessToken;
            } catch (redirectError) {
                console.error('Error acquiring token via redirect:', redirectError);
                return null;
            }
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
