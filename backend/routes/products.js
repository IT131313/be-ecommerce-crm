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

// Add rating to a product (only for users who have purchased it)
router.post('/:id/rating', authMiddleware, async (req, res) => {
  const { rating, review, orderId } = req.body;
  
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  if (!orderId) {
    return res.status(400).json({ error: 'Order ID is required' });
  }

  try {
    // Check if product exists
    const product = await db.get(
      'SELECT id FROM products WHERE id = ?',
      [req.params.id]
    );
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if user has purchased this product in the specified order
    const orderItem = await db.get(`
      SELECT oi.id 
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.product_id = ? AND o.id = ? AND o.user_id = ? AND o.status = 'completed'
    `, [req.params.id, orderId, req.user.id]);

    if (!orderItem) {
      return res.status(403).json({ 
        error: 'You can only rate products you have purchased and received' 
      });
    }

    // Check if user has already rated this product for this order
    const existingRating = await db.get(
      'SELECT id FROM product_ratings WHERE user_id = ? AND product_id = ? AND order_id = ?',
      [req.user.id, req.params.id, orderId]
    );

    if (existingRating) {
      return res.status(400).json({ error: 'You have already rated this product for this order' });
    }

    // Add the rating
    await db.run(
      'INSERT INTO product_ratings (user_id, product_id, order_id, rating, review) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, req.params.id, orderId, rating, review || null]
    );

    // Update product's average rating and rating count
    const ratingStats = await db.get(`
      SELECT 
        AVG(rating) as avg_rating,
        COUNT(*) as rating_count
      FROM product_ratings 
      WHERE product_id = ?
    `, [req.params.id]);

    await db.run(
      'UPDATE products SET rating = ?, rating_count = ? WHERE id = ?',
      [Math.round(ratingStats.avg_rating * 10) / 10, ratingStats.rating_count, req.params.id]
    );

    res.json({ 
      message: 'Rating added successfully',
      rating: rating,
      review: review
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product ratings
router.get('/:id/ratings', async (req, res) => {
  try {
    const ratings = await db.all(`
      SELECT 
        pr.rating,
        pr.review,
        pr.created_at,
        u.username
      FROM product_ratings pr
      JOIN users u ON pr.user_id = u.id
      WHERE pr.product_id = ?
      ORDER BY pr.created_at DESC
    `, [req.params.id]);

    // Get rating summary
    const summary = await db.get(`
      SELECT 
        AVG(rating) as average_rating,
        COUNT(*) as total_ratings,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
      FROM product_ratings 
      WHERE product_id = ?
    `, [req.params.id]);

    res.json({
      ratings: ratings,
      summary: {
        average_rating: summary.average_rating ? Math.round(summary.average_rating * 10) / 10 : 0,
        total_ratings: summary.total_ratings || 0,
        distribution: {
          5: summary.five_star || 0,
          4: summary.four_star || 0,
          3: summary.three_star || 0,
          2: summary.two_star || 0,
          1: summary.one_star || 0
        }
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's purchased products that can be rated
router.get('/user/rateable', authMiddleware, async (req, res) => {
  try {
    const rateableProducts = await db.all(`
      SELECT DISTINCT
        p.id,
        p.name,
        p.image_url,
        o.id as order_id,
        o.created_at as order_date,
        CASE 
          WHEN pr.id IS NOT NULL THEN 1 
          ELSE 0 
        END as already_rated
      FROM products p
      JOIN order_items oi ON p.id = oi.product_id
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN product_ratings pr ON (p.id = pr.product_id AND o.id = pr.order_id AND pr.user_id = ?)
      WHERE o.user_id = ? AND o.status = 'completed'
      ORDER BY o.created_at DESC
    `, [req.user.id, req.user.id]);

    res.json(rateableProducts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
