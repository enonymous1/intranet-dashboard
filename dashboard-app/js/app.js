import { EventEmitter } from './core/event-emitter.js';
import { Config } from './config/config.js';
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
class DashboardApp {
    constructor() {
        this.eventEmitter = new EventEmitter();
        this.modules = {};
        this.isInitialized = false;
        this.initialize();
    }

    async initialize() {
        try {
            await this.initializeServices();
            await this.initializeModules();
            this.setupModuleCommunication();
            this.setupUIEventHandlers();
            this._applyStoredMode();
            this.isInitialized = true;
            this.eventEmitter.emit('appReady');
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.handleInitializationError();
        }
    }

    async initializeServices() {
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

    /** Identity for the local store: demo, MSAL account, else a stable guest id. */
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
            let id = localStorage.getItem('intranet-dashboard:local-user');
            if (!id) {
                id = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
                localStorage.setItem('intranet-dashboard:local-user', id);
            }
            return id;
        } catch {
            return 'local';
        }
    }

    async initializeModules() {
        this.modules.authModule = new AuthenticationModule(this.eventEmitter);
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
        // Theme changes recreate charts only. The original reloaded the
        // whole dashboard here, discarding unsaved drags.
        this.eventEmitter.on('recreateCharts', () => {
            document.querySelectorAll('.grid-stack-item canvas').forEach((canvas) => {
                const chartId = canvas.id;
                if (!chartId) {
                    return;
                }
                setTimeout(() => {
                    if (chartId.startsWith('lineChart')) {
                        ChartService.createLineChart(chartId);
                    } else if (chartId.startsWith('pieChart')) {
                        ChartService.createPieChart(chartId);
                    } else {
                        ChartService.createChart(chartId);
                    }
                }, 50);
            });
        });
        this.eventEmitter.on('authError', ({ error, type }) => {
            console.error(`Authentication error (${type}):`, error);
            const message = error && error.message ? error.message : 'Unknown error';
            this.showGlobalNotification(`Authentication error: ${message}`, 'error');
        });
        this.eventEmitter.on('userLogin', (account) => {
            console.log('User logged in:', account.name || account.username);
            this._updateModeUI();
        });
        this.eventEmitter.on('userLogout', () => {
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

        document.querySelectorAll('.add-widget-btn').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                const widgetType = button.getAttribute('data-widget-type');
                this.modules.dashboardModule.addWidget({ type: widgetType, w: 4, h: 2 });
            });
        });

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

        window.addEventListener('beforeunload', () => this.cleanup());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isInitialized) {
                this.eventEmitter.emit('tabVisible');
            }
        });
    }

    _getMode() {
        try {
            return localStorage.getItem('intranet-dashboard:mode');
        } catch {
            return null;
        }
    }

    _setMode(mode) {
        try {
            localStorage.setItem('intranet-dashboard:mode', mode);
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
        // Static message only — no error text is interpolated into HTML.
        document.body.innerHTML = `
            <div class="error-screen">
                <h3>Application Error</h3>
                <p>Failed to initialize the dashboard application. Please refresh the page and try again.</p>
                <button type="button" onclick="location.reload()">Reload Page</button>
            </div>
        `;
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
        window.dashboardApp = new DashboardApp();
    });
}

export default DashboardApp;
