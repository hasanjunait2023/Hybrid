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

# Caddy terminates TLS and proxies plain HTTP, so PHP never sees HTTPS on its
# own. PipraPay's pp_site_url() reads $_SERVER['HTTPS'] to pick the scheme for
# every asset/redirect URL — without this, pages render http:// asset links
# that browsers block as mixed content (the unstyled login page). Honoring the
# proxy's X-Forwarded-Proto restores https; server config only, app untouched.
RUN printf 'SetEnvIf X-Forwarded-Proto "^https$" HTTPS=on\n' \
      > /etc/apache2/conf-available/forwarded-proto.conf \
  && a2enconf forwarded-proto
# ponytail: keep -dev libs (runtime .so deps); slim with a multi-stage build only if image size bites.
