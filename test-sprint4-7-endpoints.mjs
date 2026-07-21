/**
 * Test Sprint 4-7 — Finance · Skills · Inventory · Notifications · Messages
 * TDD: Define el comportamiento esperado y verifica contra la API real.
 * Ejecutar: node test-sprint4-7-endpoints.mjs
 * Requiere: API en localhost:3005, Keycloak en localhost:8090
 */

const BASE = 'http://localhost:3005/api/v1';
const KC   = 'http://localhost:8090/realms/regieart/protocol/openid-connect/token';

const C = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', gray: '\x1b[90m',
};
const ok    = m => console.log(`${C.green}  ✓ ${m}${C.reset}`);
const fail  = m => console.log(`${C.red}  ✗ ${m}${C.reset}`);
const info  = m => console.log(`${C.cyan}    ${m}${C.reset}`);
const title = m => console.log(`\n${C.bold}${C.yellow}══ ${m} ══${C.reset}`);
const sep   = () => console.log(`${C.gray}  ─────────────────────────────────${C.reset}`);

let passed = 0, failed = 0;
function assert(label, cond, detail = '') {
  if (cond) { ok(label); passed++; }
  else       { fail(`${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

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
  const d = await res.json();
  if (!d.access_token) throw new Error('No token: ' + JSON.stringify(d));
  return d.access_token;
}

// ═══════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════
async function setup(token) {
  title('SETUP');
  const rMe  = await req('GET', '/users/me', { token });
  const userId = rMe.data?.data?.id;
  info(`userId: ${userId}`);

  const rOrg = await req('POST', '/organizations', {
    token,
    body: { name: `Org Finance Test ${Date.now()}` },
  });
  const orgId = rOrg.data?.data?.id;
  assert('Crear org → HTTP 201', rOrg.status === 201);
  info(`orgId: ${orgId}`);

  const rEvent = await req('POST', '/events', {
    token,
    body: { orgId, title: 'Test Event', type: 'CONCERT', startTime: '2026-09-10T20:00:00.000Z' },
  });
  const eventId = rEvent.data?.data?.id;
  assert('Crear evento → HTTP 201', rEvent.status === 201);
  info(`eventId: ${eventId}`);

  return { userId, orgId, eventId };
}

// ═══════════════════════════════════════════════════════════════
// SUITE 1 — FINANCE (Sprint 4)
// ═══════════════════════════════════════════════════════════════
async function suiteFinance(token, { orgId, eventId, userId }) {
  title('SUITE 1 — Finance: Categorías + Entradas + Per Diem + Reportes');

  // 1.1 Categorías
  sep(); console.log(`${C.bold}  1.1 Categorías${C.reset}`);
  const rCat1 = await req('POST', '/finance/categories', {
    token,
    body: { orgId, name: 'Transporte', type: 'EXPENSE', icon: '🚌' },
  });
  assert('Crear categoría EXPENSE → 201', rCat1.status === 201);
  const catId = rCat1.data?.data?.id;

  const rCat2 = await req('POST', '/finance/categories', {
    token,
    body: { orgId, name: 'Caché del evento', type: 'INCOME' },
  });
  assert('Crear categoría INCOME → 201', rCat2.status === 201);
  const incomeCatId = rCat2.data?.data?.id;

  // Duplicado → 409
  const rCatDup = await req('POST', '/finance/categories', {
    token, body: { orgId, name: 'Transporte', type: 'EXPENSE' },
  });
  assert('Categoría duplicada → 409', rCatDup.status === 409);

  const rCatList = await req('GET', '/finance/categories', { token, params: { orgId } });
  assert('Listar categorías → 200', rCatList.status === 200);
  assert('Devuelve 2 categorías', rCatList.data?.data?.length === 2);

  // 1.2 Entradas
  sep(); console.log(`${C.bold}  1.2 Entradas (Gastos / Ingresos)${C.reset}`);
  const rE1 = await req('POST', '/finance/entries', {
    token,
    body: {
      orgId, eventId, categoryId: catId,
      type: 'EXPENSE', amount: '150.00', currency: 'CAD',
      description: 'Alquiler de furgoneta para el show',
      date: '2026-09-10',
    },
  });
  assert('Crear gasto → 201', rE1.status === 201);
  assert('Status PENDING por defecto', rE1.data?.data?.status === 'PENDING');
  assert('Tiene categoría incluida', !!rE1.data?.data?.category?.name);
  const entryId = rE1.data?.data?.id;

  await req('POST', '/finance/entries', {
    token,
    body: {
      orgId, categoryId: incomeCatId,
      type: 'INCOME', amount: '5000.00', currency: 'CAD',
      description: 'Pago del organizador del festival',
      date: '2026-09-10',
    },
  });

  const rEList = await req('GET', '/finance/entries', { token, params: { orgId } });
  assert('Listar entradas → 200', rEList.status === 200);
  assert('2 entradas total', rEList.data?.data?.total === 2);

  const rEFilter = await req('GET', '/finance/entries', { token, params: { orgId, type: 'EXPENSE' } });
  assert('Filtrar por EXPENSE → solo gastos', rEFilter.data?.data?.entries?.every(e => e.type === 'EXPENSE'));

  const rEGet = await req('GET', `/finance/entries/${entryId}`, { token });
  assert('GET entrada por ID → 200', rEGet.status === 200);
  assert('Tiene evento vinculado', !!rEGet.data?.data?.event?.id);

  // Editar
  const rEPatch = await req('PATCH', `/finance/entries/${entryId}`, {
    token, body: { amount: '180.00', description: 'Furgoneta + combustible' },
  });
  assert('Editar entrada → 200', rEPatch.status === 200);

  // Aprobar
  sep(); console.log(`${C.bold}  1.3 Aprobar / Rechazar gastos${C.reset}`);
  const rApprove = await req('PATCH', `/finance/entries/${entryId}/approve`, { token });
  assert('Aprobar gasto → 200', rApprove.status === 200);
  assert('Status → APPROVED', rApprove.data?.data?.status === 'APPROVED');
  assert('paidAt presente', !!rApprove.data?.data?.paidAt);
  assert('approvedById presente', !!rApprove.data?.data?.approvedById);

  // Crear otro gasto para rechazar
  const rE3 = await req('POST', '/finance/entries', {
    token, body: { orgId, type: 'EXPENSE', amount: '30.00', date: '2026-09-10', description: 'Aparcamiento' },
  });
  const entry3Id = rE3.data?.data?.id;
  const rReject = await req('PATCH', `/finance/entries/${entry3Id}/reject`, {
    token, body: { reason: 'Gasto no autorizado' },
  });
  assert('Rechazar gasto → 200', rReject.status === 200);
  assert('Status → REJECTED', rReject.data?.data?.status === 'REJECTED');

  // Eliminar
  const rDel = await req('DELETE', `/finance/entries/${entry3Id}`, { token });
  assert('Eliminar entrada → 200', rDel.status === 200);

  // 1.4 Per Diem
  sep(); console.log(`${C.bold}  1.4 Per Diem${C.reset}`);
  const rPD = await req('POST', '/finance/per-diem', {
    token,
    body: { orgId, eventId, userId, amount: '50.00', currency: 'CAD', description: 'Viático show 10-Sep' },
  });
  assert('Crear per diem → 201', rPD.status === 201);
  assert('isPaid = false', rPD.data?.data?.isPaid === false);
  const pdId = rPD.data?.data?.id;

  const rPDList = await req('GET', '/finance/per-diem', { token, params: { orgId, eventId } });
  assert('Listar per diems → 200', rPDList.status === 200);
  assert('1 per diem', rPDList.data?.data?.length === 1);

  const rPDPaid = await req('PATCH', `/finance/per-diem/${pdId}/mark-paid`, { token });
  assert('Marcar per diem pagado → 200', rPDPaid.status === 200);
  assert('isPaid = true', rPDPaid.data?.data?.isPaid === true);
  assert('paidAt presente', !!rPDPaid.data?.data?.paidAt);

  // 1.5 Reporte
  sep(); console.log(`${C.bold}  1.5 Reporte financiero${C.reset}`);
  const rReport = await req('GET', '/finance/reports', { token, params: { orgId } });
  assert('GET reporte → 200', rReport.status === 200);
  assert('Tiene summary con balance', typeof rReport.data?.data?.summary?.balance === 'number');
  assert('totalExpense > 0 (gasto aprobado contabilizado)', rReport.data?.data?.summary?.totalExpense > 0);
  assert('Tiene byCategory array', Array.isArray(rReport.data?.data?.byCategory));
  info(`Balance: ${rReport.data?.data?.summary?.balance} CAD`);

  // 1.6 Validaciones
  sep(); console.log(`${C.bold}  1.6 Validaciones Finance${C.reset}`);
  const r401 = await req('GET', '/finance/categories');
  assert('Sin token → 401', r401.status === 401);
  const r400 = await req('POST', '/finance/entries', {
    token, body: { orgId, type: 'INVALID', amount: 'abc', date: 'no-date' },
  });
  assert('Datos inválidos → 400', r400.status === 400);
}

// ═══════════════════════════════════════════════════════════════
// SUITE 2 — SKILLS & USER SEARCH (Sprint 5)
// ═══════════════════════════════════════════════════════════════
async function suiteSkills(token, { userId }) {
  title('SUITE 2 — Skills: Categorías + Habilidades de usuario + Búsqueda');

  // 2.1 Categorías globales
  sep(); console.log(`${C.bold}  2.1 Skill Categories${C.reset}`);
  const rCat1 = await req('POST', '/skill-categories', {
    token, body: { name: 'Trompeta', type: 'INSTRUMENT', icon: '🎺' },
  });
  assert('Crear categoría Trompeta → 201', rCat1.status === 201);
  const trumpetCatId = rCat1.data?.data?.id;

  await req('POST', '/skill-categories', { token, body: { name: 'Director Musical', type: 'MANAGEMENT' } });
  await req('POST', '/skill-categories', { token, body: { name: 'Técnico FOH', type: 'TECHNICAL' } });

  // Duplicado → 409
  const rDup = await req('POST', '/skill-categories', {
    token, body: { name: 'Trompeta', type: 'INSTRUMENT' },
  });
  assert('Categoría duplicada → 409', rDup.status === 409);

  const rCatList = await req('GET', '/skill-categories', { token });
  assert('Listar categorías → 200', rCatList.status === 200);
  assert('Al menos 3 categorías', rCatList.data?.data?.length >= 3);

  // 2.2 Habilidades del usuario
  sep(); console.log(`${C.bold}  2.2 User Skills${C.reset}`);
  const rAdd = await req('POST', '/users/me/skills', {
    token,
    body: { skillCategoryId: trumpetCatId, expertiseLevel: 'PROFESSIONAL', yearsExp: 15 },
  });
  assert('Agregar habilidad Trompeta → 201', rAdd.status === 201);
  assert('expertiseLevel correcto', rAdd.data?.data?.expertiseLevel === 'PROFESSIONAL');
  assert('Tiene skillCategory incluida', !!rAdd.data?.data?.skillCategory?.name);
  const skillId = rAdd.data?.data?.id;

  // Duplicado → 409
  const rAddDup = await req('POST', '/users/me/skills', {
    token, body: { skillCategoryId: trumpetCatId },
  });
  assert('Habilidad duplicada → 409', rAddDup.status === 409);

  // GET mis habilidades
  const rMySkills = await req('GET', '/users/me/skills', { token });
  assert('GET mis habilidades → 200', rMySkills.status === 200);
  assert('1 habilidad', rMySkills.data?.data?.length === 1);

  // GET habilidades de otro usuario por ID
  const rOtherSkills = await req('GET', `/users/${userId}/skills`, { token });
  assert('GET skills de usuario por ID → 200', rOtherSkills.status === 200);

  // 2.3 Perfil público
  sep(); console.log(`${C.bold}  2.3 Perfil público GET /users/:id${C.reset}`);
  const rProfile = await req('GET', `/users/${userId}`, { token });
  assert('GET perfil público → 200', rProfile.status === 200);
  assert('No expone email', !('email' in (rProfile.data?.data ?? {})));
  assert('Tiene skills en perfil', Array.isArray(rProfile.data?.data?.skills));
  assert('Tiene memberships en perfil', Array.isArray(rProfile.data?.data?.memberships));

  // 2.4 Búsqueda de usuarios
  sep(); console.log(`${C.bold}  2.4 GET /users/search${C.reset}`);
  const rSearch = await req('GET', '/users/search', { token, params: { skill: 'Trompeta' } });
  assert('Buscar por skill → 200', rSearch.status === 200);
  assert('Encuentra al usuario con Trompeta', rSearch.data?.data?.total >= 1);
  assert('No expone email en búsqueda', !rSearch.data?.data?.users?.[0]?.email);

  // 2.5 Actualizar perfil con city/country
  sep(); console.log(`${C.bold}  2.5 PATCH /users/me con city/country${C.reset}`);
  const rPatch = await req('PATCH', '/users/me', {
    token, body: { city: 'Montréal', country: 'CA' },
  });
  assert('Actualizar city/country → 200', rPatch.status === 200);
  assert('city guardada', rPatch.data?.data?.city === 'Montréal');
  assert('country guardada', rPatch.data?.data?.country === 'CA');

  // Buscar por ciudad
  const rByCity = await req('GET', '/users/search', { token, params: { city: 'Montréal' } });
  assert('Buscar por city → devuelve usuario', rByCity.data?.data?.total >= 1);

  // 2.6 Eliminar habilidad
  sep(); console.log(`${C.bold}  2.6 DELETE /users/me/skills/:skillId${C.reset}`);
  const rDelSkill = await req('DELETE', `/users/me/skills/${skillId}`, { token });
  assert('Eliminar habilidad → 200', rDelSkill.status === 200);
  const rAfterDel = await req('GET', '/users/me/skills', { token });
  assert('0 habilidades después de eliminar', rAfterDel.data?.data?.length === 0);

  // Eliminar categoría
  const rDelCat = await req('DELETE', `/skill-categories/${trumpetCatId}`, { token });
  assert('Eliminar categoría → 200', rDelCat.status === 200);
  const rCatListAfter = await req('GET', '/skill-categories', { token });
  assert('2 categorías después de eliminar', rCatListAfter.data?.data?.length === 2);
}

// ═══════════════════════════════════════════════════════════════
// SUITE 3 — INVENTORY (Sprint 6)
// ═══════════════════════════════════════════════════════════════
async function suiteInventory(token, { orgId, eventId, userId }) {
  title('SUITE 3 — Inventario & Backline');

  // 3.1 Crear instrumento
  sep(); console.log(`${C.bold}  3.1 POST /instruments${C.reset}`);
  const rI1 = await req('POST', '/instruments', {
    token,
    body: {
      orgId,
      name:  'Trompeta Bach Stradivarius',
      type:  'BRASS',
      brand: 'Bach',
      model: 'Stradivarius 37',
      serialNumber: 'BS-2026-001',
      notes: 'Instrumento principal del director',
    },
  });
  assert('Crear instrumento → 201', rI1.status === 201);
  assert('Status AVAILABLE por defecto', rI1.data?.data?.status === 'AVAILABLE');
  const instrumentId = rI1.data?.data?.id;
  info(`instrumentId: ${instrumentId}`);

  await req('POST', '/instruments', {
    token, body: { orgId, name: 'Consola Yamaha CL5', type: 'AUDIO_GEAR', brand: 'Yamaha' },
  });

  // 3.2 Listar
  sep(); console.log(`${C.bold}  3.2 GET /instruments${C.reset}`);
  const rList = await req('GET', '/instruments', { token, params: { orgId } });
  assert('Listar → 200', rList.status === 200);
  assert('2 instrumentos', rList.data?.data?.length === 2);

  const rFilter = await req('GET', '/instruments', { token, params: { orgId, type: 'BRASS' } });
  assert('Filtrar por BRASS → 1 instrumento', rFilter.data?.data?.length === 1);

  // 3.3 Detalle
  const rGet = await req('GET', `/instruments/${instrumentId}`, { token });
  assert('GET por ID → 200', rGet.status === 200);
  assert('Tiene serialNumber', rGet.data?.data?.serialNumber === 'BS-2026-001');
  assert('Tiene assignments array', Array.isArray(rGet.data?.data?.assignments));

  // 3.4 Editar
  const rPatch = await req('PATCH', `/instruments/${instrumentId}`, {
    token, body: { notes: 'Instrumento principal — revisado 2026' },
  });
  assert('Editar instrumento → 200', rPatch.status === 200);

  // 3.5 Asignar
  sep(); console.log(`${C.bold}  3.5 POST /instruments/:id/assign${C.reset}`);
  const rAssign = await req('POST', `/instruments/${instrumentId}/assign`, {
    token,
    body: { userId, eventId, notes: 'Para el concierto de septiembre' },
  });
  assert('Asignar instrumento → 201', rAssign.status === 201);

  // Asignar de nuevo → 409
  const rAssignDup = await req('POST', `/instruments/${instrumentId}/assign`, {
    token, body: { userId },
  });
  assert('Asignar instrumento ya en uso → 409', rAssignDup.status === 409);

  // Verificar status IN_USE
  const rAfterAssign = await req('GET', `/instruments/${instrumentId}`, { token });
  assert('Status → IN_USE tras asignación', rAfterAssign.data?.data?.status === 'IN_USE');

  // 3.6 Lista de equipaje por evento
  sep(); console.log(`${C.bold}  3.6 GET /instruments/assignments?eventId=${C.reset}`);
  const rAssignments = await req('GET', '/instruments/assignments', { token, params: { orgId, eventId } });
  assert('Lista de equipaje → 200', rAssignments.status === 200);
  assert('Al menos 1 asignación', rAssignments.data?.data?.length >= 1);
  assert('Tiene instrumento incluido', !!rAssignments.data?.data?.[0]?.instrument?.name);
  assert('Tiene usuario incluido', !!rAssignments.data?.data?.[0]?.user?.displayName);

  // 3.7 Devolución
  sep(); console.log(`${C.bold}  3.7 PATCH /instruments/:id/return${C.reset}`);
  const rReturn = await req('PATCH', `/instruments/${instrumentId}/return`, { token });
  assert('Devolver instrumento → 200', rReturn.status === 200);

  const rAfterReturn = await req('GET', `/instruments/${instrumentId}`, { token });
  assert('Status → AVAILABLE tras devolución', rAfterReturn.data?.data?.status === 'AVAILABLE');
  assert('returnedAt presente en historial', !!rAfterReturn.data?.data?.assignments?.[0]?.returnedAt);

  // 3.8 Retirar instrumento
  sep(); console.log(`${C.bold}  3.8 PATCH /instruments/:id/retire${C.reset}`);
  const rRetire = await req('PATCH', `/instruments/${instrumentId}/retire`, { token });
  assert('Retirar instrumento → 200', rRetire.status === 200);
  assert('Status → RETIRED', rRetire.data?.data?.status === 'RETIRED');

  // No aparece en lista (isActive=false)
  const rListAfterRetire = await req('GET', '/instruments', { token, params: { orgId } });
  assert('Instrumento retirado no aparece en lista', !rListAfterRetire.data?.data?.some(i => i.id === instrumentId));
}

// ═══════════════════════════════════════════════════════════════
// SUITE 4 — NOTIFICATIONS (Sprint 7)
// ═══════════════════════════════════════════════════════════════
async function suiteNotifications(token, { orgId, eventId, userId }) {
  title('SUITE 4 — Notificaciones');

  // Las notificaciones se crean automáticamente por los triggers
  // Crear trigger: agregar usuario al roster de un evento
  await req('POST', `/events/${eventId}/roster`, {
    token, body: { userId, role: 'Trompeta' },
  });

  // Esperar un tick para que el fire-and-forget procese
  await new Promise(r => setTimeout(r, 200));

  // 4.1 Listar notificaciones
  sep(); console.log(`${C.bold}  4.1 GET /notifications${C.reset}`);
  const rList = await req('GET', '/notifications', { token });
  assert('GET notificaciones → 200', rList.status === 200);
  assert('Tiene notifications array', Array.isArray(rList.data?.data?.notifications));
  assert('Tiene unreadCount', typeof rList.data?.data?.unreadCount === 'number');
  info(`Total notificaciones: ${rList.data?.data?.total}`);
  info(`Sin leer: ${rList.data?.data?.unreadCount}`);

  // Filtrar solo no leídas
  const rUnread = await req('GET', '/notifications', { token, params: { isRead: 'false' } });
  assert('Filtrar isRead=false → 200', rUnread.status === 200);

  // 4.2 Si hay notificaciones, marcar la primera como leída
  const firstNotif = rList.data?.data?.notifications?.[0];
  if (firstNotif) {
    sep(); console.log(`${C.bold}  4.2 PATCH /notifications/:id/read${C.reset}`);
    const rRead = await req('PATCH', `/notifications/${firstNotif.id}/read`, { token });
    assert('Marcar como leída → 200', rRead.status === 200);

    // Verificar que el count disminuyó
    const rAfterRead = await req('GET', '/notifications', { token });
    const newUnread = rAfterRead.data?.data?.unreadCount;
    assert('unreadCount disminuyó', newUnread <= rList.data?.data?.unreadCount);
  }

  // 4.3 Marcar todas como leídas
  sep(); console.log(`${C.bold}  4.3 PATCH /notifications/read-all${C.reset}`);
  const rReadAll = await req('PATCH', '/notifications/read-all', { token });
  assert('Marcar todas leídas → 200', rReadAll.status === 200);
  assert('Tiene campo updated', typeof rReadAll.data?.data?.updated === 'number');

  const rAfterReadAll = await req('GET', '/notifications', { token, params: { isRead: 'false' } });
  assert('Sin notificaciones no leídas tras read-all', rAfterReadAll.data?.data?.unreadCount === 0);

  // 4.4 Eliminar notificación
  if (firstNotif) {
    sep(); console.log(`${C.bold}  4.4 DELETE /notifications/:id${C.reset}`);
    const rDel = await req('DELETE', `/notifications/${firstNotif.id}`, { token });
    assert('Eliminar notificación → 200', rDel.status === 200);
  }

  // 4.5 Sin token → 401
  const r401 = await req('GET', '/notifications');
  assert('Sin token → 401', r401.status === 401);
}

// ═══════════════════════════════════════════════════════════════
// SUITE 5 — MESSAGES (Sprint 7)
// ═══════════════════════════════════════════════════════════════
async function suiteMessages(token, { userId }) {
  title('SUITE 5 — Mensajes Directos');

  // Para testear mensajes necesitamos otro usuario
  // Usamos el mismo usuario como remitente y verificamos el comportamiento
  sep(); console.log(`${C.bold}  5.1 POST /messages — enviar a sí mismo da 400${C.reset}`);
  const rSelf = await req('POST', '/messages', {
    token, body: { recipientId: userId, body: 'Mensaje a mí mismo' },
  });
  assert('Enviar mensaje a uno mismo → 400', rSelf.status === 400);

  // 5.2 Lista de conversaciones (vacío)
  sep(); console.log(`${C.bold}  5.2 GET /messages/conversations${C.reset}`);
  const rConvs = await req('GET', '/messages/conversations', { token });
  assert('GET conversaciones → 200', rConvs.status === 200);
  assert('Devuelve array', Array.isArray(rConvs.data?.data));

  // 5.3 Conversación con usuario inexistente → 404
  sep(); console.log(`${C.bold}  5.3 GET /messages/conversations/:userId inexistente → 404${C.reset}`);
  const rConv404 = await req('GET', '/messages/conversations/id-fake-000', { token });
  assert('Conversación usuario inexistente → 404', rConv404.status === 404);

  // 5.4 Sin token → 401
  const r401 = await req('POST', '/messages');
  assert('Enviar mensaje sin token → 401', r401.status === 401);

  // 5.5 Body inválido → 400
  const r400 = await req('POST', '/messages', {
    token, body: { recipientId: userId }, // falta body
  });
  assert('Mensaje sin body → 400', r400.status === 400);
}

// ═══════════════════════════════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════════════════════════════
async function runAll() {
  console.log(`\n${C.bold}${C.yellow}`);
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  TEST SPRINT 4-7 — Finance · Skills · Inventory · Notif  ║');
  console.log(`║  ${BASE.padEnd(56)} ║`);
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(C.reset);

  const health = await fetch(`${BASE}/health`).catch(() => null);
  if (!health?.ok) { fail('API no responde'); process.exit(1); }
  ok('API respondiendo');

  let token;
  try {
    title('AUTH');
    token = await getToken();
    ok(`Token obtenido (${token.length} chars)`);
  } catch (e) { fail(e.message); process.exit(1); }

  const ctx = await setup(token);

  await suiteFinance(token, ctx);
  await suiteSkills(token, ctx);
  await suiteInventory(token, ctx);
  await suiteNotifications(token, ctx);
  await suiteMessages(token, ctx);

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

runAll().catch(e => { fail(e.message); console.error(e); process.exit(1); });
