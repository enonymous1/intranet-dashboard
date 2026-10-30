/**
 * Pure layout helpers: widget identity, validation and serialization.
 *
 * The original saved only a widget's type and geometry, so titles, info
 * text and chart settings were lost on every reload. A saved widget is now
 * the full object { id, type, x, y, w, h, options }, and these helpers are
 * the single definition of what a valid one looks like. They have no DOM
 * dependency, so they are covered by node:test.
 */

export const WIDGET_TYPES = ['welcome', 'info', 'chart', 'lineChart', 'pieChart'];

export function createWidgetId() {
    return `widget-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function clampInt(value, fallback, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    const rounded = Math.floor(value);
    if (rounded < min) return min;
    if (max !== undefined && rounded > max) return max;
    return rounded;
}

/**
 * Normalize one widget object, or return null if it is unusable.
 * Geometry is clamped (width 1-12, height >= 1, positions >= 0) rather
 * than rejected, so one bad saved widget cannot break a whole layout.
 */
export function normalizeWidget(widget, fallbackIndex = 0) {
    if (!widget || typeof widget !== 'object' || Array.isArray(widget)) {
        return null;
    }
    if (!WIDGET_TYPES.includes(widget.type)) {
        return null;
    }
    return {
        id: typeof widget.id === 'string' && widget.id ? widget.id : createWidgetId(),
        type: widget.type,
        x: clampInt(widget.x, 0, 0),
        y: clampInt(widget.y, fallbackIndex, 0),
        w: clampInt(widget.w, 4, 1, 12),
        h: clampInt(widget.h, 2, 1),
        options: widget.options && typeof widget.options === 'object' && !Array.isArray(widget.options)
            ? widget.options
            : {},
    };
}

/** Serialize widgets for storage, dropping anything unusable. */
export function serializeLayout(widgets) {
    if (!Array.isArray(widgets)) {
        return [];
    }
    return widgets
        .map((widget, index) => normalizeWidget(widget, index))
        .filter((widget) => widget !== null);
}

/** Parse a stored layout; anything malformed becomes an empty layout. */
export function parseLayout(data) {
    return serializeLayout(data);
}
