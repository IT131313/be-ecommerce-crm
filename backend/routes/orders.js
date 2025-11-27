const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware, adminAuthMiddleware, userOnlyMiddleware } = require('../middleware/auth');
const { applyAutoTag } = require('../services/customerTags');

// Get orders list
// - Users: only their own orders
// - Admins: all orders
router.get('/', authMiddleware, async (req, res) => {
  try {
    let orders;

    if (req.user && req.user.isAdmin && req.user.role === 'admin') {
      // Admin: get all orders
      orders = await db.all(`
        SELECT 
          o.id,
          o.user_id,
          o.total_amount,
          o.shipping_cost,
          o.shipping_address,
          o.contact_phone,
          o.shipping_method,
          o.tracking_number,
          o.shipped_at,
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
    } else {
      // Regular user: only own orders
      orders = await db.all(`
        SELECT 
          o.id,
          o.total_amount,
          o.shipping_cost,
          o.shipping_address,
          o.contact_phone,
          o.shipping_method,
          o.tracking_number,
          o.shipped_at,
          o.status,
          o.created_at,
          COUNT(oi.id) as item_count
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = ?
        GROUP BY o.id
        ORDER BY o.created_at DESC
      `, [req.user.id]);
    }
    
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get order details by ID
// - Users: only their own order
// - Admins: any order
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    let order;
    // Get order info
    if (req.user && req.user.isAdmin && req.user.role === 'admin') {
      // Admin can view any order
      order = await db.get(`
        SELECT 
          o.id,
          o.user_id,
          o.total_amount,
          o.shipping_cost,
          o.shipping_address,
          o.contact_phone,
          o.shipping_method,
          o.tracking_number,
          o.shipped_at,
          o.status,
          o.created_at,
          u.username,
          u.email
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.id = ?
      `, [req.params.id]);
    } else {
      // Regular user: must own the order
      order = await db.get(`
        SELECT 
          o.id,
          o.total_amount,
          o.shipping_cost,
          o.shipping_address,
          o.contact_phone,
          o.shipping_method,
          o.tracking_number,
          o.shipped_at,
          o.status,
          o.created_at,
          u.username,
          u.email
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.id = ? AND o.user_id = ?
      `, [req.params.id, req.user.id]);
    }

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
router.patch('/:id/cancel', userOnlyMiddleware, async (req, res) => {
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
        SET stock = stock + ?
        WHERE id = ?
      `, [item.quantity, item.product_id]);
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

// Mark shipped order as completed (user confirms receipt)
router.patch('/:id/complete', userOnlyMiddleware, async (req, res) => {
  try {
    const order = await db.get(`
      SELECT id, status, user_id
      FROM orders
      WHERE id = ? AND user_id = ?
    `, [req.params.id, req.user.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status === 'completed') {
      return res.status(400).json({ error: 'Order already completed' });
    }

    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Cancelled orders cannot be completed' });
    }

    if (order.status !== 'shipped') {
      return res.status(400).json({ error: 'Order can only be completed after it has been shipped' });
    }

    await db.run(`
      UPDATE orders 
      SET status = 'completed'
      WHERE id = ?
    `, [req.params.id]);

    await db.run(`
      INSERT INTO warranty_tickets (order_id, user_id, product_id, issue_date, expiry_date)
      SELECT
        o.id,
        o.user_id,
        oi.product_id,
        CURDATE(),
        DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = ?
      ON DUPLICATE KEY UPDATE
        status = 'active',
        issue_date = VALUES(issue_date),
        expiry_date = VALUES(expiry_date)
    `, [req.params.id]);

    await applyAutoTag(order.user_id);

    res.json({
      message: 'Order marked as completed. Thank you for confirming receipt.',
      orderId: req.params.id,
      newStatus: 'completed'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status (admin functionality - can be extended later)
router.patch('/:id/status', adminAuthMiddleware, async (req, res) => {
  const { status } = req.body;
  
  const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'completed', 'cancelled'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // Admin can update any order status
    const order = await db.get(`
      SELECT id, user_id, status as current_status
      FROM orders
      WHERE id = ?
    `, [req.params.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    await db.run(`
      UPDATE orders 
      SET status = ? 
      WHERE id = ?
    `, [status, req.params.id]);

    if (['completed', 'shipped'].includes(status)) {
      await applyAutoTag(order.user_id);
    }

    if (status === 'completed' && order.current_status !== 'completed') {
      await db.run(`
        INSERT INTO warranty_tickets (order_id, user_id, product_id, issue_date, expiry_date)
        SELECT
        o.id,
        o.user_id,
        oi.product_id,
        CURDATE(),
        DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = ?
      ON DUPLICATE KEY UPDATE
        status = 'active',
          issue_date = VALUES(issue_date),
          expiry_date = VALUES(expiry_date)
      `, [req.params.id]);
    }

    res.json({ 
      message: 'Order status updated successfully by admin',
      orderId: req.params.id,
      newStatus: status
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
