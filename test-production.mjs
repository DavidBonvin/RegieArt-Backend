/**
 * Test de producción — StorageModule en Railway
 * Ejecutar: node test-production.mjs
 *
 * Archivos de prueba:
 *   - C:\Antigravity\MediasTest\afiche-produccion.svg
 *   - C:\Antigravity\MediasTest\produccion-Le Petit Pêcheur-BanderaRoja.mp3
 */

import fs from 'fs';
import path from 'path';

const BASE = 'https://regieart-backend-production.up.railway.app/api/v1';
const KC   = 'https://keycloak-production-b2ce.up.railway.app/realms/regieart/protocol/openid-connect/token';

const SVG_PATH = 'C:\\Antigravity\\MediasTest\\afiche-produccion.svg';
const MP3_PATH = 'C:\\Antigravity\\MediasTest\\produccion-Le Petit Pêcheur-BanderaRoja.mp3';

const C = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m',
};
const ok    = (m) => console.log(`${C.green}✓ ${m}${C.reset}`);
const fail  = (m) => console.log(`${C.red}✗ ${m}${C.reset}`);
const info  = (m) => console.log(`${C.cyan}  ${m}${C.reset}`);
const title = (m) => console.log(`\n${C.bold}${C.yellow}══ ${m} ══${C.reset}`);

async function req(method, path, { token, body, params } = {}) {
  const url = new URL(BASE + path);
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

async function getToken() {
  title('SETUP — Token Keycloak (producción)');
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

async function getIds(token) {
  title('SETUP — userId y orgId');
  const me   = await req('GET', '/users/me',      { token });
  const orgs = await req('GET', '/organizations', { token });
  const userId = me.data?.data?.id;
  const orgId  = orgs.data?.data?.[0]?.id;
  ok(`userId: ${userId}`);
  ok(`orgId:  ${orgId}`);
  return { userId, orgId };
}

async function testSVG(token, orgId) {
  title('TEST 1 — Subida de SVG como music-score (afiche-produccion.svg)');

  // Leer archivo real
  const fileBuffer = fs.readFileSync(SVG_PATH);
  const fileSizeBytes = fileBuffer.length;
  const songId = 'song-test-produccion-001';

  info(`Archivo: ${path.basename(SVG_PATH)}`);
  info(`Tamaño:  ${fileSizeBytes} bytes`);

  // Paso 1: Presigned URL
  info('→ Paso 1: Solicitar URL de subida');
  const r1 = await req('POST', '/storage/presigned-upload', {
    token,
    body: {
      assetType:    'music-score',
      contentType:  'image/svg+xml',
      fileSizeBytes,
      orgId,
      songId,
      displayName:  'Afiche producción — Le Petit Pêcheur',
      originalName: 'afiche-produccion.svg',
      description:  'Afiche oficial de la producción temporada 2026',
      tags:         ['afiche', 'produccion', '2026'],
      language:     'fr',
    },
  });

  if (!r1.ok) {
    fail(`Presigned upload falló: HTTP ${r1.status}`);
    console.log(JSON.stringify(r1.data, null, 2));
    return null;
  }
  ok(`Presigned URL obtenida → HTTP ${r1.status}`);
  const { uploadUrl, key, assetId } = r1.data?.data ?? {};
  info(`key:     ${key}`);
  info(`assetId: ${assetId}`);

  // Paso 2: PUT directo a R2
  info('→ Paso 2: Subir archivo a Cloudflare R2');
  const putRes = await fetch(uploadUrl, {
    method:  'PUT',
    headers: {
      'Content-Type':   'image/svg+xml',
      'Content-Length': String(fileSizeBytes),
    },
    body: fileBuffer,
  });

  if (!putRes.ok && putRes.status !== 200) {
    const txt = await putRes.text();
    fail(`PUT a R2 falló: HTTP ${putRes.status} — ${txt.substring(0, 300)}`);
    return null;
  }
  ok(`Archivo subido a R2 → HTTP ${putRes.status}`);
  info(`ETag: ${putRes.headers.get('etag')}`);

  // Paso 3: Confirmar
  info('→ Paso 3: Confirmar upload');
  const r3 = await req('POST', '/storage/confirm-upload', {
    token,
    body: { key, assetType: 'music-score' },
  });

  if (!r3.ok) {
    fail(`Confirm falló: HTTP ${r3.status}`);
    console.log(JSON.stringify(r3.data, null, 2));
    return null;
  }
  ok(`Asset CONFIRMADO → HTTP ${r3.status}`);
  info(`status: ${r3.data?.data?.status}`);

  // Paso 4: Descargar por ID
  info('→ Paso 4: Obtener URL de descarga por ID');
  const r4 = await req('GET', `/storage/assets/${assetId}/download`, { token });
  if (r4.ok) {
    ok(`Download URL obtenida → HTTP ${r4.status}`);
    info(`URL: ${r4.data?.downloadUrl?.substring(0, 80)}...`);
  } else {
    fail(`Download por ID falló: HTTP ${r4.status}`);
  }

  return assetId;
}

async function testMP3(token, orgId) {
  title('TEST 2 — Subida de MP3 como audio-track (BanderaRoja.mp3)');

  const fileBuffer = fs.readFileSync(MP3_PATH);
  const fileSizeBytes = fileBuffer.length;
  const songId = 'song-test-produccion-001';

  info(`Archivo: ${path.basename(MP3_PATH)}`);
  info(`Tamaño:  ${fileSizeBytes} bytes (${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB)`);

  // Paso 1
  info('→ Paso 1: Solicitar URL de subida');
  const r1 = await req('POST', '/storage/presigned-upload', {
    token,
    body: {
      assetType:    'audio-track',
      contentType:  'audio/mpeg',
      fileSizeBytes,
      orgId,
      songId,
      displayName:  'Le Petit Pêcheur — Bandera Roja',
      originalName: 'produccion-Le Petit Pêcheur-BanderaRoja.mp3',
      description:  'Pista de audio de la producción',
      tags:         ['audio', 'produccion', 'le-petit-pecheur'],
      language:     'fr',
    },
  });

  if (!r1.ok) {
    fail(`Presigned upload falló: HTTP ${r1.status}`);
    console.log(JSON.stringify(r1.data, null, 2));
    return null;
  }
  ok(`Presigned URL obtenida → HTTP ${r1.status}`);
  const { uploadUrl, key, assetId } = r1.data?.data ?? {};
  info(`key:     ${key}`);
  info(`assetId: ${assetId}`);

  // Paso 2
  info('→ Paso 2: Subir archivo a Cloudflare R2');
  const putRes = await fetch(uploadUrl, {
    method:  'PUT',
    headers: {
      'Content-Type':   'audio/mpeg',
      'Content-Length': String(fileSizeBytes),
    },
    body: fileBuffer,
  });

  if (!putRes.ok && putRes.status !== 200) {
    const txt = await putRes.text();
    fail(`PUT a R2 falló: HTTP ${putRes.status} — ${txt.substring(0, 300)}`);
    return null;
  }
  ok(`Archivo subido a R2 → HTTP ${putRes.status}`);
  info(`ETag: ${putRes.headers.get('etag')}`);

  // Paso 3
  info('→ Paso 3: Confirmar upload');
  const r3 = await req('POST', '/storage/confirm-upload', {
    token,
    body: { key, assetType: 'audio-track' },
  });

  if (!r3.ok) {
    fail(`Confirm falló: HTTP ${r3.status}`);
    console.log(JSON.stringify(r3.data, null, 2));
    return null;
  }
  ok(`Asset CONFIRMADO → HTTP ${r3.status}`);
  info(`status: ${r3.data?.data?.status}`);

  // Paso 4
  info('→ Paso 4: Obtener URL de descarga por ID');
  const r4 = await req('GET', `/storage/assets/${assetId}/download`, { token });
  if (r4.ok) {
    ok(`Download URL obtenida → HTTP ${r4.status}`);
    info(`URL: ${r4.data?.downloadUrl?.substring(0, 80)}...`);
  } else {
    fail(`Download por ID falló: HTTP ${r4.status}`);
  }

  return assetId;
}

async function testBusqueda(token, orgId) {
  title('TEST 3 — Búsqueda de assets en producción');

  const r = await req('GET', '/storage/assets', {
    token,
    params: { orgId, limit: '10', orderBy: 'createdAt', order: 'desc' },
  });

  if (r.ok) {
    ok(`Búsqueda OK → HTTP ${r.status}`);
    info(`Total assets: ${r.data?.data?.total}`);
    info(`Assets en esta página: ${r.data?.data?.items?.length}`);
    r.data?.data?.items?.forEach(a =>
      info(`  • [${a.status}] ${a.displayName ?? a.originalName ?? a.key} (${a.assetType})`)
    );
  } else {
    fail(`Búsqueda falló: HTTP ${r.status}`);
  }
}

async function runAll() {
  console.log(`${C.bold}${C.yellow}`);
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  TEST PRODUCCIÓN — RégieArt StorageModule        ║');
  console.log(`║  ${BASE.substring(0, 48)} ║`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(C.reset);

  // Verificar archivos
  if (!fs.existsSync(SVG_PATH)) { fail(`Archivo no encontrado: ${SVG_PATH}`); process.exit(1); }
  if (!fs.existsSync(MP3_PATH)) { fail(`Archivo no encontrado: ${MP3_PATH}`); process.exit(1); }
  ok('Archivos de prueba encontrados');

  const token = await getToken();
  const { orgId } = await getIds(token);

  const svgAssetId = await testSVG(token, orgId);
  const mp3AssetId = await testMP3(token, orgId);
  await testBusqueda(token, orgId);

  title('RESUMEN');
  if (svgAssetId) ok(`SVG subido y confirmado → assetId: ${svgAssetId}`);
  else            fail('SVG — falló');
  if (mp3AssetId) ok(`MP3 subido y confirmado → assetId: ${mp3AssetId}`);
  else            fail('MP3 — falló');

  console.log(`\n${C.cyan}Para verificar los archivos en R2, abre el dashboard de Cloudflare.${C.reset}`);
}

runAll().catch(console.error);
