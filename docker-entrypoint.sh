#!/bin/sh
# Render injects a dynamic PORT env var. Apache must listen on it.
# Falls back to 80 for local docker-compose.
PORT="${PORT:-80}"

# Rewrite Apache ports.conf to use the dynamic port
sed -i "s/Listen 80/Listen ${PORT}/" /etc/apache2/ports.conf
sed -i "s/:80>/:${PORT}>/" /etc/apache2/sites-available/000-default.conf

# Start Apache in foreground
exec apache2-foreground
