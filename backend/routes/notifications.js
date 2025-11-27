const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
} = require('../services/notificationService');

// Get notifications for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status = 'all', limit = 20, offset = 0 } = req.query;
    const notifications = await getUserNotifications(req.user.id, {
      status,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });
    res.json({ notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get unread count for badge
router.get('/count', authMiddleware, async (req, res) => {
  try {
    const count = await getUnreadCount(req.user.id);
    res.json({ count });
  } catch (error) {
    console.error('Error fetching notification count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark single notification as read
router.post('/:id/read', authMiddleware, async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id, 10);
    if (Number.isNaN(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification id' });
    }

    const result = await markAsRead(notificationId, req.user.id);
    res.json({ updated: result.updated });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark all as read
router.post('/read-all', authMiddleware, async (req, res) => {
  try {
    const result = await markAllAsRead(req.user.id);
    res.json({ updated: result.updated });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
