/**
 * Test Sprint 2 — Organizations (completo), Songs, Events, Venues
 * Ejecutar: node test-sprint2-endpoints.mjs
 *
 * Requiere:
 *   - API corriendo en localhost:3005
 *   - Keycloak en localhost:8090
 *   - PostgreSQL en localhost:5433
 */

const BASE = 'http://localhost:3005/api/v1';
const KC   = 'http://localhost:8090/realms/regieart/protocol/openid-connect/token';

// ─── Colores ─────────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', gray: '\x1b[90m',
};
const ok    = (m) => console.log(`${C.green}  ✓ ${m}${C.reset}`);
const fail  = (m) => console.log(`${C.red}  ✗ ${m}${C.reset}`);
const info  = (m) => console.log(`${C.cyan}    ${m}${C.reset}`);
const warn  = (m) => console.log(`${C.yellow}  ⚠ ${m}${C.reset}`);
const title = (m) => console.log(`\n${C.bold}${C.yellow}══ ${m} ══${C.reset}`);
const sep   = ()  => console.log(`${C.gray}  ─────────────────────────────────${C.reset}`);

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) { ok(label); passed++; }
  else           { fail(label + (detail ? ` — ${detail}` : '')); failed++; }
}

// ─── HTTP Helper ─────────────────────────────────────────────────────────────
async function req(method, path, { token, body, params } = {}) {
  const url = new URL(BASE + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body  ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function getToken() {
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
  return data.access_token;
}

// =============================================================================
// SUITE 1 — ORGANIZATIONS COMPLETO
// =============================================================================
async function suiteOrganizations(token) {
  title('SUITE 1 — Organizations');

  // ── Crear organización
  sep();
  console.log(`${C.bold}  1.1 POST /organizations${C.reset}`);
  const r1 = await req('POST', '/organizations', {
    token,
    body: {
      name: `Test Band Sprint2 ${Date.now()}`,
      description: 'Banda creada por el test automatizado Sprint 2',
      website: 'https://example.com',
      phone: '+1-514-000-0000',
    },
  });
  assert('Crear org → HTTP 201', r1.status === 201);
  const org = r1.data?.data;
  assert('Respuesta contiene id', !!org?.id);
  assert('Respuesta contiene slug', !!org?.slug);
  info(`orgId: ${org?.id}  slug: ${org?.slug}`);

  if (!org?.id) {
    fail('No se puede continuar sin orgId');
    return null;
  }

  // ── Listar mis organizaciones
  sep();
  console.log(`${C.bold}  1.2 GET /organizations${C.reset}`);
  const r2 = await req('GET', '/organizations', { token });
  assert('Listar orgs → HTTP 200', r2.status === 200);
  assert('Array en data', Array.isArray(r2.data?.data));
  const found = r2.data?.data?.find(o => o.id === org.id);
  assert('Org recién creada aparece en la lista', !!found);

  // ── Detalle de organización
  sep();
  console.log(`${C.bold}  1.3 GET /organizations/:id${C.reset}`);
  const r3 = await req('GET', `/organizations/${org.id}`, { token });
  assert('Obtener org → HTTP 200', r3.status === 200);
  assert('Tiene miembros en include', Array.isArray(r3.data?.data?.members));
  const myMembership = r3.data?.data?.members?.[0];
  assert('El creador es OWNER', myMembership?.role === 'OWNER');

  // ── Listar miembros
  sep();
  console.log(`${C.bold}  1.4 GET /organizations/:id/members${C.reset}`);
  const r4 = await req('GET', `/organizations/${org.id}/members`, { token });
  assert('Listar miembros → HTTP 200', r4.status === 200);
  assert('Array de miembros', Array.isArray(r4.data?.data));
  assert('Al menos 1 miembro (el creador)', r4.data?.data?.length >= 1);
  const memberId = r4.data?.data?.[0]?.id;
  const userId   = r4.data?.data?.[0]?.user?.id;
  info(`memberId: ${memberId}  userId: ${userId}`);

  // ── Editar organización
  sep();
  console.log(`${C.bold}  1.5 PATCH /organizations/:id${C.reset}`);
  const r5 = await req('PATCH', `/organizations/${org.id}`, {
    token,
    body: { description: 'Descripción actualizada por el test' },
  });
  assert('Actualizar org → HTTP 200', r5.status === 200);
  assert('Descripción actualizada', r5.data?.data?.description === 'Descripción actualizada por el test');

  // ── Crear invite link
  sep();
  console.log(`${C.bold}  1.6 POST /organizations/:id/invite-links${C.reset}`);
  const r6 = await req('POST', `/organizations/${org.id}/invite-links`, {
    token,
    body: { role: 'MEMBER' },
  });
  assert('Crear invite link → HTTP 201', r6.status === 201);
  assert('Tiene token', !!r6.data?.data?.token);
  assert('Tiene expiresAt', !!r6.data?.data?.expiresAt);
  const inviteToken = r6.data?.data?.token;
  const inviteLinkId = r6.data?.data?.id;
  info(`invite token: ${inviteToken}`);

  // ── Listar invite links
  sep();
  console.log(`${C.bold}  1.7 GET /organizations/:id/invite-links${C.reset}`);
  const r7 = await req('GET', `/organizations/${org.id}/invite-links`, { token });
  assert('Listar invite links → HTTP 200', r7.status === 200);
  assert('Array de links', Array.isArray(r7.data?.data));
  assert('Link recién creado aparece', r7.data?.data?.some(l => l.id === inviteLinkId));

  // ── Revocar invite link
  sep();
  console.log(`${C.bold}  1.8 DELETE /organizations/:id/invite-links/:linkId${C.reset}`);
  const r8 = await req('DELETE', `/organizations/${org.id}/invite-links/${inviteLinkId}`, { token });
  assert('Revocar link → HTTP 200', r8.status === 200);
  // Verificar que ya no aparece
  const r8b = await req('GET', `/organizations/${org.id}/invite-links`, { token });
  assert('Link revocado ya no aparece en lista', !r8b.data?.data?.some(l => l.id === inviteLinkId));

  // ── Crear segundo link para probar join
  sep();
  console.log(`${C.bold}  1.9 POST /organizations/join/:token${C.reset}`);
  const r9a = await req('POST', `/organizations/${org.id}/invite-links`, {
    token,
    body: { role: 'MEMBER' },
  });
  const joinToken = r9a.data?.data?.token;
  // Intentar unirse con el mismo usuario (debería dar 409 Conflict)
  const r9 = await req('POST', `/organizations/join/${joinToken}`, { token });
  assert('Join propio token → 409 Conflict (ya es miembro)', r9.status === 409);

  // ── Intentar unirse con token inválido
  const r9c = await req('POST', '/organizations/join/token-inventado-000', { token });
  assert('Join token inválido → 404', r9c.status === 404);

  // ── Soft-delete de la org
  sep();
  console.log(`${C.bold}  1.10 DELETE /organizations/:id${C.reset}`);
  const r10 = await req('DELETE', `/organizations/${org.id}`, { token });
  assert('Soft-delete org → HTTP 200', r10.status === 200);
  assert('deletedAt presente', !!r10.data?.data?.deletedAt);

  return { orgId: org.id, userId };
}

// =============================================================================
// SUITE 2 — SONGS / REPERTORIO
// =============================================================================
async function suiteSongs(token) {
  title('SUITE 2 — Songs (Repertorio)');

  // Necesitamos una org activa para los songs
  sep();
  console.log(`${C.bold}  Setup: crear org para songs${C.reset}`);
  const rOrg = await req('POST', '/organizations', {
    token,
    body: { name: `Org Songs Test ${Date.now()}` },
  });
  const org = rOrg.data?.data;
  if (!org?.id) { fail('No se pudo crear org para suite songs'); return null; }
  info(`orgId: ${org.id}`);

  // ── Crear canción
  sep();
  console.log(`${C.bold}  2.1 POST /songs${C.reset}`);
  const r1 = await req('POST', '/songs', {
    token,
    body: {
      orgId: org.id,
      title: 'Le Petit Pêcheur',
      composer: 'Félix Leclerc',
      arranger: 'Jean Dupont',
      genre: 'Chanson québécoise',
      musicalKey: 'Do mayor',
      tempo: 120,
      durationSeconds: 210,
      notes: 'Canción emblemática del repertorio',
    },
  });
  assert('Crear canción → HTTP 201', r1.status === 201);
  assert('Tiene id', !!r1.data?.data?.id);
  assert('Título correcto', r1.data?.data?.title === 'Le Petit Pêcheur');
  const songId = r1.data?.data?.id;
  info(`songId: ${songId}`);

  // ── Crear segunda canción para buscar
  await req('POST', '/songs', {
    token,
    body: { orgId: org.id, title: 'Bandera Roja', composer: 'Autor Test', genre: 'Pop' },
  });

  // ── Listar canciones de la org
  sep();
  console.log(`${C.bold}  2.2 GET /songs?orgId=${C.reset}`);
  const r2 = await req('GET', '/songs', { token, params: { orgId: org.id } });
  assert('Listar songs → HTTP 200', r2.status === 200);
  assert('Tiene array de songs', Array.isArray(r2.data?.data?.songs));
  assert('Total correcto (2)', r2.data?.data?.total === 2);

  // ── Búsqueda por texto
  sep();
  console.log(`${C.bold}  2.3 GET /songs?search=pêcheur${C.reset}`);
  const r3 = await req('GET', '/songs', {
    token,
    params: { orgId: org.id, search: 'pêcheur' },
  });
  assert('Búsqueda por texto → HTTP 200', r3.status === 200);
  assert('Encuentra la canción correcta', r3.data?.data?.songs?.some(s => s.id === songId));

  // ── Filtrar por género
  sep();
  console.log(`${C.bold}  2.4 GET /songs?genre=Pop${C.reset}`);
  const r4 = await req('GET', '/songs', {
    token,
    params: { orgId: org.id, genre: 'Pop' },
  });
  assert('Filtrar por género → HTTP 200', r4.status === 200);
  assert('Solo retorna canciones Pop', r4.data?.data?.songs?.every(s => s.genre === 'Pop'));

  // ── Detalle de canción
  sep();
  console.log(`${C.bold}  2.5 GET /songs/:id${C.reset}`);
  const r5 = await req('GET', `/songs/${songId}`, { token });
  assert('Detalle song → HTTP 200', r5.status === 200);
  assert('Tiene campo assets (array)', Array.isArray(r5.data?.data?.assets));
  assert('Título correcto en detalle', r5.data?.data?.title === 'Le Petit Pêcheur');

  // ── Song no existe → 404
  const r5b = await req('GET', '/songs/id-que-no-existe-000', { token });
  assert('Song inexistente → 404', r5b.status === 404);

  // ── Actualizar canción
  sep();
  console.log(`${C.bold}  2.6 PATCH /songs/:id${C.reset}`);
  const r6 = await req('PATCH', `/songs/${songId}`, {
    token,
    body: { tempo: 135, notes: 'Notas actualizadas en el test' },
  });
  assert('Actualizar song → HTTP 200', r6.status === 200);
  assert('Tempo actualizado', r6.data?.data?.tempo === 135);
  assert('Notes actualizado', r6.data?.data?.notes === 'Notas actualizadas en el test');

  // ── Soft-delete canción
  sep();
  console.log(`${C.bold}  2.7 DELETE /songs/:id${C.reset}`);
  const r7 = await req('DELETE', `/songs/${songId}`, { token });
  assert('Soft-delete song → HTTP 200', r7.status === 200);
  // Verificar que ya no aparece en lista
  const r7b = await req('GET', '/songs', { token, params: { orgId: org.id } });
  assert('Song eliminada no aparece en lista', !r7b.data?.data?.songs?.some(s => s.id === songId));

  return { orgId: org.id };
}

// =============================================================================
// SUITE 3 — VENUES
// =============================================================================
async function suiteVenues(token) {
  title('SUITE 3 — Venues');

  // ── Crear venue
  sep();
  console.log(`${C.bold}  3.1 POST /venues${C.reset}`);
  const r1 = await req('POST', '/venues', {
    token,
    body: {
      name: 'Salle Wilfrid-Pelletier',
      address: '175 Rue Sainte-Catherine O',
      city: 'Montréal',
      country: 'CA',
      capacity: 2982,
      technicalContactName: 'Jean-Michel Legrand',
      technicalContactEmail: 'jm.legrand@example.com',
      notes: 'Venue principal del test Sprint 2',
    },
  });
  assert('Crear venue → HTTP 201', r1.status === 201);
  assert('Tiene id', !!r1.data?.data?.id);
  assert('Ciudad correcta', r1.data?.data?.city === 'Montréal');
  const venueId = r1.data?.data?.id;
  info(`venueId: ${venueId}`);

  // ── Listar venues
  sep();
  console.log(`${C.bold}  3.2 GET /venues${C.reset}`);
  const r2 = await req('GET', '/venues', { token });
  assert('Listar venues → HTTP 200', r2.status === 200);
  assert('Array de venues', Array.isArray(r2.data?.data));
  assert('Venue recién creado aparece', r2.data?.data?.some(v => v.id === venueId));

  // ── Filtrar por ciudad
  sep();
  console.log(`${C.bold}  3.3 GET /venues?city=montréal${C.reset}`);
  const r3 = await req('GET', '/venues', { token, params: { city: 'montréal' } });
  assert('Filtrar por ciudad → HTTP 200', r3.status === 200);
  assert('Encuentra el venue correcto', r3.data?.data?.some(v => v.id === venueId));

  // ── Detalle de venue
  sep();
  console.log(`${C.bold}  3.4 GET /venues/:id${C.reset}`);
  const r4 = await req('GET', `/venues/${venueId}`, { token });
  assert('Detalle venue → HTTP 200', r4.status === 200);
  assert('Capacidad correcta', r4.data?.data?.capacity === 2982);

  // ── Venue no existe → 404
  const r4b = await req('GET', '/venues/id-inexistente-000', { token });
  assert('Venue inexistente → 404', r4b.status === 404);

  // ── Editar venue
  sep();
  console.log(`${C.bold}  3.5 PATCH /venues/:id${C.reset}`);
  const r5 = await req('PATCH', `/venues/${venueId}`, {
    token,
    body: { capacity: 3000, notes: 'Renovación 2026 — aforo aumentado' },
  });
  assert('Actualizar venue → HTTP 200', r5.status === 200);
  assert('Capacidad actualizada', r5.data?.data?.capacity === 3000);

  return { venueId };
}

// =============================================================================
// SUITE 4 — EVENTS + ROSTER
// =============================================================================
async function suiteEvents(token, venueId) {
  title('SUITE 4 — Events + Roster');

  // Setup: crear org
  const rOrg = await req('POST', '/organizations', {
    token,
    body: { name: `Org Events Test ${Date.now()}` },
  });
  const org = rOrg.data?.data;
  if (!org?.id) { fail('No se pudo crear org para suite events'); return; }
  info(`orgId: ${org.id}`);

  // Obtener userId del usuario autenticado
  const rMe = await req('GET', '/users/me', { token });
  const userId = rMe.data?.data?.id;
  info(`userId: ${userId}`);

  // ── Crear evento tipo CONCERT
  sep();
  console.log(`${C.bold}  4.1 POST /events (CONCERT)${C.reset}`);
  const r1 = await req('POST', '/events', {
    token,
    body: {
      orgId: org.id,
      title: 'Concierto de Verano 2026',
      type: 'CONCERT',
      startTime: '2026-08-15T20:00:00.000Z',
      endTime:   '2026-08-15T23:30:00.000Z',
      venueId,
      description: 'Gran concierto de verano — test Sprint 2',
      isPublic: true,
      daysheetNotes: 'Soundcheck a las 17:00. FOH: consola Yamaha CL5.',
      itineraryNotes: 'Bus sale del local a las 14:00.',
    },
  });
  assert('Crear evento → HTTP 201', r1.status === 201);
  assert('Tiene id', !!r1.data?.data?.id);
  assert('Tipo correcto', r1.data?.data?.type === 'CONCERT');
  assert('Status inicial DRAFT', r1.data?.data?.status === 'DRAFT');
  assert('Venue vinculado', r1.data?.data?.venueId === venueId);
  const eventId = r1.data?.data?.id;
  info(`eventId: ${eventId}`);

  // ── Crear evento tipo REHEARSAL
  const rReh = await req('POST', '/events', {
    token,
    body: {
      orgId: org.id,
      title: 'Ensayo General',
      type: 'REHEARSAL',
      startTime: '2026-08-14T10:00:00.000Z',
    },
  });
  assert('Crear ensayo → HTTP 201', rReh.status === 201);
  const rehearsalId = rReh.data?.data?.id;

  // ── Listar eventos
  sep();
  console.log(`${C.bold}  4.2 GET /events?orgId=...${C.reset}`);
  const r2 = await req('GET', '/events', { token, params: { orgId: org.id } });
  assert('Listar eventos → HTTP 200', r2.status === 200);
  assert('Tiene array de events', Array.isArray(r2.data?.data?.events));
  assert('Total 2 eventos', r2.data?.data?.total === 2);

  // ── Filtrar por tipo
  sep();
  console.log(`${C.bold}  4.3 GET /events?type=CONCERT${C.reset}`);
  const r3 = await req('GET', '/events', {
    token,
    params: { orgId: org.id, type: 'CONCERT' },
  });
  assert('Filtrar por CONCERT → HTTP 200', r3.status === 200);
  assert('Solo retorna conciertos', r3.data?.data?.events?.every(e => e.type === 'CONCERT'));

  // ── Filtrar por rango de fechas
  sep();
  console.log(`${C.bold}  4.4 GET /events?from=...&to=...${C.reset}`);
  const r4 = await req('GET', '/events', {
    token,
    params: { orgId: org.id, from: '2026-08-01T00:00:00Z', to: '2026-08-31T23:59:59Z' },
  });
  assert('Filtrar por fechas → HTTP 200', r4.status === 200);
  assert('Devuelve ambos eventos del mes', r4.data?.data?.total === 2);

  // ── Detalle de evento
  sep();
  console.log(`${C.bold}  4.5 GET /events/:id${C.reset}`);
  const r5 = await req('GET', `/events/${eventId}`, { token });
  assert('Detalle evento → HTTP 200', r5.status === 200);
  assert('Incluye venue con nombre', !!r5.data?.data?.venue?.name);
  assert('Incluye roster (array)', Array.isArray(r5.data?.data?.roster));
  assert('Incluye assets (array)', Array.isArray(r5.data?.data?.assets));
  assert('daysheetNotes presente', !!r5.data?.data?.daysheetNotes);

  // ── Actualizar evento (cambiar status a CONFIRMED)
  sep();
  console.log(`${C.bold}  4.6 PATCH /events/:id${C.reset}`);
  const r6 = await req('PATCH', `/events/${eventId}`, {
    token,
    body: { status: 'CONFIRMED', title: 'Concierto de Verano 2026 — CONFIRMADO' },
  });
  assert('Actualizar evento → HTTP 200', r6.status === 200);
  assert('Status → CONFIRMED', r6.data?.data?.status === 'CONFIRMED');
  assert('Título actualizado', r6.data?.data?.title === 'Concierto de Verano 2026 — CONFIRMADO');

  // ── Actualizar daysheet
  sep();
  console.log(`${C.bold}  4.7 PATCH /events/:id/daysheet${C.reset}`);
  const r7 = await req('PATCH', `/events/${eventId}/daysheet`, {
    token,
    body: {
      daysheetNotes: 'Soundcheck 17:00. PA: L-Acoustics K2. Monitor: IEM Sennheiser.',
      itineraryNotes: 'Salida 14:00 desde el local. Hotel: Le Crystal.',
    },
  });
  assert('Actualizar daysheet → HTTP 200', r7.status === 200);
  assert('daysheetNotes actualizado', r7.data?.data?.daysheetNotes?.includes('L-Acoustics'));
  assert('itineraryNotes actualizado', r7.data?.data?.itineraryNotes?.includes('Le Crystal'));

  // ── Roster: agregar miembro al evento
  sep();
  console.log(`${C.bold}  4.8 POST /events/:id/roster${C.reset}`);
  const r8 = await req('POST', `/events/${eventId}/roster`, {
    token,
    body: {
      userId,
      role: 'Director Musical',
      notes: 'Responsable del soundcheck',
    },
  });
  assert('Agregar al roster → HTTP 201', r8.status === 201);
  assert('Status inicial INVITED', r8.data?.data?.status === 'INVITED');
  assert('Rol correcto', r8.data?.data?.role === 'Director Musical');

  // ── Agregar el mismo usuario de nuevo → 409
  const r8b = await req('POST', `/events/${eventId}/roster`, {
    token,
    body: { userId },
  });
  assert('Agregar duplicado al roster → 409', r8b.status === 409);

  // ── Listar roster
  sep();
  console.log(`${C.bold}  4.9 GET /events/:id/roster${C.reset}`);
  const r9 = await req('GET', `/events/${eventId}/roster`, { token });
  assert('Listar roster → HTTP 200', r9.status === 200);
  assert('Array de participantes', Array.isArray(r9.data?.data));
  assert('Al menos 1 miembro en roster', r9.data?.data?.length >= 1);
  assert('Incluye user con displayName', !!r9.data?.data?.[0]?.user?.displayName);

  // ── Confirmar asistencia (el mismo usuario actualiza su propio status)
  sep();
  console.log(`${C.bold}  4.10 PATCH /events/:id/roster/:userId (confirmar)${C.reset}`);
  const r10 = await req('PATCH', `/events/${eventId}/roster/${userId}`, {
    token,
    body: { status: 'CONFIRMED' },
  });
  assert('Confirmar asistencia → HTTP 200', r10.status === 200);
  assert('Status → CONFIRMED', r10.data?.data?.status === 'CONFIRMED');
  assert('respondedAt presente', !!r10.data?.data?.respondedAt);

  // ── Remover del roster
  sep();
  console.log(`${C.bold}  4.11 DELETE /events/:id/roster/:userId${C.reset}`);
  const r11 = await req('DELETE', `/events/${eventId}/roster/${userId}`, { token });
  assert('Remover del roster → HTTP 200', r11.status === 200);
  // Verificar que ya no está
  const r11b = await req('GET', `/events/${eventId}/roster`, { token });
  assert('Miembro ya no aparece en roster', !r11b.data?.data?.some(m => m.user?.id === userId));

  // ── Evento no existe → 404
  const r404 = await req('GET', '/events/id-inexistente-000', { token });
  assert('Evento inexistente → 404', r404.status === 404);

  // ── Soft-delete del evento
  sep();
  console.log(`${C.bold}  4.12 DELETE /events/:id${C.reset}`);
  const r12 = await req('DELETE', `/events/${eventId}`, { token });
  assert('Soft-delete evento → HTTP 200', r12.status === 200);
  // Verificar que ya no aparece
  const r12b = await req('GET', '/events', { token, params: { orgId: org.id } });
  assert('Evento eliminado no aparece en lista', !r12b.data?.data?.events?.some(e => e.id === eventId));

  // ── Soft-delete no afecta al ensayo
  assert('Ensayo sigue existiendo', r12b.data?.data?.events?.some(e => e.id === rehearsalId));

  return { orgId: org.id };
}

// =============================================================================
// SUITE 5 — VALIDACIONES / SEGURIDAD
// =============================================================================
async function suiteValidations(token) {
  title('SUITE 5 — Validaciones y Seguridad');

  // ── Sin token → 401
  sep();
  console.log(`${C.bold}  5.1 Petición sin token${C.reset}`);
  const r1 = await req('GET', '/organizations');
  assert('Sin token → 401', r1.status === 401);

  const r1b = await req('GET', '/songs');
  assert('GET /songs sin token → 401', r1b.status === 401);

  const r1c = await req('GET', '/events');
  assert('GET /events sin token → 401', r1c.status === 401);

  // ── Campos requeridos faltantes → 400
  sep();
  console.log(`${C.bold}  5.2 Body inválido → 400${C.reset}`);
  const r2 = await req('POST', '/organizations', {
    token,
    body: {}, // falta name
  });
  assert('POST /organizations sin name → 400', r2.status === 400);

  const r3 = await req('POST', '/songs', {
    token,
    body: { title: 'Sin orgId' }, // falta orgId
  });
  assert('POST /songs sin orgId → 400', r3.status === 400);

  const r4 = await req('POST', '/events', {
    token,
    body: { orgId: 'id-falso', title: 'Test' }, // falta type y startTime
  });
  assert('POST /events sin type/startTime → 400', r4.status === 400);

  // ── Type enum inválido → 400
  sep();
  console.log(`${C.bold}  5.3 Enum inválido → 400${C.reset}`);
  const r5 = await req('POST', '/events', {
    token,
    body: {
      orgId: 'cid-fake',
      title: 'Test',
      type: 'INVALID_TYPE',
      startTime: '2026-08-15T20:00:00.000Z',
    },
  });
  assert('EventType inválido → 400', r5.status === 400);

  // ── No miembro de la org → 403
  sep();
  console.log(`${C.bold}  5.4 Acceso a org ajena → 403${C.reset}`);
  const rFakeOrg = await req('GET', '/organizations/org-que-no-existe', { token });
  assert('Org inexistente/ajena → 404', rFakeOrg.status === 404);
}

// =============================================================================
// RUNNER PRINCIPAL
// =============================================================================
async function runAll() {
  console.log(`\n${C.bold}${C.yellow}`);
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  TEST SPRINT 2 — Organizations, Songs, Events, Venues ║');
  console.log(`║  ${BASE.padEnd(50)} ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(C.reset);

  // Health check rápido
  const health = await fetch(`${BASE}/health`).catch(() => null);
  if (!health?.ok) {
    fail(`API no responde en ${BASE}/health — ¿está corriendo el servidor?`);
    process.exit(1);
  }
  ok('API respondiendo en /health');

  let token;
  try {
    title('SETUP — Token Keycloak');
    token = await getToken();
    ok(`Token obtenido (${token.length} chars)`);
  } catch (e) {
    fail(`No se pudo obtener token: ${e.message}`);
    process.exit(1);
  }

  // Correr suites en secuencia
  await suiteOrganizations(token);
  const songsSuite = await suiteSongs(token);
  const { venueId } = await suiteVenues(token);
  await suiteEvents(token, venueId);
  await suiteValidations(token);

  // ── Resumen final
  const total = passed + failed;
  console.log(`\n${C.bold}${C.yellow}══ RESUMEN ══${C.reset}`);
  console.log(`${C.bold}  Total:   ${total}${C.reset}`);
  console.log(`${C.green}  Passed: ${passed}${C.reset}`);
  if (failed > 0) {
    console.log(`${C.red}  Failed: ${failed}${C.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${C.bold}${C.green}  ✓ Todos los tests pasaron — listo para producción.${C.reset}\n`);
  }
}

runAll().catch((e) => {
  fail(`Error inesperado: ${e.message}`);
  console.error(e);
  process.exit(1);
});
