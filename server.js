// Main dashboard route
const express = require('express');
const bodyParser = require('body-parser');
const mysql2 = require('mysql2');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

// Create connection to MySQL
const db = mysql2.createConnection({
    host: process.env.HOST,
    user: process.env.USER,
    password: process.env.PASSWORD,
    database: process.env.DATABASE,
    port: process.env.DATABASE_PORT
});

// Connect to the database
db.connect(err => {
    if (err) throw err;
    console.log('MySQL Connected...');
});

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));


app.get('/', (req, res) => {
    const query = `
        SELECT
            date, meter_reading, daily_generation  
        FROM readings
        ORDER BY date DESC
        LIMIT 30
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching readings:", err);
            return res.status(500).json({ error: 'Database query failed' });
        }

        // Calculate statistics
        const stats = calculateStats(results);

        res.render('dashboard', {
            readings: results,
            stats: stats,
            todayGeneration: results[0]?.daily_generation || 0,
            lastUpdate: results[0]?.date || new Date()
        });
    });
});

// API endpoint for chart data
app.get('/api/chart-data', (req, res) => {
    const query = `
        SELECT
            date, meter_reading, daily_generation  
        FROM readings
        ORDER BY date ASC
        LIMIT 30
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching chart data:", err);
            return res.status(500).json({ error: 'Database query failed' });
        }

        const chartData = results.map(reading => ({
            date: reading.date,
            meter_reading: parseFloat(reading.meter_reading) || 0,
            daily_generation: parseFloat(reading.daily_generation) || 0
        }));

        res.json(chartData);
    });
});

// API endpoint for dashboard statistics
app.get('/api/stats', (req, res) => {
    const queries = {
        total: 'SELECT SUM(daily_generation) as total_generation FROM readings',
        monthly: `SELECT SUM(daily_generation) as monthly_generation 
                  FROM readings 
                  WHERE date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
        today: `SELECT daily_generation, meter_reading 
                FROM readings 
                ORDER BY date DESC 
                LIMIT 1`,
        average: `SELECT AVG(daily_generation) as avg_generation 
                  FROM readings 
                  WHERE date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`
    };

    // Execute all queries
    Promise.all([
        new Promise((resolve, reject) => {
            db.query(queries.total, (err, results) => {
                if (err) reject(err);
                else resolve(results[0]?.total_generation || 0);
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queries.monthly, (err, results) => {
                if (err) reject(err);
                else resolve(results[0]?.monthly_generation || 0);
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queries.today, (err, results) => {
                if (err) reject(err);
                else resolve(results[0] || { daily_generation: 0, meter_reading: 0 });
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queries.average, (err, results) => {
                if (err) reject(err);
                else resolve(results[0]?.avg_generation || 0);
            });
        })
    ])
        .then(([totalGeneration, monthlyGeneration, todayData, avgGeneration]) => {
            const ratePerKwh = 15; // Rate per kWh in rupees
            const stats = {
                todayGeneration: parseFloat(todayData.daily_generation) || 0,
                totalGeneration: parseFloat(totalGeneration) || 0,
                monthlyGeneration: parseFloat(monthlyGeneration) || 0,
                currentMeterReading: parseFloat(todayData.meter_reading) || 0,
                totalSavings: (parseFloat(totalGeneration) || 0) * ratePerKwh,
                monthlySavings: (parseFloat(monthlyGeneration) || 0) * ratePerKwh,
                avgGeneration: parseFloat(avgGeneration) || 0,
                efficiency: calculateEfficiency(parseFloat(avgGeneration) || 0)
            };

            res.json(stats);
        })
        .catch(err => {
            console.error("Error fetching stats:", err);
            res.status(500).json({ error: 'Failed to fetch statistics' });
        });
});

// Submit reading with improved logic
app.post('/add_readings', (req, res) => {
    const today_reading = parseFloat(req.body.today_reading);
    const date = new Date().toISOString().split('T')[0];

    if (!today_reading || today_reading <= 0) {
        return res.status(400).json({ message: 'Invalid meter reading provided.' });
    }

    // Get the last meter reading (not daily generation)
    const retrieveQuery = 'SELECT meter_reading FROM readings ORDER BY date DESC LIMIT 1';

    db.query(retrieveQuery, (err, results) => {
        if (err) {
            console.error('Error retrieving last reading:', err);
            return res.status(500).json({ message: 'Failed to retrieve last reading.' });
        }

        let lastMeterReading = 0;
        let daily_generation = 0;

        if (results.length > 0) {
            lastMeterReading = parseFloat(results[0].meter_reading) || 0;
            daily_generation = today_reading - lastMeterReading;
        } else {
            // First reading - no daily generation can be calculated
            daily_generation = 0;
        }

        // Ensure daily generation is not negative
        if (daily_generation < 0) {
            return res.status(400).json({
                message: 'Invalid reading: Today\'s reading cannot be less than the previous reading.'
            });
        }

        // Insert the new reading
        const insertQuery = 'INSERT INTO readings (date, meter_reading, daily_generation) VALUES (?, ?, ?)';
        db.query(insertQuery, [date, today_reading, daily_generation], (err, result) => {
            if (err) {
                console.error('Error inserting new reading:', err);
                return res.status(500).json({ message: 'Failed to insert new reading.' });
            }

            // Check if it's an API request (JSON) or form submission
            if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
                res.json({
                    success: true,
                    message: 'Reading added successfully',
                    data: {
                        date: date,
                        meter_reading: today_reading,
                        daily_generation: daily_generation
                    }
                });
            } else {
                res.render('add_reading', {
                    message: 'Reading added successfully',
                    date: date,
                    meter_reading: today_reading,
                    daily_generation: daily_generation
                });
            }
        });
    });
});

// API endpoint to add reading via AJAX
app.post('/api/add_reading', (req, res) => {
    const today_reading = parseFloat(req.body.today_reading);
    const reading_date = req.body.date || new Date().toISOString().split('T')[0];

    if (!today_reading || today_reading <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Invalid meter reading provided.'
        });
    }

    // Get the last meter reading
    const retrieveQuery = 'SELECT meter_reading FROM readings WHERE date < ? ORDER BY date DESC LIMIT 1';

    db.query(retrieveQuery, [reading_date], (err, results) => {
        if (err) {
            console.error('Error retrieving last reading:', err);
            return res.status(500).json({
                success: false,
                message: 'Failed to retrieve last reading.'
            });
        }

        let lastMeterReading = 0;
        let daily_generation = 0;

        if (results.length > 0) {
            lastMeterReading = parseFloat(results[0].meter_reading) || 0;
            daily_generation = today_reading - lastMeterReading;
        }

        if (daily_generation < 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reading: Today\'s reading cannot be less than the previous reading.'
            });
        }

        // Check if reading already exists for this date
        const checkQuery = 'SELECT id FROM readings WHERE date = ?';
        db.query(checkQuery, [reading_date], (err, existing) => {
            if (err) {
                console.error('Error checking existing reading:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Database error.'
                });
            }

            if (existing.length > 0) {
                // Update existing reading
                const updateQuery = 'UPDATE readings SET meter_reading = ?, daily_generation = ? WHERE date = ?';
                db.query(updateQuery, [today_reading, daily_generation, reading_date], (err, result) => {
                    if (err) {
                        console.error('Error updating reading:', err);
                        return res.status(500).json({
                            success: false,
                            message: 'Failed to update reading.'
                        });
                    }

                    res.json({
                        success: true,
                        message: 'Reading updated successfully',
                        data: {
                            date: reading_date,
                            meter_reading: today_reading,
                            daily_generation: daily_generation
                        }
                    });
                });
            } else {
                // Insert new reading
                const insertQuery = 'INSERT INTO readings (date, meter_reading, daily_generation) VALUES (?, ?, ?)';
                db.query(insertQuery, [reading_date, today_reading, daily_generation], (err, result) => {
                    if (err) {
                        console.error('Error inserting new reading:', err);
                        return res.status(500).json({
                            success: false,
                            message: 'Failed to insert new reading.'
                        });
                    }

                    res.json({
                        success: true,
                        message: 'Reading added successfully',
                        data: {
                            date: reading_date,
                            meter_reading: today_reading,
                            daily_generation: daily_generation
                        }
                    });
                });
            }
        });
    });
});

// Helper function to calculate statistics
function calculateStats(readings) {
    if (!readings || readings.length === 0) {
        return {
            totalGeneration: 0,
            totalSavings: 0,
            avgGeneration: 0,
            efficiency: 0
        };
    }

    const totalGeneration = readings.reduce((sum, reading) =>
        sum + (parseFloat(reading.daily_generation) || 0), 0);

    const ratePerKwh = 15;
    const totalSavings = totalGeneration * ratePerKwh;
    const avgGeneration = totalGeneration / readings.length;
    const efficiency = calculateEfficiency(avgGeneration);

    return {
        totalGeneration,
        totalSavings,
        avgGeneration,
        efficiency
    };
}

// Helper function to calculate efficiency percentage
function calculateEfficiency(avgGeneration) {
    // Assuming optimal generation is around 30 kWh per day
    const optimalGeneration = 30;
    const efficiency = Math.min(100, (avgGeneration / optimalGeneration) * 100);
    return Math.round(efficiency * 10) / 10; // Round to 1 decimal place
}

// API endpoint to delete a reading
app.delete('/api/readings/:date', (req, res) => {
    const date = req.params.date;

    const deleteQuery = 'DELETE FROM readings WHERE date = ?';
    db.query(deleteQuery, [date], (err, result) => {
        if (err) {
            console.error('Error deleting reading:', err);
            return res.status(500).json({
                success: false,
                message: 'Failed to delete reading.'
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Reading not found.'
            });
        }

        res.json({
            success: true,
            message: 'Reading deleted successfully'
        });
    });
});
