const express = require('express');
const router = express.Router();
const db = require('../config/database');
const multer = require('multer');
const path = require('path');
const { authMiddleware, adminAuthMiddleware, userOnlyMiddleware } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/complaints/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'complaint-' + uniqueSuffix + path.extname(file.originalname))
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Get user's warranty tickets
router.get('/tickets', userOnlyMiddleware, async (req, res) => {
  try {
    const tickets = await db.all(`
      SELECT 
        wt.*,
        p.name as product_name,
        p.image_url as product_image,
        o.id as order_id,
        o.created_at as order_date,
        CASE 
          WHEN wt.expiry_date < CURDATE() THEN 'expired'
          ELSE wt.status
        END as current_status
      FROM warranty_tickets wt
      JOIN products p ON wt.product_id = p.id
      JOIN orders o ON wt.order_id = o.id
      WHERE wt.user_id = ?
      ORDER BY wt.created_at DESC
    `, [req.user.id]);

    res.json(tickets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new complaint using warranty ticket
router.post('/create', userOnlyMiddleware, upload.single('evidence_photo'), async (req, res) => {
  const { ticket_id, title, reason } = req.body;

  try {
    // Verify ticket belongs to user and is valid
    const ticket = await db.get(`
      SELECT wt.*, p.name as product_name
      FROM warranty_tickets wt
      JOIN products p ON wt.product_id = p.id
      WHERE wt.id = ? AND wt.user_id = ? AND wt.status = 'active' AND wt.expiry_date >= CURDATE()
    `, [ticket_id, req.user.id]);

    if (!ticket) {
      return res.status(400).json({ 
        error: 'Invalid or expired warranty ticket' 
      });
    }

    // Check if complaint already exists for this ticket
    const existingComplaint = await db.get(`
      SELECT id FROM complaints WHERE ticket_id = ? AND status != 'resolved'
    `, [ticket_id]);

    if (existingComplaint) {
      return res.status(400).json({ 
        error: 'A complaint is already active for this ticket' 
      });
    }

    let evidencePhotoPath = null;
    if (req.file) {
      evidencePhotoPath = req.file.path;
    }

    // Create complaint
    const result = await db.run(`
      INSERT INTO complaints (ticket_id, user_id, title, reason, evidence_photo, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `, [ticket_id, req.user.id, title, reason, evidencePhotoPath]);

    // Mark ticket as used
    await db.run(`
      UPDATE warranty_tickets 
      SET status = 'used' 
      WHERE id = ?
    `, [ticket_id]);

    res.status(201).json({
      message: 'Complaint submitted successfully',
      complaint_id: result.lastID
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's complaints
router.get('/my-complaints', userOnlyMiddleware, async (req, res) => {
  try {
    const complaints = await db.all(`
      SELECT 
        c.*,
        wt.order_id,
        p.name as product_name,
        p.image_url as product_image,
        a.name as admin_name,
        cr.id as chat_room_id
      FROM complaints c
      JOIN warranty_tickets wt ON c.ticket_id = wt.id
      JOIN products p ON wt.product_id = p.id
      LEFT JOIN admins a ON c.admin_id = a.id
      LEFT JOIN complaint_chat_rooms ccr ON c.id = ccr.complaint_id
      LEFT JOIN chat_rooms cr ON ccr.chat_room_id = cr.id
      WHERE c.user_id = ?
      ORDER BY c.created_at DESC
    `, [req.user.id]);

    res.json(complaints);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific complaint details
router.get('/:complaintId', authMiddleware, async (req, res) => {
  const { complaintId } = req.params;

  try {
    let whereClause = 'c.id = ?';
    let params = [complaintId];

    // Non-admin users can only see their own complaints
    if (!req.user.isAdmin) {
      whereClause += ' AND c.user_id = ?';
      params.push(req.user.id);
    }

    const complaint = await db.get(`
      SELECT 
        c.*,
        wt.order_id,
        wt.issue_date,
        wt.expiry_date,
        p.name as product_name,
        p.image_url as product_image,
        p.description as product_description,
        u.username,
        u.email as user_email,
        a.name as admin_name,
        cr.id as chat_room_id
      FROM complaints c
      JOIN warranty_tickets wt ON c.ticket_id = wt.id
      JOIN products p ON wt.product_id = p.id
      JOIN users u ON c.user_id = u.id
      LEFT JOIN admins a ON c.admin_id = a.id
      LEFT JOIN complaint_chat_rooms ccr ON c.id = ccr.complaint_id
      LEFT JOIN chat_rooms cr ON ccr.chat_room_id = cr.id
      WHERE ${whereClause}
    `, params);

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    res.json(complaint);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;