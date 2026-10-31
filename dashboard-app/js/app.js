import { EventEmitter } from './core/event-emitter.js';
import { Config } from './config/config.js';
import { STORAGE_KEYS, EVENTS } from './core/constants.js';
import { WidgetFactory } from './modules/widget-factory.js';
import { FirebaseService } from './services/firebase-service.js';
import { LocalLayoutStore, FirebaseLayoutStore } from './services/layout-store.js';
import { AuthenticationModule } from './modules/auth-module.js';
import { DashboardModule } from './modules/dashboard-module.js';
import { ThemeModule } from './modules/theme-module.js';
import { ChartService } from './services/chart-service.js';

/**
 * Main application. Vanilla DOM throughout — jQuery, Bootstrap and
 * AdminLTE are gone, so the page is one GridStack stylesheet, one
 * Chart.js script and these modules.
 *
 * Startup never blocks on an external service. Firebase is tried with
 * an 8-second cap and, on any failure, the app silently uses local
 * storage; the original waited 10 seconds on Firebase readiness and
 * then replaced the whole page with an error screen, which is what
 * made its "local-only fallback" unreachable. Auth is awaited but also
 * non-fatal: no MSAL config simply means guest mode.
 */
/**
 * Main application. Constructor wires only — it performs no I/O, no DOM
 * work, and no async work, so it can be constructed in a test with
 * injected dependencies. Call start() to run startup; it returns a
 * promise, so a caller (or a test) can await success or handle failure
 * instead of the old constructor firing an unawaited async initialize().
 */
class DashboardApp {
    /**
     * @param {object} [deps] — injectable for tests; all optional.
     * @param {EventEmitter} [deps.eventEmitter]
     * @param {object} [deps.layoutStore] — skips the Firebase probe
     * @param {object} [deps.firebaseService]
     * @param {object} [deps.authModule] — still initialized via initialize()
     */
    constructor(deps = {}) {
        this.eventEmitter = deps.eventEmitter ?? new EventEmitter();
        this.modules = {};
        this.isInitialized = false;
        this._overrides = deps;
    }

    /** @returns {Promise<void>} Resolves when startup completes. */
    async start() {
        await this.initializeServices();
        await this.initializeModules();
        this.setupModuleCommunication();
        this.setupUIEventHandlers();
        this._applyStoredMode();
        this.isInitialized = true;
        this.eventEmitter.emit(EVENTS.appReady);
    }

    async initializeServices() {
        if (this._overrides.layoutStore) {
            this.modules.firebaseService = this._overrides.firebaseService ?? new FirebaseService();
            this.modules.layoutStore = this._overrides.layoutStore;
            return;
        }
        const firebaseService = new FirebaseService();
        let layoutStore;
        if (Config.getFirebaseConfig()) {
            const ready = await Promise.race([
                firebaseService.initialize(),
                new Promise((resolve) => setTimeout(() => resolve(false), 8000)),
            ]);
            if (ready) {
                layoutStore = new FirebaseLayoutStore(firebaseService);
            } else {
                console.warn('Firebase unavailable, using local storage for layouts.');
                layoutStore = new LocalLayoutStore(() => this._localUserKey());
            }
        } else {
            layoutStore = new LocalLayoutStore(() => this._localUserKey());
        }
        this.modules.firebaseService = firebaseService;
        this.modules.layoutStore = layoutStore;
    }

    /**
     * Identity for the local store: demo, MSAL account, else a stable guest id.
     * homeAccountId is preferred over username because it is stable when
     * a user changes their username; using the username as the key would
     * orphan the old layout on rename.
     */
    _localUserKey() {
        const auth = this.modules.authModule;
        if (auth && typeof auth.isDemo === 'function' && auth.isDemo()) {
            return 'demo';
        }
        const user = auth ? auth.getCurrentUser() : null;
        if (user) {
            return `msal-${user.homeAccountId || user.username || 'user'}`;
        }
        try {
            let id = localStorage.getItem(STORAGE_KEYS.localUser);
            if (!id) {
                id = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
                localStorage.setItem(STORAGE_KEYS.localUser, id);
            }
            return id;
        } catch {
            return 'local';
        }
    }

    async initializeModules() {
        this.modules.authModule = this._overrides.authModule
            ?? new AuthenticationModule(this.eventEmitter);
        try {
            await this.modules.authModule.initialize();
        } catch (error) {
            console.error('Authentication initialization failed (continuing as guest):', error);
        }
        this.modules.themeModule = new ThemeModule(this.eventEmitter);
        this.modules.dashboardModule = new DashboardModule(
            this.eventEmitter,
            this.modules.layoutStore,
            this.modules.authModule,
        );
        await this.modules.dashboardModule.initialize();
        await this.modules.dashboardModule.loadLayout();
    }

    setupModuleCommunication() {
        // Theme changes recreate charts only, with their saved options
        // (DashboardModule knows them; the old path recreated line/pie
        // charts with no options, resetting them to defaults, and
        // guessed the type from the canvas-id prefix). The original
        // reloaded the whole dashboard here, discarding unsaved drags.
        this.eventEmitter.on(EVENTS.recreateCharts, () => {
            this.modules.dashboardModule.recreateCharts();
        });
        this.eventEmitter.on(EVENTS.authError, ({ error, type }) => {
            console.error(`Authentication error (${type}):`, error);
            const message = error && error.message ? error.message : 'Unknown error';
            this.showGlobalNotification(`Authentication error: ${message}`, 'error');
        });
        this.eventEmitter.on(EVENTS.userLogin, (account) => {
            console.log('User logged in:', account.name || account.username);
            this._updateModeUI();
        });
        this.eventEmitter.on(EVENTS.userLogout, () => {
            console.log('User logged out');
            this._updateModeUI();
        });
    }

    setupUIEventHandlers() {
        const onClick = (id, handler) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', (event) => {
                    event.preventDefault();
                    handler();
                });
            }
        };
        onClick('loginBtn', () => this.modules.authModule.login());
        onClick('logoutBtn', () => this.modules.authModule.logout());
        onClick('darkModeToggle', () => this.modules.themeModule.toggleTheme());
        onClick('saveLayoutBtn', () => this.modules.dashboardModule.saveLayout());
        onClick('resetLayoutBtn', () => this.modules.dashboardModule.loadDefaultDashboard());
        onClick('demoBtn', () => {
            if (this.modules.authModule.isDemo()) {
                this._setMode('guest');
                this.modules.authModule.exitDemo();
            } else {
                this._setMode('demo');
                this.modules.authModule.signInAsDemo();
            }
            this._updateModeUI();
        });

        // First-visit choice dialog: demo, real Microsoft sign-in, or guest.
        onClick('demoChoiceBtn', () => {
            this._setMode('demo');
            this._closeChoiceDialog();
            this.modules.authModule.signInAsDemo();
            this._updateModeUI();
        });
        onClick('msalChoiceBtn', () => {
            if (!this.modules.authModule.isConfigured) {
                this.showGlobalNotification('Microsoft sign-in is not configured in this demo.', 'warning');
                return;
            }
            this._setMode('real');
            this._closeChoiceDialog();
            this.modules.authModule.login();
        });
        onClick('guestChoiceBtn', () => {
            this._setMode('guest');
            this._closeChoiceDialog();
            this._updateModeUI();
        });
        const dialog = document.getElementById('signinChoiceDialog');
        if (dialog) {
            // Dismissing with Esc counts as "continue as guest", so the
            // dialog does not reappear on every visit after a dismissal.
            dialog.addEventListener('close', () => {
                if (!this._getMode()) {
                    this._setMode('guest');
                }
            });
        }

        // Hide sign-in entirely when MSAL is not configured; guest mode
        // is the whole point of the no-keys demo.
        if (!this.modules.authModule.isConfigured) {
            const loginBtn = document.getElementById('loginBtn');
            if (loginBtn) {
                loginBtn.hidden = true;
            }
        }

        this._renderWidgetMenu();

        // Delegated: widget remove buttons are created dynamically.
        document.addEventListener('click', (event) => {
            const removeBtn = event.target.closest('.remove-widget-btn');
            if (!removeBtn) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const item = removeBtn.closest('.grid-stack-item');
            if (item) {
                this.modules.dashboardModule.removeWidget(item);
            }
        });

        document.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 's') {
                event.preventDefault();
                this.modules.dashboardModule.saveLayout();
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
                event.preventDefault();
                this.modules.themeModule.toggleTheme();
            }
        });

        window.addEventListener('beforeunload', () => {
            this.modules.dashboardModule?.flushAutoSave();
            this.cleanup();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                // A drag followed by closing the tab within the 2 s
                // autosave debounce used to be lost; flush it here.
                this.modules.dashboardModule?.flushAutoSave();
            } else if (this.isInitialized) {
                this.eventEmitter.emit(EVENTS.tabVisible);
            }
        });
    }

    /**
     * Build the sidebar widget menu from the registry, instead of five
     * hardcoded buttons in index.html. Adding a widget type is then a
     * registry entry, not an HTML edit plus a JS edit.
     */
    _renderWidgetMenu() {
        const menu = document.getElementById('widgetMenu');
        if (!menu) {
            return;
        }
        menu.innerHTML = '';
        WidgetFactory.getAvailableWidgetTypes().forEach((widgetType) => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn add-widget-btn';
            button.setAttribute('data-widget-type', widgetType.id);
            button.textContent = widgetType.name;
            button.addEventListener('click', (event) => {
                event.preventDefault();
                this.modules.dashboardModule.addWidget({ type: widgetType.id, w: 4, h: 2 });
            });
            item.appendChild(button);
            menu.appendChild(item);
        });
    }

    _getMode() {
        try {
            return localStorage.getItem(STORAGE_KEYS.mode);
        } catch {
            return null;
        }
    }

    _setMode(mode) {
        try {
            localStorage.setItem(STORAGE_KEYS.mode, mode);
        } catch {
            // Private mode etc.: choice simply is not remembered.
        }
    }

    _updateModeUI() {
        const auth = this.modules.authModule;
        if (!auth) {
            return;
        }
        const isDemo = typeof auth.isDemo === 'function' && auth.isDemo();
        const demoBtn = document.getElementById('demoBtn');
        if (demoBtn) {
            demoBtn.textContent = isDemo ? 'Exit demo' : 'Try demo';
        }
        const badge = document.getElementById('modeBadge');
        if (badge) {
            badge.hidden = !isDemo;
            badge.textContent = 'Demo mode';
        }
    }

    _closeChoiceDialog() {
        const dialog = document.getElementById('signinChoiceDialog');
        if (dialog && typeof dialog.close === 'function' && dialog.open) {
            dialog.close();
        }
    }

    /**
     * First-visit choice, applied once at startup. A restored real MSAL
     * session or a remembered choice skips the dialog; a remembered demo
     * choice re-enters demo mode (and therefore the sample layout, or a
     * previously saved demo layout). Nothing here ever attempts a real
     * sign-in on its own — the real option only runs when the visitor
     * clicks it, and it is disabled entirely when MSAL is not configured.
     */
    _applyStoredMode() {
        const auth = this.modules.authModule;
        if (auth.isAuthenticated() && !auth.isDemo()) {
            this._updateModeUI();
            return;
        }
        const stored = this._getMode();
        if (stored === 'demo') {
            auth.signInAsDemo();
            this._updateModeUI();
            return;
        }
        if (stored === 'real' || stored === 'guest') {
            this._updateModeUI();
            return;
        }
        const dialog = document.getElementById('signinChoiceDialog');
        if (!dialog) {
            return;
        }
        const msalBtn = document.getElementById('msalChoiceBtn');
        if (msalBtn) {
            msalBtn.disabled = !auth.isConfigured;
        }
        const msalNote = document.getElementById('msalChoiceNote');
        if (msalNote) {
            msalNote.textContent = auth.isConfigured
                ? ''
                : 'Microsoft sign-in is not configured in this demo — try the demo instead.';
        }
        try {
            if (typeof dialog.showModal === 'function') {
                dialog.showModal();
            } else {
                dialog.setAttribute('open', '');
            }
        } catch {
            // showModal throws if the dialog is already open; ignore.
        }
    }

    showGlobalNotification(message, type = 'info') {
        if (this.modules.dashboardModule) {
            this.modules.dashboardModule.showNotification(message, type);
        } else {
            console.log(`${type.toUpperCase()}: ${message}`);
        }
    }

    handleInitializationError() {
        // Overlay, not body.innerHTML: replacing the body destroyed any
        // partially built DOM and made diagnostics impossible. This keeps
        // the page intact underneath and uses textContent throughout.
        if (typeof document === 'undefined') {
            return;
        }
        if (document.getElementById('error-screen')) {
            return;
        }
        const screen = document.createElement('div');
        screen.id = 'error-screen';
        screen.className = 'error-screen';
        const heading = document.createElement('h3');
        heading.textContent = 'Application Error';
        const message = document.createElement('p');
        message.textContent = 'Failed to initialize the dashboard application. Please refresh the page and try again.';
        const reload = document.createElement('button');
        reload.type = 'button';
        reload.textContent = 'Reload Page';
        reload.addEventListener('click', () => window.location.reload());
        screen.append(heading, message, reload);
        document.body.appendChild(screen);
    }

    getAppState() {
        return {
            isInitialized: this.isInitialized,
            currentUser: this.modules.authModule?.getCurrentUser(),
            currentTheme: this.modules.themeModule?.getCurrentTheme(),
            dashboardState: this.modules.dashboardModule?.getDashboardState(),
            firebaseReady: this.modules.firebaseService?.isReady(),
        };
    }

    cleanup() {
        Object.values(this.modules).forEach((module) => {
            if (module && typeof module.destroy === 'function') {
                try {
                    module.destroy();
                } catch {
                    // Cleanup must never throw during unload.
                }
            }
        });
        ChartService.destroyAllCharts();
        this.eventEmitter.removeAllListeners();
    }

    getModule(moduleName) {
        return this.modules[moduleName] || null;
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
        });
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
        });
        const app = new DashboardApp();
        window.dashboardApp = app;
        app.start().catch((error) => {
            console.error('Failed to initialize application:', error);
            app.handleInitializationError();
        });
    });
}

export default DashboardApp;
