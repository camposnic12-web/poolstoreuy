// Envío de emails con Resend.
// Paso 3: versión en texto simple para probar el circuito completo.
// Paso 4: se reemplaza el contenido por plantillas HTML con los colores de la web.
import { Resend } from 'resend';
import { env, pesos, fechaUY } from './util.mjs';

const WA_TIENDA = '59897197654';

function cliente() {
  return new Resend(env('RESEND_API_KEY'));
}

async function enviar(payload, idempotencyKey) {
  const { data, error } = await cliente().emails.send(payload, { idempotencyKey });
  if (error) {
    const e = new Error(`Resend: ${error.message || error.name || 'error desconocido'}`);
    e.detalle = error;
    throw e;
  }
  return data?.id;
}

function waLink(telefono) {
  let n = String(telefono || '').replace(/\D/g, '');
  if (n.startsWith('598')) return `https://wa.me/${n}`;
  if (n.startsWith('0')) n = n.slice(1);
  return n ? `https://wa.me/598${n}` : '';
}

function lineasItems(p) {
  return p.items.map((i) => `• ${i.cantidad} × ${i.nombre} — ${pesos(i.subtotal)}`).join('\n');
}

function bloqueEntrega(p) {
  if (p.entrega === 'retiro') return 'Retiro en el local';
  return [
    'Envío a domicilio',
    `Dirección: ${p.direccion}`,
    `Ciudad/localidad: ${p.ciudad}`,
    `Departamento: ${p.departamento}`,
  ].join('\n');
}

/** Email al dueño con todos los datos para coordinar el envío. */
export async function enviarEmailDueno(p) {
  const aviso = p.montoOk ? '' : '⚠️ REVISAR MONTO — ';
  const subject = `${aviso}🎱 Nueva venta #${p.pedido} — ${pesos(p.monto)}`;
  const text = [
    p.montoOk ? '' : `⚠️ REVISAR MONTO: Mercado Pago cobró ${pesos(p.monto)} ${p.moneda}, el pedido esperaba ${pesos(p.totalEsperado)} ${p.monedaEsperada}.\n`,
    `Pedido: #${p.pedido}`,
    `Pago Mercado Pago: ${p.paymentId} (${p.medioPago})`,
    `Fecha: ${fechaUY(p.fecha)} (hora de Uruguay)`,
    '',
    'PRODUCTOS',
    lineasItems(p),
    `TOTAL: ${pesos(p.monto)} ${p.moneda}`,
    '',
    'CLIENTE',
    `Nombre: ${p.nombre}`,
    `Email: ${p.email}`,
    `Teléfono: ${p.telefono}  ${waLink(p.telefono)}`,
    `Cédula: ${p.cedula || '—'}`,
    '',
    'ENTREGA',
    bloqueEntrega(p),
    '',
    `Comentarios: ${p.comentarios || '—'}`,
  ].join('\n');

  return enviar(
    {
      from: env('FROM_EMAIL'),
      to: env('ADMIN_EMAIL').split(',').map((s) => s.trim()).filter(Boolean),
      replyTo: p.email || undefined,
      subject,
      text,
    },
    `admin-${p.paymentId}`,
  );
}

/** Email de confirmación al comprador. */
export async function enviarEmailComprador(p) {
  const text = [
    `¡Hola ${p.nombre.split(' ')[0]}!`,
    '',
    `Gracias por tu compra en Pool Store. Recibimos tu pago del pedido #${p.pedido}.`,
    '',
    lineasItems(p),
    `Total: ${pesos(p.monto)}`,
    '',
    p.entrega === 'retiro'
      ? 'Elegiste retiro en el local. Te vamos a contactar para coordinar el día y horario.'
      : 'Te vamos a contactar para coordinar la entrega y el armado.',
    '',
    `¿Dudas? Escribinos por WhatsApp al 097 197 654: https://wa.me/${WA_TIENDA}`,
    '',
    'Pool Store UY — https://poolstore.uy',
  ].join('\n');

  return enviar(
    {
      from: env('FROM_EMAIL'),
      to: [p.email],
      subject: `¡Gracias por tu compra! Pedido #${p.pedido} — Pool Store`,
      text,
    },
    `comprador-${p.paymentId}`,
  );
}
