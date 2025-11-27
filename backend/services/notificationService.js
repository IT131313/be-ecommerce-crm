const db = require('../config/database');

const AUDIENCE = {
  ALL: 'all',
  USER: 'user'
};

const STATUS = {
  UNREAD: 'unread',
  READ: 'read'
};

const serializeData = (data) => {
  if (data === null || data === undefined) {
    return null;
  }

  if (typeof data === 'string') {
    return data;
  }

  try {
    return JSON.stringify(data);
  } catch (e) {
    return null;
  }
};

const safeParseJson = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
};

const buildNotificationResponse = (row) => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  data: safeParseJson(row.data),
  audience: row.audience,
  status: row.status,
  read_at: row.read_at,
  created_at: row.created_at
});

async function createNotification({ type, title, body = null, data = null, audience = AUDIENCE.USER, userIds = [] }) {
  const payload = serializeData(data);
  const { lastID: notificationId } = await db.run(
    `INSERT INTO notifications (type, title, body, data, audience) VALUES (?, ?, ?, ?, ?)`,
    [type, title, body, payload, audience]
  );

  const uniqueUserIds = Array.from(new Set((userIds || []).filter(Boolean)));
  if (uniqueUserIds.length > 0) {
    const placeholders = uniqueUserIds.map(() => '(?, ?)').join(', ');
    const params = [];
    uniqueUserIds.forEach((uid) => {
      params.push(notificationId, uid);
    });

    await db.run(
      `INSERT IGNORE INTO notification_users (notification_id, user_id) VALUES ${placeholders}`,
      params
    );
  }

  return { notificationId, recipients: uniqueUserIds.length };
}

async function broadcastToAllUsers({ type, title, body = null, data = null }) {
  const users = await db.all('SELECT id FROM users');
  const userIds = users.map((u) => u.id);
  return createNotification({
    type,
    title,
    body,
    data,
    audience: AUDIENCE.ALL,
    userIds
  });
}

async function notifyUsers(userIds, { type, title, body = null, data = null }) {
  return createNotification({
    type,
    title,
    body,
    data,
    audience: AUDIENCE.USER,
    userIds
  });
}

async function getUserNotifications(userId, { status = 'all', limit = 20, offset = 0 } = {}) {
  const normalizedLimit = Number.isInteger(Number(limit)) ? Math.min(parseInt(limit, 10), 100) : 20;
  const normalizedOffset = Number.isInteger(Number(offset)) ? Math.max(parseInt(offset, 10), 0) : 0;

  const statusFilter = status === STATUS.UNREAD ? 'AND nu.status = "unread"' : '';

  const rows = await db.all(
    `
      SELECT n.*, nu.status, nu.read_at
      FROM notification_users nu
      JOIN notifications n ON n.id = nu.notification_id
      WHERE nu.user_id = ?
      ${statusFilter}
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `,
    [userId, normalizedLimit, normalizedOffset]
  );

  return rows.map(buildNotificationResponse);
}

async function getUnreadCount(userId) {
  const row = await db.get(
    `SELECT COUNT(*) AS count FROM notification_users WHERE user_id = ? AND status = "unread"`,
    [userId]
  );
  return row?.count || 0;
}

async function markAsRead(notificationId, userId) {
  const result = await db.run(
    `
      UPDATE notification_users
      SET status = ?, read_at = IF(status = ?, read_at, NOW())
      WHERE notification_id = ? AND user_id = ?
    `,
    [STATUS.READ, STATUS.READ, notificationId, userId]
  );
  return { updated: (result?.changes || 0) > 0 };
}

async function markAllAsRead(userId) {
  const result = await db.run(
    `
      UPDATE notification_users
      SET status = ?, read_at = IF(status = ?, read_at, NOW())
      WHERE user_id = ? AND status = ?
    `,
    [STATUS.READ, STATUS.READ, userId, STATUS.UNREAD]
  );
  return { updated: (result?.changes || 0) > 0 };
}

module.exports = {
  AUDIENCE,
  STATUS,
  createNotification,
  broadcastToAllUsers,
  notifyUsers,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};
