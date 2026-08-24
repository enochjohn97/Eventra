FROM php:8.2-apache

# Install dependencies and extensions
RUN apt-get update && apt-get install -y \
    libpng-dev \
    libjpeg62-turbo-dev \
    libfreetype6-dev \
    libzip-dev \
    unzip \
    tesseract-ocr \
    git \
 && docker-php-ext-configure gd --with-freetype --with-jpeg \
 && docker-php-ext-install gd zip pdo_mysql mysqli \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Enable Apache modules needed for routing, CORS headers, compression
RUN a2enmod rewrite headers deflate expires

# Configure Apache: AllowOverride All so .htaccess rules (routing for
# /admin, /client, /api, /public, index.php) are respected.
# ServerName suppresses the FQDN warning on startup.
RUN echo 'ServerName localhost' >> /etc/apache2/apache2.conf \
 && sed -i 's|AllowOverride None|AllowOverride All|g' /etc/apache2/apache2.conf \
 && sed -i 's|AllowOverride None|AllowOverride All|g' /etc/apache2/sites-available/000-default.conf

# Set document root to /var/www/html (project root serves all folders)
ENV APACHE_DOCUMENT_ROOT /var/www/html
RUN sed -i 's|/var/www/html|${APACHE_DOCUMENT_ROOT}|g' /etc/apache2/sites-available/000-default.conf

# Set working directory
WORKDIR /var/www/html

# Copy composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Copy all application files EXCEPT mobile/ (excluded via .dockerignore)
COPY . /var/www/html/

# Install PHP dependencies
RUN composer install --no-dev --optimize-autoloader || true

# Set correct ownership
RUN chown -R www-data:www-data /var/www/html \
 && find /var/www/html -type d -exec chmod 755 {} \; \
 && find /var/www/html -type f -exec chmod 644 {} \;

# Ensure logs/ and uploads/ are writable at runtime
RUN mkdir -p /var/www/html/logs /var/www/html/uploads \
 && chown -R www-data:www-data /var/www/html/logs /var/www/html/uploads \
 && chmod -R 775 /var/www/html/logs /var/www/html/uploads

# Render injects a dynamic PORT env var — rewrite Apache to listen on it.
# Falls back to 80 for local docker-compose usage.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
