/**
 * Theme colours — the single palette for charts.
 *
 * ThemeModule.getChartColors() and ChartService.themeColors() used to
 * return two different palettes (8 colours vs 2), so a dark-mode tweak
 * fixed one and not the other. Both now delegate here. The CSS custom
 * properties in custom.css are the same palette expressed for CSS; if
 * you change a colour here, check the CSS variables too (and vice versa).
 */
export function getChartColors(isDark) {
    return {
        background: isDark ? '#454d55' : '#ffffff',
        text: isDark ? '#ffffff' : '#333333',
        grid: isDark ? '#6c757d' : '#e0e0e0',
        primary: isDark ? '#007bff' : '#0056b3',
        success: isDark ? '#28a745' : '#1e7e34',
        warning: isDark ? '#ffc107' : '#d39e00',
        danger: isDark ? '#dc3545' : '#bd2130',
        info: isDark ? '#17a2b8' : '#138496',
    };
}
