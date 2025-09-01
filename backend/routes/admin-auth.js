const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { sendResetPinEmail } = require('../config/email');

// Admin login endpoint
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const admin = await db.get(
      'SELECT * FROM admins WHERE email = ?',
      [email]
    );

    if (!admin) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, admin.password);
    
    if (!passwordMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        id: admin.id, 
        email: admin.email, 
        name: admin.name,
        role: 'admin',
        isAdmin: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' } // Admin sessions last longer
    );

    res.json({ 
      message: 'Admin login successful', 
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin forgot password endpoint
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const admin = await db.get('SELECT * FROM admins WHERE email = ?', [email]);
    
    if (!admin) {
      return res.status(400).json({ error: 'Admin email not found' });
    }

    const pin = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit PIN
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
    
    await db.run(
      'UPDATE admins SET reset_pin = ?, reset_pin_expiry = ? WHERE email = ?',
      [pin, expiry, email]
    );
    
    // Send PIN via email
    const emailResult = await sendResetPinEmail(email, pin);
    
    if (emailResult.success) {
      res.json({ message: 'PIN code sent to your admin email' });
    } else {
      res.status(500).json({ error: 'Failed to send email. Please try again.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin reset password endpoint
router.post('/reset-password', async (req, res) => {
  const { email, pin, newPassword, confirmNewPassword } = req.body;
  
  if (!email || !pin || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  try {
    const admin = await db.get(
      'SELECT * FROM admins WHERE email = ? AND reset_pin = ?',
      [email, pin]
    );

    if (!admin) {
      return res.status(400).json({ error: 'Invalid email or PIN' });
    }
    
    const now = new Date();
    if (!admin.reset_pin_expiry || now > admin.reset_pin_expiry) {
      return res.status(400).json({ error: 'PIN code expired' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.run(
      'UPDATE admins SET password = ?, reset_pin = NULL, reset_pin_expiry = NULL WHERE email = ?',
      [hashedPassword, email]
    );
    
    res.json({ message: 'Admin password reset successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get admin profile (protected route)
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const admin = await db.get(
      'SELECT id, email, name, role, created_at FROM admins WHERE id = ?',
      [decoded.id]
    );

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({ admin });
  } catch (error) {
    console.error('Admin profile error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;