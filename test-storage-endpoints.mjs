/**
 * Test completo de todos los endpoints del StorageModule.
 * Ejecutar: node test-storage-endpoints.mjs
 *
 * Requiere que el servidor esté corriendo en localhost:3005
 * y que Keycloak esté corriendo en localhost:8090.
 */

const BASE = 'http://localhost:3005/api/v1';
const KC   = 'http://localhost:8090/realms/regieart/protocol/openid-connect/token';

// ─── Colores para la consola ──────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
};
function ok(msg)   { console.log(`${C.green}✓ ${msg}${C.reset}`); }
function fail(msg) { console.log(`${C.red}✗ ${msg}${C.reset}`); }
function info(msg) { console.log(`${C.cyan}  ${msg}${C.reset}`); }
function title(msg){ console.log(`\n${C.bold}${C.yellow}══ ${msg} ══${C.reset}`); }

// ─── Helper HTTP ──────────────────────────────────────────────────────────────
async function req(method, path, { token, body, params } = {}) {
  const url = new URL(BASE + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const options = {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body  ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  const res  = await fetch(url.toString(), options);
  const json = await res.json().catch(() => null);

  return { status: res.status, ok: res.ok, data: json };
}

// ─── 1. Obtener token de Keycloak ─────────────────────────────────────────────
async function getToken() {
  title('SETUP — Token Keycloak');
  const res = await fetch(KC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id:  'regieart-mobile',
      username:   'teststorage@gmail.com',
      password:   'teststorage@gmail.com',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('No se pudo obtener token: ' + JSON.stringify(data));
  ok(`Token obtenido (${data.access_token.length} chars)`);
  return data.access_token;
}

// ─── 2. Obtener userId y orgId ────────────────────────────────────────────────
async function getIds(token) {
  title('SETUP — Obtener IDs de usuario y organización');

  const me   = await req('GET', '/users/me',      { token });
  const orgs = await req('GET', '/organizations', { token });

  const userId = me.data?.data?.id;
  const orgId  = orgs.data?.data?.[0]?.id;

  ok(`userId: ${userId}`);
  ok(`orgId:  ${orgId}`);
  return { userId, orgId };
}

// ─── TEST HELPERS ─────────────────────────────────────────────────────────────
function printResult(label, { status, data }) {
  const symbol = status >= 200 && status < 300 ? '✓' : '✗';
  const color  = status >= 200 && status < 300 ? C.green : C.red;
  console.log(`${color}${symbol} ${label} → HTTP ${status}${C.reset}`);
  console.log(JSON.stringify(data, null, 2));
}

// ═════════════════════════════════════════════════════════════════════════════
// TESTS PRINCIPALES
// ═════════════════════════════════════════════════════════════════════════════
async function runAll() {
  const token          = await getToken();
  const { userId, orgId } = await getIds(token);

  let assetId  = null;
  let assetKey = null;
  let uploadUrl = null;
  let multipartUploadId = null;
  let multipartKey = null;

  // ───────────────────────────────────────────────────────────────────────────
  title('EP-01 — POST /storage/presigned-upload');
  // ───────────────────────────────────────────────────────────────────────────
  info('Solicita URL firmada para subir un PNG como banner de org');
  // Usamos exactamente el tamaño real del contenido que vamos a subir
  const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#1a1a2e"/><text x="600" y="220" fill="white" font-size="48" text-anchor="middle">Banner Test</text></svg>';
  const svgBytes = Buffer.byteLength(svgContent, 'utf8');

  const r1 = await req('POST', '/storage/presigned-upload', {
    token,
    body: {
      assetType:    'org-banner',
      contentType:  'image/png',
      fileSizeBytes: svgBytes,
      orgId,
      displayName:  'Banner de la organización',
      originalName: 'banner-test.png',
      description:  'Archivo de prueba para documentación de endpoints',
      tags:         ['test', 'banner', 'png'],
      language:     'es',
      isPublic:     false,
      width:        1200,
      height:       400,
    },
  });
  printResult('POST /storage/presigned-upload', r1);

  if (r1.ok) {
    assetId   = r1.data?.data?.assetId;
    assetKey  = r1.data?.data?.key;
    uploadUrl = r1.data?.data?.uploadUrl;
    ok(`assetId creado: ${assetId}`);
    ok(`key: ${assetKey}`);
    info(`uploadUrl: ${uploadUrl?.substring(0, 80)}...`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  title('EP-02 — Subida real del archivo a R2 (PUT directo)');
  // ───────────────────────────────────────────────────────────────────────────
  if (uploadUrl) {
    info('Sube el SVG directamente a la URL firmada (sin pasar por la API)');
    const putRes = await fetch(uploadUrl, {
      method:  'PUT',
      headers: {
        'Content-Type':   'image/png',
        'Content-Length': String(svgBytes),
      },
      body: svgContent,
    });
    if (putRes.ok || putRes.status === 200) {
      ok(`Archivo subido a R2 → HTTP ${putRes.status}`);
      const etag = putRes.headers.get('etag');
      info(`ETag: ${etag}`);
    } else {
      const txt = await putRes.text();
      fail(`Error subiendo a R2: ${putRes.status} — ${txt.substring(0, 300)}`);
    }
  } else {
    fail('No hay uploadUrl — saltando subida real');
  }

  // ───────────────────────────────────────────────────────────────────────────
  title('EP-03 — POST /storage/confirm-upload');
  // ───────────────────────────────────────────────────────────────────────────
  info('Confirma que el archivo llegó a R2 y actualiza el Asset a CONFIRMED');
  if (assetKey) {
    const r3 = await req('POST', '/storage/confirm-upload', {
      token,
      body: {
        key:         assetKey,
        assetType:   'org-banner',
        // Metadatos técnicos verificados (opcionales)
        width:       1200,
        height:      400,
        pageCount:   1,
      },
    });
    printResult('POST /storage/confirm-upload', r3);
  } else {
    fail('No hay key — saltando confirm-upload');
  }

  // ───────────────────────────────────────────────────────────────────────────
  title('EP-04 — GET /storage/presigned-download');
  // ───────────────────────────────────────────────────────────────────────────
  info('Obtiene URL firmada de descarga (válida 5 min) — usa caché Redis');
  if (assetKey) {
    const r4 = await req('GET', '/storage/presigned-download', {
      token,
      params: { key: assetKey },
    });
    printResult('GET /storage/presigned-download', r4);
    if (r4.ok) info(`downloadUrl: ${r4.data?.data?.downloadUrl?.substring(0, 80)}...`);
  } else {
    fail('No hay key — saltando presigned-download');
  }

  // ───────────────────────────────────────────────────────────────────────────
  title('EP-05 — GET /storage/objects');
  // ───────────────────────────────────────────────────────────────────────────
  info('Lista objetos en R2 con un prefijo (no pasa por la DB, va directo a S3 ListObjects)');
  const r5 = await req('GET', '/storage/objects', {
    token,
    params: { prefix: `organizations/${orgId}/` },
  });
  printResult('GET /storage/objects', r5);

  // ───────────────────────────────────────────────────────────────────────────
  title('EP-06 — GET /storage/assets (búsqueda con filtros)');
  // ───────────────────────────────────────────────────────────────────────────
  info('Busca assets en la DB con filtros combinados');

  // 6a — Sin filtros
  info('→ Sin filtros (todos los assets del usuario)');
  const r6a = await req('GET', '/storage/assets', { token });
  printResult('GET /storage/assets (sin filtros)', r6a);

  // 6b — Filtrar por assetType
  info('→ Filtrar por assetType=music-score');
  const r6b = await req('GET', '/storage/assets', {
    token,
    params: { 'assetType[]': 'music-score', orgId },
  });
  printResult('GET /storage/assets (?assetType[]=MUSIC_SCORE)', r6b);

  // 6c — Búsqueda de texto
  info('→ Búsqueda de texto q=partitura');
  const r6c = await req('GET', '/storage/assets', {
    token,
    params: { q: 'partitura' },
  });
  printResult('GET /storage/assets (?q=partitura)', r6c);

  // 6d — Paginación
  info('→ Paginación page=1&limit=5');
  const r6d = await req('GET', '/storage/assets', {
    token,
    params: { page: '1', limit: '5', orderBy: 'createdAt', order: 'desc' },
  });
  printResult('GET /storage/assets (?page=1&limit=5)', r6d);

  // ───────────────────────────────────────────────────────────────────────────
  title('EP-07 — GET /storage/assets/:id');
  // ───────────────────────────────────────────────────────────────────────────
  info('Obtiene un asset concreto por su ID de base de datos');
  if (assetId) {
    const r7 = await req('GET', `/storage/assets/${assetId}`, { token });
    printResult(`GET /storage/assets/${assetId}`, r7);
  } else {
    fail('No hay assetId — saltando get-by-id');
  }

  // ───────────────────────────────────────────────────────────────────────────
  title('EP-08 — PATCH /storage/assets/:id');
  // ───────────────────────────────────────────────────────────────────────────
  info('Actualiza metadatos editables: displayName, description, tags, language, isPublic');
  if (assetId) {
    const r8 = await req('PATCH', `/storage/assets/${assetId}`, {
      token,
      body: {
        displayName: 'Partitura de prueba — ACTUALIZADA',
        description: 'Descripción actualizada después del confirm',
        tags:        ['test', 'partitura', 'svg', 'actualizada'],
        language:    'en',
        isPublic:    true,
      },
    });
    printResult(`PATCH /storage/assets/${assetId}`, r8);
  } else {
    fail('No hay assetId — saltando patch');
  }

  // ───────────────────────────────────────────────────────────────────────────
  title('EP-09 — DELETE /storage/assets/:id (soft-delete)');
  // ───────────────────────────────────────────────────────────────────────────
  info('Marca el asset como DELETED en la DB y borra el objeto real en R2');
  if (assetId) {
    const r9 = await req('DELETE', `/storage/assets/${assetId}`, { token });
    printResult(`DELETE /storage/assets/${assetId}`, r9);
  } else {
    fail('No hay assetId — saltando delete');
  }

  // ───────────────────────────────────────────────────────────────────────────
  title('EP-10 — POST /storage/multipart/initiate');
  // ───────────────────────────────────────────────────────────────────────────
  info('Inicia una subida multipart para un archivo grande (simula MP4 de 257 MB)');
  const r10 = await req('POST', '/storage/multipart/initiate', {
    token,
    body: {
      assetType:     'reference-video',
      contentType:   'video/mp4',
      fileSizeBytes: 270294474,        // 257 MB
      orgId,
      eventId:       'event-test-001', // requerido por la política reference-video
      displayName:   'Video de referencia — test multipart',
      originalName:  'video-referencia.mp4',
      partSizeBytes: 10_485_760,       // 10 MB por parte → 28 partes
    },
  });
  printResult('POST /storage/multipart/initiate', r10);

  if (r10.ok) {
    multipartUploadId = r10.data?.data?.uploadId;
    multipartKey      = r10.data?.data?.key;
    const partsCount  = r10.data?.data?.parts?.length;
    ok(`uploadId: ${multipartUploadId}`);
    ok(`key: ${multipartKey}`);
    ok(`partes generadas: ${partsCount}`);
    info(`Ejemplo part[0] uploadUrl: ${r10.data?.data?.parts?.[0]?.uploadUrl?.substring(0, 80)}...`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  title('EP-11 — DELETE /storage/multipart/abort');
  // ───────────────────────────────────────────────────────────────────────────
  // Abortamos en vez de completar, ya que no subimos partes reales
  info('Aborta la subida multipart (libera las partes parciales en R2)');
  if (multipartUploadId && multipartKey) {
    const r11 = await req('DELETE', '/storage/multipart/abort', {
      token,
      body: {
        key:      multipartKey,
        uploadId: multipartUploadId,
      },
    });
    printResult('DELETE /storage/multipart/abort', r11);
  } else {
    fail('No hay uploadId/key multipart — saltando abort');
  }

  // ───────────────────────────────────────────────────────────────────────────
  title('EP-12 — POST /storage/multipart/complete (demo estructura)');
  // ───────────────────────────────────────────────────────────────────────────
  info('Estructura de la petición para completar una subida multipart (requiere partes reales subidas)');
  info('BODY esperado:');
  console.log(JSON.stringify({
    key:      '<key del asset>',
    uploadId: '<uploadId de initiate>',
    parts: [
      { partNumber: 1, etag: '"abc123..."' },
      { partNumber: 2, etag: '"def456..."' },
      { partNumber: 3, etag: '"ghi789..."' },
    ],
  }, null, 2));
  info('→ No se ejecuta porque requeriría haber subido partes reales a cada partUrl.');

  // ───────────────────────────────────────────────────────────────────────────
  title('RESUMEN FINAL');
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\nEstructura base de todas las peticiones:');
  console.log('  Headers:   Authorization: Bearer <JWT>');
  console.log('  Content-Type: application/json (en POST/PATCH con body)');
  console.log('  Base URL:  http://localhost:3005/api/v1\n');
}

runAll().catch(console.error);
