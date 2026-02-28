<?php
// Email configuration using PHPMailer
require_once __DIR__ . '/env-loader.php';

define('SMTP_HOST', $_ENV['MAIL_HOST'] ?? '');
define('SMTP_PORT', $_ENV['MAIL_PORT'] ?? 587);
define('SMTP_USER', $_ENV['MAIL_USERNAME'] ?? '');
define('SMTP_PASS', $_ENV['MAIL_PASSWORD'] ?? '');
define('SMTP_SECURE', $_ENV['MAIL_ENCRYPTION'] ?? 'tls');
define('EMAIL_FROM', $_ENV['MAIL_FROM_ADDRESS'] ?? 'noreply@eventra.com');
define('EMAIL_FROM_NAME', $_ENV['MAIL_FROM_NAME'] ?? 'Eventra');
