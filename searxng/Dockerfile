# Render (and most hosts) build from a Dockerfile — there's no equivalent to
# docker-compose's bind-mount for injecting settings.yml into the stock
# searxng/searxng image at deploy time. Baking it into the image at build time
# is the portable version of the same thing; local dev keeps using the
# bind-mount in docker-compose.yml (faster edit/reload loop, no rebuild).
FROM searxng/searxng:latest

COPY settings.yml /etc/searxng/settings.yml
