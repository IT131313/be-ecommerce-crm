const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { adminAuthMiddleware } = require('../middleware/auth');
const { applyAutoTag, setManualTag, resetToAuto, TAGS, VALID_TAGS } = require('../services/customerTags');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');

const productUploadsDir = path.join(__dirname, '..', 'uploads', 'products');
fs.mkdirSync(productUploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, productUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const toStoredImagePath = (filename) => path.posix.join('uploads/products', filename);

async function deleteProductImage(relativePath) {
  if (!relativePath) {
    return;
  }

  const uploadsRoot = path.join(__dirname, '..', 'uploads', 'products');
  const absolutePath = path.resolve(path.join(__dirname, '..', relativePath));
  const normalizedRoot = path.normalize(uploadsRoot);
  const normalizedAbsolute = path.normalize(absolutePath);

  if (!normalizedAbsolute.startsWith(normalizedRoot)) {
    return;
  }

  try {
    await fsPromises.unlink(normalizedAbsolute);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to delete old product image:', error);
    }
  }
}

const TAG_ALIASES = {
  bermasalah: TAGS.NEEDS_ATTENTION,
  problematic: TAGS.NEEDS_ATTENTION,
  resiko: TAGS.NEEDS_ATTENTION,
  risiko: TAGS.NEEDS_ATTENTION,
  perlu_perhatian: TAGS.NEEDS_ATTENTION,
  loyal: TAGS.LOYAL,
  prospek_baru: TAGS.PROSPECT_NEW,
  prospect_new: TAGS.PROSPECT_NEW,
  prospect: TAGS.PROSPECT_NEW
};

function normalizeTagAlias(tag) {
  if (!tag) return null;
  const normalized = String(tag).toLowerCase();
  return TAG_ALIASES[normalized] || tag;
}

// Create new user (admin only)
router.post('/users', adminAuthMiddleware, async (req, res) => {
  const { email, username, password, confirmPassword, address, phone } = req.body || {};
  
  if (!email || !username || !password || !confirmPassword) {
    return res.status(400).json({ error: 'Email, username, password, and confirmation are required' });
  }
  
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  const sanitizeOptionalString = (value) => {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    return String(value).trim();
  };

  const sanitizedAddress = sanitizeOptionalString(address);
  const sanitizedPhone = sanitizeOptionalString(phone);

  if (sanitizedAddress && sanitizedAddress.length > 500) {
    return res.status(400).json({ error: 'Address cannot exceed 500 characters' });
  }

  let validatedPhone = sanitizedPhone;
  if (validatedPhone) {
    const digitsOnly = validatedPhone.replace(/[^0-9]/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      return res.status(400).json({ error: 'Phone number must be between 7 and 15 digits' });
    }
    if (!/^[0-9+()\-\s]+$/.test(validatedPhone)) {
      return res.status(400).json({ error: 'Phone number contains invalid characters' });
    }
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
      'INSERT INTO users (email, username, password, address, phone, customer_tag, customer_tag_source) VALUES (?, ?, ?, ?, ?, ?, "auto")',
      [email, username, hashedPassword, sanitizedAddress || null, validatedPhone || null, 'prospect_new']
    );
    
    res.status(201).json({ 
      message: 'User created successfully by admin',
      userId: result.lastID,
      user: {
        id: result.lastID,
        email,
        username,
        address: sanitizedAddress || null,
        phone: validatedPhone || null,
        customer_tag: 'prospect_new',
        customer_tag_source: 'auto'
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
      SELECT id, email, username, address, phone, customer_tag, customer_tag_source, created_at 
      FROM users 
      ORDER BY created_at DESC
    `);
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get customer segments with activity counts (admin only)
router.get('/customers/segments', adminAuthMiddleware, async (req, res) => {
  try {
    const customers = await db.all(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.customer_tag,
        u.customer_tag_source,
        u.created_at,
        COALESCE(o.completed_count, 0) AS completed_orders,
        COALESCE(c.claim_count, 0) AS warranty_claims
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS completed_count
        FROM orders
        WHERE status IN ('completed', 'shipped')
        GROUP BY user_id
      ) o ON o.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS claim_count
        FROM complaints
        GROUP BY user_id
      ) c ON c.user_id = u.id
      ORDER BY u.created_at DESC
    `);

    const enriched = [];
    for (const customer of customers) {
      if (customer.customer_tag_source !== 'manual') {
        const result = await applyAutoTag(customer.id);
        customer.customer_tag = result.tag || customer.customer_tag;
        customer.customer_tag_source = 'auto';
      }
      enriched.push(customer);
    }

    res.json({
      customers: enriched,
      tagOptions: {
        prospect_new: 'Prospek Baru',
        loyal: 'Loyal',
        needs_attention: 'Perlu Perhatian'
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific user by ID (admin only)
router.get('/users/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const user = await db.get(`
      SELECT id, email, username, address, phone, customer_tag, customer_tag_source, created_at 
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

// Manually adjust customer tag or reset to auto (admin only)
router.patch('/users/:id/tag', adminAuthMiddleware, async (req, res) => {
  try {
    const { tag, mode } = req.body || {};
    const normalizedTag = normalizeTagAlias(tag);
    const wantsAuto = (mode === 'auto') || (normalizedTag && String(normalizedTag).toLowerCase() === 'auto');

    if (wantsAuto) {
      const result = await resetToAuto(req.params.id);
      return res.json({
        message: 'Customer tag recalculated automatically',
        tag: result.tag,
        source: 'auto'
      });
    }

    if (!normalizedTag) {
      return res.status(400).json({ error: 'Tag is required (prospect_new, loyal, needs_attention)' });
    }

    const canonicalTag = normalizeTagAlias(normalizedTag);
    if (!VALID_TAGS.has(canonicalTag)) {
      return res.status(400).json({ error: 'Invalid tag. Use prospect_new, loyal, or needs_attention' });
    }

    const result = await setManualTag(req.params.id, canonicalTag);
    res.json({
      message: 'Customer tag updated',
      tag: result.tag,
      source: 'manual'
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
});

// Update user (admin only)
router.put('/users/:id', adminAuthMiddleware, async (req, res) => {
  const { email, username, address, phone } = req.body || {};
  
  if (!email || !username) {
    return res.status(400).json({ error: 'Email and username are required' });
  }

  const trimmedEmail = String(email).trim();
  const trimmedUsername = String(username).trim();

  if (!trimmedEmail) {
    return res.status(400).json({ error: 'Email cannot be empty' });
  }

  if (!trimmedUsername) {
    return res.status(400).json({ error: 'Username cannot be empty' });
  }

  const sanitizeOptionalString = (value) => {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    return String(value).trim();
  };

  const sanitizedAddress = sanitizeOptionalString(address);
  const sanitizedPhone = sanitizeOptionalString(phone);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (trimmedUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long' });
  }

  if (sanitizedAddress && sanitizedAddress.length > 500) {
    return res.status(400).json({ error: 'Address cannot exceed 500 characters' });
  }

  let validatedPhone = sanitizedPhone;
  if (validatedPhone) {
    const digitsOnly = validatedPhone.replace(/[^0-9]/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      return res.status(400).json({ error: 'Phone number must be between 7 and 15 digits' });
    }
    if (!/^[0-9+()\-\s]+$/.test(validatedPhone)) {
      return res.status(400).json({ error: 'Phone number contains invalid characters' });
    }
  }

  try {
    const user = await db.get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email or username already exists for other users
    const existingUser = await db.get(
      'SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?',
      [trimmedEmail, trimmedUsername, req.params.id]
    );
    
    if (existingUser) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    await db.run(`
      UPDATE users 
      SET email = ?, username = ?, address = ?, phone = ?
      WHERE id = ?
    `, [trimmedEmail, trimmedUsername, sanitizedAddress ?? null, validatedPhone ?? null, req.params.id]);
    
    res.json({ 
      message: 'User updated successfully by admin',
      user: {
        id: req.params.id,
        email: trimmedEmail,
        username: trimmedUsername,
        address: sanitizedAddress ?? null,
        phone: validatedPhone ?? null
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

// List orders pending shipment (address provided, not shipped)
router.get('/shipments/pending', adminAuthMiddleware, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT 
        o.id,
        o.user_id,
        o.total_amount,
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
  WHERE o.shipping_address IS NOT NULL 
        AND (o.tracking_number IS NULL OR o.tracking_number = '')
        AND o.status IN ('pending','confirmed')
      GROUP BY o.id
      ORDER BY o.created_at ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List orders with confirmed status awaiting shipment (no tracking yet)
router.get('/shipments/confirmed', adminAuthMiddleware, async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT 
        o.id,
        o.user_id,
        o.total_amount,
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
      WHERE o.shipping_address IS NOT NULL 
        AND (o.tracking_number IS NULL OR o.tracking_number = '')
        AND o.status = 'confirmed'
      GROUP BY o.id
      ORDER BY o.created_at ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set tracking number and auto-mark as shipped
router.patch('/orders/:id/ship', adminAuthMiddleware, async (req, res) => {
  try {
    let { trackingNumber } = req.body;

    if (trackingNumber === undefined || trackingNumber === null) {
      return res.status(400).json({ error: 'trackingNumber is required' });
    }

    trackingNumber = String(trackingNumber).trim();
    if (!trackingNumber) {
      return res.status(400).json({ error: 'trackingNumber cannot be empty' });
    }
    if (trackingNumber.length > 100) {
      return res.status(400).json({ error: 'trackingNumber too long (max 100 chars)' });
    }

    // Get order and validate state
    const order = await db.get(
      `SELECT id, status, shipping_address, tracking_number FROM orders WHERE id = ?`,
      [req.params.id]
    );
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (!order.shipping_address) {
      return res.status(400).json({ error: 'Shipping address not set by customer' });
    }
    if (order.status === 'cancelled' || order.status === 'completed') {
      return res.status(400).json({ error: `Cannot ship an order with status ${order.status}` });
    }
    if (order.status === 'shipped') {
      return res.status(400).json({ error: 'Order already shipped' });
    }

    await db.run(
      `UPDATE orders 
       SET tracking_number = ?, status = 'shipped', shipped_at = NOW()
       WHERE id = ?`,
      [trackingNumber, req.params.id]
    );

    res.json({ 
      message: 'Tracking number saved. Order marked as shipped.',
      orderId: Number(req.params.id),
      trackingNumber
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
        o.shipping_address,
        o.contact_phone,
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

// Add new product (admin only)
router.post('/products', adminAuthMiddleware, upload.single('image'), async (req, res) => {
  const body = req.body || {};
  const { name, description, category, price, imageUrl } = body;
  const stockRaw = body.stock;
  const uploadedImagePath = req.file ? toStoredImagePath(req.file.filename) : null;

  if (!name || !category || price === undefined || price === null || price === '') {
    if (uploadedImagePath) {
      await deleteProductImage(uploadedImagePath);
    }
    return res.status(400).json({ error: 'Name, category and price are required' });
  }

  const priceValue = Number(price);
  if (!Number.isFinite(priceValue) || priceValue < 0) {
    if (uploadedImagePath) {
      await deleteProductImage(uploadedImagePath);
    }
    return res.status(400).json({ error: 'Price must be a non-negative number' });
  }

  let stockValue = 0;
  if (stockRaw !== undefined && stockRaw !== null && stockRaw !== '') {
    stockValue = Number(stockRaw);
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      if (uploadedImagePath) {
        await deleteProductImage(uploadedImagePath);
      }
      return res.status(400).json({ error: 'Stock must be a non-negative integer' });
    }
  }

  let storedImagePath = imageUrl || null;
  if (uploadedImagePath) {
    storedImagePath = uploadedImagePath;
  }

  try {
    const result = await db.run(
      'INSERT INTO products (name, description, category, price, image_url, stock) VALUES (?, ?, ?, ?, ?, ?)',
      [name, description || null, category, priceValue, storedImagePath, stockValue]
    );

    const product = await db.get('SELECT * FROM products WHERE id = ?', [result.lastID]);

    return res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Create product error:', error);

    if (uploadedImagePath) {
      await deleteProductImage(uploadedImagePath);
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product (admin only)
router.put('/products/:id', adminAuthMiddleware, upload.single('image'), async (req, res) => {
  const productId = req.params.id;
  const uploadedImagePath = req.file ? toStoredImagePath(req.file.filename) : null;
  const body = req.body || {};

  let product;
  try {
    product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      if (uploadedImagePath) {
        await deleteProductImage(uploadedImagePath);
      }
      return res.status(404).json({ error: 'Product not found' });
    }
  } catch (error) {
    console.error('Fetch product error:', error);
    if (uploadedImagePath) {
      await deleteProductImage(uploadedImagePath);
    }
    return res.status(500).json({ error: 'Internal server error' });
  }

  const name = body.name !== undefined ? body.name : product.name;
  const description = body.description !== undefined ? body.description : product.description;
  const category = body.category !== undefined ? body.category : product.category;
  const priceRaw = body.price !== undefined && body.price !== null && body.price !== '' ? body.price : product.price;
  const stockRaw = body.stock !== undefined ? body.stock : product.stock;

  if (!name || !category) {
    if (uploadedImagePath) {
      await deleteProductImage(uploadedImagePath);
    }
    return res.status(400).json({ error: 'Name and category are required' });
  }

  const priceValue = Number(priceRaw);
  if (!Number.isFinite(priceValue) || priceValue < 0) {
    if (uploadedImagePath) {
      await deleteProductImage(uploadedImagePath);
    }
    return res.status(400).json({ error: 'Price must be a non-negative number' });
  }

  let stockValue = stockRaw;
  if (stockValue === '' || stockValue === null || stockValue === undefined) {
    stockValue = product.stock || 0;
  }
  stockValue = Number(stockValue);
  if (!Number.isInteger(stockValue) || stockValue < 0) {
    if (uploadedImagePath) {
      await deleteProductImage(uploadedImagePath);
    }
    return res.status(400).json({ error: 'Stock must be a non-negative integer' });
  }

  let imagePath = product.image_url;
  if (uploadedImagePath) {
    imagePath = uploadedImagePath;
  } else if (body.imageUrl !== undefined) {
    imagePath = body.imageUrl || null;
  }

  try {
    await db.run(
      'UPDATE products SET name = ?, description = ?, category = ?, price = ?, image_url = ?, stock = ? WHERE id = ?',
      [name, description || null, category, priceValue, imagePath, stockValue, productId]
    );

    if (product.image_url && imagePath !== product.image_url) {
      await deleteProductImage(product.image_url);
    }

    const updatedProduct = await db.get('SELECT * FROM products WHERE id = ?', [productId]);

    return res.json({
      message: 'Product updated successfully',
      product: updatedProduct
    });
  } catch (error) {
    console.error('Update product error:', error);

    if (uploadedImagePath) {
      await deleteProductImage(uploadedImagePath);
    }

    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete product (admin only)
router.delete('/products/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const product = await db.get('SELECT id, image_url FROM products WHERE id = ?', [req.params.id]);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);

    if (product.image_url) {
      await deleteProductImage(product.image_url);
    }

    return res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new admin (admin only)
router.post('/admins', adminAuthMiddleware, async (req, res) => {
  const { email, password, name, role } = req.body || {};

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, name and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    const existing = await db.get('SELECT id FROM admins WHERE email = ?', [email]);
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const finalRole = (role && String(role).toLowerCase() === 'admin') ? 'admin' : 'admin';

    const result = await db.run(
      'INSERT INTO admins (email, password, name, role) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, name, finalRole]
    );

    return res.status(201).json({
      message: 'Admin created successfully',
      admin: {
        id: result.lastID,
        email,
        name,
        role: finalRole
      }
    });
  } catch (error) {
    console.error('Create admin error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// List admins (admin only)
router.get('/admins', adminAuthMiddleware, async (req, res) => {
  try {
    const admins = await db.all(
      `SELECT id, email, name, role, created_at 
       FROM admins 
       ORDER BY created_at DESC`
    );
    return res.json(admins);
  } catch (error) {
    console.error('List admins error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete admin (admin only)
router.delete('/admins/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (Number.isNaN(targetId)) {
      return res.status(400).json({ error: 'Invalid admin id' });
    }

    // Cannot delete self
    if (req.user && Number(req.user.id) === targetId) {
      return res.status(400).json({ error: 'Cannot delete your own admin account' });
    }

    const existing = await db.get('SELECT id FROM admins WHERE id = ?', [targetId]);
    if (!existing) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Prevent deleting the last admin to avoid lockout
    const countRow = await db.get('SELECT COUNT(*) as count FROM admins');
    if (Number(countRow?.count || 0) <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last admin' });
    }

    await db.run('DELETE FROM admins WHERE id = ?', [targetId]);
    return res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    console.error('Delete admin error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
