const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const path = require('path');
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
const paymentsRoutes = require('./routes/payments');
const { handleChatConnection } = require('./socket/chatHandler');
const { initializeDatabase } = require('./config/init-db');

const app = express();
const server = http.createServer(app);

const WIB_TIME_ZONE = 'Asia/Jakarta';
const wibDateTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: WIB_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const convertDatesToWIBStrings = (payload) => {
  if (payload instanceof Date) {
    const parts = wibDateTimeFormatter.formatToParts(payload).reduce((acc, part) => {
      if (part.type !== 'literal') {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  }

  if (Array.isArray(payload)) {
    return payload.map(convertDatesToWIBStrings);
  }

  if (isPlainObject(payload)) {
    const cloned = {};
    for (const [key, value] of Object.entries(payload)) {
      cloned[key] = convertDatesToWIBStrings(value);
    }
    return cloned;
  }

  return payload;
};

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

// Ensure every JSON response serializes Date objects as WIB (GMT+7) strings
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(convertDatesToWIBStrings(body));
  next();
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const PORT = process.env.PORT || 3000;

// Routes  
app.get('/', (req, res) => {
  res.send('Selamat Datang di Server E-commerce + CRM!');
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
app.use('/api/payments', paymentsRoutes);

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



