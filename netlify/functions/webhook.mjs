// POST /api/webhook
// Notificaciones de Mercado Pago (Webhooks). Flujo:
//   1. Validar x-signature con MP_WEBHOOK_SECRET.
//   2. Ignorar todo lo que no sea type=payment.
//   3. Consultar el pago a la API de MP (no confiar en el body).
//   4. Solo si status === 'approved': tomar el pago en Blobs (idempotencia),
//      verificar monto/moneda contra la metadata y mandar los emails.
// Errores transitorios (MP, Resend, Blobs caídos) → 500 para que MP reintente.
import { createHmac } from 'node:crypto';
import { MercadoPagoConfig, Payment, WebhookSignatureValidator } from 'mercadopago';
import { MONEDA } from './lib/catalogo.mjs';
import { tomarPago, actualizarPago } from './lib/idempotencia.mjs';
import { enviarEmailDueno, enviarEmailComprador } from './lib/emails.mjs';
import { log, json, env, faltantes } from './lib/util.mjs';

const FN = 'webhook';

export const config = { path: '/api/webhook' };

// --- 1. Firma ---------------------------------------------------------------

/**
 * Valida x-signature con el validador oficial del SDK.
 * Manifest: "id:<data.id en minúsculas>;request-id:<x-request-id>;ts:<ts>;"
 * (los pares sin valor se omiten). HMAC-SHA256 en hex.
 * @returns {null | object} null si es válida; si no, detalle para el log.
 */
function verificarFirma(req, url, body) {
  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id');
  const dataIdQuery = url.searchParams.get('data.id');
  // La doc de MP pide data.id en minúsculas (el SDK de Node no lo hace; los de pagos son numéricos).
  const dataId = dataIdQuery ? dataIdQuery.toLowerCase() : dataIdQuery;
  const secret = env('MP_WEBHOOK_SECRET');

  try {
    // Sin toleranceSeconds: el SDK asume `ts` en segundos y MP lo manda en ms.
    // Un reenvío viejo no es peligroso: siempre consultamos el pago y hay idempotencia.
    WebhookSignatureValidator.validate({ xSignature, xRequestId, dataId, secret });
    return null;
  } catch (e) {
    // Detalle para diagnosticar (sin exponer el secreto).
    const ts = /ts=([^,]+)/.exec(xSignature || '')?.[1]?.trim();
    const manifest = [
      dataId ? `id:${dataId}` : null,
      xRequestId ? `request-id:${xRequestId}` : null,
      ts ? `ts:${ts}` : null,
    ].filter(Boolean).join(';') + ';';
    return {
      motivo: e?.reason || e?.message,
      x_signature: xSignature,
      x_request_id: xRequestId,
      data_id_query: dataIdQuery,
      data_id_body: body?.data?.id ?? null,
      type: url.searchParams.get('type') || body?.type || null,
      action: body?.action ?? null,
      live_mode: body?.live_mode ?? null,
      query: url.search,
      manifest,
      // Primeros 8 caracteres del HMAC calculado: alcanza para comparar con v1 sin filtrar nada útil.
      hmac_calculado_prefijo: secret && ts
        ? createHmac('sha256', secret).update(manifest).digest('hex').slice(0, 8)
        : null,
      secreto_cargado: Boolean(secret),
      user_agent: req.headers.get('user-agent'),
      ip: req.headers.get('x-nf-client-connection-ip'),
    };
  }
}

// --- 3/4. Datos del pedido a partir del pago ----------------------------------

function datosPedido(pago) {
  const m = pago.metadata || {};
  const items = Array.isArray(m.items) && m.items.length
    ? m.items.map((i) => ({
      nombre: String(i.nombre ?? i.id ?? 'Producto'),
      cantidad: Number(i.cantidad),
      subtotal: Number(i.subtotal),
    }))
    // Respaldo: los items de la preferencia que MP guarda en el pago.
    : (pago.additional_info?.items || []).map((i) => ({
      nombre: String(i.title),
      cantidad: Number(i.quantity),
      subtotal: Number(i.unit_price) * Number(i.quantity),
    }));

  const monto = Number(pago.transaction_amount);
  const totalEsperado = Number(m.total);
  const montoOk =
    pago.currency_id === MONEDA &&
    m.moneda === MONEDA &&
    Number.isFinite(totalEsperado) &&
    Math.abs(monto - totalEsperado) < 0.005;

  return {
    pedido: m.pedido || pago.external_reference || '(sin número)',
    paymentId: String(pago.id),
    medioPago: [pago.payment_method_id, pago.installments > 1 ? `${pago.installments} cuotas` : '']
      .filter(Boolean).join(', '),
    fecha: pago.date_approved || pago.date_created || new Date().toISOString(),
    monto,
    moneda: pago.currency_id,
    totalEsperado,
    monedaEsperada: m.moneda,
    montoOk,
    items,
    nombre: m.comprador_nombre || [pago.payer?.first_name, pago.payer?.last_name].filter(Boolean).join(' ') || '(sin nombre)',
    email: m.comprador_email || pago.payer?.email || '',
    telefono: m.comprador_telefono || '',
    cedula: m.comprador_cedula || '',
    entrega: m.entrega || '',
    departamento: m.departamento || '',
    ciudad: m.ciudad || '',
    direccion: m.direccion || '',
    comentarios: m.comentarios || '',
    metadataCompleta: Boolean(m.pedido && m.comprador_email && m.entrega && Array.isArray(m.items)),
  };
}

// --- Handler ----------------------------------------------------------------

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' });

  const url = new URL(req.url);
  let body = {};
  try {
    const texto = await req.text();
    body = texto ? JSON.parse(texto) : {};
  } catch {
    body = {};
  }

  const falta = faltantes(['MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'RESEND_API_KEY', 'ADMIN_EMAIL', 'FROM_EMAIL']);
  if (falta.length) {
    log(FN, 'error', 'config_incompleta', { faltan: falta });
    return json(500, { error: 'config' }); // MP reintenta más tarde
  }

  // 1. Firma
  const fallo = verificarFirma(req, url, body);
  if (fallo) {
    const modo = env('MP_WEBHOOK_SIGNATURE_MODE') === 'log' ? 'log' : 'enforce';
    log(FN, 'warn', 'firma_invalida', { modo, ...fallo });
    if (modo === 'enforce') return json(401, { error: 'firma inválida' });
    // modo 'log' (solo para diagnóstico): sigue igual: el pago se verifica contra la API.
  }

  // 2. Tipo
  const tipo = url.searchParams.get('type') || body?.type || url.searchParams.get('topic');
  const paymentId = String(url.searchParams.get('data.id') || body?.data?.id || '');
  if (tipo !== 'payment') {
    log(FN, 'info', 'ignorado_tipo', { tipo, action: body?.action });
    return json(200, { ok: true, ignorado: 'tipo' });
  }
  if (!/^\d+$/.test(paymentId)) {
    log(FN, 'warn', 'ignorado_id_invalido', { paymentId });
    return json(200, { ok: true, ignorado: 'id' });
  }

  // 3. Consultar el pago a MP
  let pago;
  try {
    const client = new MercadoPagoConfig({ accessToken: env('MP_ACCESS_TOKEN'), options: { timeout: 8000 } });
    pago = await new Payment(client).get({ id: paymentId });
  } catch (e) {
    const status = e?.status ?? e?.cause?.status;
    if (status === 404) {
      // Ej.: notificación de prueba del panel de MP (id inventado).
      log(FN, 'warn', 'pago_no_encontrado', { paymentId });
      return json(200, { ok: true, ignorado: 'no_encontrado' });
    }
    log(FN, 'error', 'mp_error_consultando_pago', { paymentId, status, mensaje: e?.message });
    return json(500, { error: 'mp' });
  }

  const ref = pago.external_reference || '';
  const esNuestro = ref.startsWith('PS-') || Boolean(pago.metadata?.pedido);
  if (!esNuestro) {
    log(FN, 'info', 'ignorado_no_es_de_la_web', { paymentId, external_reference: ref });
    return json(200, { ok: true, ignorado: 'externo' });
  }

  if (pago.status !== 'approved') {
    // pending (Abitab/RedPagos), in_process, rejected, etc. MP vuelve a avisar si cambia.
    log(FN, 'info', 'pago_no_aprobado', { paymentId, pedido: ref, status: pago.status, detalle: pago.status_detail });
    return json(200, { ok: true, status: pago.status });
  }

  const info = datosPedido(pago);
  log(FN, 'info', 'pago_aprobado', {
    paymentId,
    pedido: info.pedido,
    monto: info.monto,
    moneda: info.moneda,
    total_esperado: info.totalEsperado,
    monto_ok: info.montoOk,
    metadata_completa: info.metadataCompleta,
    metadata_claves: Object.keys(pago.metadata || {}),
  });
  if (!info.montoOk) {
    log(FN, 'error', 'monto_no_coincide', {
      paymentId, pedido: info.pedido,
      cobrado: info.monto, moneda: info.moneda,
      esperado: info.totalEsperado, moneda_esperada: info.monedaEsperada,
    });
  }

  // 4. Idempotencia
  let lock;
  try {
    lock = await tomarPago(paymentId, info.pedido);
  } catch (e) {
    log(FN, 'error', 'blobs_error', { paymentId, mensaje: e?.message });
    return json(500, { error: 'blobs' });
  }
  if (lock.resultado === 'completo') {
    log(FN, 'info', 'duplicado_ya_enviado', { paymentId, pedido: info.pedido });
    return json(200, { ok: true, duplicado: true });
  }
  if (lock.resultado === 'ocupado') {
    // Otra invocación lo está procesando (<3 min). Si falla, su 500 hace que MP reintente.
    log(FN, 'info', 'duplicado_en_proceso', { paymentId, pedido: info.pedido, hace_ms: lock.hace_ms });
    return json(200, { ok: true, en_proceso: true });
  }
  if (lock.retomado) {
    log(FN, 'warn', 'reprocesando', { paymentId, pedido: info.pedido, registro: lock.registro });
  }

  const reg = lock.registro;
  let etag = lock.etag;
  const guardar = async () => {
    const r = await actualizarPago(paymentId, reg, etag);
    if (r.ok) etag = r.etag;
    else log(FN, 'warn', 'bloqueo_perdido', { paymentId, registro: reg });
  };

  try {
    if (!reg.admin) {
      const id = await enviarEmailDueno(info);
      reg.admin = true;
      await guardar();
      log(FN, 'info', 'email_dueno_enviado', { paymentId, pedido: info.pedido, resend_id: id, revisar_monto: !info.montoOk });
    }

    if (!reg.comprador) {
      if (!info.montoOk) {
        // Si el monto no coincide, el dueño revisa antes de confirmarle al cliente.
        reg.comprador = 'omitido_revisar_monto';
        log(FN, 'warn', 'email_comprador_omitido', { paymentId, motivo: 'monto' });
      } else if (!info.email) {
        reg.comprador = 'omitido_sin_email';
        log(FN, 'warn', 'email_comprador_omitido', { paymentId, motivo: 'sin_email' });
      } else {
        const id = await enviarEmailComprador(info);
        reg.comprador = true;
        log(FN, 'info', 'email_comprador_enviado', { paymentId, pedido: info.pedido, resend_id: id });
      }
      await guardar();
    }

    reg.estado = 'completo';
    reg.completado = Date.now();
    delete reg.error;
    await guardar();
    return json(200, { ok: true });
  } catch (e) {
    log(FN, 'error', 'error_enviando_emails', {
      paymentId, pedido: info.pedido, mensaje: e?.message, detalle: e?.detalle, registro: reg,
    });
    // Liberar el bloqueo para que el reintento de MP lo tome enseguida.
    reg.estado = 'error';
    reg.error = String(e?.message || e).slice(0, 300);
    try { await guardar(); } catch (e2) { log(FN, 'error', 'blobs_error_liberando', { paymentId, mensaje: e2?.message }); }
    return json(500, { error: 'email' });
  }
};
