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
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

module.exports = { initializeDatabase };
