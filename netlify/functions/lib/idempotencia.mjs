// Idempotencia del webhook con Netlify Blobs.
//
// Un registro por pago (clave: id de pago de Mercado Pago):
//   { estado: 'procesando' | 'error' | 'completo', desde, admin, comprador, pedido }
//
// - 'procesando' es un bloqueo con vencimiento: si pasaron más de LOCK_MS desde
//   `desde`, se considera libre (la invocación anterior se cayó) y se reprocesa.
// - 'error' libera el bloqueo al instante para que el reintento de MP lo tome.
// - `admin` / `comprador` registran qué email ya salió, para no repetirlo.
// Todas las escrituras son condicionales (onlyIfNew / onlyIfMatch con ETag),
// así dos notificaciones simultáneas no pueden tomar el mismo pago.
import { getStore } from '@netlify/blobs';

export const LOCK_MS = 3 * 60 * 1000;
const STORE = 'pagos-notificados';

function store() {
  return getStore({ name: STORE, consistency: 'strong' });
}

const clave = (paymentId) => `pago-${paymentId}`;

/**
 * Intenta tomar el pago para procesarlo.
 * @returns {Promise<
 *   {resultado:'tomado', registro:object, etag:string, retomado:boolean} |
 *   {resultado:'completo', registro:object} |
 *   {resultado:'ocupado', registro:object, hace_ms:number}
 * >}
 */
export async function tomarPago(paymentId, pedido) {
  const s = store();
  const key = clave(paymentId);
  const nuevo = { estado: 'procesando', desde: Date.now(), admin: false, comprador: false, pedido };

  for (let intento = 0; intento < 3; intento++) {
    const creado = await s.setJSON(key, nuevo, { onlyIfNew: true });
    if (creado.modified) return { resultado: 'tomado', registro: nuevo, etag: creado.etag, retomado: false };

    const actual = await s.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    if (!actual) continue; // lo borraron entre medio: reintentar

    const reg = actual.data || {};
    if (reg.estado === 'completo') return { resultado: 'completo', registro: reg };

    const hace = Date.now() - Number(reg.desde || 0);
    if (reg.estado === 'procesando' && hace < LOCK_MS) {
      return { resultado: 'ocupado', registro: reg, hace_ms: hace };
    }

    // Libre: 'error' o 'procesando' vencido. Se retoma conservando qué emails ya salieron.
    const retomado = { ...reg, estado: 'procesando', desde: Date.now(), pedido: reg.pedido || pedido };
    const tomado = await s.setJSON(key, retomado, { onlyIfMatch: actual.etag });
    if (tomado.modified) return { resultado: 'tomado', registro: retomado, etag: tomado.etag, retomado: true };
    // Otra invocación lo tomó primero: volver a mirar.
  }
  const reg = (await s.get(key, { type: 'json', consistency: 'strong' })) || {};
  return { resultado: 'ocupado', registro: reg, hace_ms: 0 };
}

/**
 * Actualiza el registro manteniendo la "propiedad" del bloqueo (ETag).
 * @returns {Promise<{ok:boolean, etag?:string}>}
 */
export async function actualizarPago(paymentId, registro, etag) {
  const r = await store().setJSON(clave(paymentId), registro, { onlyIfMatch: etag });
  return { ok: r.modified, etag: r.etag };
}
