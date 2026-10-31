import { ChartService } from '../services/chart-service.js';
import { escapeHtml, sanitizeIconClass } from '../core/escape.js';
import { createWidgetId } from '../core/layout.js';
import { WIDGET_REGISTRY, getWidgetTypeList } from '../core/widgets.js';

/**
 * Factory for dashboard widgets. Every user-controlled string (title,
 * message, content, icon) is escaped or sanitized here, because widget
 * HTML is built as a string and later inserted into the page; the
 * original interpolated those fields raw.
 *
 * createWidget(type, currentUser, options, widgetId): widgetId is
 * optional and is how a reloaded widget keeps its identity, so save and
 * load round-trip the same widget instead of minting a new one.
 */
export class WidgetFactory {
    /**
     * Build one widget's HTML. Charts are NOT created here: the returned
     * HTML contains only the <canvas>, and DashboardModule mounts the
     * chart synchronously once the element is in the DOM. (The old code
     * scheduled chart creation on a 100 ms timeout from here, which
     * could fire after the widget had been removed.)
     * @param {string} widgetType — a WIDGET_REGISTRY key
     * @param {object|null} currentUser
     * @param {object} [options]
     * @param {string|null} [widgetId] — preserved on reload so save/load
     *   round-trips identity; generated when omitted
     * @returns {string} widget HTML (all user strings escaped)
     */
    static createWidget(widgetType, currentUser, options = {}, widgetId = null) {
        const id = typeof widgetId === 'string' && widgetId ? widgetId : createWidgetId();
        const opts = options && typeof options === 'object' ? options : {};
        switch (widgetType) {
            case 'welcome':
                return this.createWelcomeWidget(currentUser, opts, id);
            case 'info':
                return this.createInfoWidget(opts, id);
            case 'chart':
                return this.createChartWidget(opts, id);
            case 'lineChart':
                return this.createLineChartWidget(opts, id);
            case 'pieChart':
                return this.createPieChartWidget(opts, id);
            default:
                return this.createUnknownWidget(widgetType, id);
        }
    }

    static createWelcomeWidget(currentUser, options, widgetId) {
        const userName = currentUser ? (currentUser.name || currentUser.username) : 'Guest';
        const title = options.title ? escapeHtml(options.title) : `Welcome, ${escapeHtml(userName)}!`;
        const message = escapeHtml(options.message || 'This is your personal dashboard.');
        return `
            <div class="card" data-widget-id="${escapeHtml(widgetId)}" data-widget-type="welcome">
                <div class="card-body">
                    <h3 class="card-title">${title}</h3>
                    <p class="card-text">${message}</p>
                    <small class="text-muted">Last updated: ${escapeHtml(new Date().toLocaleString())}</small>
                </div>
            </div>
        `;
    }

    static createInfoWidget(options, widgetId) {
        const title = escapeHtml(options.title || 'Information');
        const content = escapeHtml(options.content || 'Some quick example text to build on the card title and make up the bulk of the card\'s content.');
        const icon = sanitizeIconClass(options.icon);
        return `
            <div class="card" data-widget-id="${escapeHtml(widgetId)}" data-widget-type="info">
                <div class="card-body">
                    <h5 class="card-title"><span class="${icon}" aria-hidden="true"></span> ${title}</h5>
                    <p class="card-text">${content}</p>
                    <small class="text-muted">Info widget</small>
                </div>
            </div>
        `;
    }

    /**
     * One chart card for all three chart types. They used to be three
     * near-identical methods differing only in canvas prefix and default
     * title; the prefix is now taken from the registry entry.
     */
    static createChartCard(widgetType, options, widgetId) {
        const entry = WIDGET_REGISTRY[widgetType];
        const chartId = `${entry.chartPrefix}-${widgetId}`;
        const title = escapeHtml(options.title || entry.name);
        return `
            <div class="card" data-widget-id="${escapeHtml(widgetId)}" data-widget-type="${widgetType}">
                <div class="card-header">
                    <h5 class="card-title mb-0">${title}</h5>
                </div>
                <div class="card-body">
                    <canvas id="${escapeHtml(chartId)}"></canvas>
                </div>
            </div>
        `;
    }

    static createChartWidget(options, widgetId) {
        return this.createChartCard('chart', options, widgetId);
    }

    static createLineChartWidget(options, widgetId) {
        return this.createChartCard('lineChart', options, widgetId);
    }

    static createPieChartWidget(options, widgetId) {
        return this.createChartCard('pieChart', options, widgetId);
    }

    static createUnknownWidget(widgetType, widgetId) {
        return `
            <div class="card" data-widget-id="${escapeHtml(widgetId)}" data-widget-type="unknown">
                <div class="card-body">
                    <h5 class="card-title text-warning">Unknown Widget</h5>
                    <p class="card-text">Widget type "${escapeHtml(widgetType)}" is not recognized.</p>
                    <small class="text-muted">Please check the widget configuration.</small>
                </div>
            </div>
        `;
    }

    /** Sidebar / picker entries, driven by the registry (see core/widgets.js). */
    static getAvailableWidgetTypes() {
        return getWidgetTypeList();
    }

    /**
     * Strict validation for *user-supplied* configs (sidebar adds). Unlike
     * normalizeWidget, which clamps out-of-range geometry for saved
     * layouts, this rejects it — a caller should hear that its geometry
     * was wrong, not silently get a different size.
     */
    static validateWidgetConfig(config) {
        const errors = [];
        if (!config || typeof config !== 'object') {
            return { isValid: false, errors: ['Widget configuration is required'] };
        }
        if (!config.type || !Object.hasOwn(WIDGET_REGISTRY, config.type)) {
            errors.push('Valid widget type is required');
        }
        if (typeof config.w !== 'number' || config.w < 1 || config.w > 12) {
            errors.push('Width must be a number between 1 and 12');
        }
        if (typeof config.h !== 'number' || config.h < 1) {
            errors.push('Height must be a positive number');
        }
        if (config.x !== undefined && (typeof config.x !== 'number' || config.x < 0)) {
            errors.push('X position must be a non-negative number');
        }
        if (config.y !== undefined && (typeof config.y !== 'number' || config.y < 0)) {
            errors.push('Y position must be a non-negative number');
        }
        if (config.options !== undefined && (typeof config.options !== 'object' || Array.isArray(config.options))) {
            errors.push('Options must be an object');
        }
        return { isValid: errors.length === 0, errors };
    }
}
