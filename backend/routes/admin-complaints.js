const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { adminAuthMiddleware } = require('../middleware/auth');

// Get all complaints with priority sorting
router.get('/complaints', adminAuthMiddleware, async (req, res) => {
  const { status, priority, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let whereConditions = [];
    let params = [];

    if (status) {
      whereConditions.push('c.status = ?');
      params.push(status);
    }

    if (priority) {
      whereConditions.push('c.priority = ?');
      params.push(priority);
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const complaints = await db.all(`
      SELECT 
        c.*,
        wt.order_id,
        wt.issue_date,
        wt.expiry_date,
        p.name as product_name,
        p.image_url as product_image,
        u.username,
        u.email as user_email,
        a.name as admin_name,
        cr.id as chat_room_id,
        CASE 
          WHEN c.priority = 'high' THEN 3
          WHEN c.priority = 'medium' THEN 2
          ELSE 1
        END as priority_order
      FROM complaints c
      JOIN warranty_tickets wt ON c.ticket_id = wt.id
      JOIN products p ON wt.product_id = p.id
      JOIN users u ON c.user_id = u.id
      LEFT JOIN admins a ON c.admin_id = a.id
      LEFT JOIN complaint_chat_rooms ccr ON c.id = ccr.complaint_id
      LEFT JOIN chat_rooms cr ON ccr.chat_room_id = cr.id
      ${whereClause}
      ORDER BY 
        priority_order DESC, 
        c.created_at ASC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Get total count for pagination
    const totalResult = await db.get(`
      SELECT COUNT(*) as total
      FROM complaints c
      JOIN warranty_tickets wt ON c.ticket_id = wt.id
      JOIN products p ON wt.product_id = p.id
      JOIN users u ON c.user_id = u.id
      LEFT JOIN admins a ON c.admin_id = a.id
      ${whereClause}
    `, params);

    res.json({
      complaints,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalResult.total,
        totalPages: Math.ceil(totalResult.total / limit)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Accept complaint and create chat room
router.patch('/complaints/:complaintId/accept', adminAuthMiddleware, async (req, res) => {
  const { complaintId } = req.params;

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Check if complaint exists and is pending
    const [complaints] = await connection.execute(`
      SELECT c.*, u.id as user_id 
      FROM complaints c
      JOIN warranty_tickets wt ON c.ticket_id = wt.id
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ? AND c.status = 'pending'
    `, [complaintId]);

    const complaint = complaints[0];
    if (!complaint) {
      await connection.rollback();
      return res.status(404).json({ 
        error: 'Complaint not found or already processed' 
      });
    }

    // Create chat room for this complaint
    const [chatRoomResult] = await connection.execute(`
      INSERT INTO chat_rooms (user_id, admin_id, status) 
      VALUES (?, ?, 'active')
    `, [complaint.user_id, req.user.id]);

    const chatRoomId = chatRoomResult.insertId;

    // Link complaint to chat room
    await connection.execute(`
      INSERT INTO complaint_chat_rooms (complaint_id, chat_room_id)
      VALUES (?, ?)
    `, [complaintId, chatRoomId]);

    // Update complaint status and assign admin
    await connection.execute(`
      UPDATE complaints 
      SET status = 'accepted', admin_id = ?, chat_room_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.user.id, chatRoomId, complaintId]);

    // Add initial system message to chat room
    await connection.execute(`
      INSERT INTO chat_messages (room_id, sender_id, sender_type, message, message_type)
      VALUES (?, ?, 'admin', 'Pengaduan Anda telah diterima. Mari kita diskusikan masalah ini lebih lanjut.', 'system')
    `, [chatRoomId, req.user.id]);

    await connection.commit();

    res.json({
      message: 'Complaint accepted and chat room created',
      chat_room_id: chatRoomId
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Reject complaint with comment
router.patch('/complaints/:complaintId/reject', adminAuthMiddleware, async (req, res) => {
  const { complaintId } = req.params;
  const { admin_comment } = req.body;

  if (!admin_comment || admin_comment.trim() === '') {
    return res.status(400).json({ 
      error: 'Admin comment is required when rejecting complaint' 
    });
  }

  try {
    // Check if complaint exists and is pending
    const complaint = await db.get(`
      SELECT id FROM complaints 
      WHERE id = ? AND status = 'pending'
    `, [complaintId]);

    if (!complaint) {
      return res.status(404).json({ 
        error: 'Complaint not found or already processed' 
      });
    }

    // Update complaint status and add admin comment
    await db.run(`
      UPDATE complaints 
      SET status = 'rejected', admin_id = ?, admin_comment = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.user.id, admin_comment, complaintId]);

    res.json({
      message: 'Complaint rejected successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update complaint priority
router.patch('/complaints/:complaintId/priority', adminAuthMiddleware, async (req, res) => {
  const { complaintId } = req.params;
  const { priority } = req.body;

  if (!['low', 'medium', 'high'].includes(priority)) {
    return res.status(400).json({ 
      error: 'Invalid priority. Must be low, medium, or high' 
    });
  }

  try {
    const result = await db.run(`
      UPDATE complaints 
      SET priority = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [priority, complaintId]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    res.json({
      message: 'Complaint priority updated successfully'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark complaint as resolved
router.patch('/complaints/:complaintId/resolve', adminAuthMiddleware, async (req, res) => {
  const { complaintId } = req.params;

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Check if complaint exists and is accepted
    const [complaints] = await connection.execute(`
      SELECT c.*, cr.id as chat_room_id
      FROM complaints c
      LEFT JOIN complaint_chat_rooms ccr ON c.id = ccr.complaint_id
      LEFT JOIN chat_rooms cr ON ccr.chat_room_id = cr.id
      WHERE c.id = ? AND c.status = 'accepted'
    `, [complaintId]);

    const complaint = complaints[0];
    if (!complaint) {
      await connection.rollback();
      return res.status(404).json({ 
        error: 'Complaint not found or not in accepted status' 
      });
    }

    // Update complaint status
    await connection.execute(`
      UPDATE complaints 
      SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [complaintId]);

    // Close associated chat room if exists
    if (complaint.chat_room_id) {
      await connection.execute(`
        UPDATE chat_rooms 
        SET status = 'closed', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [complaint.chat_room_id]);

      // Add system message about resolution
      await connection.execute(`
        INSERT INTO chat_messages (room_id, sender_id, sender_type, message, message_type)
        VALUES (?, ?, 'admin', 'Pengaduan ini telah diselesaikan. Chat room akan ditutup.', 'system')
      `, [complaint.chat_room_id, req.user.id]);
    }

    await connection.commit();

    res.json({
      message: 'Complaint resolved successfully'
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Get complaint statistics
router.get('/complaints/stats/overview', adminAuthMiddleware, async (req, res) => {
  try {
    // Get total complaints by status
    const statusStats = await db.all(`
      SELECT status, COUNT(*) as count
      FROM complaints
      GROUP BY status
    `);

    // Get total complaints by priority
    const priorityStats = await db.all(`
      SELECT priority, COUNT(*) as count
      FROM complaints
      WHERE status != 'resolved'
      GROUP BY priority
    `);

    // Get recent complaints (last 30 days) - MySQL/MariaDB syntax
    const recentComplaints = await db.get(`
      SELECT COUNT(*) as count
      FROM complaints
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);

    // Get pending complaints count
    const pendingCount = await db.get(`
      SELECT COUNT(*) as count
      FROM complaints
      WHERE status = 'pending'
    `);

    // Get average resolution time (in days) - MySQL/MariaDB syntax
    const avgResolutionTime = await db.get(`
      SELECT AVG(TIMESTAMPDIFF(DAY, created_at, resolved_at)) as avg_days
      FROM complaints
      WHERE status = 'resolved' AND resolved_at IS NOT NULL
    `);

    res.json({
      status_distribution: statusStats,
      priority_distribution: priorityStats,
      recent_complaints: recentComplaints.count,
      pending_complaints: pendingCount.count,
      average_resolution_days: Math.round(avgResolutionTime.avg_days || 0)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
