
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { userOnlyMiddleware } = require('../middleware/auth');
const { sendResetPinEmail } = require('../config/email');
const { OAuth2Client } = require('google-auth-library');

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

async function generateUniqueUsername(base) {
  let username = base;
  let counter = 0;
  // Ensure alphanumeric + underscores only, and reasonable length
  username = (username || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20) || 'user';

  // Try base, then base1, base2, ... until available
  while (true) {
    const candidate = counter === 0 ? username : `${username}${counter}`;
    const exists = await db.get('SELECT id FROM users WHERE username = ?', [candidate]);
    if (!exists) return candidate;
    counter += 1;
  }
}

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
      'INSERT INTO users (email, username, password, customer_tag, customer_tag_source) VALUES (?, ?, ?, ?, "auto")',
      [email, username, hashedPassword, 'prospect_new']
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
 
// Logout endpoint (user)
router.post('/logout', userOnlyMiddleware, async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(400).json({ error: 'Token not provided' });
    }

    // Derive expiry from token payload if present
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
      // If duplicate (already revoked), still respond success
      // MySQL error code for duplicate key is ER_DUP_ENTRY (1062)
      if (e && (e.code === 'ER_DUP_ENTRY' || e.errno === 1062)) {
        return res.json({ message: 'Logged out' });
      }
      throw e;
    }

    return res.json({ message: 'Logged out' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Google Sign-In (no Firebase) — verify ID token then login/register
router.post('/google', async (req, res) => {
  try {
    if (!googleClientId) {
      return res.status(500).json({ error: 'Google Sign-In not configured (missing GOOGLE_CLIENT_ID)' });
    }

    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    // Verify ID token against configured audience (your Web Client ID)
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const {
      sub: googleSub,
      email,
      email_verified: emailVerified,
      name,
      picture,
    } = payload;

    if (!email || emailVerified === false) {
      return res.status(400).json({ error: 'Google account email not verified' });
    }

    // Find or create user by email
    let user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      // Create a new user with generated username and random password
      const baseFromEmail = email.split('@')[0];
      const username = await generateUniqueUsername(baseFromEmail);
      const bcrypt = require('bcryptjs');
      const randomPassword = require('crypto').randomBytes(24).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      await db.run(
        'INSERT INTO users (email, username, password) VALUES (?, ?, ?)',
        [email, username, hashedPassword]
      );
      user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    }

    // Issue our own JWT for session/auth in this app
    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, provider: 'google' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.json({ message: 'Google login successful', token });
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(401).json({ error: 'Failed to verify Google token' });
  }
});
