# Production Keycloak image for Railway deployment.
#
# Build phase: optimizes the distribution for faster startup.
# Runtime: uses `start` (production mode) instead of `start-dev`.
# Realm import: copies the realm-export.json so Keycloak auto-creates
# the "regieart" realm on first boot (skipped on subsequent boots).

FROM quay.io/keycloak/keycloak:23.0

# Copy realm so Keycloak auto-imports it on first boot
COPY realm-export.json /opt/keycloak/data/import/realm-export.json

EXPOSE 8080

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--import-realm", "--hostname-strict=false", "--hostname-strict-https=false", "--http-enabled=true", "--health-enabled=true"]
