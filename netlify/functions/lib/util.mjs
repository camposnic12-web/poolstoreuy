// Utilidades compartidas por las funciones de pago.

/** Log en una línea JSON (se lee bien en Netlify → Logs → Functions). */
export function log(fn, nivel, evento, datos = {}) {
  const linea = JSON.stringify({ fn, nivel, evento, ...datos });
  if (nivel === 'error') console.error(linea);
  else if (nivel === 'warn') console.warn(linea);
  else console.log(linea);
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function env(nombre) {
  const v = process.env[nombre];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

/** Verifica que estén cargadas las variables; devuelve las que faltan. */
export function faltantes(nombres) {
  return nombres.filter((n) => !env(n));
}

const SITE_NAME = 'poolstoreuy'; // subdominio de Netlify (poolstoreuy.netlify.app)

function hostPermitido(host) {
  return (
    host === 'poolstore.uy' ||
    host === 'www.poolstore.uy' ||
    host === `${SITE_NAME}.netlify.app` ||
    host.endsWith(`--${SITE_NAME}.netlify.app`) // deploy previews y branch deploys
  );
}

/**
 * URL base para back_urls y notification_url.
 * - En poolstore.uy / previews de Netlify: el origen del request (así la
 *   Deploy Preview recibe su propio webhook).
 * - En cualquier otro caso (localhost, host desconocido): SITE_URL.
 */
export function urlBase(req) {
  try {
    const u = new URL(req.url);
    if (u.protocol === 'https:' && hostPermitido(u.hostname)) return u.origin;
  } catch {
    // sigue con SITE_URL
  }
  return env('SITE_URL').replace(/\/+$/, '');
}

/** Fecha/hora en horario de Uruguay. */
export function fechaUY(fecha = new Date()) {
  return new Intl.DateTimeFormat('es-UY', {
    timeZone: 'America/Montevideo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(fecha));
}

export function pesos(n) {
  return '$' + Number(n).toLocaleString('es-UY', { maximumFractionDigits: 2 });
}
