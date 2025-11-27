const db = require('./database');

// Runs startup checks and adds missing order columns if needed
async function initializeDatabase() {
  try {
    await db.run('SELECT 1');
    console.log('Database initialized successfully');

    const dbName = process.env.DB_NAME || 'auth_db';

    // Ensure orders.shipping_method column exists
    try {
      const columnCheck = await db.get(
        `SELECT COUNT(*) as cnt
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shipping_method'`,
        [dbName]
      );
      if (!columnCheck || columnCheck.cnt === 0) {
        await db.run("ALTER TABLE orders ADD COLUMN shipping_method VARCHAR(10) NULL");
        console.log('Added orders.shipping_method column');
      }
    } catch (e) {
      console.warn('Could not ensure orders.shipping_method column:', e.message || e);
    }

    // Ensure orders.tracking_number column exists
    try {
      const columnCheckTrack = await db.get(
        `SELECT COUNT(*) as cnt
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'tracking_number'`,
        [dbName]
      );
      if (!columnCheckTrack || columnCheckTrack.cnt === 0) {
        await db.run("ALTER TABLE orders ADD COLUMN tracking_number VARCHAR(100) NULL");
        console.log('Added orders.tracking_number column');
      }
    } catch (e) {
      console.warn('Could not ensure orders.tracking_number column:', e.message || e);
    }

    // Ensure orders.shipped_at column exists
    try {
      const columnCheckShippedAt = await db.get(
        `SELECT COUNT(*) as cnt
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shipped_at'`,
        [dbName]
      );
      if (!columnCheckShippedAt || columnCheckShippedAt.cnt === 0) {
        await db.run("ALTER TABLE orders ADD COLUMN shipped_at DATETIME NULL");
        console.log('Added orders.shipped_at column');
      }
    } catch (e) {
      console.warn('Could not ensure orders.shipped_at column:', e.message || e);
    }

    // Ensure orders.shipping_cost column exists
    try {
      const columnCheckShippingCost = await db.get(
        `SELECT COUNT(*) as cnt
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shipping_cost'`,
        [dbName]
      );
      if (!columnCheckShippingCost || columnCheckShippingCost.cnt === 0) {
        await db.run("ALTER TABLE orders ADD COLUMN shipping_cost DECIMAL(10,2) NOT NULL DEFAULT 0");
        console.log('Added orders.shipping_cost column');
      }
    } catch (e) {
      console.warn('Could not ensure orders.shipping_cost column:', e.message || e);
    }

    // Ensure notifications tables exist
    try {
      await db.run(`
        CREATE TABLE IF NOT EXISTS notifications (
          id INT AUTO_INCREMENT PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          body TEXT,
          data JSON,
          audience ENUM('all', 'user') DEFAULT 'user',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_notifications_type (type),
          INDEX idx_notifications_created_at (created_at)
        )
      `);

      await db.run(`
        CREATE TABLE IF NOT EXISTS notification_users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          notification_id INT NOT NULL,
          user_id INT NOT NULL,
          status ENUM('unread', 'read') DEFAULT 'unread',
          read_at DATETIME NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_notification_user (notification_id, user_id),
          FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_notification_users_user_status (user_id, status),
          INDEX idx_notification_users_notification (notification_id)
        )
      `);

      console.log('Notifications tables verified');
    } catch (e) {
      console.warn('Could not ensure notification tables:', e.message || e);
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

module.exports = { initializeDatabase };
