-- Migration: add activity types & result file metadata to consultation timeline items
USE auth_db;

ALTER TABLE consultation_timeline_items
  ADD COLUMN activity_type ENUM('progress', 'meeting', 'finalization') DEFAULT 'progress' AFTER description,
  ADD COLUMN meeting_datetime DATETIME NULL AFTER due_date,
  ADD COLUMN meeting_link VARCHAR(500) NULL AFTER meeting_datetime,
  ADD COLUMN result_file_path VARCHAR(500) NULL AFTER meeting_link,
  ADD COLUMN result_original_filename VARCHAR(255) NULL AFTER result_file_path,
  ADD COLUMN result_uploaded_at DATETIME NULL AFTER result_original_filename,
  ADD COLUMN result_uploaded_by_admin_id INT NULL AFTER result_uploaded_at,
  ADD CONSTRAINT fk_timeline_result_admin
    FOREIGN KEY (result_uploaded_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL;
