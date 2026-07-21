#!/bin/sh
# ============================================================
# start.sh — Script de arranque de RégieArt API
#
# Estrategia:
#   1. Intentar `prisma migrate deploy`.
#   2. Si falla con P3009 (migración fallida bloqueando la DB),
#      extraer los nombres de las migraciones fallidas del output,
#      marcarlas como "rolled-back" con `prisma migrate resolve`,
#      y reintentar el deploy.
#   3. Si falla por cualquier otra razón, salir con error.
#   4. Arrancar el servidor Node.js.
#
# Esto evita que un restart en producción quede bloqueado
# indefinidamente por una migración que falló a mitad de camino.
# ============================================================

set -e

SCHEMA="../../packages/database/prisma/schema.prisma"
PRISMA="node_modules/.bin/prisma"

echo "[start.sh] Running prisma migrate deploy..."

# Capturar salida y código de salida sin abortar el script
DEPLOY_OUTPUT=$($PRISMA migrate deploy --schema="$SCHEMA" 2>&1) && DEPLOY_EXIT=0 || DEPLOY_EXIT=$?

echo "$DEPLOY_OUTPUT"

if [ $DEPLOY_EXIT -ne 0 ]; then
  # Verificar si el error es P3009 (migración fallida bloqueando)
  if echo "$DEPLOY_OUTPUT" | grep -q "P3009"; then
    echo "[start.sh] WARNING: Found failed migration(s) — resolving automatically..."

    # Extraer nombres de migraciones fallidas desde el output de Prisma
    # Formato: "The `20260714155212_sprint2_orgs_songs_events` migration started at..."
    FAILED_MIGRATIONS=$(echo "$DEPLOY_OUTPUT" | grep -oE '[0-9]{14}_[a-zA-Z0-9_]+' | sort -u)

    if [ -z "$FAILED_MIGRATIONS" ]; then
      echo "[start.sh] ERROR: Could not extract failed migration names from Prisma output."
      exit 1
    fi

    for MIGRATION in $FAILED_MIGRATIONS; do
      echo "[start.sh]  → Resolving as rolled-back: $MIGRATION"
      $PRISMA migrate resolve \
        --rolled-back "$MIGRATION" \
        --schema="$SCHEMA" \
        || echo "[start.sh]  ↳ (already resolved or not found — continuing)"
    done

    echo "[start.sh] Retrying prisma migrate deploy..."
    $PRISMA migrate deploy --schema="$SCHEMA"
  else
    echo "[start.sh] ERROR: prisma migrate deploy failed for an unrelated reason."
    exit $DEPLOY_EXIT
  fi
fi

echo "[start.sh] Migrations OK — starting server..."
exec node dist/main
