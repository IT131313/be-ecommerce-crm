const express = require('express');
const router = express.Router();
const db = require('../config/database');
const authMiddleware = require('../middleware/auth');

// Get all consultation types
router.get('/types', async (req, res) => {
  try {
    const types = await db.all('SELECT * FROM consultation_types ORDER BY id');
    res.json(types);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all design categories
router.get('/design-categories', async (req, res) => {
  try {
    const categories = await db.all('SELECT * FROM design_categories ORDER BY id');
    res.json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all design styles
router.get('/design-styles', async (req, res) => {
  try {
    const styles = await db.all('SELECT * FROM design_styles ORDER BY id');
    res.json(styles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new consultation (protected route)
router.post('/', authMiddleware, async (req, res) => {
  const {
    serviceId,
    consultationTypeId,
    designCategoryId,
    designStyleId,
    consultationDate,
    consultationTime,
    address,
    notes
  } = req.body;

  // Validation
  if (!serviceId || !consultationTypeId || !designCategoryId || !designStyleId || !consultationDate) {
    return res.status(400).json({ 
      error: 'Service ID, consultation type, design category, design style, and consultation date are required' 
    });
  }

  try {
    // Verify service exists
    const service = await db.get('SELECT id FROM services WHERE id = ?', [serviceId]);
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Verify consultation type exists
    const consultationType = await db.get('SELECT id FROM consultation_types WHERE id = ?', [consultationTypeId]);
    if (!consultationType) {
      return res.status(404).json({ error: 'Consultation type not found' });
    }

    // Verify design category exists
    const designCategory = await db.get('SELECT id FROM design_categories WHERE id = ?', [designCategoryId]);
    if (!designCategory) {
      return res.status(404).json({ error: 'Design category not found' });
    }

    // Verify design style exists
    const designStyle = await db.get('SELECT id FROM design_styles WHERE id = ?', [designStyleId]);
    if (!designStyle) {
      return res.status(404).json({ error: 'Design style not found' });
    }

    // Insert consultation
    const result = await db.run(`
      INSERT INTO consultations (
        user_id, service_id, consultation_type_id, design_category_id, 
        design_style_id, consultation_date, consultation_time, address, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.userId,
      serviceId,
      consultationTypeId,
      designCategoryId,
      designStyleId,
      consultationDate,
      consultationTime,
      address,
      notes
    ]);

    res.status(201).json({ 
      message: 'Consultation scheduled successfully',
      consultationId: result.lastID
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's consultations (protected route)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const consultations = await db.all(`
      SELECT 
        c.*,
        s.name as service_name,
        s.description as service_description,
        ct.name as consultation_type_name,
        dc.name as design_category_name,
        ds.name as design_style_name
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      JOIN consultation_types ct ON c.consultation_type_id = ct.id
      JOIN design_categories dc ON c.design_category_id = dc.id
      JOIN design_styles ds ON c.design_style_id = ds.id
      WHERE c.user_id = ?
      ORDER BY c.created_at DESC
    `, [req.user.userId]);

    res.json(consultations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific consultation by ID (protected route)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const consultation = await db.get(`
      SELECT 
        c.*,
        s.name as service_name,
        s.description as service_description,
        s.image_url as service_image,
        ct.name as consultation_type_name,
        ct.description as consultation_type_description,
        dc.name as design_category_name,
        dc.image_url as design_category_image,
        ds.name as design_style_name,
        ds.image_url as design_style_image
      FROM consultations c
      JOIN services s ON c.service_id = s.id
      JOIN consultation_types ct ON c.consultation_type_id = ct.id
      JOIN design_categories dc ON c.design_category_id = dc.id
      JOIN design_styles ds ON c.design_style_id = ds.id
      WHERE c.id = ? AND c.user_id = ?
    `, [req.params.id, req.user.userId]);

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    res.json(consultation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update consultation status (protected route - for admin)
router.patch('/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  const validStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const result = await db.run(
      'UPDATE consultations SET status = ? WHERE id = ?',
      [status, req.params.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    res.json({ message: 'Consultation status updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel consultation (protected route)
router.patch('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const consultation = await db.get(
      'SELECT id, status FROM consultations WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );

    if (!consultation) {
      return res.status(404).json({ error: 'Consultation not found' });
    }

    if (consultation.status === 'completed' || consultation.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot cancel completed or already cancelled consultation' });
    }

    await db.run(
      'UPDATE consultations SET status = ? WHERE id = ?',
      ['cancelled', req.params.id]
    );

    res.json({ message: 'Consultation cancelled successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add consultation type (protected route - admin)
router.post('/types', authMiddleware, async (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await db.run(
      'INSERT INTO consultation_types (name, description) VALUES (?, ?)',
      [name, description]
    );

    res.status(201).json({ 
      message: 'Consultation type added successfully',
      id: result.lastID 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add design category (protected route - admin)
router.post('/design-categories', authMiddleware, async (req, res) => {
  const { name, imageUrl } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await db.run(
      'INSERT INTO design_categories (name, image_url) VALUES (?, ?)',
      [name, imageUrl]
    );

    res.status(201).json({ 
      message: 'Design category added successfully',
      id: result.lastID 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add design style (protected route - admin)
router.post('/design-styles', authMiddleware, async (req, res) => {
  const { name, imageUrl } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await db.run(
      'INSERT INTO design_styles (name, image_url) VALUES (?, ?)',
      [name, imageUrl]
    );

    res.status(201).json({ 
      message: 'Design style added successfully',
      id: result.lastID 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all consultations for admin (protected route - admin)
router.get('/admin/all', authMiddleware, async (req, res) => {
  try {
    const consultations = await db.all(`
      SELECT 
        c.*,
        u.username,
        u.email,
        s.name as service_name,
        ct.name as consultation_type_name,
        dc.name as design_category_name,
        ds.name as design_style_name
      FROM consultations c
      JOIN users u ON c.user_id = u.id
      JOIN services s ON c.service_id = s.id
      JOIN consultation_types ct ON c.consultation_type_id = ct.id
      JOIN design_categories dc ON c.design_category_id = dc.id
      JOIN design_styles ds ON c.design_style_id = ds.id
      ORDER BY c.created_at DESC
    `);

    res.json(consultations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;