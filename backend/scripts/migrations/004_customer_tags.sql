ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS customer_tag VARCHAR(50) NOT NULL DEFAULT 'prospect_new',
  ADD COLUMN IF NOT EXISTS customer_tag_source ENUM('auto', 'manual') NOT NULL DEFAULT 'auto';

UPDATE users 
SET 
  customer_tag = COALESCE(customer_tag, 'prospect_new'),
  customer_tag_source = COALESCE(customer_tag_source, 'auto');
