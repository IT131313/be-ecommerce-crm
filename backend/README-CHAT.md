# Real-Time Chat System dengan Socket.IO

## Fitur Chat yang Telah Diimplementasi

### 🚀 **Fitur Utama:**
- **Real-time messaging** antara User dan Admin
- **Chat rooms** otomatis untuk setiap user
- **Message history** tersimpan di database
- **Read receipts** dan status pesan
- **Typing indicators** 
- **Admin dashboard** untuk manage semua chat
- **Notification system** untuk pesan baru
- **Auto-assignment** admin ke chat room

### 📊 **Database Schema:**

```sql
-- Chat Rooms
CREATE TABLE chat_rooms (
  id INT PRIMARY KEY,
  user_id INT NOT NULL,
  admin_id INT,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Chat Messages  
CREATE TABLE chat_messages (
  id INT PRIMARY KEY,
  room_id INT NOT NULL,
  sender_id INT NOT NULL,
  sender_type ENUM('user', 'admin'),
  message TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP
);
```

## 🔌 **Socket.IO Events:**

### **Client ke Server:**
- `join_chat` - Bergabung ke chat room
- `send_message` - Mengirim pesan
- `typing` - Indikator sedang mengetik
- `mark_messages_read` - Tandai pesan sudah dibaca
- `get_active_rooms` - Dapatkan daftar room aktif (admin)

### **Server ke Client:**
- `joined_room` - Berhasil bergabung ke room
- `new_message` - Pesan baru masuk
- `user_typing` - User sedang mengetik
- `messages_read` - Pesan sudah dibaca
- `admin_notification` - Notifikasi untuk admin
- `user_joined` / `user_left` - Status online/offline

## 🌐 **REST API Endpoints:**

### **User Endpoints:**
```http
GET /api/chat/room
Authorization: Bearer <user_token>
```
Mendapatkan chat room dan message history user.

### **Admin Endpoints:**
```http
GET /api/chat/rooms
Authorization: Bearer <admin_token>
```
Mendapatkan semua chat rooms aktif.

```http
GET /api/chat/rooms/:roomId/messages
Authorization: Bearer <admin_token>
```
Mendapatkan messages dari room tertentu dengan pagination.

```http
PATCH /api/chat/rooms/:roomId/assign
Authorization: Bearer <admin_token>
```
Assign admin ke chat room.

```http
PATCH /api/chat/rooms/:roomId/close
Authorization: Bearer <admin_token>
```
Menutup chat room.

```http
GET /api/chat/stats
Authorization: Bearer <admin_token>
```
Statistik chat (total rooms, unread messages, dll).

## 💻 **Cara Menggunakan:**

### **1. Setup Client (Frontend)**

Install socket.io client:
```bash
npm install socket.io-client
```

### **2. User Chat Implementation:**

```javascript
import { io } from 'socket.io-client';

// Connect dengan authentication
const socket = io('http://localhost:3000', {
  auth: {
    token: userToken // JWT token dari login
  }
});

// Join chat room
socket.emit('join_chat', {});

// Listen for messages
socket.on('new_message', (message) => {
  console.log('New message:', message);
  // Update UI dengan pesan baru
});

// Send message
const sendMessage = (text) => {
  socket.emit('send_message', {
    message: text,
    messageType: 'text'
  });
};

// Typing indicator
const handleTyping = (isTyping) => {
  socket.emit('typing', { isTyping });
};

// Listen for typing
socket.on('user_typing', (data) => {
  if (data.userType === 'admin') {
    // Tampilkan "Admin is typing..."
  }
});
```

### **3. Admin Chat Implementation:**

```javascript
// Connect as admin
const socket = io('http://localhost:3000', {
  auth: {
    token: adminToken // JWT token admin
  }
});

// Get active chat rooms
socket.emit('get_active_rooms');

socket.on('active_rooms', (rooms) => {
  // Tampilkan daftar chat rooms
  console.log('Active rooms:', rooms);
});

// Join specific room
const joinRoom = (roomId) => {
  socket.emit('join_chat', { roomId });
};

// Listen for new message notifications
socket.on('admin_notification', (notification) => {
  if (notification.type === 'new_message') {
    // Tampilkan notifikasi pesan baru
    console.log(`New message from ${notification.userEmail}`);
  }
});
```

### **4. React Component Example:**

```jsx
import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

const ChatComponent = ({ userToken, isAdmin = false }) => {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io('http://localhost:3000', {
      auth: { token: userToken }
    });

    setSocket(newSocket);

    // Join chat room
    if (isAdmin) {
      newSocket.emit('get_active_rooms');
    } else {
      newSocket.emit('join_chat', {});
    }

    // Listen for events
    newSocket.on('joined_room', (data) => {
      setMessages(data.messages);
    });

    newSocket.on('new_message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    newSocket.on('user_typing', (data) => {
      setIsTyping(data.isTyping);
    });

    return () => newSocket.close();
  }, [userToken, isAdmin]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() && socket) {
      socket.emit('send_message', {
        message: newMessage.trim()
      });
      setNewMessage('');
    }
  };

  const handleTyping = (e) => {
    if (socket) {
      socket.emit('typing', { isTyping: e.target.value.length > 0 });
    }
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.sender_type}`}>
            <strong>{msg.sender_name}:</strong> {msg.message}
            <small>{new Date(msg.created_at).toLocaleTimeString()}</small>
          </div>
        ))}
        {isTyping && <div className="typing">Someone is typing...</div>}
      </div>
      
      <form onSubmit={sendMessage} className="message-form">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => {
            setNewMessage(e.target.value);
            handleTyping(e);
          }}
          placeholder="Type your message..."
          className="message-input"
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default ChatComponent;
```

## 🔒 **Keamanan:**

- **JWT Authentication** required untuk semua socket connections
- **Role-based access** - User hanya bisa akses room mereka sendiri
- **Admin privileges** - Admin bisa akses semua rooms
- **Message validation** - Pesan kosong tidak bisa dikirim
- **Rate limiting** bisa ditambahkan di production

## 📈 **Performance Features:**

- **Database indexing** untuk queries yang cepat
- **Message pagination** untuk history yang panjang
- **Connection management** untuk memory efficiency
- **Auto-cleanup** untuk connections yang terputus

## 🛠 **Testing:**

Test koneksi socket dengan Postman atau tool serupa:

```javascript
// Test connection
const socket = io('http://localhost:3000', {
  auth: { token: 'your_jwt_token_here' }
});

socket.on('connect', () => {
  console.log('Connected to chat server');
  
  // Test join room
  socket.emit('join_chat', {});
});

socket.on('joined_room', (data) => {
  console.log('Joined room:', data.roomId);
  
  // Test send message
  socket.emit('send_message', {
    message: 'Hello, this is a test message!'
  });
});
```

## 🚀 **Production Deployment:**

1. Set environment variable untuk client URL:
```bash
CLIENT_URL=https://your-frontend-domain.com
```

2. Configure reverse proxy (Nginx) untuk WebSocket:
```nginx
location /socket.io/ {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_pass http://localhost:3000;
}
```

3. Enable clustering untuk multiple instances:
```javascript
// Gunakan Redis adapter untuk multiple server instances
const { createAdapter } = require('@socket.io/redis-adapter');
io.adapter(createAdapter(redisClient));
```

Fitur chat real-time sudah siap digunakan dengan semua fitur enterprise-level! 🎉