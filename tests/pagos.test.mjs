// Pruebas de las funciones de pago (create-preference y webhook).
// Uso: npm test   (VERBOSE=1 npm test para ver los logs de las funciones)
// Mercado Pago y Resend se simulan interceptando fetch; Netlify Blobs corre con
// el servidor local del paquete. No usa credenciales reales ni manda emails.
import { createHmac } from 'node:crypto';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BlobsServer } from '@netlify/blobs/server';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const BLOBS_DIR = mkdtempSync(join(tmpdir(), 'poolstore-blobs-'));
const server = new BlobsServer({ directory: BLOBS_DIR, token: 'tok', port: 0 });
const { port } = await server.start();
// Proxy que serializa las escrituras (como el servicio real, donde los PUT condicionales son atómicos;
// el BlobsServer local hace check-then-write con awaits en el medio).
const realFetchForProxy = globalThis.fetch;
let cola = Promise.resolve();
const proxy = http.createServer((req, res) => {
  const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
    const run = async () => {
      const r = await realFetchForProxy(`http://localhost:${port}${req.url}`, { method: req.method, headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => k !== 'host' && k !== 'content-length')), body: ['GET','HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const buf = Buffer.from(await r.arrayBuffer());
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(buf);
    };
    if (req.method === 'PUT') { cola = cola.then(run, run); } else run();
  });
});
await new Promise(r => proxy.listen(0, r));
const pport = proxy.address().port;
const ctx = { apiURL: `http://localhost:${pport}`, edgeURL: `http://localhost:${pport}`, uncachedEdgeURL: `http://localhost:${pport}`, siteID: 'site', token: 'tok' };
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(ctx)).toString('base64');
Object.assign(process.env, {
  MP_ACCESS_TOKEN: 'TEST-123', MP_WEBHOOK_SECRET: 'secreto-test', RESEND_API_KEY: 're_test',
  ADMIN_EMAIL: 'dueno@poolstore.uy', FROM_EMAIL: 'Pool Store <ventas@poolstore.uy>', SITE_URL: 'https://poolstore.uy',
});

// ---- mocks de MP y Resend ----
const realFetch = globalThis.fetch;
const mp = { prefs: [], prefHeaders: [], payments: {}, failPref: false };
const resend = { sent: [], failNext: null, delayMs: 0 };
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('https://api.mercadopago.com/checkout/preferences')) {
    if (mp.failPref) return new Response(JSON.stringify({ message: 'invalid token', status: 401 }), { status: 401 });
    const body = JSON.parse(init.body); mp.prefs.push(body); mp.prefHeaders.push(init.headers);
    return new Response(JSON.stringify({ id: 'pref-1', init_point: 'https://www.mercadopago.com.uy/checkout/v1/redirect?pref_id=pref-1' }), { status: 201 });
  }
  const m = url.match(/^https:\/\/api\.mercadopago\.com\/v1\/payments\/(\d+)/);
  if (m) {
    const p = mp.payments[m[1]];
    return p ? new Response(JSON.stringify(p), { status: 200 }) : new Response(JSON.stringify({ message: 'Payment not found', status: 404 }), { status: 404 });
  }
  if (url.startsWith('https://api.resend.com/emails')) {
    const body = JSON.parse(init.body);
    if (resend.delayMs) await new Promise(r => setTimeout(r, resend.delayMs));
    if (resend.failNext && resend.failNext(body)) { resend.failNext = null; return new Response(JSON.stringify({ name: 'application_error', message: 'Resend caído', statusCode: 500 }), { status: 500 }); }
    resend.sent.push({ to: body.to, subject: body.subject, text: body.text, idem: new Headers(init.headers).get('idempotency-key') });
    return new Response(JSON.stringify({ id: 'em_' + resend.sent.length }), { status: 200 });
  }
  return realFetch(input, init);
};

const logs = [];
for (const k of ['log', 'warn', 'error']) { const o = console[k]; console[k] = (...a) => { logs.push(a.join(' ')); if (process.env.VERBOSE) o(...a); }; }

const { default: crear } = await import(REPO + 'netlify/functions/create-preference.mjs');
const { default: webhook } = await import(REPO + 'netlify/functions/webhook.mjs');
const { getStore } = await import('@netlify/blobs');
const store = getStore({ name: 'pagos-notificados', consistency: 'strong' });

let ok = 0, bad = 0;
const check = (cond, msg) => { if (cond) { ok++; console.info('  ✓', msg); } else { bad++; console.info('  ✗', msg); } };
const post = (url, body, headers = {}) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

const comprador = { nombre: 'Juan Pérez', email: 'Juan@Test.com', telefono: '097 197 654', cedula: '1.234.567-2', entrega: 'envio', departamento: 'Canelones', ciudad: 'Pando', direccion: 'Av. Artigas 1234', comentarios: 'De tarde' };

console.info('\n== create-preference ==');
let r = await crear(new Request('https://poolstore.uy/api/create-preference'));
check(r.status === 405, 'GET → 405');
r = await crear(post('https://poolstore.uy/api/create-preference', '{malo'));
check(r.status === 400, 'JSON roto → 400');
r = await crear(post('https://poolstore.uy/api/create-preference', { items: [{ id: 'mesa-pool-con-tapa', cantidad: 1 }], comprador }));
check(r.status === 400 && (await r.json()).error.includes('ya no está disponible'), 'producto agotado → 400');
r = await crear(post('https://poolstore.uy/api/create-preference', { items: [{ id: 'mesa-pool-rojo', cantidad: 1 }], comprador }));
check(r.status === 400, 'producto próximamente → 400');
r = await crear(post('https://poolstore.uy/api/create-preference', { items: [{ id: 'no-existe', cantidad: 1 }], comprador }));
check(r.status === 400, 'producto inexistente → 400');
r = await crear(post('https://poolstore.uy/api/create-preference', { items: [{ id: 'futbolito', cantidad: 11 }], comprador }));
check(r.status === 400, 'cantidad > 10 → 400');
r = await crear(post('https://poolstore.uy/api/create-preference', { items: [{ id: 'futbolito', cantidad: 1.5 }], comprador }));
check(r.status === 400, 'cantidad decimal → 400');
r = await crear(post('https://poolstore.uy/api/create-preference', { items: [{ id: 'futbolito', cantidad: 1 }], comprador: { ...comprador, cedula: '1.234.567-1', departamento: 'Buenos Aires' } }));
let j = await r.json();
check(r.status === 400 && j.fields.cedula && j.fields.departamento, 'cédula y departamento inválidos → 400 con fields');
check(mp.prefs.length === 0, 'ninguna preferencia creada con datos inválidos');

r = await crear(post('https://poolstore.uy/api/create-preference', {
  items: [{ id: 'mesa-pool-verde', cantidad: 1, precio: 1 }, { id: 'taquera-pared', cantidad: 2, unit_price: 1 }, { id: 'taquera-pared', cantidad: 1 }],
  comprador: { ...comprador, total: 5 },
}));
j = await r.json();
const pref = mp.prefs.at(-1);
check(r.status === 200 && j.init_point && /^PS-\d{6}-[A-Z2-9]{4}$/.test(j.pedido), `200 con init_point y pedido (${j.pedido})`);
check(pref.items.find(i => i.id === 'mesa-pool-verde').unit_price === 22000, 'precio de la mesa sale de products.json (ignora precio:1)');
check(pref.items.find(i => i.id === 'taquera-pared').quantity === 3, 'ids repetidos se unifican (taquera x3)');
check(pref.metadata.total === 24100 && pref.metadata.moneda === 'UYU', 'total calculado en servidor: 24100 UYU');
check(pref.items.every(i => i.currency_id === 'UYU'), 'currency_id UYU en todos los items');
check(pref.external_reference === j.pedido && pref.metadata.pedido === j.pedido, 'external_reference = metadata.pedido = pedido');
check(pref.statement_descriptor === 'POOLSTORE' && pref.auto_return === 'approved', 'statement_descriptor y auto_return');
check(pref.notification_url === 'https://poolstore.uy/api/webhook?source_news=webhooks', 'notification_url');
check(pref.back_urls.success === 'https://poolstore.uy/pago/exito.html' && pref.back_urls.failure.endsWith('/pago/error.html'), 'back_urls');
check(Object.keys(pref.metadata).every(k => /^[a-z_]+$/.test(k)) && pref.metadata.items.every(i => Object.keys(i).every(k => /^[a-z_]+$/.test(k))), 'claves de metadata en snake_case');
check(pref.metadata.comprador_email === 'juan@test.com' && pref.metadata.direccion === 'Av. Artigas 1234' && pref.metadata.comentarios === 'De tarde', 'datos del comprador en metadata');
check(pref.payer.identification?.number === '12345672' && pref.payer.name === 'Juan' && pref.payer.surname === 'Pérez', 'payer con CI y nombre/apellido');
check(new Headers(mp.prefHeaders.at(-1)).get('x-idempotency-key') === j.pedido, 'X-Idempotency-Key = pedido');

await crear(post('https://deploy-preview-7--poolstoreuy.netlify.app/api/create-preference', { items: [{ id: 'futbolito', cantidad: 1 }], comprador: { ...comprador, entrega: 'retiro' } }));
check(mp.prefs.at(-1).notification_url.startsWith('https://deploy-preview-7--poolstoreuy.netlify.app/'), 'Deploy Preview usa su propia URL');
check(mp.prefs.at(-1).metadata.direccion === '' && !mp.prefs.at(-1).payer.address, 'retiro: sin dirección');
await crear(post('https://evil.example.com/api/create-preference', { items: [{ id: 'futbolito', cantidad: 1 }], comprador }));
check(mp.prefs.at(-1).notification_url.startsWith('https://poolstore.uy/'), 'host desconocido → SITE_URL');
await crear(post('http://localhost:8888/api/create-preference', { items: [{ id: 'futbolito', cantidad: 1 }], comprador }));
check(mp.prefs.at(-1).back_urls.success.startsWith('https://poolstore.uy/'), 'localhost → SITE_URL (túnel en local)');
mp.failPref = true;
r = await crear(post('https://poolstore.uy/api/create-preference', { items: [{ id: 'futbolito', cantidad: 1 }], comprador }));
check(r.status === 502 && logs.some(l => l.includes('mp_error_creando_preferencia')), 'error de MP → 502 + log');
mp.failPref = false;

// ---- webhook ----
console.info('\n== webhook ==');
const secret = process.env.MP_WEBHOOK_SECRET;
function firmado(id, { type = 'payment', secreto = secret, reqId = 'req-' + Math.random().toString(36).slice(2), sinFirma = false } = {}) {
  const ts = String(Date.now());
  const manifest = `id:${String(id).toLowerCase()};request-id:${reqId};ts:${ts};`;
  const v1 = createHmac('sha256', secreto).update(manifest).digest('hex');
  const headers = sinFirma ? {} : { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': reqId };
  return post(`https://poolstore.uy/api/webhook?source_news=webhooks&data.id=${id}&type=${type}`, { action: `${type}.updated`, type, data: { id: String(id) }, live_mode: false }, headers);
}
const meta = (pedido, total) => ({ pedido, total, moneda: 'UYU', creado_en: new Date().toISOString(), items: [{ id: 'mesa-pool-verde', nombre: 'Mesa Pool Profesional — Paño Verde', cantidad: 1, precio_unitario: total, subtotal: total }], comprador_nombre: 'Juan Pérez', comprador_email: 'juan@test.com', comprador_telefono: '097 197 654', comprador_cedula: '1.234.567-2', entrega: 'envio', departamento: 'Canelones', ciudad: 'Pando', direccion: 'Av. Artigas 1234', comentarios: 'De tarde' });
const pago = (id, status, total, extra = {}) => (mp.payments[id] = { id: Number(id), status, status_detail: status === 'approved' ? 'accredited' : 'pending_waiting_payment', transaction_amount: total, currency_id: 'UYU', external_reference: `PS-260930-T${id}`, payment_method_id: 'visa', installments: 1, date_approved: '2026-09-30T15:04:00.000-03:00', metadata: meta(`PS-260930-T${id}`, total), payer: { email: 'test_user_123@testuser.com' }, ...extra });

pago('1001', 'approved', 22000);
r = await webhook(firmado('1001', { sinFirma: true }));
check(r.status === 401, 'sin firma → 401');
r = await webhook(firmado('1001', { secreto: 'otro' }));
check(r.status === 401, 'firma con otro secreto → 401');
const rechazo = JSON.parse(logs.filter(l => l.includes('firma_invalida')).at(-1));
check(rechazo.motivo === 'SignatureMismatch' && rechazo.x_request_id && rechazo.manifest.startsWith('id:1001;request-id:') && rechazo.hmac_calculado_prefijo, 'rechazo logueado con detalle (motivo, request-id, manifest, prefijo HMAC)');
check(!JSON.stringify(rechazo).includes(secret), 'el log no contiene el secreto');
check(resend.sent.length === 0, 'sin emails tras firmas inválidas');

process.env.MP_WEBHOOK_SIGNATURE_MODE = 'log';
pago('1002', 'pending', 22000);
r = await webhook(firmado('1002', { sinFirma: true }));
check(r.status === 200 && logs.some(l => l.includes('"modo":"log"')), 'modo log: firma inválida se registra y sigue');
delete process.env.MP_WEBHOOK_SIGNATURE_MODE;

r = await webhook(firmado('555', { type: 'merchant_order' }));
check(r.status === 200 && (await r.json()).ignorado === 'tipo', 'merchant_order → 200 ignorado');
r = await webhook(firmado('123456'));
check(r.status === 200 && (await r.json()).ignorado === 'no_encontrado', 'pago inexistente (simulación del panel) → 200');
r = await webhook(firmado('1002'));
check(r.status === 200 && (await r.json()).status === 'pending' && resend.sent.length === 0, 'pending (Abitab) → 200 sin emails');
pago('1003', 'approved', 22000, { external_reference: 'OTRA-COSA', metadata: {} });
r = await webhook(firmado('1003'));
check(r.status === 200 && (await r.json()).ignorado === 'externo', 'pago que no es de la web → ignorado');

r = await webhook(firmado('1001'));
check(r.status === 200 && resend.sent.length === 2, 'approved → 200 y 2 emails');
const [adm, cli] = resend.sent;
check(adm.subject === '🎱 Nueva venta #PS-260930-T1001 — $22.000' && adm.to[0] === 'dueno@poolstore.uy', `asunto dueño: "${adm.subject}"`);
check(adm.text.includes('https://wa.me/59897197654') && adm.text.includes('Av. Artigas 1234') && adm.text.includes('Canelones'), 'email dueño con wa.me, dirección y departamento');
check(cli.to[0] === 'juan@test.com' && adm.idem === 'admin-1001' && cli.idem === 'comprador-1001', 'email comprador a metadata.comprador_email + idempotency keys en Resend');
check((await store.get('pago-1001', { type: 'json' })).estado === 'completo', 'Blobs: estado completo');
r = await webhook(firmado('1001'));
check(r.status === 200 && (await r.json()).duplicado && resend.sent.length === 2, 'segunda notificación → duplicado, sin emails nuevos');

resend.sent = []; resend.delayMs = 150;
pago('1004', 'approved', 7500);
const rs = await Promise.all([webhook(firmado('1004')), webhook(firmado('1004')), webhook(firmado('1004'))]);
check(rs.every(x => x.status === 200) && resend.sent.length === 2, `3 notificaciones simultáneas → exactamente 2 emails (${resend.sent.length})`);
resend.delayMs = 0;

resend.sent = [];
pago('1005', 'approved', 4500);
resend.failNext = (b) => b.to[0] === 'juan@test.com';
r = await webhook(firmado('1005'));
let reg = await store.get('pago-1005', { type: 'json' });
check(r.status === 500 && reg.estado === 'error' && reg.admin === true && reg.comprador === false, 'Resend falla en email comprador → 500, bloqueo liberado, admin marcado');
r = await webhook(firmado('1005'));
check(r.status === 200 && resend.sent.length === 2 && resend.sent[1].to[0] === 'juan@test.com', 'reintento de MP → manda SOLO el email del comprador');

resend.sent = [];
pago('1006', 'approved', 6500);
await store.setJSON('pago-1006', { estado: 'procesando', desde: Date.now() - 60_000, admin: false, comprador: false });
r = await webhook(firmado('1006'));
check(r.status === 200 && (await r.json()).en_proceso && resend.sent.length === 0, '"procesando" hace 1 min → ocupado, sin emails');
await store.setJSON('pago-1006', { estado: 'procesando', desde: Date.now() - 4 * 60_000, admin: true, comprador: false });
r = await webhook(firmado('1006'));
check(r.status === 200 && resend.sent.length === 1 && resend.sent[0].to[0] === 'juan@test.com' && logs.some(l => l.includes('reprocesando')), '"procesando" hace 4 min → se retoma (solo falta comprador)');

resend.sent = [];
pago('1007', 'approved', 100, { metadata: meta('PS-260930-T1007', 22000) });
r = await webhook(firmado('1007'));
check(r.status === 200 && resend.sent.length === 1 && resend.sent[0].subject.startsWith('⚠️ REVISAR MONTO — 🎱 Nueva venta #PS-260930-T1007'), `monto distinto → solo email dueño con "${resend.sent[0]?.subject}"`);
check(resend.sent[0].text.includes('Mercado Pago cobró $100 UYU, el pedido esperaba $22.000 UYU'), 'el email explica la diferencia de monto');
resend.sent = [];
pago('1008', 'approved', 22000, { currency_id: 'USD' });
r = await webhook(firmado('1008'));
check(resend.sent.length === 1 && resend.sent[0].subject.startsWith('⚠️ REVISAR MONTO'), 'moneda USD → ⚠️ REVISAR MONTO');

delete process.env.RESEND_API_KEY;
r = await webhook(firmado('1009'));
check(r.status === 500 && logs.some(l => l.includes('config_incompleta') && l.includes('RESEND_API_KEY')), 'falta variable → 500 + log claro');

console.info(`\n${ok} OK, ${bad} fallas`);
await server.stop(); proxy.close();
rmSync(BLOBS_DIR, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
