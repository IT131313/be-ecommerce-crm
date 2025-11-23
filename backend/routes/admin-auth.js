const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { adminAuthMiddleware } = require('../middleware/auth');
const { sendResetPinEmail } = require('../config/email');

// First-time admin self-setup
// - Allows creating the first admin when table is empty
// - Optionally guarded by ADMIN_SETUP_KEY for subsequent setups
router.post('/setup', async (req, res) => {
  const { email, password, name, setupKey } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Count existing admins
    const countRow = await db.get('SELECT COUNT(*) as count FROM admins');
    const adminsCount = Number(countRow?.count || 0);

    // If admins already exist, require valid setup key (if configured)
    if (adminsCount > 0) {
      const requiredKey = process.env.ADMIN_SETUP_KEY || '';
      if (!requiredKey || setupKey !== requiredKey) {
        return res.status(403).json({ error: 'Setup already completed' });
      }
    }

    // Check existing admin by email
    const existing = await db.get('SELECT id, password, name FROM admins WHERE email = ?', [email]);

    const hashedPassword = await bcrypt.hash(password, 10);
    const displayName = name || 'System Administrator';

    let adminId;
    if (existing) {
      const existingHash = existing.PASSWORD || existing.password;
      if (existingHash) {
        // Email already taken with valid password
        return res.status(400).json({ error: 'Email already in use' });
      }
      // Repair existing admin with empty/NULL password
      await db.run(
        'UPDATE admins SET password = ?, name = COALESCE(name, ?) WHERE email = ?',
        [hashedPassword, displayName, email]
      );
      adminId = existing.id;
    } else {
      const result = await db.run(
        'INSERT INTO admins (email, password, name, role) VALUES (?, ?, ?, ?)',
        [email, hashedPassword, displayName, 'admin']
      );
      adminId = result.lastID;
    }

    // Issue token for immediate use
    const token = jwt.sign(
      {
        id: adminId,
        email,
        name: displayName,
        role: 'admin',
        isAdmin: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.status(201).json({
      message: existing ? 'Admin repaired and ready' : 'Admin created successfully',
      token,
      admin: {
        id: adminId,
        email,
        name: displayName,
        role: 'admin'
      }
    });
  } catch (error) {
    console.error('Admin setup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

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

    // Guard: ensure password hash exists before comparing (handle driver casing)
    const storedHash = admin.PASSWORD || admin.password;
    if (!storedHash) {
      console.warn('Admin record missing password hash for email:', email);
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, storedHash);
    
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
router.get('/profile', adminAuthMiddleware, async (req, res) => {
  try {
    const admin = await db.get(
      'SELECT id, email, name, role, created_at FROM admins WHERE id = ?',
      [req.user.id]
    );

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    res.json({ admin });
  } catch (error) {
    console.error('Admin profile error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

// Admin logout
router.post('/logout', adminAuthMiddleware, async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(400).json({ error: 'Token not provided' });
    }

    // Get exp from token
    const decoded = jwt.decode(token);
    let expiresAt = null;
    if (decoded && decoded.exp) {
      expiresAt = new Date(decoded.exp * 1000);
    }

    try {
      await db.run(
        'INSERT INTO revoked_tokens (token, expires_at) VALUES (?, ?)',
        [token, expiresAt]
      );
    } catch (e) {
      if (e && (e.code === 'ER_DUP_ENTRY' || e.errno === 1062)) {
        return res.json({ message: 'Logged out' });
      }
      throw e;
    }

    return res.json({ message: 'Logged out' });
  } catch (error) {
    console.error('Admin logout error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
