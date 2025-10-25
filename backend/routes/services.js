const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware, adminAuthMiddleware, userOnlyMiddleware } = require('../middleware/auth');

// Get all services
router.get('/', async (req, res) => {
  try {
    const services = await db.all(`
      SELECT * FROM services
      ORDER BY category
    `);
    res.json(services);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get services by category
router.get('/category/:category', async (req, res) => {
  try {
    const services = await db.all(
      'SELECT * FROM services WHERE category = ?',
      [req.params.category]
    );
    res.json(services);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get service by ID
router.get('/:id', async (req, res) => {
  try {
    const service = await db.get(
      'SELECT * FROM services WHERE id = ?',
      [req.params.id]
    );
    
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }
    
    res.json(service);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add new service (protected route)
router.post('/', adminAuthMiddleware, async (req, res) => {
  const { name, description, category, price, imageUrl } = req.body;
  
  if (!name || !description || !category) {
    return res.status(400).json({ error: 'Name, description and category are required' });
  }

  try {
    await db.run(
      'INSERT INTO services (name, description, category, price, image_url) VALUES (?, ?, ?, ?, ?)',
      [name, description, category, price, imageUrl]
    );
    res.status(201).json({ message: 'Service added successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update service (protected route)
router.put('/:id', adminAuthMiddleware, async (req, res) => {
  const { name, description, category, price, imageUrl } = req.body;

  if ([name, description, category, price, imageUrl].every((value) => value === undefined)) {
    return res.status(400).json({ error: 'At least one field must be provided for update' });
  }

  let normalizedPrice = price;

  if (price !== undefined) {
    if (price === null) {
      normalizedPrice = null;
    } else {
      normalizedPrice = Number(price);
      if (Number.isNaN(normalizedPrice)) {
        return res.status(400).json({ error: 'Price must be a valid number' });
      }
    }
  }

  try {
    const existingService = await db.get(
      'SELECT id FROM services WHERE id = ?',
      [req.params.id]
    );

    if (!existingService) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const fields = [];
    const values = [];

    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name);
    }

    if (description !== undefined) {
      fields.push('description = ?');
      values.push(description);
    }

    if (category !== undefined) {
      fields.push('category = ?');
      values.push(category);
    }

    if (price !== undefined) {
      fields.push('price = ?');
      values.push(normalizedPrice);
    }

    if (imageUrl !== undefined) {
      fields.push('image_url = ?');
      values.push(imageUrl);
    }

    if (!fields.length) {
      return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    values.push(req.params.id);

    const updateQuery = `UPDATE services SET ${fields.join(', ')} WHERE id = ?`;
    await db.run(updateQuery, values);

    const updatedService = await db.get(
      'SELECT * FROM services WHERE id = ?',
      [req.params.id]
    );

    res.json({ message: 'Service updated successfully', service: updatedService });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete service (protected route)
router.delete('/:id', adminAuthMiddleware, async (req, res) => {
  try {
    const { changes } = await db.run(
      'DELETE FROM services WHERE id = ?',
      [req.params.id]
    );

    if (!changes) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;


