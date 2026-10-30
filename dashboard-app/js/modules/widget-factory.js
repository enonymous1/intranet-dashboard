import { ChartService } from '../services/chart-service.js';
import { escapeHtml, sanitizeIconClass } from '../core/escape.js';
import { createWidgetId, WIDGET_TYPES } from '../core/layout.js';

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
    static widgetTypes = {
        welcome: 'welcome',
        info: 'info',
        chart: 'chart',
        lineChart: 'lineChart',
        pieChart: 'pieChart',
    };

    static createWidget(widgetType, currentUser, options = {}, widgetId = null) {
        const id = typeof widgetId === 'string' && widgetId ? widgetId : createWidgetId();
        const opts = options && typeof options === 'object' ? options : {};
        switch (widgetType) {
            case this.widgetTypes.welcome:
                return this.createWelcomeWidget(currentUser, opts, id);
            case this.widgetTypes.info:
                return this.createInfoWidget(opts, id);
            case this.widgetTypes.chart:
                return this.createChartWidget(opts, id);
            case this.widgetTypes.lineChart:
                return this.createLineChartWidget(opts, id);
            case this.widgetTypes.pieChart:
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

    static createChartWidget(options, widgetId) {
        const chartId = `chart-${widgetId}`;
        const title = escapeHtml(options.title || 'Chart');
        setTimeout(() => {
            try {
                ChartService.createChart(chartId, options.chartConfig);
            } catch (error) {
                console.error('Error creating chart widget:', error);
            }
        }, 100);
        return `
            <div class="card" data-widget-id="${escapeHtml(widgetId)}" data-widget-type="chart">
                <div class="card-header">
                    <h5 class="card-title mb-0">${title}</h5>
                </div>
                <div class="card-body">
                    <canvas id="${escapeHtml(chartId)}"></canvas>
                </div>
            </div>
        `;
    }

    static createLineChartWidget(options, widgetId) {
        const chartId = `lineChart-${widgetId}`;
        const title = escapeHtml(options.title || 'Line Chart');
        setTimeout(() => {
            try {
                ChartService.createLineChart(chartId, options);
            } catch (error) {
                console.error('Error creating line chart widget:', error);
            }
        }, 100);
        return `
            <div class="card" data-widget-id="${escapeHtml(widgetId)}" data-widget-type="lineChart">
                <div class="card-header">
                    <h5 class="card-title mb-0">${title}</h5>
                </div>
                <div class="card-body">
                    <canvas id="${escapeHtml(chartId)}"></canvas>
                </div>
            </div>
        `;
    }

    static createPieChartWidget(options, widgetId) {
        const chartId = `pieChart-${widgetId}`;
        const title = escapeHtml(options.title || 'Pie Chart');
        setTimeout(() => {
            try {
                ChartService.createPieChart(chartId, options);
            } catch (error) {
                console.error('Error creating pie chart widget:', error);
            }
        }, 100);
        return `
            <div class="card" data-widget-id="${escapeHtml(widgetId)}" data-widget-type="pieChart">
                <div class="card-header">
                    <h5 class="card-title mb-0">${title}</h5>
                </div>
                <div class="card-body">
                    <canvas id="${escapeHtml(chartId)}"></canvas>
                </div>
            </div>
        `;
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

    /** Read a widget type back out of a rendered grid item (vanilla DOM). */
    static extractWidgetType(element) {
        if (!element || typeof element.querySelector !== 'function') {
            return 'info';
        }
        const typed = element.querySelector('[data-widget-type]');
        if (typed) {
            return typed.getAttribute('data-widget-type');
        }
        if (element.querySelector('.card-body h3')) return 'welcome';
        const canvas = element.querySelector('canvas');
        if (canvas) {
            const canvasId = canvas.getAttribute('id') || '';
            if (canvasId.includes('lineChart')) return 'lineChart';
            if (canvasId.includes('pieChart')) return 'pieChart';
            return 'chart';
        }
        return 'info';
    }

    static getAvailableWidgetTypes() {
        return [
            { id: 'welcome', name: 'Welcome', description: 'Personal welcome message' },
            { id: 'info', name: 'Info Box', description: 'Information display widget' },
            { id: 'chart', name: 'Bar Chart', description: 'Bar chart visualization' },
            { id: 'lineChart', name: 'Line Chart', description: 'Line chart visualization' },
            { id: 'pieChart', name: 'Pie Chart', description: 'Pie chart visualization' },
        ];
    }

    static validateWidgetConfig(config) {
        const errors = [];
        if (!config || typeof config !== 'object') {
            return { isValid: false, errors: ['Widget configuration is required'] };
        }
        if (!config.type || !WIDGET_TYPES.includes(config.type)) {
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
