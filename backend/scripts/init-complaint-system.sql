-- Ensure we operate on the correct database
USE auth_db;

-- Create warranty tickets table
CREATE TABLE IF NOT EXISTS warranty_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  status ENUM('active', 'used', 'expired') NOT NULL DEFAULT 'active',
  issue_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY unique_order_product (order_id, product_id)
);

-- Create complaints table
CREATE TABLE IF NOT EXISTS complaints (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  user_id INT NOT NULL,
  admin_id INT,
  title VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  evidence_photo VARCHAR(500),
  priority ENUM('low', 'medium', 'high') DEFAULT 'low',
  status ENUM('pending', 'accepted', 'rejected', 'resolved') NOT NULL DEFAULT 'pending',
  admin_comment TEXT,
  chat_room_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (ticket_id) REFERENCES warranty_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL,
  FOREIGN KEY (chat_room_id) REFERENCES chat_rooms(id) ON DELETE SET NULL
);

-- Create complaints_chat_rooms junction table for better tracking
CREATE TABLE IF NOT EXISTS complaint_chat_rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT NOT NULL,
  chat_room_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
  FOREIGN KEY (chat_room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE,
  UNIQUE KEY unique_complaint_room (complaint_id, chat_room_id)
);

-- Create indexes for better performance
CREATE INDEX idx_warranty_tickets_user_id ON warranty_tickets(user_id);
CREATE INDEX idx_warranty_tickets_order_id ON warranty_tickets(order_id);
CREATE INDEX idx_warranty_tickets_status ON warranty_tickets(status);

CREATE INDEX idx_complaints_user_id ON complaints(user_id);
CREATE INDEX idx_complaints_admin_id ON complaints(admin_id);
CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaints_priority ON complaints(priority);
CREATE INDEX idx_complaints_created_at ON complaints(created_at);

-- Add trigger to automatically create warranty tickets when order is completed
DROP TRIGGER IF EXISTS create_warranty_tickets_after_order_confirmed;
DROP TRIGGER IF EXISTS create_warranty_tickets_after_order_completed;
DELIMITER //
CREATE TRIGGER create_warranty_tickets_after_order_completed
AFTER UPDATE ON orders
FOR EACH ROW
BEGIN
  -- Only create tickets when status changes to 'completed'
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO warranty_tickets (order_id, user_id, product_id, issue_date, expiry_date)
    SELECT 
      NEW.id,
      NEW.user_id,
      oi.product_id,
      CURDATE(),
      DATE_ADD(CURDATE(), INTERVAL 30 DAY) -- 30-day warranty
    FROM order_items oi
    WHERE oi.order_id = NEW.id
    ON DUPLICATE KEY UPDATE
      status = 'active',
      issue_date = CURDATE(),
      expiry_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY);
  END IF;
END//
DELIMITER ;
