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

//add product endpoint
app.post('/add_product', (req, res) => {

    // Prepare the data for insertion into the database
    const products = req.body.map(product => [
        product.item_name,
        parseInt(product.size_half_price) || 0,
        parseInt(product.size_one_price) || 0,
        parseInt(product.size_one_half_price) || 0,
        parseInt(product.size_two_price) || 0,
        parseInt(product.size_two_half_price) || 0,
        parseInt(product.size_three_price) || 0,
        parseInt(product.size_four_price) || 0,
        product.category, product.company
    ]);

    // Insert data into the database
    const sql = `INSERT INTO products (item_name, size_half_price, size_one_price, size_one_half_price, size_two_price, size_two_half_price, size_three_price, size_four_price, category, company) VALUES ?`;

    db.query(sql, [products], (err, result) => {
        if (err) {
            console.error('Database Error:', err);
            return res.status(500).json({ error: 'Failed to insert products into database' });
        }
        res.status(200).json({ message: 'Products added successfully', insertedRows: result.affectedRows });
    });
});

//submit the estimate
app.post('/add_readings', (req, res) => {
    const today_reading = parseInt(req.body.today_reading, 10);

    const date = new Date().toISOString().split('T')[0];
    let daily_generation;
    let lastReading;
    const retrieveQuery = 'SELECT daily_generation FROM readings ORDER BY date DESC LIMIT 1';

    db.query(retrieveQuery, (err, results) => {
        if (err) {
            console.error('Error retrieving last reading:', err);
            return res.status(500).json({ message: 'Failed to retrieve last reading.' });
        }

        if (results.length === 0) {
            lastReading = 0;
        } else {
            lastReading = results[0].daily_generation;
        }

        if (lastReading === undefined || lastReading === null || lastReading === 0) {
            lastReading = 0;
            daily_generation = 0;
        } else {
            daily_generation = today_reading - lastReading;
        }

        // console.log(today_reading, lastReading, date, daily_generation);

        // Insert the new reading
        const insertQuery = 'INSERT INTO readings (date, meter_reading, daily_generation) VALUES (?, ?, ?)';
        db.query(insertQuery, [date, today_reading, daily_generation], (err, result) => {
            if (err) {
                console.error('Error inserting new reading:', err);
                return res.status(500).json({ message: 'Failed to insert new reading.' });
            }
            res.render('add_reading', {
                message: 'Reading added successfully',
                date: date,
                meter_reading: today_reading,
                daily_generation: daily_generation
            });
        });
    });

});


app.get('/', (req, res) => {
    const query = `
        SELECT 
            date, meter_reading, daily_generation  
        FROM readings 
        ORDER BY date DESC
        LIMIT 10;
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching recent estimates:", err);
            return res.status(500).json({ error: 'Database query failed' });
        }
        res.render('temp', { reading: results, daily_generation: results[0]?.daily_generation || 0, });
    });
});

app.get('/all-products', (req, res) => {
    const sql = 'SELECT * FROM products';
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.render('products', { products: results });
    });
});

//product-selection
app.get('/product_selection', (req, res) => {
    const queryProducts = 'SELECT * FROM products';
    const queryCategories = 'SELECT DISTINCT category FROM products WHERE category IS NOT NULL';
    const queryCompanies = 'SELECT DISTINCT company FROM products WHERE company IS NOT NULL';

    db.query(queryProducts, (errProducts, resultsProducts) => {
        if (errProducts) throw errProducts;

        db.query(queryCategories, (errCategories, resultsCategories) => {
            if (errCategories) throw errCategories;

            db.query(queryCompanies, (errCompanies, resultsCompanies) => {
                if (errCompanies) throw errCompanies;

                const products = resultsProducts.map(product => {
                    const sizes = [
                        { label: '1/2"', price: product.size_half_price },
                        { label: '1"', price: product.size_one_price },
                        { label: '1 1/2"', price: product.size_one_half_price },
                        { label: '2"', price: product.size_two_price },
                        { label: '2 1/2"', price: product.size_two_half_price },
                        { label: '3"', price: product.size_three_price },
                        { label: '4"', price: product.size_four_price },
                    ].filter(size => size.price); // Exclude sizes with no price

                    return { ...product, sizes };
                });

                res.render('product_selection', {
                    products,
                    categories: resultsCategories.map(row => row.category),
                    companies: resultsCompanies.map(row => row.company),
                });
            });
        });
    });
});

app.get('/filter', (req, res) => {
    const { filterType, filterValue } = req.query;

    let query = 'SELECT * FROM products';
    const queryParams = [];

    if (filterType === 'category') {
        query += ' WHERE category = ?';
        queryParams.push(filterValue);
    } else if (filterType === 'company') {
        query += ' WHERE company = ?';
        queryParams.push(filterValue);
    } else if (filterType === 'all') {
        query;
        queryParams;
    } else {
        // Invalid filter type, return early
        return res.status(400).json({ error: 'Invalid filter type' });
    }

    db.query(query, queryParams, (err, results) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ error: 'Database query failed' });
        }

        const products = results.map(product => ({
            ...product,
            sizes: [
                { label: '1/2"', price: product.size_half_price },
                { label: '1"', price: product.size_one_price },
                { label: '1 1/2"', price: product.size_one_half_price },
                { label: '2"', price: product.size_two_price },
                { label: '2 1/2"', price: product.size_two_half_price },
                { label: '3"', price: product.size_three_price },
                { label: '4"', price: product.size_four_price },
            ],
        }));

        return res.json(products);
    });
});


//retrieve the estimate data
app.get('/estimate-details/:id', (req, res) => {
    const groupId = req.params.id;

    const query = `
        SELECT 
            ei.product_name AS productName, 
            ei.category, 
            ei.company, 
            ei.size, 
            ei.quantity, 
            ei.price, 
            ei.total 
        FROM estimate_items ei 
        WHERE ei.group_id = ?;
    `;

    db.query(query, [groupId], (err, results) => {
        if (err) {
            console.error("Error fetching estimate details:", err);
            return res.status(500).send("Internal Server Error");
        }

        // Send the details as JSON
        res.json(results);
    });
});


// Route to fetch all estimates
app.get('/estimates', (req, res) => {
    const query = `
        SELECT 
            eg.id AS group_id, 
            eg.person_name AS personName, 
            eg.grand_total AS grandTotal, 
            eg.created_at AS createdAt 
        FROM estimate_groups eg 
        ORDER BY eg.created_at DESC;
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error("Error fetching estimates:", err);
            return res.status(500).send("Internal Server Error");
        }

        // Render the estimates view
        res.render('estimates', { estimates: results });
    });
});

app.get('/add_readings', (req, res) => {
    res.render('add_reading');
});

// Start the server
app.listen(process.env.PORT, () => {
    console.log('Server started on http://localhost:3000');
});