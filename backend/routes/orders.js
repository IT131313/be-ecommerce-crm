const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

// Get user's order history
router.get('/', authMiddleware, async (req, res) => {
  try {
    const orders = await db.all(`
      SELECT 
        o.id,
        o.total_amount,
        o.status,
        o.created_at,
        COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [req.user.id]);
    
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get order details by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    // Get order info
    const order = await db.get(`
      SELECT 
        o.id,
        o.total_amount,
        o.status,
        o.created_at,
        u.username,
        u.email
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = ? AND o.user_id = ?
    `, [req.params.id, req.user.id]);

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

// Cancel order
router.patch('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    // Check if order exists and belongs to user
    const order = await db.get(`
      SELECT id, status, user_id
      FROM orders
      WHERE id = ? AND user_id = ?
    `, [req.params.id, req.user.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if order can be cancelled
    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Order is already cancelled' });
    }

    if (order.status === 'completed' || order.status === 'shipped') {
      return res.status(400).json({ error: 'Cannot cancel completed or shipped orders' });
    }

    // Get order items to restore stock
    const orderItems = await db.all(`
      SELECT product_id, quantity
      FROM order_items
      WHERE order_id = ?
    `, [req.params.id]);

    // Update order status to cancelled
    await db.run(`
      UPDATE orders 
      SET status = 'cancelled' 
      WHERE id = ?
    `, [req.params.id]);

    // Restore product stock
    for (const item of orderItems) {
      await db.run(`
        UPDATE products 
        SET stock = stock + ?, sold = COALESCE(sold, 0) - ?
        WHERE id = ?
      `, [item.quantity, item.quantity, item.product_id]);
    }

    res.json({ 
      message: 'Order cancelled successfully',
      orderId: req.params.id
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status (admin functionality - can be extended later)
router.patch('/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body;
  
  const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'completed', 'cancelled'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const order = await db.get(`
      SELECT id, status as current_status
      FROM orders
      WHERE id = ? AND user_id = ?
    `, [req.params.id, req.user.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    await db.run(`
      UPDATE orders 
      SET status = ? 
      WHERE id = ?
    `, [status, req.params.id]);

    res.json({ 
      message: 'Order status updated successfully',
      orderId: req.params.id,
      newStatus: status
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;