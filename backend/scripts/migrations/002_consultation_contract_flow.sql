-- Migration: enrich consultation contracts with project cost & payment tracking
USE auth_db;

ALTER TABLE consultations
  ADD COLUMN payment_status VARCHAR(50) NOT NULL DEFAULT 'not_ready' AFTER status,
  ADD COLUMN cancellation_fee_percent DECIMAL(5,2) DEFAULT 10.00 AFTER payment_status,
  ADD COLUMN cancellation_fee_amount DECIMAL(12,2) DEFAULT 0 AFTER cancellation_fee_percent,
  ADD COLUMN final_delivery_status VARCHAR(50) NOT NULL DEFAULT 'not_ready' AFTER cancellation_fee_amount,
  ADD COLUMN final_delivery_note TEXT AFTER final_delivery_status;

ALTER TABLE consultation_contracts
  ADD COLUMN project_cost DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER admin_id;

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
