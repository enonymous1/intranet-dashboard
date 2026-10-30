import { ChartService } from '../services/chart-service.js';

/**
 * Dark/light theme. Vanilla DOM (no jQuery), preference in localStorage,
 * system preference as the default, and cross-tab sync via storage events.
 * getChartColors() mirrors the palette ChartService applies from the
 * body's dark-mode class, so custom chart code can match the theme.
 */
export class ThemeModule {
    constructor(eventEmitter) {
        this.eventEmitter = eventEmitter;
        this.currentTheme = 'light';
        this.themes = {
            light: { name: 'Light', icon: '☀️', class: '' },
            dark: { name: 'Dark', icon: '🌙', class: 'dark-mode' },
        };
        this.initializeTheme();
    }

    initializeTheme() {
        this.applyInitialTheme();
        this.setupThemeEventListeners();
    }

    applyInitialTheme() {
        const savedTheme = this.getSavedTheme();
        if (savedTheme && this.themes[savedTheme]) {
            this.setTheme(savedTheme, false);
        } else {
            this.setTheme(this.getSystemTheme(), false);
        }
    }

    setupThemeEventListeners() {
        if (typeof window === 'undefined' || !window.matchMedia) {
            return;
        }
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = (event) => {
            if (!this.getSavedTheme()) {
                this.setTheme(event.matches ? 'dark' : 'light', true);
            }
        };
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', onChange);
        } else if (typeof mediaQuery.addListener === 'function') {
            mediaQuery.addListener(onChange);
        }
        window.addEventListener('storage', (event) => {
            if (event.key === 'dashboard-theme') {
                const newTheme = event.newValue;
                if (newTheme && this.themes[newTheme] && newTheme !== this.currentTheme) {
                    this.setTheme(newTheme, false);
                }
            }
        });
    }

    toggleTheme() {
        this.setTheme(this.currentTheme === 'dark' ? 'light' : 'dark', true);
    }

    setTheme(themeName, savePreference = true) {
        if (!this.themes[themeName]) {
            console.error(`Theme '${themeName}' not found`);
            return;
        }
        const previousTheme = this.currentTheme;
        this.currentTheme = themeName;
        const theme = this.themes[themeName];
        if (typeof document !== 'undefined') {
            Object.values(this.themes).forEach((entry) => {
                if (entry.class) {
                    document.body.classList.remove(entry.class);
                }
            });
            if (theme.class) {
                document.body.classList.add(theme.class);
            }
        }
        this.updateThemeToggleUI();
        if (savePreference) {
            this.saveThemePreference(themeName);
        }
        // Note: themeChanged deliberately does NOT reload the dashboard
        // (the original did, discarding unsaved drags). It only recreates
        // charts, via updateChartsForTheme below.
        this.eventEmitter.emit('themeChanged', {
            currentTheme: themeName,
            previousTheme,
            isDarkMode: themeName === 'dark',
        });
        this.updateChartsForTheme();
    }

    updateThemeToggleUI() {
        if (typeof document === 'undefined') {
            return;
        }
        const toggle = document.getElementById('darkModeToggle');
        if (!toggle) {
            return;
        }
        const oppositeTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        const iconEl = document.getElementById('themeIcon');
        if (iconEl) {
            iconEl.textContent = this.themes[oppositeTheme].icon;
        }
        toggle.setAttribute('title', `Switch to ${this.themes[oppositeTheme].name} mode`);
        toggle.setAttribute('aria-label', `Switch to ${this.themes[oppositeTheme].name} mode`);
    }

    updateChartsForTheme() {
        ChartService.destroyAllCharts();
        setTimeout(() => {
            this.eventEmitter.emit('recreateCharts');
        }, 100);
    }

    getChartColors() {
        const isDark = this.currentTheme === 'dark';
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

    saveThemePreference(themeName) {
        try {
            localStorage.setItem('dashboard-theme', themeName);
        } catch (error) {
            console.error('Failed to save theme preference:', error);
        }
    }

    getSavedTheme() {
        try {
            return localStorage.getItem('dashboard-theme');
        } catch (error) {
            console.error('Failed to get saved theme:', error);
            return null;
        }
    }

    getCurrentTheme() {
        return { name: this.currentTheme, ...this.themes[this.currentTheme] };
    }

    getAvailableThemes() {
        return this.themes;
    }

    addTheme(name, config) {
        if (this.themes[name]) {
            console.warn(`Theme '${name}' already exists and will be overwritten`);
        }
        this.themes[name] = {
            name: config.displayName || name,
            icon: config.icon || '🎨',
            class: config.class || '',
            colors: config.colors || {},
        };
    }

    removeTheme(name) {
        if (!this.themes[name]) {
            console.error(`Theme '${name}' not found`);
            return;
        }
        if (name === 'light' || name === 'dark') {
            console.error('Cannot remove default themes');
            return;
        }
        if (this.currentTheme === name) {
            this.setTheme('light', true);
        }
        delete this.themes[name];
    }

    applyCustomCSS(css) {
        if (typeof document === 'undefined') {
            return;
        }
        const styleId = 'custom-theme-styles';
        let styleElement = document.getElementById(styleId);
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = styleId;
            document.head.appendChild(styleElement);
        }
        styleElement.textContent = css;
    }

    getSystemTheme() {
        if (typeof window !== 'undefined' && window.matchMedia
            && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    destroy() {
        // Listeners are on window/media-query objects; nothing to tear down
        // for a single-page app that lives for the page lifetime.
    }
}
