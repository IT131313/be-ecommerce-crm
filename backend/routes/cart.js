const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

// Get user's cart
router.get('/', authMiddleware, async (req, res) => {
  try {
    const cartItems = await db.all(`
      SELECT 
        cart_items.id,
        cart_items.quantity,
        products.id as product_id,
        products.name,
        products.price,
        products.image_url,
        products.stock
      FROM cart_items
      JOIN products ON cart_items.product_id = products.id
      WHERE cart_items.user_id = ?
    `, [req.user.id]);
    
    res.json(cartItems);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add item to cart
router.post('/add', authMiddleware, async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  
  if (!productId) {
    return res.status(400).json({ error: 'Product ID is required' });
  }

  try {
    // Check if product exists and has enough stock
    const product = await db.get(
      'SELECT id, stock FROM products WHERE id = ?',
      [productId]
    );
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Not enough stock available' });
    }

    // Check if item already in cart
    const existingItem = await db.get(
      'SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?',
      [req.user.id, productId]
    );

    if (existingItem) {
      // Update quantity if total doesn't exceed stock
      const newQuantity = existingItem.quantity + quantity;
      if (newQuantity > product.stock) {
        return res.status(400).json({ error: 'Not enough stock available' });
      }
      
      await db.run(
        'UPDATE cart_items SET quantity = ? WHERE id = ?',
        [newQuantity, existingItem.id]
      );
    } else {
      // Add new item to cart
      await db.run(
        'INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)',
        [req.user.id, productId, quantity]
      );
    }

    // Get updated cart item with product details
    const updatedCart = await db.all(`
      SELECT 
        cart_items.id,
        cart_items.quantity,
        products.id as product_id,
        products.name,
        products.price,
        products.image_url,
        products.stock
      FROM cart_items
      JOIN products ON cart_items.product_id = products.id
      WHERE cart_items.user_id = ?
    `, [req.user.id]);

    res.json({ 
      message: 'Item added to cart successfully',
      cart: updatedCart
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update cart item quantity
router.patch('/update/:itemId', authMiddleware, async (req, res) => {
  const { quantity } = req.body;
  
  if (typeof quantity !== 'number' || quantity < 0) {
    return res.status(400).json({ error: 'Valid quantity is required' });
  }

  try {
    const cartItem = await db.get(
      'SELECT product_id FROM cart_items WHERE id = ? AND user_id = ?',
      [req.params.itemId, req.user.id]
    );
    
    if (!cartItem) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    // Check stock availability
    const product = await db.get(
      'SELECT stock FROM products WHERE id = ?',
      [cartItem.product_id]
    );
    
    if (quantity > product.stock) {
      return res.status(400).json({ error: 'Not enough stock available' });
    }

    if (quantity === 0) {
      await db.run(
        'DELETE FROM cart_items WHERE id = ?',
        [req.params.itemId]
      );
    } else {
      await db.run(
        'UPDATE cart_items SET quantity = ? WHERE id = ?',
        [quantity, req.params.itemId]
      );
    }

    // Get updated cart item with product details
    const updatedCart = await db.all(`
      SELECT 
        cart_items.id,
        cart_items.quantity,
        products.id as product_id,
        products.name,
        products.price,
        products.image_url,
        products.stock
      FROM cart_items
      JOIN products ON cart_items.product_id = products.id
      WHERE cart_items.user_id = ?
    `, [req.user.id]);

    res.json({ 
      message: 'Cart updated successfully',
      cart: updatedCart
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Checkout
router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    // Get cart items
    const cartItems = await db.all(`
      SELECT 
        cart_items.quantity,
        products.id as product_id,
        products.price,
        products.stock
      FROM cart_items
      JOIN products ON cart_items.product_id = products.id
      WHERE cart_items.user_id = ?
    `, [req.user.id]);

    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Verify stock availability
    for (const item of cartItems) {
      if (item.quantity > item.stock) {
        return res.status(400).json({ 
          error: 'Some items are no longer in stock',
          productId: item.product_id
        });
      }
    }

    // Calculate total amount
    const totalAmount = cartItems.reduce((sum, item) => 
      sum + (item.price * item.quantity), 0
    );

    // Create order
    const orderResult = await db.run(
      'INSERT INTO orders (user_id, total_amount) VALUES (?, ?)',
      [req.user.id, totalAmount]
    );

    // Add order items and update product stock
    for (const item of cartItems) {
      await db.run(
        'INSERT INTO order_items (order_id, product_id, quantity, price_at_time) VALUES (?, ?, ?, ?)',
        [orderResult.lastID, item.product_id, item.quantity, item.price]
      );

      await db.run(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
    }

    // Clear cart
    await db.run(
      'DELETE FROM cart_items WHERE user_id = ?',
      [req.user.id]
    );

    res.json({ 
      message: 'Order placed successfully',
      orderId: orderResult.lastID
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove item from cart
router.delete('/remove/:itemId', authMiddleware, async (req, res) => {
  try {
    const cartItem = await db.get(
      'SELECT id FROM cart_items WHERE id = ? AND user_id = ?',
      [req.params.itemId, req.user.id]
    );
    
    if (!cartItem) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    await db.run(
      'DELETE FROM cart_items WHERE id = ?',
      [req.params.itemId]
    );

    // Get updated cart
    const updatedCart = await db.all(`
      SELECT 
        cart_items.id,
        cart_items.quantity,
        products.id as product_id,
        products.name,
        products.price,
        products.image_url,
        products.stock
      FROM cart_items
      JOIN products ON cart_items.product_id = products.id
      WHERE cart_items.user_id = ?
    `, [req.user.id]);

    res.json({ 
      message: 'Item removed from cart successfully',
      cart: updatedCart
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
