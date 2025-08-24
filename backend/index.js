const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/database');
const authRoutes = require('./routes/auth');
const servicesRoutes = require('./routes/services');
const productsRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const consultationsRoutes = require('./routes/consultations');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Helper function to create users table if not exists
// Database is initialized in database.js
async function initializeDatabase() {
  try {
    // Verify database connection
    await db.run('SELECT 1');
    console.log('Database initialized successfully');
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
      '/api/auth/forgot-password',
      '/api/auth/reset-password'
    ]
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/consultations', consultationsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start server and initialize database
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Selamat Datang! Server running on port ${PORT}`);
    });
  })
   .catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
