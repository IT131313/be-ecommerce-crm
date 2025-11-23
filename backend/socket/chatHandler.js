const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Store active connections
const activeConnections = new Map();
const adminConnections = new Map();
const userConnections = new Map();

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.userEmail = decoded.email;
    socket.isAdmin = decoded.isAdmin || false;
    socket.userType = decoded.isAdmin ? 'admin' : 'user';
    
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Invalid authentication token'));
  }
};

// Get or create chat room for user
const getOrCreateChatRoom = async (userId) => {
  try {
    // Check if user already has an active chat room
    let room = await db.get(`
      SELECT * FROM chat_rooms 
      WHERE user_id = ? AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `, [userId]);

    if (!room) {
      // Create new chat room
      const result = await db.run(`
        INSERT INTO chat_rooms (user_id, status) 
        VALUES (?, 'active')
      `, [userId]);
      
      room = {
        id: result.lastID,
        user_id: userId,
        admin_id: null,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      };
    }

    return room;
  } catch (error) {
    console.error('Error getting or creating chat room:', error);
    throw error;
  }
};

// Save message to database
const saveMessage = async (roomId, senderId, senderType, message, messageType = 'text') => {
  try {
    const result = await db.run(`
      INSERT INTO chat_messages (room_id, sender_id, sender_type, message, message_type) 
      VALUES (?, ?, ?, ?, ?)
    `, [roomId, senderId, senderType, message, messageType]);

    // Update room's updated_at timestamp
    await db.run(`
      UPDATE chat_rooms 
      SET updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [roomId]);

    return {
      id: result.lastID,
      room_id: roomId,
      sender_id: senderId,
      sender_type: senderType,
      message,
      message_type: messageType,
      is_read: false,
      created_at: new Date()
    };
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
};

// Mark messages as read
const markMessagesAsRead = async (roomId, readerId, readerType) => {
  try {
    const otherType = readerType === 'admin' ? 'user' : 'admin';
    
    await db.run(`
      UPDATE chat_messages 
      SET is_read = TRUE 
      WHERE room_id = ? AND sender_type = ? AND is_read = FALSE
    `, [roomId, otherType]);
  } catch (error) {
    console.error('Error marking messages as read:', error);
  }
};

const handleChatConnection = (io) => {
  // Apply authentication middleware
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`${socket.userType} connected:`, socket.userEmail);

    // Store connection
    activeConnections.set(socket.id, {
      userId: socket.userId,
      userEmail: socket.userEmail,
      isAdmin: socket.isAdmin,
      userType: socket.userType,
      socket
    });

    if (socket.isAdmin) {
      adminConnections.set(socket.userId, socket);
    } else {
      userConnections.set(socket.userId, socket);
    }

    // Handle user joining chat
    socket.on('join_chat', async (data) => {
      try {
        let roomId;

        if (socket.isAdmin) {
          // Admin joining specific room
          roomId = data.roomId;
          if (!roomId) {
            socket.emit('error', { message: 'Room ID required for admin' });
            return;
          }

          // Assign admin to room if not already assigned
          await db.run(`
            UPDATE chat_rooms 
            SET admin_id = ? 
            WHERE id = ? AND admin_id IS NULL
          `, [socket.userId, roomId]);

        } else {
          // User joining their own chat room
          const room = await getOrCreateChatRoom(socket.userId);
          roomId = room.id;
        }

        socket.join(`room_${roomId}`);
        socket.currentRoomId = roomId;

        // Mark messages as read
        await markMessagesAsRead(roomId, socket.userId, socket.userType);

        // Get recent messages
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
          LIMIT 50
        `, [roomId]);

        // Normalize payload for FE expectations
        const normalizedMessages = messages.map((m) => ({
          ...m,
          sender: m.sender_type, // alias for FE compatibility
          createdAt: m.created_at, // keep existing field too
        }));

        socket.emit('joined_room', {
          roomId,
          messages: normalizedMessages
        });

        // Notify other participants
        socket.to(`room_${roomId}`).emit('user_joined', {
          userId: socket.userId,
          userEmail: socket.userEmail,
          userType: socket.userType
        });

      } catch (error) {
        console.error('Error joining chat:', error);
        socket.emit('error', { message: 'Failed to join chat' });
      }
    });

    // Handle sending message
    socket.on('send_message', async (data) => {
      try {
        const { message, messageType = 'text' } = data;

        if (!socket.currentRoomId) {
          socket.emit('error', { message: 'Please join a room first' });
          return;
        }

        if (!message || message.trim() === '') {
          socket.emit('error', { message: 'Message cannot be empty' });
          return;
        }

        // Save message to database
        const savedMessage = await saveMessage(
          socket.currentRoomId,
          socket.userId,
          socket.userType,
          message.trim(),
          messageType
        );

        // Get sender name
        let senderName;
        if (socket.userType === 'user') {
          const user = await db.get('SELECT username FROM users WHERE id = ?', [socket.userId]);
          senderName = user?.username || 'User';
        } else {
          const admin = await db.get('SELECT name FROM admins WHERE id = ?', [socket.userId]);
          senderName = admin?.name || 'Admin';
        }

        const messageData = {
          ...savedMessage,
          sender_name: senderName,
          sender: savedMessage.sender_type, // alias for FE compatibility
          createdAt: savedMessage.created_at
        };

        // Send to all participants in the room
        io.to(`room_${socket.currentRoomId}`).emit('new_message', messageData);

        // Notify admin dashboard about new user message
        if (socket.userType === 'user') {
          io.emit('admin_notification', {
            type: 'new_message',
            roomId: socket.currentRoomId,
            userId: socket.userId,
            userEmail: socket.userEmail,
            message: message.trim()
          });
        }

      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
      if (socket.currentRoomId) {
        socket.to(`room_${socket.currentRoomId}`).emit('user_typing', {
          userId: socket.userId,
          userEmail: socket.userEmail,
          userType: socket.userType,
          isTyping: data.isTyping
        });
      }
    });

    // Handle marking messages as read
    socket.on('mark_messages_read', async (data) => {
      try {
        const { roomId } = data;
        await markMessagesAsRead(roomId, socket.userId, socket.userType);
        
        socket.to(`room_${roomId}`).emit('messages_read', {
          readerId: socket.userId,
          readerType: socket.userType,
          reader: socket.userType // alias for FE compatibility
        });
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    });

    // Handle getting active rooms (for admin)
    socket.on('get_active_rooms', async () => {
      if (!socket.isAdmin) {
        socket.emit('error', { message: 'Admin access required' });
        return;
      }

      try {
        const activeRooms = await db.all(`
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
                  ORDER BY cm.created_at DESC LIMIT 1) as last_message_time
          FROM chat_rooms cr
          JOIN users u ON cr.user_id = u.id
          LEFT JOIN admins a ON cr.admin_id = a.id
          WHERE cr.status = 'active'
          ORDER BY cr.updated_at DESC
        `);

        // Add camelCase aliases without breaking existing FE
        const normalizedRooms = activeRooms.map((r) => ({
          ...r,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          lastMessage: r.last_message,
          lastMessageTime: r.last_message_time,
          unreadCount: r.unread_count,
          userEmail: r.user_email,
          adminName: r.admin_name
        }));

        socket.emit('active_rooms', normalizedRooms);
      } catch (error) {
        console.error('Error getting active rooms:', error);
        socket.emit('error', { message: 'Failed to get active rooms' });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`${socket.userType} disconnected:`, socket.userEmail);

      // Remove from active connections
      activeConnections.delete(socket.id);
      
      if (socket.isAdmin) {
        adminConnections.delete(socket.userId);
      } else {
        userConnections.delete(socket.userId);
      }

      // Notify room participants
      if (socket.currentRoomId) {
        socket.to(`room_${socket.currentRoomId}`).emit('user_left', {
          userId: socket.userId,
          userEmail: socket.userEmail,
          userType: socket.userType
        });
      }
    });

    // Handle error
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });
};

module.exports = {
  handleChatConnection,
  activeConnections,
  adminConnections,
  userConnections
};
