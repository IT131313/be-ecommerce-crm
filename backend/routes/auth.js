
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { sendResetPinEmail } = require('../config/email');

// Register endpoint
router.post('/register', async (req, res) => {
  const { email, username, password, confirmPassword } = req.body;
  
  if (!email || !username || !password || !confirmPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const existingUser = await db.get(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    
    if (existingUser) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    await db.run(
      'INSERT INTO users (email, username, password) VALUES (?, ?, ?)',
      [email, username, hashedPassword]
    );
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  const { emailOrUsername, password } = req.body;
  
  if (!emailOrUsername || !password) {
    return res.status(400).json({ error: 'Email/Username and password are required' });
  }

  try {
    const user = await db.get(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [emailOrUsername, emailOrUsername]
    );

    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    if (!user.password && !user.PASSWORD) {
      console.error('User password is null/undefined:', user);
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.PASSWORD || user.password);
    
    if (!passwordMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ message: 'Login successful', token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Forgot password endpoint
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    
    if (!user) {
      return res.status(400).json({ error: 'Email not found' });
    }

    const pin = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit PIN
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
    
    await db.run(
      'UPDATE users SET reset_pin = ?, reset_pin_expiry = ? WHERE email = ?',
      [pin, expiry, email]
    );
    
    // Send PIN via email
    const emailResult = await sendResetPinEmail(email, pin);
    
    if (emailResult.success) {
      res.json({ message: 'PIN code sent to your email' });
    } else {
      res.status(500).json({ error: 'Failed to send email. Please try again.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password endpoint
router.post('/reset-password', async (req, res) => {
  const { email, pin, newPassword, confirmNewPassword } = req.body;
  
  if (!email || !pin || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  try {
    const user = await db.get(
      'SELECT * FROM users WHERE email = ? AND reset_pin = ?',
      [email, pin]
    );

    if (!user) {
      return res.status(400).json({ error: 'Invalid email or PIN' });
    }
    const now = new Date();
    
    if (!user.reset_pin_expiry || now > user.reset_pin_expiry) {
      return res.status(400).json({ error: 'PIN code expired' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.run(
      'UPDATE users SET password = ?, reset_pin = NULL, reset_pin_expiry = NULL WHERE email = ?',
      [hashedPassword, email]
    );
    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
