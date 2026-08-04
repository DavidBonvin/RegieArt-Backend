/**
 * Test de produccion - StorageModule en Railway
 * Ejecutar: node test-production.mjs
 *
 * Prueba el ciclo completo (presigned-url -> PUT R2 -> confirm -> download -> delete)
 * con TODOS los archivos de C:\Antigravity\MediasTest, incluyendo:
 *   - SVG          -> music-score    (requiere songId)
 *   - MP3          -> audio-track    (requiere songId)
 *   - video.mp4    -> reference-video (requiere eventId)
 *   - pelicula.mp4 -> reference-video (270 MB - requiere eventId)
 *   - .mscz        -> formato no soportado -> espera 400
 */

import fs from 'fs';
import path from 'path';

const BASE   = 'https://regieart-backend-production.up.railway.app/api/v1';
const KC     = 'https://keycloak-production-b2ce.up.railway.app/realms/regieart/protocol/openid-connect/token';
const FOLDER = 'C:\\Antigravity\\MediasTest';

const C = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', gray: '\x1b[90m',
};
const ok    = (m) => console.log(`${C.green}  OK ${m}${C.reset}`);
const fail  = (m) => console.log(`${C.red}  FAIL ${m}${C.reset}`);
const info  = (m) => console.log(`${C.cyan}    ${m}${C.reset}`);
const warn  = (m) => console.log(`${C.yellow}  WARN ${m}${C.reset}`);
const title = (m) => console.log(`\n${C.bold}${C.yellow}== ${m} ==${C.reset}`);
const sep   = () => console.log(`${C.gray}  ---------------------------------${C.reset}`);

async function req(method, urlPath, { token, body, params } = {}) {
  const url = new URL(BASE + urlPath);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res  = await fetch(url.toString(), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body  ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data: json };
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function getToken() {
  title('AUTH -- Token Keycloak');
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
  if (!data.access_token) throw new Error('No token: ' + JSON.stringify(data));
  ok(`Token obtenido (${data.access_token.length} chars)`);
  return data.access_token;
}

async function getOrgId(token) {
  const me   = await req('GET', '/users/me',      { token });
  const orgs = await req('GET', '/organizations', { token });
  const userId = me.data?.data?.id;
  const orgId  = orgs.data?.data?.[0]?.id;
  ok(`userId: ${userId}`);
  ok(`orgId:  ${orgId}`);
  return { userId, orgId };
}

async function createTempSong(token, orgId) {
  const r = await req('POST', '/songs', {
    token,
    body: { orgId, title: `Test Storage Song ${Date.now()}` },
  });
  if (!r.ok) throw new Error(`No se pudo crear cancion: ${r.status} ${JSON.stringify(r.data)}`);
  ok(`Cancion temporal: ${r.data?.data?.id}`);
  return r.data?.data?.id;
}

async function createTempEvent(token, orgId) {
  const r = await req('POST', '/events', {
    token,
    body: {
      orgId,
      title:     `Test Storage Event ${Date.now()}`,
      type:      'REHEARSAL',
      startTime: '2026-09-01T18:00:00.000Z',
    },
  });
  if (!r.ok) throw new Error(`No se pudo crear evento: ${r.status} ${JSON.stringify(r.data)}`);
  ok(`Evento temporal: ${r.data?.data?.id}`);
  return r.data?.data?.id;
}

async function deleteAsset(token, assetId, label) {
  if (!assetId) return;
  const r = await req('DELETE', `/storage/assets/${assetId}`, { token });
  if (r.ok) ok(`Asset eliminado de R2+DB: ${label}`);
  else      fail(`No se pudo eliminar asset "${label}": HTTP ${r.status}`);
}

async function deleteTempSong(token, songId) {
  if (!songId) return;
  const r = await req('DELETE', `/songs/${songId}`, { token });
  if (r.ok) ok('Cancion temporal eliminada');
  else      fail(`No se pudo eliminar cancion: HTTP ${r.status}`);
}

async function deleteTempEvent(token, eventId) {
  if (!eventId) return;
  const r = await req('DELETE', `/events/${eventId}`, { token });
  if (r.ok) ok('Evento temporal eliminado');
  else      fail(`No se pudo eliminar evento: HTTP ${r.status}`);
}

async function runUploadCycle(token, { label, filePath, assetType, contentType, bodyExtra = {} }) {
  sep();
  console.log(`${C.bold}  ${label}${C.reset}`);

  if (!fs.existsSync(filePath)) {
    warn(`Archivo no encontrado -- saltando: ${path.basename(filePath)}`);
    return null;
  }

  const fileBuffer    = fs.readFileSync(filePath);
  const fileSizeBytes = fileBuffer.length;
  info(`Archivo: ${path.basename(filePath)}  (${formatBytes(fileSizeBytes)})`);

  // Paso 1: Presigned URL
  info('-> Paso 1: Presigned upload URL');
  const r1 = await req('POST', '/storage/presigned-upload', {
    token,
    body: { assetType, contentType, fileSizeBytes, ...bodyExtra },
  });

  if (!r1.ok) {
    fail(`Presigned upload fallo: HTTP ${r1.status} -- ${r1.data?.error?.message}`);
    return null;
  }
  ok(`Presigned URL obtenida -> HTTP ${r1.status}`);
  const { uploadUrl, key, assetId } = r1.data?.data ?? {};
  info(`key:     ${key}`);
  info(`assetId: ${assetId}`);

  // Paso 2: PUT directo a Cloudflare R2
  info('-> Paso 2: PUT a Cloudflare R2 (subida directa)');
  const t0     = Date.now();
  const putRes = await fetch(uploadUrl, {
    method:  'PUT',
    headers: { 'Content-Type': contentType, 'Content-Length': String(fileSizeBytes) },
    body:    fileBuffer,
  });

  if (!putRes.ok && putRes.status !== 200) {
    const txt = await putRes.text();
    fail(`PUT a R2 fallo: HTTP ${putRes.status} -- ${txt.substring(0, 200)}`);
    return null;
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  ok(`Archivo subido a R2 -> HTTP ${putRes.status}  (${elapsed}s)`);
  info(`ETag: ${putRes.headers.get('etag')}`);

  // Paso 3: Confirmar (PENDING -> CONFIRMED)
  info('-> Paso 3: Confirm upload');
  const r3 = await req('POST', '/storage/confirm-upload', {
    token,
    body: { key, assetType },
  });

  if (!r3.ok) {
    fail(`Confirm fallo: HTTP ${r3.status} -- ${r3.data?.error?.message}`);
    return assetId;
  }
  ok(`Asset CONFIRMADO -> status: ${r3.data?.data?.asset?.status}`);

  // Paso 4: Download URL por ID
  info('-> Paso 4: Download URL por assetId');
  const r4 = await req('GET', `/storage/assets/${assetId}/download`, { token });
  if (r4.ok) {
    ok(`URL de descarga obtenida -> HTTP ${r4.status}`);
    info(`URL: ${r4.data?.data?.downloadUrl?.substring(0, 90)}...`);
  } else {
    fail(`Download por ID fallo: HTTP ${r4.status}`);
  }

  return assetId;
}

async function testUnsupportedFormat(token, orgId, songId) {
  sep();
  console.log(`${C.bold}  TEST NEGATIVO -- .mscz (formato no soportado)${C.reset}`);
  const filePath = path.join(FOLDER, 'PobreSoy_Piano.mscz');
  if (!fs.existsSync(filePath)) { warn('PobreSoy_Piano.mscz no encontrado -- saltando'); return; }
  const fileSizeBytes = fs.statSync(filePath).size;
  info(`Archivo: PobreSoy_Piano.mscz  (${formatBytes(fileSizeBytes)})`);
  const r = await req('POST', '/storage/presigned-upload', {
    token,
    body: { assetType: 'music-score', contentType: 'application/octet-stream', fileSizeBytes, orgId, songId },
  });
  if (r.status === 400) ok(`Backend rechazo correctamente -> HTTP 400: ${r.data?.error?.message}`);
  else                  fail(`Se esperaba 400, se recibio ${r.status}`);
}

async function runAll() {
  console.log(`\n${C.bold}${C.yellow}`);
  console.log('+==========================================================+');
  console.log('|  TEST PRODUCCION -- StorageModule - Todos los formatos   |');
  console.log(`|  ${BASE.substring(0, 56)} |`);
  console.log('+==========================================================+');
  console.log(C.reset);

  const token         = await getToken();

  title('SETUP -- IDs de contexto');
  const { orgId }     = await getOrgId(token);

  title('SETUP -- Recursos temporales (song + event)');
  const songId        = await createTempSong(token, orgId);
  const eventId       = await createTempEvent(token, orgId);

  const collectedIds  = [];

  try {
    title('TEST 1 -- music-score (SVG)');
    const svgId = await runUploadCycle(token, {
      label:       'afiche-produccion.svg -> music-score',
      filePath:    path.join(FOLDER, 'afiche-produccion.svg'),
      assetType:   'music-score',
      contentType: 'image/svg+xml',
      bodyExtra:   { orgId, songId, displayName: 'Afiche produccion', tags: ['afiche'] },
    });
    if (svgId) collectedIds.push({ id: svgId, label: 'SVG  music-score' });

    title('TEST 2 -- audio-track (MP3)');
    const mp3Id = await runUploadCycle(token, {
      label:       'BanderaRoja.mp3 -> audio-track',
      filePath:    path.join(FOLDER, 'produccion-Le Petit P\u00EAcheur-BanderaRoja.mp3'),
      assetType:   'audio-track',
      contentType: 'audio/mpeg',
      bodyExtra:   { orgId, songId, displayName: 'Le Petit Pecheur -- Bandera Roja', tags: ['audio'] },
    });
    if (mp3Id) collectedIds.push({ id: mp3Id, label: 'MP3  audio-track' });

    title('TEST 3 -- reference-video (video.mp4 - 584 KB)');
    const vid1Id = await runUploadCycle(token, {
      label:       'video.mp4 -> reference-video',
      filePath:    path.join(FOLDER, 'video.mp4'),
      assetType:   'reference-video',
      contentType: 'video/mp4',
      bodyExtra:   { orgId, eventId, displayName: 'Video de referencia corto', tags: ['video'] },
    });
    if (vid1Id) collectedIds.push({ id: vid1Id, label: 'MP4  reference-video (pequeno)' });

    title('TEST 4 -- reference-video (cai en la trampa.mp4 - 270 MB)');
    warn('Este archivo pesa 270 MB -- la subida tardara segun tu conexion...');
    const vid2Id = await runUploadCycle(token, {
      label:       'cai en la trampa.mp4 -> reference-video',
      filePath:    path.join(FOLDER, 'cai en la trampa.mp4'),
      assetType:   'reference-video',
      contentType: 'video/mp4',
      bodyExtra:   { orgId, eventId, displayName: 'Cai en la trampa -- video referencia', tags: ['video', 'largo'] },
    });
    if (vid2Id) collectedIds.push({ id: vid2Id, label: 'MP4  reference-video (270 MB)' });

    title('TEST 5 -- Formato no soportado (.mscz)');
    await testUnsupportedFormat(token, orgId, songId);

    title('TEST 6 -- Busqueda de assets');
    sep();
    const rSearch = await req('GET', '/storage/assets', {
      token,
      params: { orgId, limit: '20', orderBy: 'createdAt', order: 'desc' },
    });
    if (rSearch.ok) {
      ok(`Busqueda OK -> ${rSearch.data?.data?.total} assets totales en la org`);
      rSearch.data?.data?.items?.slice(0, 5).forEach(a =>
        info(`  [${a.status}] ${a.displayName ?? a.originalName ?? a.key} (${a.assetType})`)
      );
    } else {
      fail(`Busqueda fallo: HTTP ${rSearch.status}`);
    }

  } finally {
    title('CLEANUP -- Eliminar assets de R2+DB');
    for (const { id, label } of collectedIds) {
      await deleteAsset(token, id, label);
    }
    title('CLEANUP -- Eliminar recursos temporales');
    await deleteTempEvent(token, eventId);
    await deleteTempSong(token, songId);
  }

  title('RESUMEN');
  for (const { id, label } of collectedIds) {
    ok(`${label} -> assetId: ${id}`);
  }
  ok(`R2 y Postgres limpios -- ${collectedIds.length} asset(s) subidos y eliminados`);
}

runAll().catch((e) => { fail(`Error fatal: ${e.message}`); console.error(e); process.exit(1); });
