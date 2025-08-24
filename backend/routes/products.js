const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await db.all(`
      SELECT * FROM products
      ORDER BY category, name
    `);
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get products by category
router.get('/category/:category', async (req, res) => {
  try {
    const products = await db.all(
      'SELECT * FROM products WHERE category = ? ORDER BY name',
      [req.params.category]
    );
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add new product (protected route)
router.post('/', authMiddleware, async (req, res) => {
  const { name, description, category, price, imageUrl } = req.body;
  
  if (!name || !category || !price) {
    return res.status(400).json({ error: 'Name, category and price are required' });
  }

  try {
    await db.run(
      'INSERT INTO products (name, description, category, price, image_url) VALUES (?, ?, ?, ?, ?)',
      [name, description, category, price, imageUrl]
    );
    res.status(201).json({ message: 'Product added successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product stock (protected route)
router.patch('/:id/stock', authMiddleware, async (req, res) => {
  const { stock } = req.body;
  
  if (typeof stock !== 'number') {
    return res.status(400).json({ error: 'Stock must be a number' });
  }

  try {
    await db.run(
      'UPDATE products SET stock = ? WHERE id = ?',
      [stock, req.params.id]
    );
    res.json({ message: 'Stock updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
