-- Migration: add pre-contract meeting link and datetime on consultations
USE auth_db;

ALTER TABLE consultations
  ADD COLUMN pre_contract_meet_link VARCHAR(500) NULL AFTER notes,
  ADD COLUMN pre_contract_meet_datetime DATETIME NULL AFTER pre_contract_meet_link;
