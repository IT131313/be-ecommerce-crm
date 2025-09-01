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

module.exports = router;