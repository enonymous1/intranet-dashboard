/**
 * Widget registry — the single definition of a widget type.
 *
 * Before this file, a widget type was a bare string copy-pasted in five
 * places (layout.js, widget-factory.js × 3, index.html's sidebar, and
 * app.js's chart-recreation dispatch on canvas-id prefixes). Adding a
 * type meant editing all five, and forgetting one failed silently.
 * Now: add one entry here plus its creator in WidgetFactory, and the
 * sidebar, validation, and chart recreation all follow.
 *
 * chartService is the ChartService method that renders this type, or
 * null for non-chart widgets; chartPrefix is the canvas-id prefix that
 * method's widgets use (kept for backwards compatibility with existing
 * saved layouts, not used for dispatch — dispatch uses data-widget-type).
 */
export const WIDGET_REGISTRY = Object.freeze({
    welcome: Object.freeze({
        name: 'Welcome', description: 'Personal welcome message',
        chartService: null, chartPrefix: null,
    }),
    info: Object.freeze({
        name: 'Info Box', description: 'Information display widget',
        chartService: null, chartPrefix: null,
    }),
    chart: Object.freeze({
        name: 'Bar Chart', description: 'Bar chart visualization',
        chartService: 'createChart', chartPrefix: 'chart',
    }),
    lineChart: Object.freeze({
        name: 'Line Chart', description: 'Line chart visualization',
        chartService: 'createLineChart', chartPrefix: 'lineChart',
    }),
    pieChart: Object.freeze({
        name: 'Pie Chart', description: 'Pie chart visualization',
        chartService: 'createPieChart', chartPrefix: 'pieChart',
    }),
});

export const WIDGET_TYPES = Object.keys(WIDGET_REGISTRY);

/** Sidebar / picker entries, in registry order. */
export function getWidgetTypeList() {
    return WIDGET_TYPES.map((id) => ({
        id, name: WIDGET_REGISTRY[id].name, description: WIDGET_REGISTRY[id].description,
    }));
}
