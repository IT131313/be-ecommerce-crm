const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware, adminAuthMiddleware, userOnlyMiddleware } = require('../middleware/auth');

// Get user's chat room and messages (user only)
router.get('/room', userOnlyMiddleware, async (req, res) => {
  try {
    // Get or create chat room for user
    let room = await db.get(`
      SELECT cr.*, a.name as admin_name, a.email as admin_email
      FROM chat_rooms cr
      LEFT JOIN admins a ON cr.admin_id = a.id
      WHERE cr.user_id = ? AND cr.status = 'active'
      ORDER BY cr.created_at DESC LIMIT 1
    `, [req.user.id]);

    if (!room) {
      // Create new chat room
      const result = await db.run(`
        INSERT INTO chat_rooms (user_id, status) 
        VALUES (?, 'active')
      `, [req.user.id]);
      
      room = {
        id: result.lastID,
        user_id: req.user.id,
        admin_id: null,
        admin_name: null,
        admin_email: null,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      };
    }

    // Get messages for this room
    const messages = await db.all(`
      SELECT cm.*, 
             CASE 
               WHEN cm.sender_type = 'user' THEN u.username
               WHEN cm.sender_type = 'admin' THEN a.name
             END as sender_name
      FROM chat_messages cm
      LEFT JOIN users u ON cm.sender_id = u.id AND cm.sender_type = 'user'
      LEFT JOIN admins a ON cm.sender_id = a.id AND cm.sender_type = 'admin'
      WHERE cm.room_id = ?
      ORDER BY cm.created_at ASC
    `, [room.id]);

    // Normalize messages for FE compatibility
    const normalizedMessages = messages.map((m) => ({
      ...m,
      sender: m.sender_type, // alias expected by some FE clients
      createdAt: m.created_at,
    }));

    res.json({
      room: {
        id: room.id,
        user_id: room.user_id,
        admin_id: room.admin_id,
        admin_name: room.admin_name,
        admin_email: room.admin_email,
        status: room.status,
        created_at: room.created_at,
        updated_at: room.updated_at
      },
      messages: normalizedMessages
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all active chat rooms (admin only)
router.get('/rooms', adminAuthMiddleware, async (req, res) => {
  try {
    const rooms = await db.all(`
      SELECT cr.*, 
             u.username, u.email as user_email,
             a.name as admin_name,
             (SELECT COUNT(*) FROM chat_messages cm 
              WHERE cm.room_id = cr.id AND cm.sender_type = 'user' AND cm.is_read = FALSE) as unread_count,
             (SELECT cm.message FROM chat_messages cm 
              WHERE cm.room_id = cr.id 
              ORDER BY cm.created_at DESC LIMIT 1) as last_message,
             (SELECT cm.created_at FROM chat_messages cm 
              WHERE cm.room_id = cr.id 
              ORDER BY cm.created_at DESC LIMIT 1) as last_message_time,
             (SELECT cm.sender_type FROM chat_messages cm 
              WHERE cm.room_id = cr.id 
              ORDER BY cm.created_at DESC LIMIT 1) as last_sender_type
      FROM chat_rooms cr
      JOIN users u ON cr.user_id = u.id
      LEFT JOIN admins a ON cr.admin_id = a.id
      WHERE cr.status = 'active'
      ORDER BY cr.updated_at DESC
    `);

    // Add camelCase aliases and sender alias for FE compatibility
    const normalizedRooms = rooms.map((r) => ({
      ...r,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastMessage: r.last_message,
      lastMessageTime: r.last_message_time,
      lastSenderType: r.last_sender_type,
      lastSender: r.last_sender_type, // alias 'sender' style
      unreadCount: r.unread_count,
      userEmail: r.user_email,
      adminName: r.admin_name,
    }));

    res.json(normalizedRooms);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific room messages (admin only)
router.get('/rooms/:roomId/messages', adminAuthMiddleware, async (req, res) => {
  const { roomId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  try {
    // Verify room exists
    const room = await db.get(`
      SELECT cr.*, u.username, u.email as user_email
      FROM chat_rooms cr
      JOIN users u ON cr.user_id = u.id
      WHERE cr.id = ?
    `, [roomId]);

    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    // Get messages with pagination
    const messages = await db.all(`
      SELECT cm.*, 
             CASE 
               WHEN cm.sender_type = 'user' THEN u.username
               WHEN cm.sender_type = 'admin' THEN a.name
             END as sender_name
      FROM chat_messages cm
      LEFT JOIN users u ON cm.sender_id = u.id AND cm.sender_type = 'user'
      LEFT JOIN admins a ON cm.sender_id = a.id AND cm.sender_type = 'admin'
      WHERE cm.room_id = ?
      ORDER BY cm.created_at DESC
      LIMIT ? OFFSET ?
    `, [roomId, parseInt(limit), offset]);

    // Get total message count
    const totalMessages = await db.get(`
      SELECT COUNT(*) as count 
      FROM chat_messages 
      WHERE room_id = ?
    `, [roomId]);

    // Normalize messages for FE compatibility
    const normalizedAdminMessages = messages.map((m) => ({
      ...m,
      sender: m.sender_type,
      createdAt: m.created_at,
    }));

    res.json({
      room: {
        id: room.id,
        user_id: room.user_id,
        username: room.username,
        user_email: room.user_email,
        admin_id: room.admin_id,
        status: room.status,
        created_at: room.created_at,
        updated_at: room.updated_at
      },
      messages: normalizedAdminMessages.reverse(), // Reverse to show oldest first
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalMessages.count,
        totalPages: Math.ceil(totalMessages.count / limit)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign admin to chat room
router.patch('/rooms/:roomId/assign', adminAuthMiddleware, async (req, res) => {
  const { roomId } = req.params;

  try {
    // Check if room exists and is not already assigned
    const room = await db.get(`
      SELECT * FROM chat_rooms 
      WHERE id = ? AND status = 'active'
    `, [roomId]);

    if (!room) {
      return res.status(404).json({ error: 'Chat room not found' });
    }

    // Assign admin to room
    await db.run(`
      UPDATE chat_rooms 
      SET admin_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.user.id, roomId]);

    // Get updated room info
    const updatedRoom = await db.get(`
      SELECT cr.*, u.username, u.email as user_email, a.name as admin_name
      FROM chat_rooms cr
      JOIN users u ON cr.user_id = u.id
      LEFT JOIN admins a ON cr.admin_id = a.id
      WHERE cr.id = ?
    `, [roomId]);

    res.json({
      message: 'Admin assigned to chat room successfully',
      room: updatedRoom
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Close chat room
router.patch('/rooms/:roomId/close', adminAuthMiddleware, async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await db.get(`
      SELECT * FROM chat_rooms 
      WHERE id = ? AND status = 'active'
    `, [roomId]);

    if (!room) {
      return res.status(404).json({ error: 'Active chat room not found' });
    }

    // Close the room
    await db.run(`
      UPDATE chat_rooms 
      SET status = 'closed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [roomId]);

    res.json({
      message: 'Chat room closed successfully',
      roomId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get chat statistics (admin only)
router.get('/stats', adminAuthMiddleware, async (req, res) => {
  try {
    // Get total rooms
    const totalRooms = await db.get(`
      SELECT COUNT(*) as count FROM chat_rooms
    `);

    // Get active rooms
    const activeRooms = await db.get(`
      SELECT COUNT(*) as count FROM chat_rooms WHERE status = 'active'
    `);

    // Get total messages
    const totalMessages = await db.get(`
      SELECT COUNT(*) as count FROM chat_messages
    `);

    // Get unread messages
    const unreadMessages = await db.get(`
      SELECT COUNT(*) as count 
      FROM chat_messages 
      WHERE is_read = FALSE AND sender_type = 'user'
    `);

    // Get rooms with unread messages
    const roomsWithUnread = await db.get(`
      SELECT COUNT(DISTINCT room_id) as count 
      FROM chat_messages 
      WHERE is_read = FALSE AND sender_type = 'user'
    `);

    // Get recent activity
    const recentActivity = await db.all(`
      SELECT cr.id as room_id, u.username, u.email,
             cm.message, cm.created_at, cm.sender_type
      FROM chat_messages cm
      JOIN chat_rooms cr ON cm.room_id = cr.id
      JOIN users u ON cr.user_id = u.id
      WHERE cr.status = 'active'
      ORDER BY cm.created_at DESC
      LIMIT 10
    `);

    res.json({
      stats: {
        total_rooms: totalRooms.count,
        active_rooms: activeRooms.count,
        total_messages: totalMessages.count,
        unread_messages: unreadMessages.count,
        rooms_with_unread: roomsWithUnread.count
      },
      recent_activity: recentActivity
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark messages as read
router.patch('/rooms/:roomId/read', authMiddleware, async (req, res) => {
  const { roomId } = req.params;

  try {
    // Verify user has access to this room
    let hasAccess = false;
    
    if (req.user.isAdmin) {
      // Admin can access any room
      const room = await db.get('SELECT id FROM chat_rooms WHERE id = ?', [roomId]);
      hasAccess = !!room;
    } else {
      // User can only access their own room
      const room = await db.get(
        'SELECT id FROM chat_rooms WHERE id = ? AND user_id = ?', 
        [roomId, req.user.id]
      );
      hasAccess = !!room;
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this chat room' });
    }

    // Mark messages as read
    const otherType = req.user.isAdmin ? 'user' : 'admin';
    
    await db.run(`
      UPDATE chat_messages 
      SET is_read = TRUE 
      WHERE room_id = ? AND sender_type = ? AND is_read = FALSE
    `, [roomId, otherType]);

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
