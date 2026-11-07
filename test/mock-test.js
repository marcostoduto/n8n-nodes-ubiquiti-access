// Test dei nodi contro un finto server UniFi Access (nessuna dipendenza esterna).
// Emula ciò che fa n8n: header Bearer da "authenticate", errori HTTP con il corpo
// della risposta, loadOptions e metodi del webhook trigger.
const http = require('http');
const assert = require('assert');
const { createHmac } = require('crypto');
const { UnifiAccessApi } = require('../dist/credentials/UnifiAccessApi.credentials.js');
const { UnifiAccess } = require('../dist/nodes/UnifiAccess/UnifiAccess.node.js');
const { UnifiAccessTrigger, verifySignature } = require('../dist/nodes/UnifiAccess/UnifiAccessTrigger.node.js');

// ------------------------------------------------------------------ finto UniFi Access
const TOKEN = 'tok-123';
const P = '/api/v1/developer';
const users = Array.from({ length: 250 }, (_, n) => ({ id: `u${n}`, first_name: `Nome${n}`, last_name: 'Test', status: 'ACTIVE' }));
const doors = [
  { id: 'd1', name: 'Ingresso', full_name: 'Sede - Ingresso', door_lock_relay_status: 'lock' },
  { id: 'd2', name: 'Magazzino', full_name: 'Sede - Magazzino', door_lock_relay_status: 'lock' },
];
const calls = [];
let nfcPolls = 0;
let webhooks = [];

const ok = (data, extra = {}) => ({ code: 'SUCCESS', msg: 'success', data, ...extra });

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ method: req.method, path: p, qs: Object.fromEntries(url.searchParams), body });

    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      return send(res, 401, { code: 'CODE_ACCESS_TOKEN_INVALID', msg: 'Invalid access token.' });
    }
    if (!p.startsWith(P)) return send(res, 404, { code: 'CODE_NOT_EXISTS', msg: 'not found' });
    const r = `${req.method} ${p.slice(P.length)}`;

    // porte
    if (r === 'GET /doors') return send(res, 200, ok(doors));
    if (r === 'GET /doors/bad') return send(res, 404, { code: 'CODE_RESOURCE_NOT_FOUND', msg: 'Resource not found.' });
    if (/^PUT \/doors\/d\d\/unlock$/.test(r)) return send(res, 200, ok(null));
    if (/^PUT \/doors\/d\d\/lock_rule$/.test(r)) return send(res, 200, ok({}));
    if (r === 'PUT /doors/settings/emergency') return send(res, 200, ok(null));
    if (r === 'GET /doors/locked') return send(res, 200, { code: 'CODE_OPERATION_FORBIDDEN', msg: 'Operation forbidden.' });

    // utenti (paginati)
    if (r === 'GET /users') {
      const num = Number(url.searchParams.get('page_num'));
      const size = Number(url.searchParams.get('page_size'));
      const page = users.slice((num - 1) * size, num * size);
      return send(res, 200, ok(page, { pagination: { page_num: num, page_size: size, total: users.length } }));
    }
    if (r === 'POST /users') return send(res, 200, ok({ id: 'new-user', ...body }));
    if (r === 'PUT /users/u1/access_policies') return send(res, 200, ok(null));
    if (r === 'PUT /users/u1/pin_codes') return send(res, 200, ok(null));
    if (r === 'POST /user_groups/g1/users') return send(res, 200, ok(null));

    // visitatori
    if (r === 'POST /visitors') return send(res, 200, ok({ id: 'v1', ...body }));
    if (r === 'DELETE /visitors/v1') return send(res, 200, ok(null));

    // dispositivi (array annidati per hub)
    if (r === 'GET /devices') return send(res, 200, ok([[{ id: 'r1', name: 'UA-G2', type: 'UA-G2-PRO' }], [{ id: 'h1', name: 'Hub', type: 'UAH' }]]));

    // credenziali
    if (r === 'POST /credentials/pin_codes') return send(res, 200, ok('82571933'));
    if (r === 'POST /credentials/nfc_cards/sessions') return send(res, 200, ok({ session_id: 's1' }));
    if (r === 'GET /credentials/nfc_cards/sessions/s1') {
      nfcPolls++;
      if (nfcPolls < 2) return send(res, 200, { code: 'CODE_CREDS_NFC_READ_POLL_TOKEN_EMPTY', msg: 'Token is empty.' });
      return send(res, 200, ok({ card_id: '014A34B6', token: 'nfc-token-1' }));
    }

    // log (data.hits + data.total)
    if (r === 'POST /system/logs') {
      const num = Number(url.searchParams.get('page_num'));
      const size = Number(url.searchParams.get('page_size'));
      const all = Array.from({ length: 130 }, (_, n) => ({ '@timestamp': `2026-11-0${1 + (n % 7)}T10:00:00Z`, _id: `l${n}`, _source: { actor: { display_name: 'Mario' }, event: { type: 'access.door.unlock' } }, tag: 'access' }));
      return send(res, 200, ok({ hits: all.slice((num - 1) * size, num * size), page: num, total: all.length }));
    }

    // webhook
    if (r === 'GET /webhooks/endpoints') return send(res, 200, ok(webhooks));
    if (r === 'POST /webhooks/endpoints') {
      const w = { id: `w${webhooks.length + 1}`, secret: 'whsec', ...body };
      webhooks.push(w);
      return send(res, 200, ok(w));
    }
    const del = /^DELETE \/webhooks\/endpoints\/(.+)$/.exec(r);
    if (del) { webhooks = webhooks.filter((w) => w.id !== del[1]); return send(res, 200, ok(null)); }

    send(res, 404, { code: 'CODE_NOT_EXISTS', msg: `no route ${r}` });
  });
});

// ------------------------------------------------------------------ finto runtime n8n
async function httpRequest(o) {
  const u = new URL(o.url.startsWith('http') ? o.url : (o.baseURL || '') + o.url);
  for (const [k, v] of Object.entries(o.qs || {})) u.searchParams.set(k, String(v));
  const headers = { ...(o.headers || {}) };
  let body = o.body;
  if (body !== undefined && typeof body === 'object') { body = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const r = await fetch(u, { method: o.method || 'GET', headers, body });
  const text = await r.text();
  const data = text && (r.headers.get('content-type') || '').includes('json') ? JSON.parse(text) : text;
  if (!r.ok) {
    // come NodeApiError: messaggio generico, corpo originale in cause.response
    const e = new Error(`Request failed with status code ${r.status}`);
    e.httpCode = String(r.status);
    e.cause = { response: { status: r.status, data } };
    throw e;
  }
  return data;
}

function makeContext(creds, params, items = [{ json: {} }], extra = {}) {
  const cred = new UnifiAccessApi();
  const staticData = extra.staticData || {};
  return {
    getInputData: () => items,
    getNodeParameter: (name, i, fallback) => {
      if (typeof i !== 'number') fallback = i; // firma dei webhook/hook: (name, fallback)
      return name in params ? params[name] : fallback;
    },
    getCredentials: async () => creds,
    continueOnFail: () => params.__continueOnFail === true,
    getWorkflowStaticData: () => staticData,
    getNodeWebhookUrl: () => 'https://n8n.example.com/webhook/abc/webhook',
    getWorkflow: () => ({ id: 'wf1', name: 'Porte' }),
    helpers: {
      async httpRequestWithAuthentication(_name, o) {
        assert.strictEqual(o.skipSslCertificateValidation, creds.allowUnauthorizedCerts !== false);
        const auth = cred.authenticate.properties.headers.Authorization.slice(1).replace('{{$credentials.apiToken}}', creds.apiToken);
        return httpRequest({ ...o, headers: { ...(o.headers || {}), Authorization: auth } });
      },
      returnJsonArray: (a) => a.map((json) => ({ json })),
    },
    ...extra,
  };
}

const node = new UnifiAccess();
const run = (ctx) => node.execute.call(ctx).then((r) => r[0].map((x) => x.json));
const last = (method, path) => [...calls].reverse().find((c) => c.method === method && c.path === P + path);

// ------------------------------------------------------------------ test
(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/`; // slash finale voluto
  const creds = { serverUrl: base, apiToken: TOKEN, allowUnauthorizedCerts: true };

  // 1. porte: elenco, apertura remota, regola temporanea, emergenza
  let out = await run(makeContext(creds, { resource: 'door', operation: 'getAll' }));
  assert.strictEqual(out.length, 2);
  out = await run(makeContext(creds, { resource: 'door', operation: 'unlock', doorId: 'd1', unlockOptions: { actor_id: 'n8n', actor_name: 'Automazione', extra: '{"motivo":"consegna"}' } }));
  assert.deepStrictEqual(out[0], { success: true, door_id: 'd1', action: 'unlock' });
  assert.deepStrictEqual(last('PUT', '/doors/d1/unlock').body, { actor_id: 'n8n', actor_name: 'Automazione', extra: { motivo: 'consegna' } });
  await run(makeContext(creds, { resource: 'door', operation: 'unlock', doorId: 'd2', unlockOptions: {} }));
  assert.deepStrictEqual(last('PUT', '/doors/d2/unlock').body, {});
  await run(makeContext(creds, { resource: 'door', operation: 'setLockRule', doorId: 'd1', lockRuleType: 'custom', interval: 15 }));
  assert.deepStrictEqual(last('PUT', '/doors/d1/lock_rule').body, { type: 'custom', interval: 15 });
  await run(makeContext(creds, { resource: 'door', operation: 'setEmergency', lockdown: true, evacuation: false }));
  assert.deepStrictEqual(last('PUT', '/doors/settings/emergency').body, { lockdown: true, evacuation: false });
  console.log('OK  porte: elenco, unlock, lock rule, emergenza');

  // 2. errori: HTTP 404 con envelope, 200 con code d'errore, token errato, continueOnFail
  await assert.rejects(run(makeContext(creds, { resource: 'door', operation: 'get', doorId: 'bad' })), /Resource not found\. \(CODE_RESOURCE_NOT_FOUND, HTTP 404\)/);
  await assert.rejects(run(makeContext(creds, { resource: 'door', operation: 'get', doorId: 'locked' })), /CODE_OPERATION_FORBIDDEN/);
  await assert.rejects(run(makeContext({ ...creds, apiToken: 'x' }, { resource: 'door', operation: 'getAll' })), /CODE_ACCESS_TOKEN_INVALID/);
  out = await run(makeContext(creds, { __continueOnFail: true, resource: 'door', operation: 'get', doorId: 'bad' }));
  assert.strictEqual(out[0].code, 'CODE_RESOURCE_NOT_FOUND');
  console.log('OK  errori UniFi Access (HTTP e code) + continueOnFail');

  // 3. utenti: paginazione, limit, expand, creazione con data, policy, PIN
  out = await run(makeContext(creds, { resource: 'user', operation: 'getAll', returnAll: true, includeAccessPolicies: true }));
  assert.strictEqual(out.length, 250);
  assert.strictEqual(last('GET', '/users').qs['expand[]'], 'access_policy');
  out = await run(makeContext(creds, { resource: 'user', operation: 'getAll', returnAll: false, limit: 120 }));
  assert.strictEqual(out.length, 120);
  out = await run(makeContext(creds, { resource: 'user', operation: 'create', firstName: 'Mario', lastName: 'Rossi', additionalFields: { user_email: 'm@r.it', onboard_time: '2026-11-01T00:00:00Z' } }));
  assert.deepStrictEqual(last('POST', '/users').body, { first_name: 'Mario', last_name: 'Rossi', user_email: 'm@r.it', onboard_time: 1793491200 });
  assert.strictEqual(out[0].id, 'new-user');
  await run(makeContext(creds, { resource: 'user', operation: 'setAccessPolicies', userId: 'u1', accessPolicyIds: ['p1', 'p2'] }));
  assert.deepStrictEqual(last('PUT', '/users/u1/access_policies').body, { access_policy_ids: ['p1', 'p2'] });
  await run(makeContext(creds, { resource: 'user', operation: 'assignPin', userId: 'u1', pinCode: '1234' }));
  assert.deepStrictEqual(last('PUT', '/users/u1/pin_codes').body, { pin_code: '1234' });
  await run(makeContext(creds, { resource: 'userGroup', operation: 'addUsers', userGroupId: 'g1', userIds: 'u1, u2' }));
  assert.deepStrictEqual(last('POST', '/user_groups/g1/users').body, ['u1', 'u2']);
  console.log('OK  utenti: paginazione, create, policy, PIN, gruppi');

  // 4. visitatori
  out = await run(makeContext(creds, {
    resource: 'visitor', operation: 'create', firstName: 'Anna', lastName: 'Bianchi', visitReason: 'Business',
    startTime: '2026-11-10T09:00:00Z', endTime: 1794333600000,
    additionalFields: { resources: '[{"id":"d1","type":"door"}]', visitor_company: 'ACME' },
  }));
  assert.deepStrictEqual(last('POST', '/visitors').body, {
    first_name: 'Anna', last_name: 'Bianchi', visit_reason: 'Business', start_time: 1794301200, end_time: 1794333600,
    resources: [{ id: 'd1', type: 'door' }], visitor_company: 'ACME',
  });
  await assert.rejects(run(makeContext(creds, { resource: 'visitor', operation: 'create', firstName: 'A', lastName: 'B', visitReason: 'Others', startTime: 200, endTime: 100, additionalFields: {} })), /End Time/);
  await run(makeContext(creds, { resource: 'visitor', operation: 'delete', visitorId: 'v1', isForce: true }));
  assert.strictEqual(last('DELETE', '/visitors/v1').qs.is_force, 'true');
  console.log('OK  visitatori: create (date -> unix), validazione, delete');

  // 5. dispositivi annidati, PIN generato, registrazione tessera con attesa
  out = await run(makeContext(creds, { resource: 'device', operation: 'getAll' }));
  assert.deepStrictEqual(out.map((d) => d.id), ['r1', 'h1']);
  out = await run(makeContext(creds, { resource: 'credential', operation: 'generatePin' }));
  assert.deepStrictEqual(out[0], { pin_code: '82571933' });
  out = await run(makeContext(creds, { resource: 'credential', operation: 'startNfcEnrollment', deviceId: 'r1', resetUaCard: false, waitForCard: true, waitTimeout: 10 }));
  assert.deepStrictEqual(out[0], { session_id: 's1', card_id: '014A34B6', token: 'nfc-token-1' });
  assert.deepStrictEqual(last('POST', '/credentials/nfc_cards/sessions').body, { device_id: 'r1', reset_ua_card: false });
  console.log('OK  dispositivi, PIN, registrazione NFC con attesa');

  // 6. log di sistema (POST paginato con hits/total) + simplify
  out = await run(makeContext(creds, { resource: 'systemLog', operation: 'getAll', topic: 'door_openings', logFilters: { since: '2026-11-01T00:00:00Z' }, returnAll: true, simplify: true }));
  assert.strictEqual(out.length, 130);
  assert.deepStrictEqual(Object.keys(out[0]), ['id', 'timestamp', 'actor', 'event', 'tag']);
  assert.deepStrictEqual(last('POST', '/system/logs').body, { topic: 'door_openings', since: 1793491200 });
  console.log('OK  system log paginati');

  // 7. loadOptions e custom request
  const opts = await node.methods.loadOptions.getDoors.call(makeContext(creds, {}));
  assert.deepStrictEqual(opts, [{ name: 'Sede - Ingresso', value: 'd1' }, { name: 'Sede - Magazzino', value: 'd2' }]);
  out = await run(makeContext(creds, { resource: 'custom', method: 'GET', endpoint: 'doors', queryParameters: '{}', splitData: true }));
  assert.strictEqual(out.length, 2);
  console.log('OK  loadOptions + custom request');

  // 8. trigger: registrazione, riuso, ricreazione se cambiano gli eventi, firma, filtro
  const trig = new UnifiAccessTrigger();
  const hooks = trig.webhookMethods.default;
  const staticData = {};
  let params = { events: ['access.door.unlock'], options: { verifySignature: true } };
  let ctx = makeContext(creds, params, undefined, { staticData });
  assert.strictEqual(await hooks.checkExists.call(ctx), false);
  await hooks.create.call(ctx);
  assert.deepStrictEqual(staticData, { webhookId: 'w1', webhookSecret: 'whsec' });
  assert.deepStrictEqual(last('POST', '/webhooks/endpoints').body, { name: 'n8n - Porte', endpoint: 'https://n8n.example.com/webhook/abc/webhook', events: ['access.door.unlock'] });
  assert.strictEqual(await hooks.checkExists.call(ctx), true);
  params.events = ['access.door.unlock', 'access.doorbell.incoming'];
  assert.strictEqual(await hooks.checkExists.call(ctx), false);
  assert.strictEqual(webhooks.length, 0);

  const payload = JSON.stringify({ event: 'access.door.unlock', data: { location: { name: 'Ingresso' } } });
  const t = '1762765200';
  const sig = `t=${t},v1=${createHmac('sha256', 'whsec').update(`${t}.${payload}`).digest('hex')}`;
  assert.ok(verifySignature(sig, payload, 'whsec'));
  assert.ok(!verifySignature(sig, payload + ' ', 'whsec'));

  let status;
  const whCtx = (header, body) => makeContext(creds, params, undefined, {
    staticData,
    getRequestObject: () => ({ rawBody: Buffer.from(body), body: JSON.parse(body) }),
    getBodyData: () => JSON.parse(body),
    getHeaderData: () => ({ signature: header }),
    getResponseObject: () => ({ status: (c) => ({ send: () => { status = c; } }) }),
  });
  staticData.webhookSecret = 'whsec';
  let r = await trig.webhook.call(whCtx(sig, payload));
  assert.strictEqual(r.workflowData[0][0].json.event, 'access.door.unlock');
  r = await trig.webhook.call(whCtx('t=1,v1=00', payload));
  assert.deepStrictEqual([r.noWebhookResponse, status], [true, 401]);
  const other = JSON.stringify({ event: 'access.visitor.status.changed' });
  r = await trig.webhook.call(whCtx(`t=${t},v1=${createHmac('sha256', 'whsec').update(`${t}.${other}`).digest('hex')}`, other));
  assert.deepStrictEqual(r, {});
  await hooks.create.call(ctx);
  assert.strictEqual(await hooks.delete.call(ctx), true);
  assert.deepStrictEqual([webhooks.length, staticData], [0, {}]);
  console.log('OK  trigger: create/check/delete, firma, filtro eventi');

  server.close();
  console.log('\nTutti i test superati');
})().catch((e) => { console.error('FALLITO:', e); server.close(); process.exit(1); });
