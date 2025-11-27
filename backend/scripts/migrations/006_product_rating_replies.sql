-- Migration: add admin reply fields to product_ratings
USE auth_db;

ALTER TABLE product_ratings
  ADD COLUMN admin_reply TEXT NULL,
  ADD COLUMN admin_reply_by INT NULL,
  ADD COLUMN admin_reply_at DATETIME NULL,
  ADD CONSTRAINT fk_product_ratings_admin_reply_by FOREIGN KEY (admin_reply_by) REFERENCES admins(id) ON DELETE SET NULL;
