-- Create the database if it doesn't exist
CREATE DATABASE IF NOT EXISTS auth_db;

-- Use the database
USE auth_db;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  customer_tag VARCHAR(50) NOT NULL DEFAULT 'prospect_new',
  customer_tag_source ENUM('auto', 'manual') NOT NULL DEFAULT 'auto',
  phone VARCHAR(25),
  address TEXT,
  reset_pin VARCHAR(10),
  reset_pin_expiry DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create admin table
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  reset_pin VARCHAR(10),
  reset_pin_expiry DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create services table
CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  price DECIMAL(10,2),
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  image_url VARCHAR(500),
  rating DECIMAL(3,2) DEFAULT 0,
  rating_count INT DEFAULT 0,
  stock INT DEFAULT 0,
  sold INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create product ratings table
CREATE TABLE IF NOT EXISTS product_ratings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  order_id INT NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  review TEXT,
  admin_reply TEXT,
  admin_reply_by INT,
  admin_reply_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_product_rating (user_id, product_id, order_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_reply_by) REFERENCES admins(id) ON DELETE SET NULL
);

CREATE INDEX idx_product_ratings_product_id ON product_ratings(product_id);
CREATE INDEX idx_product_ratings_order_id ON product_ratings(order_id);

-- Create cart_items table
CREATE TABLE IF NOT EXISTS cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  shipping_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping_address TEXT,
  contact_phone VARCHAR(25),
  shipping_method VARCHAR(10),
  tracking_number VARCHAR(100),
  shipped_at DATETIME,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  price_at_time DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Create payment transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reference_type ENUM('order', 'consultation') NOT NULL,
  reference_id INT NOT NULL,
  purpose VARCHAR(50) NOT NULL,
  order_code VARCHAR(50) NOT NULL UNIQUE,
  user_id INT,
  snap_token VARCHAR(255),
  redirect_url VARCHAR(500),
  gross_amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'IDR',
  transaction_status VARCHAR(50) DEFAULT 'token',
  payment_type VARCHAR(50),
  fraud_status VARCHAR(50),
  settlement_time DATETIME,
  midtrans_transaction_id VARCHAR(100),
  payment_response TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_payment_reference (reference_type, reference_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create consultation types table
CREATE TABLE IF NOT EXISTS consultation_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create design categories table
CREATE TABLE IF NOT EXISTS design_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create design styles table
CREATE TABLE IF NOT EXISTS design_styles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create consultations table
CREATE TABLE IF NOT EXISTS consultations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  service_id INT NOT NULL,
  consultation_type_id INT NOT NULL,
  design_category_id INT,
  design_style_id INT,
  consultation_date DATE NOT NULL,
  consultation_time TIME,
  address TEXT,
  notes TEXT,
  pre_contract_meet_link VARCHAR(500),
  pre_contract_meet_datetime DATETIME,
  reference_image_primary VARCHAR(500),
  reference_image_secondary VARCHAR(500),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  payment_status VARCHAR(50) NOT NULL DEFAULT 'not_ready',
  cancellation_fee_percent DECIMAL(5,2) DEFAULT 10.00,
  cancellation_fee_amount DECIMAL(12,2) DEFAULT 0,
  final_delivery_status VARCHAR(50) NOT NULL DEFAULT 'not_ready',
  final_delivery_note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (consultation_type_id) REFERENCES consultation_types(id) ON DELETE CASCADE,
  FOREIGN KEY (design_category_id) REFERENCES design_categories(id) ON DELETE CASCADE,
  FOREIGN KEY (design_style_id) REFERENCES design_styles(id) ON DELETE CASCADE
);

-- Create consultation contracts table
CREATE TABLE IF NOT EXISTS consultation_contracts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  consultation_id INT NOT NULL,
  admin_id INT,
  project_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  file_path VARCHAR(500) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

-- Create consultation timeline items table
CREATE TABLE IF NOT EXISTS consultation_timeline_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contract_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  activity_type ENUM('progress', 'meeting', 'finalization') DEFAULT 'progress',
  status ENUM('pending', 'in_progress', 'completed', 'cancel') DEFAULT 'pending',
  due_date DATE,
  meeting_datetime DATETIME,
  meeting_link VARCHAR(500),
  result_file_path VARCHAR(500),
  result_original_filename VARCHAR(255),
  result_uploaded_at DATETIME,
  result_uploaded_by_admin_id INT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (contract_id) REFERENCES consultation_contracts(id) ON DELETE CASCADE,
  FOREIGN KEY (result_uploaded_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

-- Consultation timeline comments (conversation per item)
CREATE TABLE IF NOT EXISTS consultation_timeline_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  timeline_item_id INT NOT NULL,
  author_type ENUM('user', 'admin') NOT NULL,
  author_user_id INT,
  author_admin_id INT,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (timeline_item_id) REFERENCES consultation_timeline_items(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (author_admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

-- Create chat rooms table
CREATE TABLE IF NOT EXISTS chat_rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  admin_id INT,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
);

-- Create chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  sender_id INT NOT NULL,
  sender_type ENUM('user', 'admin') NOT NULL,
  message TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE
);

-- Create index for better performance
CREATE INDEX idx_chat_rooms_user_id ON chat_rooms(user_id);
CREATE INDEX idx_chat_messages_room_id ON chat_messages(room_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

-- Revoked tokens (for logout/blacklist)
CREATE TABLE IF NOT EXISTS revoked_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(1024) NOT NULL UNIQUE,
  expires_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optional cleanup index
CREATE INDEX idx_revoked_tokens_expires_at ON revoked_tokens(expires_at);

-- Notifications (metadata)
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
);

-- Notification read state per user
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
);
