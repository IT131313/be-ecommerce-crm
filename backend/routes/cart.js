const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { userOnlyMiddleware } = require('../middleware/auth');

// Get user's cart
router.get('/', userOnlyMiddleware, async (req, res) => {
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
router.post('/add', userOnlyMiddleware, async (req, res) => {
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
router.patch('/update/:itemId', userOnlyMiddleware, async (req, res) => {
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
router.post('/checkout', userOnlyMiddleware, async (req, res) => {
  try {
    const {
      shippingAddress,
      contactPhone,
      shipping_address,
      contact_phone,
      shippingMethod,
      shipping_method
    } = req.body || {};

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

    const userProfile = await db.get(
      'SELECT address, phone FROM users WHERE id = ?',
      [req.user.id]
    );

    let finalShippingAddress = shippingAddress ?? shipping_address ?? userProfile?.address ?? null;
    let finalContactPhone = contactPhone ?? contact_phone ?? userProfile?.phone ?? null;
    let finalShippingMethod = (shippingMethod ?? shipping_method ?? null);

    if (finalShippingMethod !== null && finalShippingMethod !== undefined) {
      finalShippingMethod = String(finalShippingMethod).trim().toUpperCase();
    }

    const allowedMethods = ['JNE', 'JNT'];
    if (!finalShippingMethod || !allowedMethods.includes(finalShippingMethod)) {
      return res.status(400).json({ error: 'Shipping method must be either JNE or JNT' });
    }

    if (finalShippingAddress !== null && finalShippingAddress !== undefined) {
      finalShippingAddress = String(finalShippingAddress).trim();
      if (!finalShippingAddress) {
        finalShippingAddress = null;
      }
    }

    if (finalContactPhone !== null && finalContactPhone !== undefined) {
      finalContactPhone = String(finalContactPhone).trim();
      if (!finalContactPhone) {
        finalContactPhone = null;
      }
    }

    if (!finalShippingAddress || !finalContactPhone) {
      return res.status(400).json({
        error: 'Shipping address and contact phone are required. Update your profile if they are missing.'
      });
    }

    if (finalShippingAddress.length > 500) {
      return res.status(400).json({ error: 'Shipping address cannot exceed 500 characters' });
    }

    const phoneDigits = finalContactPhone.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      return res.status(400).json({ error: 'Contact phone must be between 7 and 15 digits' });
    }

    if (!/^[0-9+()\-\s]+$/.test(finalContactPhone)) {
      return res.status(400).json({ error: 'Contact phone contains invalid characters' });
    }

    // Create order
    const orderResult = await db.run(
      'INSERT INTO orders (user_id, total_amount, shipping_address, contact_phone, shipping_method) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, totalAmount, finalShippingAddress, finalContactPhone, finalShippingMethod]
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
      orderId: orderResult.lastID,
      shippingAddress: finalShippingAddress,
      contactPhone: finalContactPhone,
      shippingMethod: finalShippingMethod,
      totalAmount
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove item from cart
router.delete('/remove/:itemId', userOnlyMiddleware, async (req, res) => {
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
