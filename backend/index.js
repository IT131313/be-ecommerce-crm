const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const path = require('path');
const db = require('./config/database');
const authRoutes = require('./routes/auth');
const adminAuthRoutes = require('./routes/admin-auth');
const adminRoutes = require('./routes/admin');
const usersRoutes = require('./routes/users');
const chatRoutes = require('./routes/chat');
const servicesRoutes = require('./routes/services');
const productsRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const ordersRoutes = require('./routes/orders');
const consultationsRoutes = require('./routes/consultations');
const complaintsRoutes = require('./routes/complaints');
const adminComplaintsRoutes = require('./routes/admin-complaints');
const { handleChatConnection } = require('./socket/chatHandler');

const app = express();
const server = http.createServer(app);

// Socket.IO setup with CORS
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const PORT = process.env.PORT || 3000;

// Helper function to create users table if not exists
// Database is initialized in database.js
async function initializeDatabase() {
  try {
    // Verify database connection
    await db.run('SELECT 1');
    console.log('Database initialized successfully');

    // Ensure orders.shipping_method column exists
    try {
      const dbName = process.env.DB_NAME || 'auth_db';
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
      const dbName = process.env.DB_NAME || 'auth_db';
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
      const dbName = process.env.DB_NAME || 'auth_db';
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
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

// Routes  
app.get('/', (req, res) => {
  res.json({ 
    message: 'Selamat Datang di Server E-commerce + CRM!',
    status: 'Server berjalan dengan baik',
    port: process.env.PORT || 8000,
    endpoints: [
      '/api/auth/login',
      '/api/auth/register', 
      '/api/auth/google',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
      '/api/admin/auth/login',
      '/api/admin/auth/forgot-password',
      '/api/admin/auth/reset-password',
      '/api/users/profile',
      '/api/users/change-password',
      '/api/chat/room',
      '/api/chat/rooms',
      '/api/complaints/tickets',
      '/api/complaints/create',
      '/api/admin/complaints'
    ],
    features: [
      'Real-time Chat with Socket.IO',
      'User-Admin Communication',
      'Message History & Notifications',
      'Warranty Ticket System',
      'Customer Complaint Management'
    ]
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/consultations', consultationsRoutes);
app.use('/api/complaints', complaintsRoutes);
app.use('/api/admin', adminComplaintsRoutes);

// Initialize Socket.IO chat handlers
handleChatConnection(io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start server and initialize database
initializeDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`💬 Socket.IO chat ready`);
      console.log(`🌐 HTTP + WebSocket server active`);
    });
  })
   .catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });



