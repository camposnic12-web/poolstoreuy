// POST /api/create-preference
// Recibe { items: [{id, cantidad}], comprador: {...} }, valida todo contra
// products.json, calcula el total y crea la preferencia de Checkout Pro.
import { randomInt } from 'node:crypto';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { MONEDA, validarItems, validarComprador } from './lib/catalogo.mjs';
import { log, json, env, faltantes, urlBase } from './lib/util.mjs';

const FN = 'create-preference';
const MAX_BODY = 10_000; // bytes

export const config = {
  path: '/api/create-preference',
  // Plan Personal de Netlify: hasta 2 reglas de rate limit por proyecto. Usamos 1 acá.
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};

/** Número de pedido legible: PS-260930-K7Q2 (fecha de Uruguay + 4 caracteres). */
function nuevoPedido() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Montevideo', year: '2-digit', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const f = (t) => partes.find((p) => p.type === t).value;
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I/L
  let sufijo = '';
  for (let i = 0; i < 4; i++) sufijo += alfabeto[randomInt(alfabeto.length)];
  return `PS-${f('year')}${f('month')}${f('day')}-${sufijo}`;
}

function separarNombre(nombreCompleto) {
  const partes = nombreCompleto.split(' ');
  return { name: partes[0], surname: partes.slice(1).join(' ') };
}

export default async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Método no permitido.' });
  }

  const falta = faltantes(['MP_ACCESS_TOKEN', 'SITE_URL']);
  if (falta.length) {
    log(FN, 'error', 'config_incompleta', { faltan: falta });
    return json(500, { error: 'Los pagos online no están disponibles en este momento.' });
  }

  // --- Leer y validar el body ---
  let body;
  try {
    const texto = await req.text();
    if (texto.length > MAX_BODY) return json(413, { error: 'Pedido demasiado grande.' });
    body = JSON.parse(texto);
  } catch {
    return json(400, { error: 'Pedido inválido.' });
  }

  const carrito = validarItems(body?.items);
  if (carrito.error) {
    log(FN, 'warn', 'carrito_invalido', { motivo: carrito.error });
    return json(400, { error: carrito.error });
  }

  const { comprador, errores } = validarComprador(body?.comprador);
  if (Object.keys(errores).length) {
    log(FN, 'warn', 'comprador_invalido', { campos: Object.keys(errores) });
    return json(400, { error: 'Revisá los datos marcados en el formulario.', fields: errores });
  }

  // --- Armar la preferencia ---
  const pedido = nuevoPedido();
  const base = urlBase(req);
  const { name, surname } = separarNombre(comprador.nombre);
  const telefono = comprador.telefono.replace(/\D/g, '');

  const preferencia = {
    items: carrito.lineas.map((l) => ({
      id: l.id,
      title: l.nombre,
      quantity: l.cantidad,
      unit_price: l.precio_unitario,
      currency_id: MONEDA,
      picture_url: `${base}/${l.imagen}`,
    })),
    payer: {
      name,
      surname,
      email: comprador.email,
      phone: { number: telefono },
      ...(comprador.cedula && {
        identification: { type: 'CI', number: comprador.cedula.replace(/\D/g, '') },
      }),
      ...(comprador.entrega === 'envio' && {
        address: { street_name: comprador.direccion },
      }),
    },
    back_urls: {
      success: `${base}/pago/exito.html`,
      pending: `${base}/pago/pendiente.html`,
      failure: `${base}/pago/error.html`,
    },
    auto_return: 'approved',
    // source_news=webhooks: solo notificaciones de tipo Webhook (firmadas), no IPN.
    notification_url: `${base}/api/webhook?source_news=webhooks`,
    external_reference: pedido,
    statement_descriptor: 'POOLSTORE',
    // Mercado Pago copia la metadata al pago: así el webhook tiene todo sin base de datos.
    // Claves en snake_case (MP convierte camelCase a snake_case).
    metadata: {
      pedido,
      total: carrito.total,
      moneda: MONEDA,
      creado_en: new Date().toISOString(),
      items: carrito.lineas.map((l) => ({
        id: l.id,
        nombre: l.nombre,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        subtotal: l.subtotal,
      })),
      comprador_nombre: comprador.nombre,
      comprador_email: comprador.email,
      comprador_telefono: comprador.telefono,
      comprador_cedula: comprador.cedula,
      entrega: comprador.entrega,
      departamento: comprador.departamento,
      ciudad: comprador.ciudad,
      direccion: comprador.direccion,
      comentarios: comprador.comentarios,
    },
  };

  try {
    const client = new MercadoPagoConfig({ accessToken: env('MP_ACCESS_TOKEN'), options: { timeout: 8000 } });
    const res = await new Preference(client).create({
      body: preferencia,
      requestOptions: { idempotencyKey: pedido },
    });

    if (!res?.init_point) {
      log(FN, 'error', 'mp_sin_init_point', { pedido, respuesta_id: res?.id });
      return json(502, { error: 'No pudimos iniciar el pago.' });
    }

    log(FN, 'info', 'preferencia_creada', {
      pedido,
      preference_id: res.id,
      total: carrito.total,
      items: carrito.lineas.length,
      entrega: comprador.entrega,
      base,
    });
    return json(200, { init_point: res.init_point, pedido });
  } catch (e) {
    // El SDK lanza el JSON de error de MP (message, error, status, cause).
    log(FN, 'error', 'mp_error_creando_preferencia', {
      pedido,
      status: e?.status,
      mensaje: e?.message,
      causa: e?.cause,
    });
    return json(502, { error: 'No pudimos conectar con Mercado Pago.' });
  }
};
