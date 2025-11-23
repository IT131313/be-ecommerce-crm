USE auth_db;

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
