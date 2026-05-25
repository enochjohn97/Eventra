-- =============================================================================
-- EVENTRA DATABASE SCHEMA
-- Cleaned – No duplicates, no triggers that require special privileges
-- =============================================================================

-- 1. Create the database safely
CREATE DATABASE IF NOT EXISTS eventra_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Clear out any pre-existing or broken instances of this user
DROP USER IF EXISTS 'eventra'@'localhost';
DROP USER IF EXISTS 'eventra'@'127.0.0.1';

-- 3. Re-create the user accounts with your empty password choice
CREATE USER 'eventra'@'localhost' IDENTIFIED BY '';
CREATE USER 'eventra'@'127.0.0.1' IDENTIFIED BY '';

-- 4. Corrected Grant Syntax: notice the ".*" added to target all tables inside the DB
GRANT ALL PRIVILEGES ON eventra_db.* TO 'eventra'@'localhost';
GRANT ALL PRIVILEGES ON eventra_db.* TO 'eventra'@'127.0.0.1';

-- 5. Reload internal tables to apply immediately
FLUSH PRIVILEGES;


USE eventra_db;
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- AUTH ACCOUNTS (MASTER AUTH TABLE - SINGLE SOURCE OF TRUTH)
-- =============================================================================
CREATE TABLE  auth_accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(191) NOT NULL,
    username VARCHAR(200) NOT NULL,
    password VARCHAR(255) DEFAULT NULL,
    auth_provider ENUM('local', 'google') NOT NULL DEFAULT 'local',
    provider_id VARCHAR(191) DEFAULT NULL,
    role ENUM('admin', 'client', 'user') NOT NULL,
    role_locked TINYINT(1) NOT NULL DEFAULT 1,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    is_online TINYINT(1) DEFAULT 0,
    last_seen DATETIME DEFAULT NULL,
    failed_attempts INT UNSIGNED NOT NULL DEFAULT 0,
    locked_until DATETIME DEFAULT NULL,
    last_login_at DATETIME DEFAULT NULL,
    email_verified_at DATETIME DEFAULT NULL,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_auth_email (email),
    UNIQUE KEY uq_provider_id (provider_id),
    KEY idx_auth_role_active (role, is_active),
    KEY idx_auth_deleted (deleted_at),
    KEY idx_auth_last_seen (last_seen),
    KEY idx_auth_online_status (is_online, last_seen, role, deleted_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- AUTH TOKENS
-- =============================================================================
CREATE TABLE  auth_tokens (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    auth_id BIGINT UNSIGNED NOT NULL,
    token VARCHAR(255) NOT NULL,
    type ENUM('access', 'refresh', 'reset_password', 'email_verification', 'otp') NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_token (token),
    KEY idx_token_auth (auth_id),
    CONSTRAINT fk_token_auth FOREIGN KEY (auth_id)
        REFERENCES auth_accounts (id)
        ON DELETE CASCADE ON UPDATE CASCADE
)  ENGINE=INNODB DEFAULT CHARSET=UTF8MB4 COLLATE = UTF8MB4_UNICODE_CI;

-- =============================================================================
-- AUTH LOGS
-- =============================================================================
CREATE TABLE  auth_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    auth_id BIGINT UNSIGNED DEFAULT NULL,
    email VARCHAR(191) DEFAULT NULL,
    username VARCHAR(200) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    user_agent TEXT DEFAULT NULL,
    details TEXT DEFAULT NULL,
    auth_method VARCHAR(50) DEFAULT NULL,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_auth_logs_auth (auth_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- ADMINS PROFILE
-- =============================================================================
CREATE TABLE  admins (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    admin_auth_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    profile_pic VARCHAR(255) DEFAULT NULL,
    status ENUM('active', 'suspended', 'deleted') NOT NULL DEFAULT 'active',
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admin_auth (admin_auth_id),
    CONSTRAINT fk_admin_auth FOREIGN KEY (admin_auth_id) REFERENCES auth_accounts (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- CLIENTS PROFILE
-- =============================================================================
 CREATE TABLE  clients (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    custom_id VARCHAR(20) DEFAULT NULL,
    client_auth_id BIGINT UNSIGNED NOT NULL,
    business_name VARCHAR(150) NOT NULL,
    name VARCHAR(150) NOT NULL,
    job_title VARCHAR(100) DEFAULT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    company VARCHAR(150) DEFAULT NULL,
    dob DATE DEFAULT NULL,
    gender ENUM('male', 'female', 'other') DEFAULT NULL,
    nin VARCHAR(20) DEFAULT NULL,
    bvn VARCHAR(20) DEFAULT NULL,
    nin_verified TINYINT(1) DEFAULT 0,
    bvn_verified TINYINT(1) DEFAULT 0,
    account_name VARCHAR(150) DEFAULT NULL,
    account_number VARCHAR(50) DEFAULT NULL,
    bank_name VARCHAR(100) DEFAULT NULL,
    bank_code VARCHAR(50) DEFAULT NULL,
    subaccount_code VARCHAR(100) DEFAULT NULL,
    subaccount_id VARCHAR(100) DEFAULT NULL,
    verification_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
    address TEXT DEFAULT NULL,
    city VARCHAR(100) DEFAULT NULL,
    state VARCHAR(100) DEFAULT NULL,
    country VARCHAR(100) DEFAULT NULL,
    profile_pic VARCHAR(255) DEFAULT NULL,
    kyc_nin_file VARCHAR(255) DEFAULT NULL,
    kyc_bvn_file VARCHAR(255) DEFAULT NULL,
    kyc_voter_card_file VARCHAR(255) DEFAULT NULL,
    kyc_driver_license_file VARCHAR(255) DEFAULT NULL,
    kyc_cac_file VARCHAR(255) DEFAULT NULL,
    kyc_other_file VARCHAR(255) DEFAULT NULL,
    admin_notes TEXT DEFAULT NULL,
    status ENUM('online', 'offline', 'pending') DEFAULT 'pending',
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_client_auth (client_auth_id),
    UNIQUE KEY uq_client_custom_id (custom_id),
    KEY idx_client_deleted (deleted_at),
    CONSTRAINT fk_client_auth FOREIGN KEY (client_auth_id) REFERENCES auth_accounts (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- USERS PROFILE
-- =============================================================================
CREATE TABLE  users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    custom_id VARCHAR(20) DEFAULT NULL,
    user_auth_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    dob DATE DEFAULT NULL,
    gender ENUM('male', 'female', 'other') DEFAULT NULL,
    address VARCHAR(255) DEFAULT NULL,
    city VARCHAR(100) DEFAULT NULL,
    state VARCHAR(100) DEFAULT NULL,
    country VARCHAR(100) DEFAULT NULL,
    profile_pic VARCHAR(255) DEFAULT NULL,
    status ENUM('online', 'offline', 'pending') DEFAULT 'pending',
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_auth (user_auth_id),
    UNIQUE KEY uq_user_custom_id (custom_id),
    CONSTRAINT fk_user_auth FOREIGN KEY (user_auth_id) REFERENCES auth_accounts (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- EVENTS
-- =============================================================================
CREATE TABLE  events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    custom_id VARCHAR(30) DEFAULT NULL,
    client_id BIGINT UNSIGNED NOT NULL,
    event_name VARCHAR(255) NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    phone_contact_1 VARCHAR(30) NOT NULL,
    phone_contact_2 VARCHAR(30),
    address VARCHAR(255) NOT NULL,
    description TEXT DEFAULT NULL,
    location VARCHAR(255) DEFAULT NULL,
    latitude DECIMAL(10, 8) DEFAULT NULL,
    longitude DECIMAL(11, 8) DEFAULT NULL,
    state VARCHAR(100) DEFAULT NULL,
    event_date DATE DEFAULT NULL,
    event_time TIME DEFAULT NULL,
    visibility ENUM('all states', 'specific state') DEFAULT 'all states',
    price DECIMAL(12, 2) DEFAULT 0.00,
    image_path VARCHAR(500) DEFAULT NULL,
    external_link VARCHAR(200),
    tag VARCHAR(100),
    category VARCHAR(100) DEFAULT NULL,
    max_capacity INT UNSIGNED DEFAULT NULL,
    attendee_count INT UNSIGNED NOT NULL DEFAULT 0,
    priority ENUM('nearby', 'hot', 'trending', 'upcoming', 'featured') DEFAULT 'nearby',
    status ENUM('draft', 'scheduled', 'published', 'cancelled', 'archived') DEFAULT 'draft',
    scheduled_notification_at DATETIME DEFAULT NULL,
    scheduled_publish_time DATETIME DEFAULT NULL,
    notification_sent TINYINT(1) DEFAULT 0,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME DEFAULT NULL,
    event_visibility ENUM('public', 'private') DEFAULT 'public',
    ticket_type VARCHAR(100) DEFAULT 'all' COMMENT 'Comma-separated list of supported ticket types (regular,vip,premium) or all',
    PRIMARY KEY (id),
    UNIQUE KEY uq_event_custom_id (custom_id),
    KEY idx_event_client (client_id),
    KEY idx_event_client_status_deleted (client_id, status, deleted_at),
    KEY idx_event_status_deleted (status, deleted_at),
    CONSTRAINT fk_event_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------------------
-- All extra event columns added once (no duplicates)
-- -----------------------------------------------------------------
ALTER TABLE events 
    ADD COLUMN  locations JSON DEFAULT NULL COMMENT 'Per-state address map',
    ADD COLUMN  sales_count INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN  view_count INT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN  is_boosted TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN  ticket_count INT UNSIGNED DEFAULT NULL COMMENT 'Atomic available ticket stock',
    ADD COLUMN  total_tickets INT UNSIGNED DEFAULT NULL COMMENT 'Original capacity for sold-out % calc',
    ADD COLUMN  admin_status ENUM('pending','approved','banished','archived') NOT NULL DEFAULT 'pending' COMMENT 'Moderation status';

-- Backfill ticket_count / total_tickets from existing max_capacity (safe update mode disabled temporarily)
SET SQL_SAFE_UPDATES = 0;
UPDATE events 
SET 
    total_tickets = max_capacity,
    ticket_count = GREATEST(0,
            IFNULL(max_capacity, 0) - IFNULL(attendee_count, 0))
WHERE
    max_capacity IS NOT NULL
        AND total_tickets IS NULL;
SET SQL_SAFE_UPDATES = 1;

-- Performance indexes
ALTER TABLE events
    ADD KEY  idx_event_ranking (admin_status, event_date, ticket_count),
    ADD KEY  idx_event_lat_lng (latitude, longitude);

-- =============================================================================
-- ORDERS
-- =============================================================================
CREATE TABLE  orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    event_id BIGINT UNSIGNED NOT NULL,
    organizer_id BIGINT UNSIGNED NOT NULL,
    subaccount_code VARCHAR(100) DEFAULT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    transaction_reference VARCHAR(191) NOT NULL,
    payment_status ENUM('pending', 'success', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(50) DEFAULT NULL,
    refund_status ENUM('none', 'requested', 'approved', 'declined', 'processed') NOT NULL DEFAULT 'none',
    refund_reason TEXT DEFAULT NULL,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_order_reference (transaction_reference),
    KEY idx_order_user (user_id),
    KEY idx_order_event (event_id),
    KEY idx_order_organizer (organizer_id),
    KEY idx_order_status (payment_status),
    CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_order_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
    CONSTRAINT fk_order_organizer FOREIGN KEY (organizer_id) REFERENCES clients (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- PAYMENTS
-- =============================================================================
CREATE TABLE  payments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    custom_id VARCHAR(30) DEFAULT NULL,
    event_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    reference VARCHAR(191) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
    paystack_response JSON DEFAULT NULL,
    payment_id VARCHAR(100) DEFAULT NULL,
    transaction_id VARCHAR(100) DEFAULT NULL,
    paid_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_payment_reference (reference),
    UNIQUE KEY uq_payment_custom_id (custom_id),
    KEY idx_payment_user_status (user_id, status),
    KEY idx_payment_event_status (event_id, status),
    KEY idx_payment_user_event (user_id, event_id),
    CONSTRAINT fk_payment_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

ALTER TABLE payments 
    ADD COLUMN  quantity INT UNSIGNED NOT NULL DEFAULT 1,
    ADD COLUMN  ticket_type VARCHAR(50) DEFAULT 'regular';

-- =============================================================================
-- TICKETS
-- =============================================================================
CREATE TABLE  tickets (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    custom_id VARCHAR(30) DEFAULT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    event_id BIGINT UNSIGNED NOT NULL,
    payment_id BIGINT UNSIGNED NOT NULL,
    order_id BIGINT UNSIGNED DEFAULT NULL,
    barcode VARCHAR(255) NOT NULL,
    ticket_code VARCHAR(100) DEFAULT NULL,
    qr_code_path VARCHAR(255) DEFAULT NULL,
    qr_code_data TEXT DEFAULT NULL,
    status ENUM('valid', 'used', 'cancelled') DEFAULT 'valid',
    used TINYINT(1) DEFAULT 0,
    used_at DATETIME DEFAULT NULL,
    reminder_sent TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ticket_barcode (barcode),
    UNIQUE KEY uq_ticket_code (ticket_code),
    UNIQUE KEY uq_ticket_custom_id (custom_id),
    KEY idx_tickets_user (user_id),
    KEY idx_tickets_event (event_id),
    KEY idx_ticket_event_status_used (event_id , status , used),
    KEY idx_ticket_user_event (user_id , event_id),
    CONSTRAINT fk_ticket_payment FOREIGN KEY (payment_id)
        REFERENCES payments (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ticket_event FOREIGN KEY (event_id)
        REFERENCES events (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ticket_user FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ticket_order FOREIGN KEY (order_id)
        REFERENCES orders (id)
        ON DELETE SET NULL
)  ENGINE=INNODB DEFAULT CHARSET=UTF8MB4 COLLATE = UTF8MB4_UNICODE_CI;

ALTER TABLE tickets 
    ADD COLUMN  ticket_type VARCHAR(50) DEFAULT 'regular';

-- =============================================================================
-- FAVORITES
-- =============================================================================
CREATE TABLE  favorites (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    event_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_event (user_id , event_id),
    CONSTRAINT fk_fav_user FOREIGN KEY (user_id)
        REFERENCES auth_accounts (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_fav_event FOREIGN KEY (event_id)
        REFERENCES events (id)
        ON DELETE CASCADE
)  ENGINE=INNODB DEFAULT CHARSET=UTF8MB4 COLLATE = UTF8MB4_UNICODE_CI;

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================
CREATE TABLE  notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    recipient_auth_id BIGINT UNSIGNED NOT NULL,
    sender_auth_id BIGINT UNSIGNED DEFAULT NULL,
    sender_role VARCHAR(50) DEFAULT NULL,
    recipient_role VARCHAR(50) DEFAULT 'user',
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    metadata JSON DEFAULT NULL,
    data JSON DEFAULT NULL,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_notif_recipient (recipient_auth_id),
    CONSTRAINT fk_notif_recipient FOREIGN KEY (recipient_auth_id) REFERENCES auth_accounts (id) ON DELETE CASCADE,
    CONSTRAINT fk_notif_sender FOREIGN KEY (sender_auth_id) REFERENCES auth_accounts (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- MEDIA FOLDERS
-- =============================================================================
CREATE TABLE  media_folders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_deleted TINYINT(1) DEFAULT 0,
    restoration_count INT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_folder_client (client_id),
    CONSTRAINT fk_folder_client FOREIGN KEY (client_id)
        REFERENCES clients (id)
        ON DELETE CASCADE
)  ENGINE=INNODB DEFAULT CHARSET=UTF8MB4 COLLATE = UTF8MB4_UNICODE_CI;

-- =============================================================================
-- MEDIA
-- =============================================================================
CREATE TABLE  media (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id BIGINT UNSIGNED NOT NULL,
    folder_id BIGINT UNSIGNED DEFAULT NULL,
    folder_name VARCHAR(100) DEFAULT 'Event Assets',
    file_name VARCHAR(255) NOT NULL,
    file_extension VARCHAR(20) DEFAULT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type ENUM('image', 'video', 'document', 'pdf', 'word', 'excel', 'powerpoint', 'archive', 'other') DEFAULT 'other',
    file_size BIGINT UNSIGNED NOT NULL,
    mime_type VARCHAR(100) DEFAULT NULL,
    is_deleted TINYINT(1) DEFAULT 0,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_media_client (client_id),
    KEY idx_media_folder (folder_id),
    CONSTRAINT fk_media_client FOREIGN KEY (client_id)
        REFERENCES clients (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_media_folder FOREIGN KEY (folder_id)
        REFERENCES media_folders (id)
        ON DELETE SET NULL
)  ENGINE=INNODB DEFAULT CHARSET=UTF8MB4 COLLATE = UTF8MB4_UNICODE_CI;

ALTER TABLE media 
    ADD COLUMN  deleted_at DATETIME NULL DEFAULT NULL;

-- =============================================================================
-- SMS LOGS
-- =============================================================================
CREATE TABLE  sms_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    auth_id BIGINT UNSIGNED DEFAULT NULL,
    user_id BIGINT UNSIGNED DEFAULT NULL,
    client_id BIGINT UNSIGNED DEFAULT NULL,
    phone_number VARCHAR(20) NOT NULL,
    message_type ENUM('otp', 'event_reminder', 'payment_confirmation', 'ticket_confirmation', 'admin_notification') NOT NULL,
    message_body TEXT NOT NULL,
    twilio_sid VARCHAR(100) DEFAULT NULL,
    twilio_status VARCHAR(50) DEFAULT NULL,
    twilio_error_code VARCHAR(50) DEFAULT NULL,
    twilio_error_message VARCHAR(255) DEFAULT NULL,
    status ENUM('queued', 'sent', 'delivered', 'failed', 'undelivered') DEFAULT 'queued',
    sent_at DATETIME DEFAULT NULL,
    delivered_at DATETIME DEFAULT NULL,
    price DECIMAL(10,5) DEFAULT NULL,
    price_unit VARCHAR(10) DEFAULT NULL,
    metadata JSON DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_sms_auth (auth_id),
    KEY idx_sms_user (user_id),
    KEY idx_sms_client (client_id),
    KEY idx_sms_status (status),
    KEY idx_sms_type (message_type),
    CONSTRAINT fk_sms_auth FOREIGN KEY (auth_id) REFERENCES auth_accounts (id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_sms_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_sms_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- REFUND REQUESTS
-- =============================================================================
CREATE TABLE  refund_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    reason TEXT NOT NULL,
    status ENUM('pending', 'approved', 'declined') NOT NULL DEFAULT 'pending',
    organizer_note TEXT DEFAULT NULL,
    processed_at DATETIME DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_refund_order (order_id),
    KEY idx_refund_user (user_id),
    CONSTRAINT fk_refund_order FOREIGN KEY (order_id)
        REFERENCES orders (id)
        ON DELETE CASCADE,
    CONSTRAINT fk_refund_user FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE CASCADE
)  ENGINE=INNODB DEFAULT CHARSET=UTF8MB4 COLLATE = UTF8MB4_UNICODE_CI;

-- =============================================================================
-- PAYMENT OTPS
-- =============================================================================
CREATE TABLE  payment_otps (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    payment_reference VARCHAR(100) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    channel ENUM('email', 'sms') NOT NULL,
    expires_at DATETIME NOT NULL,
    verified_at DATETIME DEFAULT NULL,
    attempts INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (user_id),
    INDEX (payment_reference),
    CONSTRAINT fk_payment_otps_user FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE CASCADE
)  ENGINE=INNODB DEFAULT CHARSET=UTF8MB4 COLLATE = UTF8MB4_UNICODE_CI;

-- =============================================================================
-- TICKET DAILY SEQUENCE
-- =============================================================================
CREATE TABLE  ticket_daily_sequence (
    seq_date DATE NOT NULL,
    seq_value INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (seq_date)
)  ENGINE=INNODB DEFAULT CHARSET=UTF8MB4 COLLATE = UTF8MB4_UNICODE_CI;

-- =============================================================================
-- SEED DEFAULT SYSTEM ADMIN
-- =============================================================================
INSERT IGNORE INTO auth_accounts (
    email, username, password, auth_provider, role, role_locked, is_active, email_verified_at
) VALUES (
    'admin@eventra.com', 'admin', '$2y$10$iPiJGuc.fOdzO109eUDsvefK44TZwvQlCICiVxbD1KHYRx1lxwrVS', 'local', 'admin', 1, 1, NOW()
);

INSERT IGNORE INTO admins (
    admin_auth_id, name, profile_pic, metadata
) VALUES (
    (SELECT id FROM auth_accounts WHERE email = 'admin@eventra.com'),
    'System Administrator', '/public/assets/imgs/admin.png',
    JSON_OBJECT('created_by', 'system', 'immutable', true, 'note', 'Default system administrator account')
);

-- =============================================================================
-- FOREIGN KEY FIX FOR AUTH LOGS (CASCADE DELETE)
-- =============================================================================
ALTER TABLE auth_logs 
    ADD CONSTRAINT fk_auth_logs_auth 
    FOREIGN KEY (auth_id) REFERENCES auth_accounts (id) 
    ON DELETE CASCADE ON UPDATE CASCADE;
    
-- =============================================================================
-- RE-ENABLE FOREIGN KEY CHECKS
-- =============================================================================
SET FOREIGN_KEY_CHECKS = 1;