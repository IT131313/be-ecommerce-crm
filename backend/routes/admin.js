const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { adminAuthMiddleware } = require('../middleware/auth');

// Create new user (admin only)
router.post('/users', adminAuthMiddleware, async (req, res) => {
  const { email, username, password, confirmPassword } = req.body;
  
  if (!email || !username || !password || !confirmPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    // Check if user already exists
    const existingUser = await db.get(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    
    if (existingUser) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const result = await db.run(
      'INSERT INTO users (email, username, password) VALUES (?, ?, ?)',
      [email, username, hashedPassword]
    );
    
    res.status(201).json({ 
      message: 'User created successfully by admin',
      userId: result.lastID,
      user: {
        id: result.lastID,
        email,
        username
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users (admin only)
router.get('/users', adminAuthMiddleware, async (req, res) => {
  try {
    const users = await db.all(`
      SELECT id, email, username, created_at 
      FROM users 
      ORDER BY created_at DESC
    `);
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific user by ID (admin only)
router.get('/users/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const user = await db.get(`
      SELECT id, email, username, created_at 
      FROM users 
      WHERE id = ?
    `, [req.params.id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's order count and total spent
    const userStats = await db.get(`
      SELECT 
        COUNT(o.id) as total_orders,
        COALESCE(SUM(o.total_amount), 0) as total_spent
      FROM orders o
      WHERE o.user_id = ?
    `, [req.params.id]);
    
    res.json({
      ...user,
      stats: userStats
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user (admin only)
router.put('/users/:id', adminAuthMiddleware, async (req, res) => {
  const { email, username } = req.body;
  
  if (!email || !username) {
    return res.status(400).json({ error: 'Email and username are required' });
  }

  try {
    const user = await db.get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email or username already exists for other users
    const existingUser = await db.get(
      'SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?',
      [email, username, req.params.id]
    );
    
    if (existingUser) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    await db.run(`
      UPDATE users 
      SET email = ?, username = ?
      WHERE id = ?
    `, [email, username, req.params.id]);
    
    res.json({ 
      message: 'User updated successfully by admin',
      user: {
        id: req.params.id,
        email,
        username
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset user password (admin only)
router.patch('/users/:id/reset-password', adminAuthMiddleware, async (req, res) => {
  const { newPassword, confirmPassword } = req.body;
  
  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'New password and confirmation are required' });
  }
  
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    const user = await db.get('SELECT id, email FROM users WHERE id = ?', [req.params.id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password and clear any existing reset pins
    await db.run(`
      UPDATE users 
      SET password = ?, reset_pin = NULL, reset_pin_expiry = NULL
      WHERE id = ?
    `, [hashedPassword, req.params.id]);
    
    res.json({ 
      message: 'User password reset successfully by admin',
      userEmail: user.email
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all orders (admin only)
router.get('/orders', adminAuthMiddleware, async (req, res) => {
  try {
    const orders = await db.all(`
      SELECT 
        o.id,
        o.user_id,
        o.total_amount,
        o.status,
        o.created_at,
        u.username,
        u.email,
        COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN users u ON o.user_id = u.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get order details by ID (admin only)
router.get('/orders/:id', adminAuthMiddleware, async (req, res) => {
  try {
    // Get order info
    const order = await db.get(`
      SELECT 
        o.id,
        o.user_id,
        o.total_amount,
        o.status,
        o.created_at,
        u.username,
        u.email
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `, [req.params.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items
    const orderItems = await db.all(`
      SELECT 
        oi.id,
        oi.quantity,
        oi.price_at_time,
        p.id as product_id,
        p.name as product_name,
        p.image_url,
        p.category,
        (oi.quantity * oi.price_at_time) as subtotal
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [req.params.id]);

    res.json({
      ...order,
      items: orderItems
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dashboard statistics (admin only)
router.get('/dashboard/stats', adminAuthMiddleware, async (req, res) => {
  try {
    // Get total users
    const totalUsers = await db.get('SELECT COUNT(*) as count FROM users');
    
    // Get total orders
    const totalOrders = await db.get('SELECT COUNT(*) as count FROM orders');
    
    // Get total revenue
    const totalRevenue = await db.get(`
      SELECT COALESCE(SUM(total_amount), 0) as revenue 
      FROM orders 
      WHERE status IN ('completed', 'shipped')
    `);
    
    // Get total products
    const totalProducts = await db.get('SELECT COUNT(*) as count FROM products');
    
    // Get recent orders
    const recentOrders = await db.all(`
      SELECT 
        o.id,
        o.total_amount,
        o.status,
        o.created_at,
        u.username
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 5
    `);

    res.json({
      totalUsers: totalUsers.count,
      totalOrders: totalOrders.count,
      totalRevenue: totalRevenue.revenue,
      totalProducts: totalProducts.count,
      recentOrders
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user (admin only)
router.delete('/users/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const user = await db.get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product (admin only)
router.put('/products/:id', adminAuthMiddleware, async (req, res) => {
  const { name, description, category, price, imageUrl, stock } = req.body;
  
  if (!name || !category || !price) {
    return res.status(400).json({ error: 'Name, category and price are required' });
  }

  try {
    const product = await db.get('SELECT id FROM products WHERE id = ?', [req.params.id]);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await db.run(`
      UPDATE products 
      SET name = ?, description = ?, category = ?, price = ?, image_url = ?, stock = ?
      WHERE id = ?
    `, [name, description, category, price, imageUrl, stock, req.params.id]);
    
    res.json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete product (admin only)
router.delete('/products/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const product = await db.get('SELECT id FROM products WHERE id = ?', [req.params.id]);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;