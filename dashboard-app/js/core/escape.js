/**
 * Small HTML-escaping helpers.
 *
 * Widget titles, info content and notification messages can come from a
 * saved layout (local storage or Firestore), so they must never be pasted
 * into HTML unescaped. These helpers are the single place that rule lives.
 */

/** Escape a value for safe interpolation into HTML text or an attribute. */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Allow only safe icon class names (letters, digits, spaces, hyphens,
 * underscores). Anything else falls back to the default icon, so a saved
 * layout cannot inject an attribute break-out through an icon field.
 */
export function sanitizeIconClass(value, fallback = 'fas fa-info-circle') {
    const text = String(value ?? '');
    if (!text || text.length > 80 || !/^[a-zA-Z0-9\-_ ]+$/.test(text)) {
        return fallback;
    }
    return text;
}
