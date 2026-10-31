import { Config } from '../config/config.js';
import { WidgetFactory } from './widget-factory.js';
import { GridStackAdapter, FlexFallbackAdapter } from './grid-adapter.js';
import { ChartService } from '../services/chart-service.js';
import { normalizeWidget, serializeLayout, createWidgetId } from '../core/layout.js';
import { WIDGET_REGISTRY } from '../core/widgets.js';
import { EVENTS } from '../core/constants.js';
import { sanitizeIconClass } from '../core/escape.js';

/**
 * Dashboard: owns the widget registry and delegates all positioning to
 * a grid adapter (see grid-adapter.js) — never to GridStack directly.
 *
 * The registry (this.widgets) is the source of truth, not the DOM and
 * not grid.save(): a saved layout is the registry serialized whole
 * (id, type, geometry AND options), so reload restores the same widgets.
 *
 * Layouts load in one batch (adapter.beginBatch/endBatch) and charts
 * mount synchronously once their element is in the DOM. The old code
 * staggered insertion on 50/100 ms timeouts and scheduled chart creation
 * on a further 100 ms timeout; both are gone — the stagger existed to
 * let GridStack settle between inserts, batching does that properly,
 * and a chart timeout could fire after its widget had been removed.
 */
export class DashboardModule {
    constructor(eventEmitter, layoutStore, authModule) {
        this.eventEmitter = eventEmitter;
        this.layoutStore = layoutStore;
        this.authModule = authModule;
        this.adapter = null;
        this.useGridStack = false;
        this.container = null;
        this.widgets = [];
        this.isLoading = false;
        this._saveTimer = null;
        this._loadToken = 0;
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Identity changed, so the layout key changed: reload for the
        // new identity (MSAL account, or back to the local guest id).
        this.eventEmitter.on(EVENTS.userLogin, () => {
            this.loadLayout();
        });
        this.eventEmitter.on(EVENTS.userLogout, () => {
            this.loadLayout();
        });
    }

    async initialize() {
        if (typeof document === 'undefined') {
            return;
        }
        this.container = document.querySelector('.grid-stack');
        if (!this.container) {
            return;
        }
        try {
            this.adapter = new GridStackAdapter();
            this.adapter.init(this.container);
            this.useGridStack = true;
            this.adapter.onChange(() => {
                this._syncGeometryFromGrid();
                this.debouncedAutoSave();
            });
        } catch (error) {
            // GridStack missing, blocked, or init threw (v1.1.0's reversed
            // argument order did exactly this): fall back, don't fail.
            console.error('GridStack failed to initialize, using fallback layout:', error);
            this.adapter = new FlexFallbackAdapter();
            this.adapter.init(this.container);
            this.useGridStack = false;
        }
    }

    /** Copy live grid geometry back into the registry before saving. */
    _syncGeometryFromGrid() {
        if (!this.adapter) {
            return;
        }
        try {
            const byId = new Map();
            this.adapter.readGeometry().forEach((node) => {
                byId.set(node.id, node);
            });
            this.widgets = this.widgets.map((widget) => {
                const node = byId.get(widget.id);
                if (!node) {
                    return widget;
                }
                return {
                    ...widget,
                    x: typeof node.x === 'number' ? node.x : widget.x,
                    y: typeof node.y === 'number' ? node.y : widget.y,
                    w: typeof node.w === 'number' ? node.w : widget.w,
                    h: typeof node.h === 'number' ? node.h : widget.h,
                };
            });
        } catch (error) {
            console.error('Error syncing grid geometry:', error);
        }
    }

    /**
     * Add a widget to the registry and the grid.
     * Validation runs on the raw config first (strict: bad geometry is
     * rejected), then normalizeWidget repairs saved-layout values.
     * The old order — normalize, then validate — meant clamping had
     * already hidden every geometry error from the validator.
     * @param {object} widgetData — raw widget config
     * @returns {object|null} the normalized widget now in the registry, or null
     */
    addWidget(widgetData) {
        const validation = WidgetFactory.validateWidgetConfig(widgetData);
        if (!validation.isValid) {
            console.error('Invalid widget configuration:', validation.errors);
            this.showNotification('Invalid widget configuration', 'error');
            return null;
        }
        const normalized = normalizeWidget(widgetData);
        if (!normalized) {
            console.error('Invalid widget configuration:', widgetData);
            this.showNotification('Invalid widget configuration', 'error');
            return null;
        }
        // Duplicate ids (the sidebar used to reuse the type as the id)
        // would corrupt save/load, so mint a fresh one.
        if (this.widgets.some((widget) => widget.id === normalized.id)) {
            normalized.id = createWidgetId();
        }
        const currentUser = this.authModule ? this.authModule.getCurrentUser() : null;
        const widgetContent = WidgetFactory.createWidget(
            normalized.type, currentUser, normalized.options, normalized.id,
        );
        const itemHtml = `
            <div class="grid-stack-item">
                <div class="grid-stack-item-content">
                    ${widgetContent}
                    <button type="button" class="btn btn-danger btn-sm remove-widget-btn"
                        aria-label="Remove widget"><span aria-hidden="true">&times;</span></button>
                </div>
            </div>
        `;
        this.widgets.push(normalized);
        if (typeof document !== 'undefined' && this.container && this.adapter) {
            const template = document.createElement('template');
            template.innerHTML = itemHtml.trim();
            const element = template.content.firstElementChild;
            if (element) {
                const placed = this.adapter.add(element, normalized) || element;
                this._mountCharts(placed);
            }
        }
        this.eventEmitter.emit(EVENTS.widgetAdded, { widgetData: normalized });
        return normalized;
    }

    /**
     * Render the charts for one inserted item, synchronously. Dispatch
     * uses data-widget-type from the registry, not canvas-id prefixes —
     * the old recreate path guessed the type from `chartId.startsWith()`,
     * which made canvas naming load-bearing.
     */
    _mountCharts(element) {
        const card = element.querySelector('[data-widget-type]');
        if (!card) {
            return;
        }
        const type = card.getAttribute('data-widget-type');
        const entry = WIDGET_REGISTRY[type];
        if (!entry || !entry.chartService) {
            return;
        }
        const canvas = element.querySelector('canvas');
        if (!canvas) {
            return;
        }
        const widget = this.widgets.find((w) => w.id === card.getAttribute('data-widget-id'));
        const options = widget ? widget.options : {};
        try {
            // Bar charts take their chartConfig; line/pie take the whole
            // options object (ChartService accepts data or chartConfig).
            const arg = type === 'chart' ? (options.chartConfig || {}) : options;
            ChartService[entry.chartService](canvas.id, arg);
        } catch (error) {
            console.error(`Error creating ${type} chart:`, error);
        }
    }

    /** Re-render every chart currently on the grid, with its saved options. */
    recreateCharts() {
        if (!this.container) {
            return;
        }
        this.container.querySelectorAll('.grid-stack-item').forEach((element) => {
            this._mountCharts(element);
        });
    }

    removeWidget(element) {
        if (!element) {
            return;
        }
        const card = element.querySelector('[data-widget-id]');
        const widgetId = card ? card.getAttribute('data-widget-id') : null;
        if (widgetId) {
            this.widgets = this.widgets.filter((widget) => widget.id !== widgetId);
        }
        if (this.adapter) {
            this.adapter.remove(element);
        } else if (element.parentNode) {
            element.parentNode.removeChild(element);
        }
        this.eventEmitter.emit(EVENTS.widgetRemoved, { widgetId });
    }

    async saveLayout() {
        if (!this.layoutStore) {
            this.showNotification('No layout store configured', 'warning');
            return;
        }
        this._syncGeometryFromGrid();
        this.setLoading(true);
        try {
            const result = await this.layoutStore.save(serializeLayout(this.widgets));
            if (result && result.success !== false) {
                this.showNotification('Layout saved successfully!', 'success');
            } else {
                this.showNotification('Error saving layout. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Error saving layout:', error);
            this.showNotification('Error saving layout. Please try again.', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    async loadLayout() {
        if (typeof document === 'undefined' || !this.container) {
            return;
        }
        // Capture the token before awaiting the store: a second load
        // that starts while this one is awaiting supersedes it, and the
        // stale load must not add its widgets afterwards.
        const token = this._clearGrid();
        let result;
        try {
            result = this.layoutStore ? await this.layoutStore.load() : { widgets: [], corrupt: false };
        } catch (error) {
            console.error('Error loading layout:', error);
            result = { widgets: [], corrupt: false };
        }
        if (token !== this._loadToken) {
            return;
        }
        const saved = Array.isArray(result) ? result : (result.widgets || []);
        if (!Array.isArray(result) && result.corrupt) {
            this.showNotification(
                'Saved layout was unreadable — defaults loaded. Your previous layout was kept as a backup.',
                'warning',
            );
        }
        const parsed = serializeLayout(saved);
        // No saved layout yet: demo mode gets the sample layout, guests
        // get the generic defaults. A saved layout always wins over both.
        const isDemo = this.authModule
            && typeof this.authModule.isDemo === 'function'
            && this.authModule.isDemo();
        const fallback = isDemo ? Config.getDemoLayout() : Config.getDefaultWidgets();
        const toLoad = parsed.length > 0
            ? parsed
            : fallback.map((widget) => normalizeWidget(widget)).filter(Boolean);
        if (this.adapter) {
            this.adapter.beginBatch();
        }
        try {
            toLoad.forEach((widget) => this.addWidget(widget));
        } finally {
            if (this.adapter) {
                this.adapter.endBatch();
            }
        }
    }

    loadDefaultDashboard() {
        if (typeof document === 'undefined' || !this.container) {
            return;
        }
        this._clearGrid();
        // Reset restores the mode-appropriate layout: the sample layout
        // in demo mode, the generic defaults otherwise.
        const isDemo = this.authModule
            && typeof this.authModule.isDemo === 'function'
            && this.authModule.isDemo();
        const defaults = isDemo ? Config.getDemoLayout() : Config.getDefaultWidgets();
        if (this.adapter) {
            this.adapter.beginBatch();
        }
        try {
            defaults.forEach((widget) => this.addWidget(normalizeWidget(widget)));
        } finally {
            if (this.adapter) {
                this.adapter.endBatch();
            }
        }
    }

    _clearGrid() {
        this._loadToken += 1;
        this.widgets = [];
        if (this.adapter) {
            try {
                this.adapter.clear();
            } catch {
                // Grid already torn down; registry clear above is enough.
            }
        } else if (this.container) {
            this.container.innerHTML = '';
        }
        return this._loadToken;
    }

    showNotification(message, type = 'info') {
        if (typeof document === 'undefined') {
            console.log(`${type.toUpperCase()}: ${message}`);
            return;
        }
        const iconMap = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle',
        };
        // Message goes through textContent, never innerHTML, so an error
        // string can never become markup. Position lives in CSS
        // (.notification), not inline, so a theme change cannot miss it.
        const element = document.createElement('div');
        element.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible show notification`;
        element.setAttribute('role', 'status');
        const icon = document.createElement('span');
        icon.className = sanitizeIconClass(iconMap[type] || iconMap.info);
        icon.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.textContent = String(message);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'close';
        close.textContent = '×';
        close.addEventListener('click', () => element.remove());
        element.append(icon, text, close);
        document.body.appendChild(element);
        setTimeout(() => element.remove(), 5000);
    }

    setLoading(isLoading) {
        this.isLoading = isLoading;
        if (typeof document === 'undefined') {
            return;
        }
        const button = document.getElementById('saveLayoutBtn');
        if (button) {
            button.disabled = isLoading;
            button.textContent = isLoading ? 'Saving…' : 'Save Layout';
        }
        const wrapper = document.querySelector('.content-wrapper');
        if (wrapper) {
            wrapper.classList.toggle('loading', isLoading);
        }
    }

    debouncedAutoSave() {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            if (!this.isLoading) {
                this.saveLayout();
            }
        }, 2000);
    }

    /**
     * Flush a pending autosave now. Used on tab-hide/close: the local
     * store writes synchronously inside saveLayout's first tick, so
     * calling this (without awaiting) still persists a local layout.
     * A Firebase save cannot be guaranteed on unload and is not claimed to be.
     */
    flushAutoSave() {
        if (!this._saveTimer) {
            return;
        }
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
        if (!this.isLoading) {
            this.saveLayout();
        }
    }

    getWidgetById(widgetId) {
        return this.widgets.find((widget) => widget.id === widgetId) || null;
    }

    /** Shallow copy of the registry, for readers like chart recreation. */
    getWidgets() {
        return this.widgets.map((widget) => ({ ...widget, options: { ...widget.options } }));
    }

    getDashboardState() {
        return {
            widgetCount: this.widgets.length,
            isAuthenticated: this.authModule ? this.authModule.isAuthenticated() : false,
            isLoading: this.isLoading,
            useGridStack: this.adapter ? this.adapter.isGridStack : false,
        };
    }

    destroy() {
        clearTimeout(this._saveTimer);
        if (this.adapter) {
            this.adapter.destroy();
        }
        this.widgets = [];
    }
}
