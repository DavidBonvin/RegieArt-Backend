// ============================================================
// sanitize-key.util.ts — Normalización de strings para el sistema de storage.
//
// Garantiza que ningún dato de entrada del usuario contamine las rutas
// de R2, los metadatos de búsqueda ni las keys de Redis.
//
// Principio: cualquier string que entre en el sistema de storage pasa
// por aquí antes de ser persistido o usado en una URL.
// ============================================================

/**
 * Normaliza un segmento de ruta para uso en keys de S3/R2.
 *
 * Transforma cualquier string arbitrario en un slug URL-safe:
 *   "Le Petit Pêcheur - live" → "le-petit-pecheur-live"
 *   "cai en la trampa.mp4"   → "cai-en-la-trampa.mp4"
 *   "Afiche #2 (2026)!!"     → "afiche-2-2026"
 *
 * Reglas aplicadas en orden:
 *   1. Descomposición NFD → elimina acentos y diacríticos (ê, ñ, ü, ...)
 *   2. Reemplaza todo lo que no sea [a-z0-9._-] por guión
 *   3. Colapsa guiones múltiples en uno
 *   4. Elimina guiones al inicio y fin
 *   5. Lowercase
 *   6. Trunca a 128 chars (límite práctico de segmento de path)
 */
export function sanitizeKeySegment(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .normalize('NFD')                         // ê → e + combining circumflex
    .replace(/[\u0300-\u036f]/g, '')          // elimina combining marks
    .replace(/[^a-zA-Z0-9._-]/g, '-')         // todo lo demás → guión
    .replace(/-+/g, '-')                      // colapsa múltiples guiones
    .replace(/^-+|-+$/g, '')                  // trim guiones extremos
    .toLowerCase()
    .slice(0, 128);
}

/**
 * Normaliza un nombre de visualización para almacenar en DB.
 *
 * Preserva caracteres especiales (son para mostrar, no para rutas).
 * Solo elimina espacios redundantes y trunca.
 *
 * "  Le  Petit  Pêcheur  "  → "Le Petit Pêcheur"
 */
export function sanitizeDisplayName(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/\s+/g, ' ')                     // colapsa espacios internos
    .slice(0, 256);
}

/**
 * Normaliza y deduplica un array de tags.
 *
 * "  Temporada 2026 ", "URGENTE", "temporada-2026" → ["temporada-2026", "urgente"]
 *
 * Reglas:
 *   - Lowercase
 *   - Solo [a-z0-9-] (elimina espacios, acentos, caracteres especiales)
 *   - Máximo 20 tags únicos
 *   - Cada tag máximo 64 chars
 */
export function sanitizeTags(tags: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  return [
    ...new Set(
      tags
        .filter((t) => t && typeof t === 'string')
        .map((t) =>
          t
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase()
            .slice(0, 64),
        )
        .filter((t) => t.length > 0),
    ),
  ].slice(0, 20);
}

/**
 * Normaliza una descripción libre para almacenar en DB.
 * Elimina caracteres de control y trunca a 1000 chars.
 */
export function sanitizeDescription(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // control chars (preserva \n, \t)
    .trim()
    .slice(0, 1000);
}

/**
 * Normaliza el nombre de archivo original (preserva para mostrar, no para rutas).
 * Útil para registrar el nombre que el usuario ve en su dispositivo.
 */
export function sanitizeOriginalName(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[\x00-\x1F\x7F]/g, '')         // elimina control chars
    .trim()
    .slice(0, 512);
}
