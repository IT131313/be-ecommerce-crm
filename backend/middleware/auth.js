const jwt = require('jsonwebtoken');
const db = require('../config/database');

async function assertNotRevoked(token) {
  try {
    const row = await db.get(
      "SELECT id FROM revoked_tokens WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())",
      [token]
    );
    if (row) {
      const err = new Error('Token revoked');
      err.status = 401;
      throw err;
    }
  } catch (e) {
    if (e.status === 401) throw e;
    // On DB error, fail closed for safety
    const err = new Error('Authentication service unavailable');
    err.status = 401;
    throw err;
  }
}

// General authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check blacklist
    await assertNotRevoked(token);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    const isExpired = error && error.name === 'TokenExpiredError';
    const message = isExpired ? 'Token expired' : 'Invalid token';
    return res.status(error.status || 401).json({ error: message });
  }
};

// Admin-only authentication middleware
const adminAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check blacklist
    await assertNotRevoked(token);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.isAdmin || decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    const isExpired = error && error.name === 'TokenExpiredError';
    const message = isExpired ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: message });
  }
};

// User-only authentication middleware (blocks admin access)
const userOnlyMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check blacklist
    await assertNotRevoked(token);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.isAdmin) {
      return res.status(403).json({ error: 'User access only' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('User auth middleware error:', error);
    const isExpired = error && error.name === 'TokenExpiredError';
    const message = isExpired ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: message });
  }
};

module.exports = {
  authMiddleware,
  adminAuthMiddleware,
  userOnlyMiddleware
};
