# Hybrid Pay engine (self-hosted PipraPay). PipraPay's installer hard-gates on
# these PHP extensions, so we bake them into the image once instead of compiling
# them on every container start. Code is bind-mounted at runtime (./piprapay).
FROM php:8.2-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
      libpng-dev libjpeg-dev libfreetype-dev libzip-dev libmagickwand-dev \
  && docker-php-ext-configure gd --with-freetype --with-jpeg \
  && docker-php-ext-install -j"$(nproc)" bcmath pdo pdo_mysql mysqli gd zip \
  && pecl install imagick \
  && docker-php-ext-enable imagick \
  && a2enmod rewrite \
  && rm -rf /var/lib/apt/lists/*
# ponytail: keep -dev libs (runtime .so deps); slim with a multi-stage build only if image size bites.
