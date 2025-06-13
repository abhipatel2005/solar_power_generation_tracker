// Solar Panel Dashboard JavaScript
class SolarDashboard {
    constructor() {
        this.chart = null;
        this.chartType = 'line';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadChartData();
        this.loadStats();
        this.setupAutoRefresh();
        this.setUpMaxDate();
    }

    setUpMaxDate() {
        document.getElementById('reading_date').setAttribute('max', new Date().toISOString().split('T')[0]);
        document.getElementById('reading_date').setAttribute('min', new Date().toISOString().split('T')[0]);
    }

    setupEventListeners() {
        // Form submission
        const form = document.getElementById('addReadingForm');
        if (form) {
            form.addEventListener('submit', this.handleFormSubmit.bind(this));
        }

        // Auto-refresh every 5 minutes
        setInterval(() => {
            this.refreshData();
        }, 300000);
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const data = {
            today_reading: parseFloat(formData.get('today_reading')),
            date: formData.get('date')
        };

        if (!data.today_reading || data.today_reading <= 0) {
            this.showToast('Please enter a valid meter reading', 'error');
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch('/api/add_reading', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                this.showToast(result.message, 'success');
                this.showFormMessage(result.message, 'success');
                e.target.reset();

                // Set tomorrow's date as default
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                document.getElementById('reading_date').value = tomorrow.toISOString().split('T')[0];

                // Refresh data
                setTimeout(() => {
                    this.refreshData();
                }, 1000);
            } else {
                this.showToast(result.message, 'error');
                this.showFormMessage(result.message, 'error');
            }
        } catch (error) {
            console.error('Error adding reading:', error);
            this.showToast('Failed to add reading. Please try again.', 'error');
            this.showFormMessage('Failed to add reading. Please try again.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadChartData() {
        try {
            const response = await fetch('/api/chart-data');
            const data = await response.json();
            this.createChart(data);
        } catch (error) {
            console.error('Error loading chart data:', error);
        }
    }

    async loadStats() {
        try {
            const response = await fetch('/api/stats');
            const stats = await response.json();
            this.updateStats(stats);
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    createChart(data) {
        const ctx = document.getElementById('generationChart');
        if (!ctx) return;

        // Destroy existing chart if it exists
        if (this.chart) {
            this.chart.destroy();
        }

        const chartConfig = {
            type: 'line',
            data: {
                labels: data.map(item => new Date(item.date).toLocaleDateString()),
                datasets: [
                    {
                        label: 'Daily Generation (kWh)',
                        data: data.map(item => item.daily_generation),
                        backgroundColor: 'rgba(255, 107, 53, 0.1)',
                        borderColor: '#ff6b35',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#ff6b35',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 8
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            usePointStyle: true,
                            padding: 20,
                            font: {
                                size: 12,
                                weight: '500'
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: '#ff6b35',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            title: function (context) {
                                return 'Date: ' + context[0].label;
                            },
                            label: function (context) {
                                const value = context.parsed.y.toFixed(2);
                                return 'Daily Generation: ' + value + ' kWh';
                            },
                            afterLabel: function (context) {
                                const savings = (context.parsed.y * 2.25).toFixed(0);
                                return 'Savings: ₹' + savings;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            font: {
                                size: 11
                            },
                            maxRotation: 45
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Daily Generation (kWh)',
                            font: {
                                size: 12,
                                weight: '600'
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            font: {
                                size: 11
                            }
                        }
                    }
                },
                elements: {
                    point: {
                        hoverBackgroundColor: '#ffffff'
                    }
                }
            }
        };

        this.chart = new Chart(ctx, chartConfig);
    }

    updateStats(stats) {
        // Update stat cards
        const elements = {
            todayGeneration: stats.todayGeneration?.toFixed(2) + ' kWh',
            totalGeneration: stats.totalGeneration?.toFixed(2) + ' kWh',
            totalSavings: '₹' + stats.totalSavings?.toFixed(0),
            efficiency: stats.efficiency?.toFixed(1) + '%',
            monthlyGeneration: stats.monthlyGeneration?.toFixed(2) + ' kWh',
            monthlySavings: '₹' + stats.monthlySavings?.toFixed(0),
            avgGeneration: stats.avgGeneration?.toFixed(2) + ' kWh/day',
            currentMeter: stats.currentMeterReading?.toFixed(2) + ' kWh'
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });

        // Update trend indicators
        this.updateTrendIndicators(stats);
    }

    updateTrendIndicators(stats) {
        const todayTrend = document.getElementById('todayTrend');
        if (todayTrend && stats.todayGeneration) {
            if (stats.todayGeneration > stats.avgGeneration) {
                todayTrend.innerHTML = '<i class="fas fa-arrow-up"></i> Above Average';
                todayTrend.style.color = '#28a745';
            } else if (stats.todayGeneration < stats.avgGeneration * 0.8) {
                todayTrend.innerHTML = '<i class="fas fa-arrow-down"></i> Below Average';
                todayTrend.style.color = '#dc3545';
            } else {
                todayTrend.innerHTML = '<i class="fas fa-minus"></i> Normal';
                todayTrend.style.color = '#ffc107';
            }
        }
    }

    async refreshData() {
        this.showLoading(true);
        try {
            await Promise.all([
                this.loadChartData(),
                this.loadStats(),
                this.refreshTable()
            ]);

            // Update last update time
            document.getElementById('lastUpdate').textContent = new Date().toLocaleString();
            this.showToast('Data refreshed successfully', 'success');
        } catch (error) {
            console.error('Error refreshing data:', error);
            this.showToast('Failed to refresh data', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async refreshTable() {
        try {
            const response = await fetch('/api/chart-data');
            const data = await response.json();

            const tableBody = document.getElementById('readingsTableBody');
            if (!tableBody) return;

            // Sort by date descending
            data.sort((a, b) => new Date(b.date) - new Date(a.date));

            tableBody.innerHTML = data.slice(0, 30).map(reading => `
                <tr data-date="${reading.date}">
                    <td>${new Date(reading.date).toLocaleDateString()}</td>
                    <td>${reading.meter_reading.toFixed(2)} kWh</td>
                    <td>${reading.daily_generation.toFixed(2)} kWh</td>
                    <td>₹${(reading.daily_generation * 2.25).toFixed(0)}</td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Error refreshing table:', error);
        }
    }

    async deleteReading(date) {
        if (!confirm('Are you sure you want to delete this reading?')) {
            return;
        }

        this.showLoading(true);

        try {
            const response = await fetch(`/api/readings/${date}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('Reading deleted successfully', 'success');

                // Remove row from table
                const row = document.querySelector(`tr[data-date="${date}"]`);
                if (row) {
                    row.remove();
                }

                // Refresh data
                setTimeout(() => {
                    this.refreshData();
                }, 1000);
            } else {
                this.showToast(result.message || 'Failed to delete reading', 'error');
            }
        } catch (error) {
            console.error('Error deleting reading:', error);
            this.showToast('Failed to delete reading', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // toggleChartType() {
    //     this.chartType = this.chartType === 'line' ? 'bar' : 'line';
    //     this.loadChartData();
    // }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            if (show) {
                overlay.classList.add('show');
            } else {
                overlay.classList.remove('show');
            }
        }
    }

    showToast(message, type) {
        const toast = document.getElementById('toast');
        if (!toast) return;

        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }

    showFormMessage(message, type) {
        const messageDiv = document.getElementById('formMessage');
        if (!messageDiv) return;

        messageDiv.textContent = message;
        messageDiv.className = `form-message ${type}`;
        messageDiv.style.display = 'block';

        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }

    setupAutoRefresh() {
        // Auto-refresh stats every 2 minutes
        setInterval(() => {
            this.loadStats();
        }, 120000);

        // Auto-refresh chart every 5 minutes
        setInterval(() => {
            this.loadChartData();
        }, 300000);
    }
}

// Global functions for HTML onclick events
function deleteReading(date) {
    dashboard.deleteReading(date);
}

// function toggleChartType() {
//     dashboard.toggleChartType();
// }

function refreshData() {
    dashboard.refreshData();
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    window.dashboard = new SolarDashboard();
});

// Add some utility functions for enhanced functionality
function exportData() {
    fetch('/api/chart-data')
        .then(response => response.json())
        .then(data => {
            const csv = convertToCSV(data);
            downloadCSV(csv, 'solar_readings.csv');
        })
        .catch(error => {
            console.error('Error exporting data:', error);
            dashboard.showToast('Failed to export data', 'error');
        });
}

function convertToCSV(data) {
    const headers = ['Date', 'Meter Reading (kWh)', 'Daily Generation (kWh)', 'Savings (₹)'];
    const rows = data.map(item => [
        new Date(item.date).toISOString().split('T')[0],
        item.meter_reading.toFixed(2),
        item.daily_generation.toFixed(2),
        (item.daily_generation * 2.25).toFixed(0)
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Add keyboard shortcuts
document.addEventListener('keydown', function (e) {
    // Ctrl/Cmd + R for refresh
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        dashboard.refreshData();
    }

    // Ctrl/Cmd + N for new reading (focus on meter reading input)
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        const input = document.getElementById('today_reading');
        if (input) {
            input.focus();
        }
    }
});

// Add print functionality
function printDashboard() {
    window.print();
}

// Add responsive chart resize
// window.addEventListener('resize', function () {
//     if (dashboard && dashboard.chart) {
//         dashboard.chart.resize();
//     }
// });