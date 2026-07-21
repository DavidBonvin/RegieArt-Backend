/**
 * Test Sprint 3 — DaySheet & Logística Operativa
 * TDD: describe el comportamiento esperado antes de ejecutar.
 *
 * Ejecutar: node test-daysheet-endpoints.mjs
 * Requiere: API en localhost:3005, Keycloak en localhost:8090
 *
 * Cubre (18 endpoints):
 *   GET  /events/:id/daysheet              → Master consolidado
 *   GET  /events/:id/weather               → Clima por separado
 *   ── Cronograma (5) ──────────────────────────────────────────
 *   POST   /events/:id/schedule
 *   GET    /events/:id/schedule
 *   PATCH  /events/:id/schedule/:itemId
 *   PATCH  /events/:id/schedule/:itemId/complete
 *   DELETE /events/:id/schedule/:itemId
 *   ── Vehículos + Pasajeros + Pickups (9) ─────────────────────
 *   POST/GET/PATCH/DELETE /events/:id/vehicles
 *   POST/DELETE /events/:id/vehicles/:vehicleId/passengers
 *   POST/PATCH/DELETE /events/:id/vehicles/:vehicleId/pickups
 *   ── Finanzas (2) ────────────────────────────────────────────
 *   GET /events/:id/finance
 *   PUT /events/:id/finance
 */

const BASE = 'http://localhost:3005/api/v1';
const KC   = 'http://localhost:8090/realms/regieart/protocol/openid-connect/token';

// ─── Colores ─────────────────────────────────────────────────────────────────
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

function assert(label, condition, detail = '') {
  if (condition) { ok(label); passed++; }
  else           { fail(`${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

async function req(method, path, { token, body, params } = {}) {
  const url = new URL(BASE + path);
  if (params) Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
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

// =============================================================================
// SETUP: crear org + evento + venue con coordenadas
// =============================================================================
async function setup(token) {
  title('SETUP — Org + Venue + Evento');

  const rMe = await req('GET', '/users/me', { token });
  const userId = rMe.data?.data?.id;
  info(`userId: ${userId}`);

  const rOrg = await req('POST', '/organizations', {
    token,
    body: { name: `Org Daysheet Test ${Date.now()}` },
  });
  const orgId = rOrg.data?.data?.id;
  assert('Crear org → HTTP 201', rOrg.status === 201);
  info(`orgId: ${orgId}`);

  // Venue con coordenadas (Montréal Place des Arts)
  const rVenue = await req('POST', '/venues', {
    token,
    body: {
      name:                 'Salle Wilfrid-Pelletier Test',
      address:              '175 Rue Sainte-Catherine O',
      city:                 'Montréal',
      country:              'CA',
      capacity:             2982,
      latitude:             45.508888,
      longitude:            -73.561668,
      parkingNotes:         '3 plazas reservadas detrás — código barrera 1234',
      loadInNotes:          'Muelle trasero, ascensor disponible hasta las 18:00',
      technicalContactName: 'Jean-Michel Legrand',
      technicalContactPhone:'+1-514-842-2112',
      technicalContactEmail:'jm.legrand@placedesarts.com',
    },
  });
  const venueId = rVenue.data?.data?.id;
  assert('Crear venue con coords → HTTP 201', rVenue.status === 201);
  assert('Venue tiene latitude', rVenue.data?.data?.latitude === 45.508888);
  assert('Venue tiene longitude', rVenue.data?.data?.longitude === -73.561668);
  assert('Venue tiene parkingNotes', !!rVenue.data?.data?.parkingNotes);
  assert('Venue tiene loadInNotes', !!rVenue.data?.data?.loadInNotes);
  assert('Venue tiene technicalContactPhone', !!rVenue.data?.data?.technicalContactPhone);
  info(`venueId: ${venueId}`);

  const rEvent = await req('POST', '/events', {
    token,
    body: {
      orgId,
      title:         'Concierto Daysheet Test',
      type:          'CONCERT',
      startTime:     '2026-08-20T20:00:00.000Z',
      endTime:       '2026-08-20T23:30:00.000Z',
      venueId,
      isPublic:      true,
    },
  });
  const eventId = rEvent.data?.data?.id;
  assert('Crear evento → HTTP 201', rEvent.status === 201);
  info(`eventId: ${eventId}`);

  return { userId, orgId, venueId, eventId };
}

// =============================================================================
// SUITE 1 — CRONOGRAMA (5 endpoints)
// =============================================================================
async function suiteSchedule(token, eventId) {
  title('SUITE 1 — Cronograma del día');

  // 1.1 — Crear ítems del cronograma
  sep(); console.log(`${C.bold}  1.1 POST /events/:id/schedule${C.reset}`);
  const items = [
    { type: 'DEPARTURE',   title: 'Salida desde el local',    startTime: '2026-08-20T14:00:00.000Z', notes: 'Bus alquilado, puntualidad obligatoria' },
    { type: 'ARRIVAL',     title: 'Llegada a Place des Arts', startTime: '2026-08-20T16:00:00.000Z', location: 'Muelle de carga' },
    { type: 'LOAD_IN',     title: 'Carga de backline',        startTime: '2026-08-20T16:15:00.000Z', endTime: '2026-08-20T17:00:00.000Z' },
    { type: 'SOUNDCHECK',  title: 'Balance audio',            startTime: '2026-08-20T17:00:00.000Z', withWho: 'Con FOH Jean Dupont', endTime: '2026-08-20T18:30:00.000Z' },
    { type: 'CATERING_DINNER', title: 'Cena del equipo',      startTime: '2026-08-20T18:30:00.000Z', location: 'Camerinos planta baja' },
    { type: 'SHOWTIME',    title: 'Concierto',                startTime: '2026-08-20T20:00:00.000Z', endTime: '2026-08-20T22:00:00.000Z' },
    { type: 'LOAD_OUT',    title: 'Recogida de equipos',      startTime: '2026-08-20T22:30:00.000Z' },
  ];

  const createdIds = [];
  for (const item of items) {
    const r = await req('POST', `/events/${eventId}/schedule`, { token, body: item });
    assert(`Crear ítem ${item.type} → HTTP 201`, r.status === 201);
    createdIds.push(r.data?.data?.id);
  }
  info(`${createdIds.length} ítems creados`);

  // 1.2 — Listar cronograma ordenado
  sep(); console.log(`${C.bold}  1.2 GET /events/:id/schedule${C.reset}`);
  const rList = await req('GET', `/events/${eventId}/schedule`, { token });
  assert('Listar cronograma → HTTP 200', rList.status === 200);
  assert('Devuelve array', Array.isArray(rList.data?.data));
  assert(`Contiene ${items.length} ítems`, rList.data?.data?.length === items.length);
  // Verificar que vienen ordenados por startTime
  const times = rList.data?.data?.map(i => new Date(i.startTime).getTime());
  const isSorted = times.every((t, i) => i === 0 || t >= times[i - 1]);
  assert('Cronograma ordenado por startTime', isSorted);

  // 1.3 — Editar ítem
  const soundcheckId = createdIds[3];
  sep(); console.log(`${C.bold}  1.3 PATCH /events/:id/schedule/:itemId${C.reset}`);
  const rPatch = await req('PATCH', `/events/${eventId}/schedule/${soundcheckId}`, {
    token,
    body: { withWho: 'Con FOH Jean Dupont + monitor engineer Marc', notes: 'Probar primero vientos' },
  });
  assert('Editar ítem → HTTP 200', rPatch.status === 200);
  assert('withWho actualizado', rPatch.data?.data?.withWho?.includes('monitor engineer'));
  assert('notes actualizado', rPatch.data?.data?.notes?.includes('vientos'));

  // 1.4 — Toggle completado (DEPARTURE)
  const departureId = createdIds[0];
  sep(); console.log(`${C.bold}  1.4 PATCH .../schedule/:itemId/complete${C.reset}`);
  const rComplete = await req('PATCH', `/events/${eventId}/schedule/${departureId}/complete`, { token });
  assert('Marcar completado → HTTP 200', rComplete.status === 200);
  assert('isCompleted = true', rComplete.data?.data?.isCompleted === true);
  assert('completedAt tiene valor', !!rComplete.data?.data?.completedAt);
  // Toggle de nuevo → false
  const rToggle = await req('PATCH', `/events/${eventId}/schedule/${departureId}/complete`, { token });
  assert('Toggle de vuelta a false', rToggle.data?.data?.isCompleted === false);
  assert('completedAt = null tras toggle', rToggle.data?.data?.completedAt === null);

  // 1.5 — Eliminar ítem (el último LOAD_OUT)
  const loadOutId = createdIds[6];
  sep(); console.log(`${C.bold}  1.5 DELETE /events/:id/schedule/:itemId${C.reset}`);
  const rDel = await req('DELETE', `/events/${eventId}/schedule/${loadOutId}`, { token });
  assert('Eliminar ítem → HTTP 200', rDel.status === 200);
  const rAfterDel = await req('GET', `/events/${eventId}/schedule`, { token });
  assert(`Quedan ${items.length - 1} ítems`, rAfterDel.data?.data?.length === items.length - 1);

  // 1.6 — Validación: tipo de scheduleType inválido → 400
  const rBad = await req('POST', `/events/${eventId}/schedule`, {
    token,
    body: { type: 'INVALID_TYPE', title: 'Test', startTime: '2026-08-20T10:00:00.000Z' },
  });
  assert('ScheduleType inválido → 400', rBad.status === 400);

  return { firstItemId: createdIds[0] };
}

// =============================================================================
// SUITE 2 — VEHÍCULOS + PASAJEROS + PICKUPS (9 endpoints)
// =============================================================================
async function suiteVehicles(token, eventId, userId) {
  title('SUITE 2 — Vehículos, Pasajeros y Pickups');

  // 2.1 — Crear vehículos
  sep(); console.log(`${C.bold}  2.1 POST /events/:id/vehicles${C.reset}`);
  const rV1 = await req('POST', `/events/${eventId}/vehicles`, {
    token,
    body: {
      name:        'Furgoneta Backline',
      driverName:  'Carlos Martínez',
      driverPhone: '+1-514-555-0200',
      plateNumber: 'QC-123-ABC',
      capacity:    6,
      notes:       'Lleva batería, amplificadores y monitor',
    },
  });
  assert('Crear furgoneta → HTTP 201', rV1.status === 201);
  assert('Tiene plateNumber', rV1.data?.data?.plateNumber === 'QC-123-ABC');
  assert('Tiene passengers array', Array.isArray(rV1.data?.data?.passengers));
  assert('Tiene pickups array', Array.isArray(rV1.data?.data?.pickups));
  const vehicleId = rV1.data?.data?.id;
  info(`vehicleId: ${vehicleId}`);

  const rV2 = await req('POST', `/events/${eventId}/vehicles`, {
    token,
    body: { name: 'Coche Director', driverName: 'Ana López', capacity: 4 },
  });
  assert('Crear segundo vehículo → HTTP 201', rV2.status === 201);
  const vehicle2Id = rV2.data?.data?.id;

  // 2.2 — Listar vehículos
  sep(); console.log(`${C.bold}  2.2 GET /events/:id/vehicles${C.reset}`);
  const rList = await req('GET', `/events/${eventId}/vehicles`, { token });
  assert('Listar vehículos → HTTP 200', rList.status === 200);
  assert('Devuelve 2 vehículos', rList.data?.data?.length === 2);

  // 2.3 — Editar vehículo
  sep(); console.log(`${C.bold}  2.3 PATCH /events/:id/vehicles/:vehicleId${C.reset}`);
  const rPatch = await req('PATCH', `/events/${eventId}/vehicles/${vehicleId}`, {
    token,
    body: { capacity: 7, notes: 'Capacidad ampliada — añadimos el teclado' },
  });
  assert('Editar vehículo → HTTP 200', rPatch.status === 200);
  assert('Capacidad actualizada', rPatch.data?.data?.capacity === 7);

  // 2.4 — Agregar pasajero
  sep(); console.log(`${C.bold}  2.4 POST .../vehicles/:vehicleId/passengers${C.reset}`);
  const rPass = await req('POST', `/events/${eventId}/vehicles/${vehicleId}/passengers`, {
    token,
    body: { userId },
  });
  assert('Agregar pasajero → HTTP 201', rPass.status === 201);
  assert('Pasajero tiene displayName', !!rPass.data?.data?.user?.displayName);
  // Duplicado → 409
  const rDup = await req('POST', `/events/${eventId}/vehicles/${vehicleId}/passengers`, {
    token,
    body: { userId },
  });
  assert('Pasajero duplicado → 409', rDup.status === 409);

  // 2.5 — Verificar pasajero aparece en GET vehicles
  const rCheck = await req('GET', `/events/${eventId}/vehicles`, { token });
  const furgoneta = rCheck.data?.data?.find(v => v.id === vehicleId);
  assert('Pasajero aparece en GET vehicles', furgoneta?.passengers?.length === 1);

  // 2.6 — Agregar puntos de recogida
  sep(); console.log(`${C.bold}  2.6 POST .../vehicles/:vehicleId/pickups${C.reset}`);
  const pickups = [
    { time: '2026-08-20T13:00:00.000Z', address: 'Casa de Carlos — Rue Saint-Denis 45', lat: 45.520, lng: -73.570, order: 0 },
    { time: '2026-08-20T13:20:00.000Z', address: 'Estación Berri-UQAM',                lat: 45.516, lng: -73.560, order: 1 },
    { time: '2026-08-20T13:40:00.000Z', address: 'Casa de Pedro — Rue Sherbrooke 120',  lat: 45.525, lng: -73.575, order: 2 },
  ];
  const pickupIds = [];
  for (const p of pickups) {
    const r = await req('POST', `/events/${eventId}/vehicles/${vehicleId}/pickups`, { token, body: p });
    assert(`Crear pickup ${p.order} → HTTP 201`, r.status === 201);
    assert('Tiene lat/lng', r.data?.data?.lat !== null && r.data?.data?.lng !== null);
    pickupIds.push(r.data?.data?.id);
  }

  // 2.7 — Editar pickup
  sep(); console.log(`${C.bold}  2.7 PATCH .../pickups/:pickupId${C.reset}`);
  const rPatchPickup = await req('PATCH',
    `/events/${eventId}/vehicles/${vehicleId}/pickups/${pickupIds[0]}`,
    { token, body: { notes: 'Estar listo en la puerta con el instrumento', order: 0 } }
  );
  assert('Editar pickup → HTTP 200', rPatchPickup.status === 200);
  assert('notes actualizado', !!rPatchPickup.data?.data?.notes);

  // 2.8 — Verificar pickups ordenados en GET vehicles
  const rVehiclesWithPickups = await req('GET', `/events/${eventId}/vehicles`, { token });
  const v = rVehiclesWithPickups.data?.data?.find(v => v.id === vehicleId);
  assert('Pickups ordenados por order', v?.pickups?.length === 3);
  const orders = v?.pickups?.map(p => p.order) ?? [];
  assert('Orden correcto 0,1,2', JSON.stringify(orders) === JSON.stringify([0,1,2]));

  // 2.9 — Eliminar pickup
  sep(); console.log(`${C.bold}  2.9 DELETE .../pickups/:pickupId${C.reset}`);
  const rDelPickup = await req('DELETE',
    `/events/${eventId}/vehicles/${vehicleId}/pickups/${pickupIds[2]}`,
    { token }
  );
  assert('Eliminar pickup → HTTP 200', rDelPickup.status === 200);
  const rAfterDel = await req('GET', `/events/${eventId}/vehicles`, { token });
  const vAfter = rAfterDel.data?.data?.find(v => v.id === vehicleId);
  assert('Quedan 2 pickups', vAfter?.pickups?.length === 2);

  // 2.10 — Remover pasajero
  sep(); console.log(`${C.bold}  2.10 DELETE .../passengers/:userId${C.reset}`);
  const rRemPass = await req('DELETE',
    `/events/${eventId}/vehicles/${vehicleId}/passengers/${userId}`,
    { token }
  );
  assert('Remover pasajero → HTTP 200', rRemPass.status === 200);
  const rAfterRemPass = await req('GET', `/events/${eventId}/vehicles`, { token });
  const vNoPass = rAfterRemPass.data?.data?.find(v => v.id === vehicleId);
  assert('Pasajero ya no aparece', vNoPass?.passengers?.length === 0);

  // 2.11 — Eliminar vehículo
  sep(); console.log(`${C.bold}  2.11 DELETE /events/:id/vehicles/:vehicleId${C.reset}`);
  const rDelV = await req('DELETE', `/events/${eventId}/vehicles/${vehicle2Id}`, { token });
  assert('Eliminar vehículo → HTTP 200', rDelV.status === 200);
  const rFinal = await req('GET', `/events/${eventId}/vehicles`, { token });
  assert('Queda 1 vehículo', rFinal.data?.data?.length === 1);

  return { vehicleId };
}

// =============================================================================
// SUITE 3 — FINANZAS (2 endpoints)
// =============================================================================
async function suiteFinance(token, eventId) {
  title('SUITE 3 — Finanzas del Evento');

  // 3.1 — Sin finance → null
  sep(); console.log(`${C.bold}  3.1 GET /events/:id/finance (vacío)${C.reset}`);
  const rEmpty = await req('GET', `/events/${eventId}/finance`, { token });
  assert('Sin finance → HTTP 200 y data null', rEmpty.status === 200 && rEmpty.data?.data === null);

  // 3.2 — Crear finanzas (PUT = upsert)
  sep(); console.log(`${C.bold}  3.2 PUT /events/:id/finance (crear)${C.reset}`);
  const rCreate = await req('PUT', `/events/${eventId}/finance`, {
    token,
    body: {
      cacheTotal:    '5000.00',
      perDiemAmount: '50.00',
      currency:      'CAD',
      paymentNotes:  '50% por transferencia previa, 50% en efectivo al terminar',
    },
  });
  assert('Crear finanzas → HTTP 200', rCreate.status === 200);
  assert('cacheTotal presente', !!rCreate.data?.data?.cacheTotal);
  assert('currency correcto', rCreate.data?.data?.currency === 'CAD');
  assert('isPaid = false por defecto', rCreate.data?.data?.isPaid === false);
  assert('paidAt = null', rCreate.data?.data?.paidAt === null);

  // 3.3 — Actualizar (upsert de nuevo)
  sep(); console.log(`${C.bold}  3.3 PUT /events/:id/finance (actualizar)${C.reset}`);
  const rUpdate = await req('PUT', `/events/${eventId}/finance`, {
    token,
    body: { cacheTotal: '5500.00', paymentNotes: 'Precio renegociado — +500 CAD' },
  });
  assert('Actualizar finanzas → HTTP 200', rUpdate.status === 200);

  // 3.4 — Marcar como pagado
  sep(); console.log(`${C.bold}  3.4 PUT /events/:id/finance (isPaid)${C.reset}`);
  const rPaid = await req('PUT', `/events/${eventId}/finance`, {
    token,
    body: { isPaid: true },
  });
  assert('Marcar pagado → HTTP 200', rPaid.status === 200);
  assert('isPaid = true', rPaid.data?.data?.isPaid === true);
  assert('paidAt tiene timestamp', !!rPaid.data?.data?.paidAt);

  // 3.5 — Desmarcar pago
  const rUnpaid = await req('PUT', `/events/${eventId}/finance`, {
    token,
    body: { isPaid: false },
  });
  assert('Desmarcar pago → paidAt = null', rUnpaid.data?.data?.paidAt === null);

  // 3.6 — Validación: currency inválida → 400
  const rBadCurrency = await req('PUT', `/events/${eventId}/finance`, {
    token,
    body: { currency: 'dollars' },
  });
  assert('Currency inválida → 400', rBadCurrency.status === 400);
}

// =============================================================================
// SUITE 4 — MASTER DAYSHEET (1 endpoint)
// =============================================================================
async function suiteMasterDaysheet(token, eventId) {
  title('SUITE 4 — Master Daysheet GET /events/:id/daysheet');

  sep(); console.log(`${C.bold}  4.1 GET /events/:id/daysheet${C.reset}`);
  const r = await req('GET', `/events/${eventId}/daysheet`, { token });
  assert('Master daysheet → HTTP 200', r.status === 200);

  const d = r.data?.data;

  // Estructura esperada
  assert('Tiene event con id',         !!d?.event?.id);
  assert('Tiene event.startTime',      !!d?.event?.startTime);
  assert('Tiene venue con lat/lng',    d?.venue?.latitude !== null && d?.venue?.longitude !== null);
  assert('Tiene venue.parkingNotes',   !!d?.venue?.parkingNotes);
  assert('Tiene venue.loadInNotes',    !!d?.venue?.loadInNotes);
  assert('Tiene schedule (array)',     Array.isArray(d?.schedule));
  assert('Tiene roster (array)',       Array.isArray(d?.roster));
  assert('Tiene vehicles (array)',     Array.isArray(d?.vehicles));
  assert('Tiene finance (admin view)', d?.finance !== undefined);
  assert('Tiene weather campo',        'weather' in d);
  assert('Tiene meta.totalScheduleItems', typeof d?.meta?.totalScheduleItems === 'number');
  assert('Tiene meta.confirmedAttendees', typeof d?.meta?.confirmedAttendees === 'number');
  assert('Tiene meta.isAdminView = true', d?.meta?.isAdminView === true);

  // Weather: sin API key → null o campo sin error
  const weather = d?.weather;
  if (weather === null) {
    ok('Weather = null (sin WEATHER_API_KEY configurado — comportamiento correcto)');
    passed++;
  } else if (weather?.available === false) {
    assert('Weather unavailable con reason', !!weather?.reason);
    info(`Weather reason: ${weather.reason}`);
  } else {
    assert('Weather disponible con conditionText', !!weather?.conditionText);
    info(`Clima: ${weather?.conditionText} — ${weather?.avgTempC}°C`);
  }

  // Schedule debe estar ordenado
  const times = d?.schedule?.map(i => new Date(i.startTime).getTime()) ?? [];
  const sorted = times.every((t, i) => i === 0 || t >= times[i-1]);
  assert('Schedule en daysheet ordenado por startTime', sorted);

  // Vehicles con pasajeros y pickups
  const veh = d?.vehicles?.[0];
  assert('Vehicle tiene passengers array', Array.isArray(veh?.passengers));
  assert('Vehicle tiene pickups array', Array.isArray(veh?.pickups));
  assert('Pickups ordenados en daysheet', (veh?.pickups?.every((p, i, arr) => i === 0 || p.order >= arr[i-1].order)) ?? true);

  // Finance visibble para OWNER
  assert('Finance visible (OWNER)', d?.finance !== null);
}

// =============================================================================
// SUITE 5 — WEATHER (endpoint separado)
// =============================================================================
async function suiteWeather(token, eventId) {
  title('SUITE 5 — GET /events/:id/weather');

  sep(); console.log(`${C.bold}  5.1 GET /events/:id/weather${C.reset}`);
  const r = await req('GET', `/events/${eventId}/weather`, { token });
  assert('Weather endpoint → HTTP 200', r.status === 200);
  // El resultado puede ser null (sin key), objeto available:false, o forecast real
  const w = r.data?.data;
  if (w === null) {
    ok('Weather = null (sin API key — comportamiento esperado)');
    passed++;
  } else if (typeof w === 'object') {
    assert('Tiene campo available', 'available' in w);
    info(`available: ${w.available}${w.reason ? ' — ' + w.reason : ''}`);
  }
}

// =============================================================================
// SUITE 6 — VALIDACIONES Y SEGURIDAD
// =============================================================================
async function suiteValidations(token, eventId) {
  title('SUITE 6 — Validaciones y Seguridad');

  // Sin token → 401
  sep(); console.log(`${C.bold}  6.1 Sin token → 401${C.reset}`);
  const r401 = await req('GET', `/events/${eventId}/daysheet`);
  assert('Daysheet sin token → 401', r401.status === 401);
  const r401b = await req('GET', `/events/${eventId}/schedule`);
  assert('Schedule sin token → 401', r401b.status === 401);
  const r401c = await req('GET', `/events/${eventId}/finance`);
  assert('Finance sin token → 401', r401c.status === 401);

  // Evento inexistente → 404
  sep(); console.log(`${C.bold}  6.2 Evento inexistente → 404${C.reset}`);
  const r404 = await req('GET', '/events/id-que-no-existe/daysheet', { token });
  assert('Daysheet de evento inexistente → 404', r404.status === 404);
  const r404s = await req('GET', '/events/id-que-no-existe/schedule', { token });
  assert('Schedule de evento inexistente → 404', r404s.status === 404);

  // Body inválido → 400
  sep(); console.log(`${C.bold}  6.3 Body inválido → 400${C.reset}`);
  const r400 = await req('POST', `/events/${eventId}/schedule`, {
    token,
    body: { title: 'Sin type ni startTime' },  // faltan type y startTime
  });
  assert('Schedule sin type/startTime → 400', r400.status === 400);

  const r400v = await req('POST', `/events/${eventId}/vehicles`, {
    token,
    body: {},  // falta name
  });
  assert('Vehículo sin name → 400', r400v.status === 400);

  // Ítem inexistente → 404
  sep(); console.log(`${C.bold}  6.4 Ítem inexistente → 404${C.reset}`);
  const r404i = await req('PATCH', `/events/${eventId}/schedule/item-fake-000`, {
    token,
    body: { title: 'Ghost' },
  });
  assert('Schedule item inexistente → 404', r404i.status === 404);

  const r404v = await req('PATCH', `/events/${eventId}/vehicles/vehicle-fake-000`, {
    token,
    body: { name: 'Ghost' },
  });
  assert('Vehicle inexistente → 404', r404v.status === 404);
}

// =============================================================================
// RUNNER PRINCIPAL
// =============================================================================
async function runAll() {
  console.log(`\n${C.bold}${C.yellow}`);
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  TEST SPRINT 3 — DaySheet & Logística Operativa       ║');
  console.log('║  Cronograma · Vehículos · Finanzas · Clima · Master   ║');
  console.log(`║  ${BASE.padEnd(52)} ║`);
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log(C.reset);

  const health = await fetch(`${BASE}/health`).catch(() => null);
  if (!health?.ok) { fail(`API no responde — ¿servidor corriendo?`); process.exit(1); }
  ok('API respondiendo en /health');

  let token;
  try {
    title('SETUP — Token Keycloak');
    token = await getToken();
    ok(`Token obtenido (${token.length} chars)`);
  } catch (e) { fail(`Token: ${e.message}`); process.exit(1); }

  const { userId, eventId } = await setup(token);

  await suiteSchedule(token, eventId);
  await suiteVehicles(token, eventId, userId);
  await suiteFinance(token, eventId);
  await suiteMasterDaysheet(token, eventId);
  await suiteWeather(token, eventId);
  await suiteValidations(token, eventId);

  // Resumen
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

runAll().catch(e => { fail(`Error: ${e.message}`); console.error(e); process.exit(1); });
