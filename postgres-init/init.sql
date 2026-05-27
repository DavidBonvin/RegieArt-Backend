-- Script de inicialización de PostgreSQL
-- Crea las dos bases de datos necesarias: una para la app y otra para Keycloak

CREATE DATABASE regieart;
CREATE DATABASE keycloak;

GRANT ALL PRIVILEGES ON DATABASE regieart TO postgres;
GRANT ALL PRIVILEGES ON DATABASE keycloak TO postgres;
