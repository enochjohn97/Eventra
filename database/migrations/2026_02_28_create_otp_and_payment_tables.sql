-- Migration to create tables for OTP verification, transactions, and tickets

-- Table for storing payment OTPs
CREATE TABLE IF NOT EXISTS payment_otps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    payment_reference VARCHAR(100) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    channel ENUM('email', 'sms') NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id),
    INDEX (payment_reference)
);

-- Table for storing payment transactions (if not already exists via paystack)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    event_id INT NOT NULL,
    payment_reference VARCHAR(100) NOT NULL UNIQUE,
    amount DECIMAL(15, 2) NOT NULL,
    status ENUM(
        'pending',
        'success',
        'failed'
    ) DEFAULT 'pending',
    provider_response TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id),
    INDEX (event_id)
);

-- Update existing tickets table if necessary or create a new one for production-ready logic
-- Based on codebase, tickets table already exists, but we might need to ensure consistency
-- The prompt asks for: id, user_id, event_id, ticket_code (unique), qr_code_path, status, created_at
-- Our existing tickets table has: id, payment_id, barcode, used, created_at
-- We will align with the prompt requirements while keeping compatibility if possible.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS user_id INT AFTER id;

ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS event_id INT AFTER user_id;

ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS ticket_code VARCHAR(100) UNIQUE AFTER event_id;

ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS qr_code_path VARCHAR(255) AFTER ticket_code;

ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS status ENUM('valid', 'used', 'cancelled') DEFAULT 'valid' AFTER qr_code_path;

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets (user_id);

CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets (event_id);