const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { userOnlyMiddleware } = require('../middleware/auth');

// Get user profile (user only)
router.get('/profile', userOnlyMiddleware, async (req, res) => {
  try {
    const user = await db.get(`
      SELECT id, email, username, created_at 
      FROM users 
      WHERE id = ?
    `, [req.user.id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user statistics
    const stats = await db.get(`
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.total_amount), 0) as total_spent,
        COUNT(DISTINCT ci.id) as cart_items,
        COUNT(DISTINCT c.id) as consultations
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      LEFT JOIN cart_items ci ON u.id = ci.user_id
      LEFT JOIN consultations c ON u.id = c.user_id
      WHERE u.id = ?
    `, [req.user.id]);
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        created_at: user.created_at
      },
      stats: {
        total_orders: stats.total_orders || 0,
        total_spent: parseFloat(stats.total_spent) || 0,
        cart_items: stats.cart_items || 0,
        consultations: stats.consultations || 0
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile (user only)
router.patch('/profile', userOnlyMiddleware, async (req, res) => {
  const { email, username } = req.body;
  
  if (!email && !username) {
    return res.status(400).json({ error: 'At least one field (email or username) is required' });
  }

  try {
    // Get current user data
    const currentUser = await db.get(
      'SELECT email, username FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Use current values if not provided
    const newEmail = email || currentUser.email;
    const newUsername = username || currentUser.username;

    // Check if email or username already exists for other users
    if (email && email !== currentUser.email) {
      const existingEmail = await db.get(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, req.user.id]
      );
      
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    if (username && username !== currentUser.username) {
      const existingUsername = await db.get(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [username, req.user.id]
      );
      
      if (existingUsername) {
        return res.status(400).json({ error: 'Username already exists' });
      }
    }

    // Update user profile
    await db.run(`
      UPDATE users 
      SET email = ?, username = ?
      WHERE id = ?
    `, [newEmail, newUsername, req.user.id]);
    
    res.json({ 
      message: 'Profile updated successfully',
      user: {
        id: req.user.id,
        email: newEmail,
        username: newUsername
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change password (user only)
router.patch('/change-password', userOnlyMiddleware, async (req, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;
  
  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ error: 'New passwords do not match' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from current password' });
  }

  try {
    // Get user's current password
    const user = await db.get(
      'SELECT password FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password || user.PASSWORD);
    
    if (!passwordMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password and clear any existing reset pins
    await db.run(`
      UPDATE users 
      SET password = ?, reset_pin = NULL, reset_pin_expiry = NULL
      WHERE id = ?
    `, [hashedNewPassword, req.user.id]);
    
    res.json({ 
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user order history (user only)
router.get('/orders', userOnlyMiddleware, async (req, res) => {
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

// Get user consultations (user only)
router.get('/consultations', userOnlyMiddleware, async (req, res) => {
  try {
    const consultations = await db.all(`
      SELECT 
        c.id,
        c.consultation_date,
        c.consultation_time,
        c.status,
        c.created_at,
        s.name as service_name,
        ct.name as consultation_type,
        dc.name as design_category,
        ds.name as design_style
      FROM consultations c
      LEFT JOIN services s ON c.service_id = s.id
      LEFT JOIN consultation_types ct ON c.consultation_type_id = ct.id
      LEFT JOIN design_categories dc ON c.design_category_id = dc.id
      LEFT JOIN design_styles ds ON c.design_style_id = ds.id
      WHERE c.user_id = ?
      ORDER BY c.created_at DESC
    `, [req.user.id]);
    
    res.json(consultations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user account (user only)
router.delete('/account', userOnlyMiddleware, async (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password is required to delete account' });
  }

  try {
    // Get user's current password
    const user = await db.get(
      'SELECT password FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password || user.PASSWORD);
    
    if (!passwordMatch) {
      return res.status(400).json({ error: 'Password is incorrect' });
    }

    // Delete user account (this will cascade delete related data)
    await db.run('DELETE FROM users WHERE id = ?', [req.user.id]);
    
    res.json({ 
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;