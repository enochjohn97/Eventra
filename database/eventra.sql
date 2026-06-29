-- =============================================================================
-- EVENTRA DATABASE SCHEMA v2.0
-- Restructured for clarity, performance, and maintainability
-- =============================================================================

-- =============================================================================
-- SECTION 1: DATABASE & USER SETUP
-- =============================================================================

-- 1.1 Database Creation
CREATE DATABASE IF NOT EXISTS eventra_db 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

-- 1.2 User Management
DROP USER IF EXISTS 'eventra'@'localhost';
DROP USER IF EXISTS 'eventra'@'127.0.0.1';

CREATE USER 'eventra'@'localhost' IDENTIFIED BY '';
CREATE USER 'eventra'@'127.0.0.1' IDENTIFIED BY '';

GRANT ALL PRIVILEGES ON eventra_db.* TO 'eventra'@'localhost';
GRANT ALL PRIVILEGES ON eventra_db.* TO 'eventra'@'127.0.0.1';
FLUSH PRIVILEGES;

USE eventra_db;
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- SECTION 2: AUTHENTICATION & AUTHORIZATION
-- =============================================================================

-- 2.1 Master Authentication Table (Single Source of Truth)
CREATE TABLE auth_accounts (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email               VARCHAR(191) NOT NULL,
    username            VARCHAR(200) NOT NULL,
    password            VARCHAR(255) DEFAULT NULL,
    auth_provider       ENUM('local', 'google') NOT NULL DEFAULT 'local',
    provider_id         VARCHAR(191) DEFAULT NULL,
    role                ENUM('admin', 'client', 'user') NOT NULL,
    role_locked         TINYINT(1) NOT NULL DEFAULT 1,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    is_online           TINYINT(1) DEFAULT 0,
    last_seen           DATETIME DEFAULT NULL,
    failed_attempts     INT UNSIGNED NOT NULL DEFAULT 0,
    locked_until        DATETIME DEFAULT NULL,
    last_login_at       DATETIME DEFAULT NULL,
    email_verified_at   DATETIME DEFAULT NULL,
    metadata            JSON DEFAULT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME DEFAULT NULL,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_auth_email (email),
    UNIQUE KEY uq_provider_id (provider_id),
    KEY idx_auth_role_active (role, is_active),
    KEY idx_auth_deleted (deleted_at),
    KEY idx_auth_last_seen (last_seen),
    KEY idx_auth_online_status (is_online, last_seen, role, deleted_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 2.2 Authentication Tokens
CREATE TABLE auth_tokens (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    auth_id     BIGINT UNSIGNED NOT NULL,
    token       VARCHAR(255) NOT NULL,
    type        ENUM('access', 'refresh', 'reset_password', 'email_verification', 'otp') NOT NULL,
    expires_at  DATETIME NOT NULL,
    revoked     TINYINT(1) DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_token (token),
    KEY idx_token_auth (auth_id),
    CONSTRAINT fk_token_auth 
        FOREIGN KEY (auth_id) REFERENCES auth_accounts (id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 2.3 Authentication Audit Logs
CREATE TABLE auth_logs (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    auth_id     BIGINT UNSIGNED DEFAULT NULL,
    email       VARCHAR(191) DEFAULT NULL,
    username    VARCHAR(200) NOT NULL,
    event_type  VARCHAR(100) NOT NULL,
    ip_address  VARCHAR(45) DEFAULT NULL,
    user_agent  TEXT DEFAULT NULL,
    details     TEXT DEFAULT NULL,
    auth_method VARCHAR(50) DEFAULT NULL,
    metadata    JSON DEFAULT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    KEY idx_auth_logs_auth (auth_id),
    CONSTRAINT fk_auth_logs_auth 
        FOREIGN KEY (auth_id) REFERENCES auth_accounts (id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 3: USER PROFILES (Role-Specific)
-- =============================================================================

-- 3.1 Administrator Profiles
CREATE TABLE admins (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    admin_auth_id   BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(150) NOT NULL,
    profile_pic     VARCHAR(255) DEFAULT NULL,
    status          ENUM('active', 'suspended', 'deleted') NOT NULL DEFAULT 'active',
    metadata        JSON DEFAULT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_admin_auth (admin_auth_id),
    CONSTRAINT fk_admin_auth 
        FOREIGN KEY (admin_auth_id) REFERENCES auth_accounts (id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 3.2 Client/Organizer Profiles
CREATE TABLE clients (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    custom_id               VARCHAR(20) DEFAULT NULL,
    client_auth_id          BIGINT UNSIGNED NOT NULL,
    business_name           VARCHAR(150) NOT NULL,
    name                    VARCHAR(150) NOT NULL,
    job_title               VARCHAR(100) DEFAULT NULL,
    phone                   VARCHAR(20) DEFAULT NULL,
    company                 VARCHAR(150) DEFAULT NULL,
    dob                     DATE DEFAULT NULL,
    gender                  ENUM('male', 'female', 'other') DEFAULT NULL,
    
    -- KYC & Verification
    nin_verified            TINYINT(1) DEFAULT 0,
    bvn_verified            TINYINT(1) DEFAULT 0,
    verification_status     ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
    
    -- Banking Details
    account_name            VARCHAR(150) DEFAULT NULL,
    account_number          VARCHAR(50) DEFAULT NULL,
    bank_name               VARCHAR(100) DEFAULT NULL,
    bank_code               VARCHAR(50) DEFAULT NULL,
    subaccount_code         VARCHAR(100) DEFAULT NULL,
    subaccount_id           VARCHAR(100) DEFAULT NULL,
    
    -- Contact & Location
    address                 TEXT DEFAULT NULL,
    city                    VARCHAR(100) DEFAULT NULL,
    state                   VARCHAR(100) DEFAULT NULL,
    country                 VARCHAR(100) DEFAULT NULL,
    
    -- Media & Documents
    profile_pic             VARCHAR(255) DEFAULT NULL,
    kyc_nin_file            VARCHAR(255) DEFAULT NULL,
    kyc_bvn_file            VARCHAR(255) DEFAULT NULL,
    kyc_voter_card_file     VARCHAR(255) DEFAULT NULL,
    kyc_driver_license_file VARCHAR(255) DEFAULT NULL,
    kyc_cac_file            VARCHAR(255) DEFAULT NULL,
    
    -- Status & Metadata
    admin_notes             TEXT DEFAULT NULL,
    status                  ENUM('online', 'offline', 'pending') DEFAULT 'pending',
    metadata                JSON DEFAULT NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at              DATETIME DEFAULT NULL,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_client_auth (client_auth_id),
    UNIQUE KEY uq_client_custom_id (custom_id),
    KEY idx_client_deleted (deleted_at),
    CONSTRAINT fk_client_auth 
        FOREIGN KEY (client_auth_id) REFERENCES auth_accounts (id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 3.3 End-User Profiles
CREATE TABLE users (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    custom_id       VARCHAR(20) DEFAULT NULL,
    user_auth_id    BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(150) NOT NULL,
    phone           VARCHAR(20) DEFAULT NULL,
    dob             DATE DEFAULT NULL,
    gender          ENUM('male', 'female', 'other') DEFAULT NULL,
    
    -- Location
    address         VARCHAR(255) DEFAULT NULL,
    city            VARCHAR(100) DEFAULT NULL,
    state           VARCHAR(100) DEFAULT NULL,
    country         VARCHAR(100) DEFAULT NULL,
    
    -- KYC Verification
    kyc_status              ENUM('unverified', 'pending', 'verified', 'failed') DEFAULT 'unverified',
    smile_id_result_text    TEXT NULL,
    kyc_document_name       VARCHAR(255) NULL,
    
    -- Profile & Status
    profile_pic     VARCHAR(255) DEFAULT NULL,
    status          ENUM('online', 'offline', 'pending') DEFAULT 'pending',
    metadata        JSON DEFAULT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at      DATETIME DEFAULT NULL,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_auth (user_auth_id),
    UNIQUE KEY uq_user_custom_id (custom_id),
    CONSTRAINT fk_user_auth 
        FOREIGN KEY (user_auth_id) REFERENCES auth_accounts (id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 4: EVENT MANAGEMENT
-- =============================================================================

CREATE TABLE events (
    id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    custom_id                   VARCHAR(30) DEFAULT NULL,
    client_id                   BIGINT UNSIGNED NOT NULL,
    
    -- Event Details
    event_name                  VARCHAR(255) NOT NULL,
    event_type                  VARCHAR(255) NOT NULL,
    description                 TEXT DEFAULT NULL,
    category                    VARCHAR(100) DEFAULT NULL,
    tag                         VARCHAR(100) DEFAULT NULL,
    
    -- Contact Information
    phone_contact_1             VARCHAR(30) NOT NULL,
    phone_contact_2             VARCHAR(30) DEFAULT NULL,
    
    -- Location Details
    address                     VARCHAR(255) NOT NULL,
    location                    VARCHAR(255) DEFAULT NULL,
    latitude                    DECIMAL(10, 8) DEFAULT NULL,
    longitude                   DECIMAL(11, 8) DEFAULT NULL,
    state                       VARCHAR(100) DEFAULT NULL,
    locations                   JSON DEFAULT NULL COMMENT 'Per-state address map',
    
    -- Scheduling
    event_date                  DATE DEFAULT NULL,
    event_time                  TIME DEFAULT NULL,
    scheduled_publish_time      DATETIME DEFAULT NULL,
    scheduled_notification_at   DATETIME DEFAULT NULL,
    scheduling_reminder_sent    TINYINT(1) DEFAULT 0,
    user_reminder_sent          TINYINT(1) DEFAULT 0,
    notification_sent           TINYINT(1) DEFAULT 0,
    
    -- Pricing & Ticketing
    price                       DECIMAL(12, 2) DEFAULT 0.00,
    ticket_type                 VARCHAR(100) DEFAULT 'all' COMMENT 'Comma-separated: regular,vip,premium or all',
    max_capacity                INT UNSIGNED DEFAULT NULL,
    ticket_count                INT UNSIGNED DEFAULT NULL COMMENT 'Available ticket stock',
    total_tickets               INT UNSIGNED DEFAULT NULL COMMENT 'Original capacity',
    attendee_count              INT UNSIGNED NOT NULL DEFAULT 0,
    sales_count                 INT UNSIGNED NOT NULL DEFAULT 0,
    
    -- Visibility & Status
    event_visibility            ENUM('public', 'private') DEFAULT 'public',
    visibility                  ENUM('all states', 'specific state') DEFAULT 'all states',
    priority                    ENUM('nearby', 'hot', 'trending', 'upcoming', 'featured') DEFAULT 'nearby',
    status                      ENUM('draft', 'scheduled', 'published', 'cancelled', 'archived') DEFAULT 'draft',
    admin_status                ENUM('pending', 'approved', 'banished', 'archived') NOT NULL DEFAULT 'pending',
    
    -- Media & Links
    image_path                  VARCHAR(500) DEFAULT NULL,
    external_link               VARCHAR(200) DEFAULT NULL,
    
    -- Engagement Metrics
    view_count                  INT UNSIGNED NOT NULL DEFAULT 0,
    is_boosted                  TINYINT(1) NOT NULL DEFAULT 0,
    
    -- Metadata & Timestamps
    metadata                    JSON DEFAULT NULL,
    created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at                  DATETIME DEFAULT NULL,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_event_custom_id (custom_id),
    KEY idx_event_client (client_id),
    KEY idx_event_client_status_deleted (client_id, status, deleted_at),
    KEY idx_event_status_deleted (status, deleted_at),
    KEY idx_event_ranking (admin_status, event_date, ticket_count),
    KEY idx_event_lat_lng (latitude, longitude),
    CONSTRAINT fk_event_client 
        FOREIGN KEY (client_id) REFERENCES clients (id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Backfill ticket inventory data
SET SQL_SAFE_UPDATES = 0;
UPDATE events 
SET total_tickets = max_capacity,
    ticket_count = GREATEST(0, IFNULL(max_capacity, 0) - IFNULL(attendee_count, 0))
WHERE max_capacity IS NOT NULL 
  AND total_tickets IS NULL;
SET SQL_SAFE_UPDATES = 1;

-- =============================================================================
-- SECTION 5: TRANSACTIONS & PAYMENTS
-- =============================================================================

-- 5.1 Orders
CREATE TABLE orders (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id                 BIGINT UNSIGNED NOT NULL,
    event_id                BIGINT UNSIGNED NOT NULL,
    organizer_id            BIGINT UNSIGNED NOT NULL,
    subaccount_code         VARCHAR(100) DEFAULT NULL,
    amount                  DECIMAL(12, 2) NOT NULL,
    transaction_reference   VARCHAR(191) NOT NULL,
    payment_status          ENUM('pending', 'success', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
    payment_method          VARCHAR(50) DEFAULT NULL,
    refund_status           ENUM('none', 'requested', 'approved', 'declined', 'processed') NOT NULL DEFAULT 'none',
    refund_reason           TEXT DEFAULT NULL,
    metadata                JSON DEFAULT NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_order_reference (transaction_reference),
    KEY idx_order_user (user_id),
    KEY idx_order_event (event_id),
    KEY idx_order_organizer (organizer_id),
    KEY idx_order_status (payment_status),
    CONSTRAINT fk_order_user 
        FOREIGN KEY (user_id) REFERENCES users (id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_order_event 
        FOREIGN KEY (event_id) REFERENCES events (id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_order_organizer 
        FOREIGN KEY (organizer_id) REFERENCES clients (id) 
        ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 5.2 Payments
CREATE TABLE payments (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    custom_id           VARCHAR(30) DEFAULT NULL,
    event_id            BIGINT UNSIGNED NOT NULL,
    user_id             BIGINT UNSIGNED NOT NULL,
    reference           VARCHAR(191) NOT NULL,
    amount              DECIMAL(12, 2) NOT NULL,
    quantity            INT UNSIGNED NOT NULL DEFAULT 1,
    ticket_type         VARCHAR(50) DEFAULT 'regular',
    status              ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
    paystack_response   JSON DEFAULT NULL,
    payment_id          VARCHAR(100) DEFAULT NULL,
    transaction_id      VARCHAR(100) DEFAULT NULL,
    paid_at             DATETIME DEFAULT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_payment_reference (reference),
    UNIQUE KEY uq_payment_custom_id (custom_id),
    KEY idx_payment_user_status (user_id, status),
    KEY idx_payment_event_status (event_id, status),
    KEY idx_payment_user_event (user_id, event_id),
    CONSTRAINT fk_payment_event 
        FOREIGN KEY (event_id) REFERENCES events (id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_payment_user 
        FOREIGN KEY (user_id) REFERENCES users (id) 
        ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 5.3 Payment OTPs
CREATE TABLE payment_otps (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT UNSIGNED NOT NULL,
    payment_reference   VARCHAR(100) NOT NULL,
    otp_hash            VARCHAR(255) NOT NULL,
    channel             ENUM('email', 'sms') NOT NULL,
    expires_at          DATETIME NOT NULL,
    verified_at         DATETIME DEFAULT NULL,
    attempts            INT DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    KEY idx_otp_user (user_id),
    KEY idx_otp_reference (payment_reference),
    CONSTRAINT fk_payment_otps_user 
        FOREIGN KEY (user_id) REFERENCES users (id) 
        ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 5.4 Refund Requests
CREATE TABLE refund_requests (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id        BIGINT UNSIGNED NOT NULL,
    user_id         BIGINT UNSIGNED NOT NULL,
    reason          TEXT NOT NULL,
    status          ENUM('pending', 'approved', 'declined') NOT NULL DEFAULT 'pending',
    organizer_note  TEXT DEFAULT NULL,
    processed_at    DATETIME DEFAULT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    KEY idx_refund_order (order_id),
    KEY idx_refund_user (user_id),
    CONSTRAINT fk_refund_order 
        FOREIGN KEY (order_id) REFERENCES orders (id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_refund_user 
        FOREIGN KEY (user_id) REFERENCES users (id) 
        ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 6: TICKETING SYSTEM
-- =============================================================================

-- 6.1 Ticket Daily Sequence Generator
CREATE TABLE ticket_daily_sequence (
    seq_date    DATE NOT NULL,
    seq_value   INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (seq_date)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 6.2 Tickets
CREATE TABLE tickets (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    custom_id       VARCHAR(30) DEFAULT NULL,
    user_id         BIGINT UNSIGNED NOT NULL,
    event_id        BIGINT UNSIGNED NOT NULL,
    payment_id      BIGINT UNSIGNED NOT NULL,
    order_id        BIGINT UNSIGNED DEFAULT NULL,
    barcode         VARCHAR(255) NOT NULL,
    ticket_code     VARCHAR(100) DEFAULT NULL,
    ticket_type     VARCHAR(50) DEFAULT 'regular',
    qr_code_path    VARCHAR(255) DEFAULT NULL,
    qr_code_data    TEXT DEFAULT NULL,
    status          ENUM('valid', 'used', 'cancelled') DEFAULT 'valid',
    used            TINYINT(1) DEFAULT 0,
    used_at         DATETIME DEFAULT NULL,
    reminder_sent   TINYINT(1) DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_ticket_barcode (barcode),
    UNIQUE KEY uq_ticket_code (ticket_code),
    UNIQUE KEY uq_ticket_custom_id (custom_id),
    KEY idx_tickets_user (user_id),
    KEY idx_tickets_event (event_id),
    KEY idx_ticket_event_status_used (event_id, status, used),
    KEY idx_ticket_user_event (user_id, event_id),
    CONSTRAINT fk_ticket_payment 
        FOREIGN KEY (payment_id) REFERENCES payments (id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_ticket_event 
        FOREIGN KEY (event_id) REFERENCES events (id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_ticket_user 
        FOREIGN KEY (user_id) REFERENCES users (id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_ticket_order 
        FOREIGN KEY (order_id) REFERENCES orders (id) 
        ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 7: USER ENGAGEMENT
-- =============================================================================

-- 7.1 Favorites
CREATE TABLE favorites (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED NOT NULL,
    event_id    BIGINT UNSIGNED NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_event (user_id, event_id),
    CONSTRAINT fk_fav_user 
        FOREIGN KEY (user_id) REFERENCES auth_accounts (id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_fav_event 
        FOREIGN KEY (event_id) REFERENCES events (id) 
        ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 7.2 Notifications
CREATE TABLE notifications (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    recipient_auth_id   BIGINT UNSIGNED NOT NULL,
    sender_auth_id      BIGINT UNSIGNED DEFAULT NULL,
    sender_role         VARCHAR(50) DEFAULT NULL,
    recipient_role      VARCHAR(50) DEFAULT 'user',
    message             TEXT NOT NULL,
    type                VARCHAR(50) NOT NULL,
    metadata            JSON DEFAULT NULL,
    data                JSON DEFAULT NULL,
    is_read             TINYINT(1) DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    KEY idx_notif_recipient (recipient_auth_id),
    CONSTRAINT fk_notif_recipient 
        FOREIGN KEY (recipient_auth_id) REFERENCES auth_accounts (id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_notif_sender 
        FOREIGN KEY (sender_auth_id) REFERENCES auth_accounts (id) 
        ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 8: COMMUNICATION
-- =============================================================================

-- 8.1 SMS Logs
CREATE TABLE sms_logs (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    auth_id             BIGINT UNSIGNED DEFAULT NULL,
    user_id             BIGINT UNSIGNED DEFAULT NULL,
    client_id           BIGINT UNSIGNED DEFAULT NULL,
    phone_number        VARCHAR(20) NOT NULL,
    message_type        ENUM('otp', 'event_reminder', 'payment_confirmation', 'ticket_confirmation', 'admin_notification') NOT NULL,
    message_body        TEXT NOT NULL,
    termii_sid          VARCHAR(100) DEFAULT NULL,
    termii_status       VARCHAR(50) DEFAULT NULL,
    termii_error_code   VARCHAR(50) DEFAULT NULL,
    termii_error_message VARCHAR(255) DEFAULT NULL,
    status              ENUM('queued', 'sent', 'delivered', 'failed', 'undelivered') DEFAULT 'queued',
    sent_at             DATETIME DEFAULT NULL,
    delivered_at        DATETIME DEFAULT NULL,
    price               DECIMAL(10,5) DEFAULT NULL,
    price_unit          VARCHAR(10) DEFAULT NULL,
    metadata            JSON DEFAULT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    KEY idx_sms_auth (auth_id),
    KEY idx_sms_user (user_id),
    KEY idx_sms_client (client_id),
    KEY idx_sms_status (status),
    KEY idx_sms_type (message_type),
    CONSTRAINT fk_sms_auth 
        FOREIGN KEY (auth_id) REFERENCES auth_accounts (id) 
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_sms_user 
        FOREIGN KEY (user_id) REFERENCES users (id) 
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_sms_client 
        FOREIGN KEY (client_id) REFERENCES clients (id) 
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 8.2 Support Chat System
CREATE TABLE support_chats (
    id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ticket_id       VARCHAR(100) NOT NULL DEFAULT 'general',
    sender_role     ENUM('admin', 'client', 'user') NOT NULL DEFAULT 'user',
    sender_id       BIGINT UNSIGNED NOT NULL DEFAULT 0,
    event_owner_id  BIGINT UNSIGNED DEFAULT NULL,
    refund_status   ENUM('none', 'pending_admin', 'approved', 'declined') NOT NULL DEFAULT 'none',
    escalated       TINYINT(1) NOT NULL DEFAULT 0,
    status          ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    paystack_ref    VARCHAR(255) DEFAULT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    KEY idx_sc_ticket (ticket_id),
    KEY idx_sc_sender (sender_role, sender_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 8.3 Chat Messages
CREATE TABLE chat_messages (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    chat_id         INT NOT NULL,
    sender_id       BIGINT UNSIGNED NOT NULL DEFAULT 0,
    sender_type     ENUM('admin', 'client', 'user') NOT NULL DEFAULT 'user',
    receiver_id     BIGINT UNSIGNED NOT NULL DEFAULT 0,
    receiver_type   ENUM('admin', 'client', 'user') NOT NULL DEFAULT 'admin',
    message         TEXT NOT NULL,
    is_read         TINYINT(1) NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    KEY idx_cm_chat (chat_id),
    KEY idx_cm_sender (sender_id),
    KEY idx_cm_receiver (receiver_id),
    KEY idx_cm_created (created_at),
    CONSTRAINT fk_cm_chat 
        FOREIGN KEY (chat_id) REFERENCES support_chats (id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 9: MEDIA MANAGEMENT
-- =============================================================================

-- 9.1 Media Folders
CREATE TABLE media_folders (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id           BIGINT UNSIGNED NOT NULL,
    name                VARCHAR(100) NOT NULL,
    is_deleted          TINYINT(1) DEFAULT 0,
    restoration_count   INT UNSIGNED DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    KEY idx_folder_client (client_id),
    CONSTRAINT fk_folder_client 
        FOREIGN KEY (client_id) REFERENCES clients (id) 
        ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 9.2 Media Files
CREATE TABLE media (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id       BIGINT UNSIGNED NOT NULL,
    folder_id       BIGINT UNSIGNED DEFAULT NULL,
    folder_name     VARCHAR(100) DEFAULT 'Event Assets',
    file_name       VARCHAR(255) NOT NULL,
    file_extension  VARCHAR(20) DEFAULT NULL,
    file_path       VARCHAR(500) NOT NULL,
    file_type       ENUM('image', 'video', 'document', 'pdf', 'word', 'excel', 'powerpoint', 'archive', 'other') DEFAULT 'other',
    file_size       BIGINT UNSIGNED NOT NULL,
    mime_type       VARCHAR(100) DEFAULT NULL,
    is_deleted      TINYINT(1) DEFAULT 0,
    deleted_at      DATETIME NULL DEFAULT NULL,
    uploaded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    KEY idx_media_client (client_id),
    KEY idx_media_folder (folder_id),
    CONSTRAINT fk_media_client 
        FOREIGN KEY (client_id) REFERENCES clients (id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_media_folder 
        FOREIGN KEY (folder_id) REFERENCES media_folders (id) 
        ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- =============================================================================
-- SECTION 10: SEED DATA
-- =============================================================================

INSERT IGNORE INTO auth_accounts (
    email, username, password, auth_provider, role, role_locked, is_active, email_verified_at
) VALUES (
    'admin@eventra.com', 
    'admin', 
    '$2y$10$iPiJGuc.fOdzO109eUDsvefK44TZwvQlCICiVxbD1KHYRx1lxwrVS', 
    'local', 
    'admin', 
    1, 
    1, 
    NOW()
);

INSERT IGNORE INTO admins (
    admin_auth_id, name, profile_pic, metadata
) VALUES (
    (SELECT id FROM auth_accounts WHERE email = 'admin@eventra.com'),
    'System Administrator', 
    '/public/assets/imgs/admin.png',
    JSON_OBJECT('created_by', 'system', 'immutable', true, 'note', 'Default system administrator account')
);

-- =============================================================================
-- FINAL: RE-ENABLE FOREIGN KEY CHECKS
-- =============================================================================
SET FOREIGN_KEY_CHECKS = 1;