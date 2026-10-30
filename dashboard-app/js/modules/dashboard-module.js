import { Config } from '../config/config.js';
import { WidgetFactory } from './widget-factory.js';
import { normalizeWidget, serializeLayout, createWidgetId } from '../core/layout.js';
import { sanitizeIconClass } from '../core/escape.js';

/**
 * Dashboard: owns the widget registry and the GridStack grid.
 *
 * The registry (this.widgets) is the source of truth, not the DOM and
 * not grid.save(): a saved layout is the registry serialized whole
 * (id, type, geometry AND options), so reload restores the same widgets.
 *
 * GridStack is loaded as a classic script in index.html (the original's
 * ES-module import pointed at a path that does not exist in the package,
 * so the grid never initialized). If window.GridStack is missing at
 * startup — blocked CDN, offline — the dashboard falls back to a plain
 * flex layout instead of failing: widgets still render, add, remove
 * and save. Drag-and-drop is the only thing lost.
 */
export class DashboardModule {
    constructor(eventEmitter, layoutStore, authModule) {
        this.eventEmitter = eventEmitter;
        this.layoutStore = layoutStore;
        this.authModule = authModule;
        this.grid = null;
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
        this.eventEmitter.on('userLogin', () => {
            this.loadLayout();
        });
        this.eventEmitter.on('userLogout', () => {
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
        if (typeof window !== 'undefined' && window.GridStack
            && typeof window.GridStack.init === 'function') {
            try {
                this.grid = window.GridStack.init('.grid-stack', Config.getGridStackConfig());
                this.useGridStack = true;
                this.grid.on('change', () => {
                    this._syncGeometryFromGrid();
                    this.debouncedAutoSave();
                });
                this.grid.on('added', (event, items) => {
                    console.log('Widgets added:', items.length);
                });
                this.grid.on('removed', (event, items) => {
                    console.log('Widgets removed:', items.length);
                });
            } catch (error) {
                console.error('GridStack failed to initialize, using fallback layout:', error);
                this.grid = null;
                this.useGridStack = false;
            }
        }
        if (!this.useGridStack) {
            this.container.classList.add('fallback-grid');
        }
    }

    /** Copy live GridStack geometry back into the registry before saving. */
    _syncGeometryFromGrid() {
        if (!this.grid) {
            return;
        }
        try {
            const byId = new Map();
            this.grid.save().forEach((node) => {
                const card = node.el ? node.el.querySelector('[data-widget-id]') : null;
                const widgetId = card ? card.getAttribute('data-widget-id') : null;
                if (widgetId) {
                    byId.set(widgetId, node);
                }
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

    addWidget(widgetData) {
        const normalized = normalizeWidget(widgetData);
        if (!normalized) {
            console.error('Invalid widget configuration:', widgetData);
            this.showNotification('Invalid widget configuration', 'error');
            return null;
        }
        const validation = WidgetFactory.validateWidgetConfig(normalized);
        if (!validation.isValid) {
            console.error('Invalid widget configuration:', validation.errors);
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
        if (typeof document !== 'undefined' && this.container) {
            if (this.useGridStack && this.grid) {
                this.grid.addWidget(itemHtml, {
                    w: normalized.w,
                    h: normalized.h,
                    x: normalized.x,
                    y: normalized.y,
                });
            } else {
                const template = document.createElement('template');
                template.innerHTML = itemHtml.trim();
                const element = template.content.firstElementChild;
                if (element) {
                    element.style.width = `${(normalized.w / 12) * 100}%`;
                    this.container.appendChild(element);
                }
            }
        }
        this.eventEmitter.emit('widgetAdded', { widgetData: normalized });
        return normalized;
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
        if (this.useGridStack && this.grid) {
            this.grid.removeWidget(element);
        } else if (element.parentNode) {
            element.parentNode.removeChild(element);
        }
        this.eventEmitter.emit('widgetRemoved', { widgetId });
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
        const token = this._clearGrid();
        let saved = [];
        try {
            saved = this.layoutStore ? await this.layoutStore.load() : [];
        } catch (error) {
            console.error('Error loading layout:', error);
            saved = [];
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
        toLoad.forEach((widget, index) => {
            setTimeout(() => {
                // A newer load/reset in the meantime wins; stale
                // timeouts from the superseded load add nothing.
                if (token === this._loadToken) {
                    this.addWidget(widget);
                }
            }, index * 50);
        });
    }

    loadDefaultDashboard() {
        if (typeof document === 'undefined' || !this.container) {
            return;
        }
        const token = this._clearGrid();
        // Reset restores the mode-appropriate layout: the sample layout
        // in demo mode, the generic defaults otherwise.
        const isDemo = this.authModule
            && typeof this.authModule.isDemo === 'function'
            && this.authModule.isDemo();
        const defaults = isDemo ? Config.getDemoLayout() : Config.getDefaultWidgets();
        defaults.forEach((widget, index) => {
            setTimeout(() => {
                if (token === this._loadToken) {
                    this.addWidget(normalizeWidget(widget));
                }
            }, index * 100);
        });
    }

    _clearGrid() {
        this._loadToken += 1;
        this.widgets = [];
        if (this.useGridStack && this.grid) {
            try {
                this.grid.removeAll();
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
        // string can never become markup.
        const element = document.createElement('div');
        element.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible show`;
        element.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
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

    getDashboardState() {
        return {
            widgetCount: this.widgets.length,
            isAuthenticated: this.authModule ? this.authModule.isAuthenticated() : false,
            isLoading: this.isLoading,
            useGridStack: this.useGridStack,
        };
    }

    destroy() {
        clearTimeout(this._saveTimer);
        if (this.grid) {
            try {
                this.grid.destroy();
            } catch {
                // Already destroyed.
            }
        }
        this.widgets = [];
    }
}
