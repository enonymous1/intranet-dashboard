/**
 * Chart.js wrapper. Guards every browser global so a missing Chart.js
 * (offline, blocked CDN) degrades to an empty widget instead of crashing
 * the app, and drops the Chart.helpers API the original called, which
 * Chart.js 4 no longer provides.
 */
export class ChartService {
    static charts = new Map();

    /** Colors that follow the body's dark-mode class (set by ThemeModule). */
    static themeColors() {
        const dark = typeof document !== 'undefined'
            && document.body
            && document.body.classList.contains('dark-mode');
        return dark
            ? { text: '#f8f9fa', grid: '#495057' }
            : { text: '#212529', grid: '#e0e0e0' };
    }

    static createChart(chartId, options = {}) {
        if (typeof document === 'undefined' || typeof Chart === 'undefined') {
            return null;
        }
        const ctx = document.getElementById(chartId);
        if (!ctx) {
            console.error(`Canvas element with ID '${chartId}' not found`);
            return null;
        }
        if (this.charts.has(chartId)) {
            this.charts.get(chartId).destroy();
        }
        const colors = this.themeColors();
        const defaultConfig = {
            type: 'bar',
            data: {
                labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange'],
                datasets: [{
                    label: '# of Votes',
                    data: [12, 19, 3, 5, 2, 3],
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.2)', 'rgba(54, 162, 235, 0.2)',
                        'rgba(255, 206, 86, 0.2)', 'rgba(75, 192, 192, 0.2)',
                        'rgba(153, 102, 255, 0.2)', 'rgba(255, 159, 64, 0.2)',
                    ],
                    borderColor: [
                        'rgba(255, 99, 132, 1)', 'rgba(54, 162, 235, 1)',
                        'rgba(255, 206, 86, 1)', 'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)', 'rgba(255, 159, 64, 1)',
                    ],
                    borderWidth: 1,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top', labels: { color: colors.text } },
                },
                scales: {
                    x: { grid: { color: colors.grid }, ticks: { color: colors.text } },
                    y: { beginAtZero: true, grid: { color: colors.grid }, ticks: { color: colors.text } },
                },
            },
        };
        const config = this.mergeConfig(defaultConfig, options || {});
        try {
            const chart = new Chart(ctx, config);
            this.charts.set(chartId, chart);
            return chart;
        } catch (error) {
            console.error(`Error creating chart ${chartId}:`, error);
            return null;
        }
    }

    static createLineChart(chartId, data = {}) {
        const input = data && typeof data === 'object' ? data : {};
        const chartData = input.chartConfig?.data || input.data || {
            labels: ['January', 'February', 'March', 'April', 'May', 'June'],
            datasets: [{
                label: 'Dataset 1',
                data: [65, 59, 80, 81, 56, 55],
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1,
            }],
        };
        return this.createChart(chartId, {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: input.title || 'Line Chart' },
                },
            },
        });
    }

    static createPieChart(chartId, data = {}) {
        const input = data && typeof data === 'object' ? data : {};
        const chartData = input.chartConfig?.data || input.data || {
            labels: ['Red', 'Blue', 'Yellow'],
            datasets: [{
                data: [300, 50, 100],
                backgroundColor: ['rgb(255, 99, 132)', 'rgb(54, 162, 235)', 'rgb(255, 205, 86)'],
            }],
        };
        return this.createChart(chartId, {
            type: 'pie',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: input.title || 'Pie Chart' },
                },
            },
        });
    }

    static updateChart(chartId, newData) {
        const chart = this.charts.get(chartId);
        if (chart) {
            chart.data = newData;
            chart.update();
        }
    }

    static destroyChart(chartId) {
        const chart = this.charts.get(chartId);
        if (chart) {
            chart.destroy();
            this.charts.delete(chartId);
        }
    }

    static destroyAllCharts() {
        this.charts.forEach((chart) => {
            try {
                chart.destroy();
            } catch {
                // Already destroyed; clearing the map is enough.
            }
        });
        this.charts.clear();
    }

    static getChart(chartId) {
        return this.charts.get(chartId) || null;
    }

    static mergeConfig(target, source) {
        if (!source || typeof source !== 'object') {
            return { ...target };
        }
        const result = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.mergeConfig(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }

    static getActiveCharts() {
        return Array.from(this.charts.keys());
    }
}
