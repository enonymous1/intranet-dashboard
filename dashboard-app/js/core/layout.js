/**
 * Pure layout helpers: widget identity, validation and serialization.
 *
 * The original saved only a widget's type and geometry, so titles, info
 * text and chart settings were lost on every reload. A saved widget is now
 * the full object { id, type, x, y, w, h, options }, and these helpers are
 * the single definition of what a valid one looks like. They have no DOM
 * dependency, so they are covered by node:test.
 */

import { WIDGET_TYPES } from './widgets.js';

export { WIDGET_TYPES };

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
 * This is the repair path for *saved* layouts. User-supplied configs
 * go through WidgetFactory.validateWidgetConfig first, which rejects
 * out-of-range geometry instead of clamping it — the two functions
 * deliberately disagree, for different inputs.
 * @param {object} widget — raw widget, e.g. from a saved layout
 * @param {number} [fallbackIndex=0] — used as `y` when the widget has
 *   no position: unpositioned widgets then stack down the page in
 *   load order instead of all overlapping at (0, 0).
 * @returns {object|null} normalized widget, or null if the type is unknown
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

/** Serialize widgets for storage, dropping anything unusable.
 * @param {Array<object>} widgets
 * @returns {Array<object>} normalized widgets, safe to render and save
 */
export function serializeLayout(widgets) {
    if (!Array.isArray(widgets)) {
        return [];
    }
    return widgets
        .map((widget, index) => normalizeWidget(widget, index))
        .filter((widget) => widget !== null);
}

/** Schema version for the saved-layout envelope (see serializeLayoutEnvelope). */
export const LAYOUT_SCHEMA_VERSION = 1;

/**
 * Serialize widgets as a versioned envelope. Stores save the envelope,
 * not the bare array, so a future format change can migrate instead of
 * breaking every existing saved layout.
 * @param {Array<object>} widgets
 * @returns {{version: number, widgets: Array<object>}}
 */
export function serializeLayoutEnvelope(widgets) {
    return { version: LAYOUT_SCHEMA_VERSION, widgets: serializeLayout(widgets) };
}

/**
 * Parse a stored layout; anything malformed becomes an empty layout.
 * Accepts both the v1.2 envelope ({ version, widgets }) and the bare
 * array saved by v1.0/v1.1, so old layouts migrate on load.
 * @param {*} data — parsed JSON from a store
 * @returns {Array<object>} normalized widgets
 */
export function parseLayout(data) {
    if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray(data.widgets)) {
        return serializeLayout(data.widgets);
    }
    return serializeLayout(data);
}
