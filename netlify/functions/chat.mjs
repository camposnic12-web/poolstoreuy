// POST /api/chat — Asesor de compra y alquiler de Pool Store (OpenAI Responses API).
//
// Variables de entorno (Netlify → Project configuration → Environment variables, scope Functions):
//   OPENAI_API_KEY            (secreta, obligatoria)  — sin ella el chat responde 503 y la web ofrece WhatsApp.
//   OPENAI_MODEL              (opcional) modelo de texto; por defecto gpt-6-luna (económico, salidas estructuradas).
//   OPENAI_REASONING_EFFORT   (opcional) none | low | …; por defecto "none" (respuestas cortas y baratas). Vacío = no se envía.
//
// Límites de consumo: mensaje ≤ 500 caracteres, historial ≤ 8 mensajes, ≤ 400 tokens de salida, 20 pedidos/min por IP
// (regla de Netlify) + un límite por instancia de 8 pedidos/min por IP como segunda barrera.
import {
  ESQUEMA, MAX_HISTORIAL, MAX_MENSAJE, armarRespuesta, evaluarEspacio, infoDesdeHome,
  instrucciones, medidasAmbiente, waUrl,
} from './lib/asesor.mjs';

export const config = {
  path: '/api/chat',
  // Plan Personal de Netlify: hasta 2 reglas de rate limit por proyecto (la otra es para create-preference en pagos).
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

const MODELO = () => process.env.OPENAI_MODEL || 'gpt-6-luna';
const ESFUERZO = () => (process.env.OPENAI_REASONING_EFFORT ?? 'none').trim();
const OPENAI_URL = () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '') + '/responses';
const TIEMPO_OPENAI = 8500; // ms: por debajo del límite de 10 s de las funciones de Netlify
const MAX_BODY = 12000;     // bytes

const WA_GENERAL = 'Hola, vengo del asesor de la web de Pool Store.';
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});
const sinServicio = (status, motivo, pregunta) => json(status, {
  error: motivo,
  respuesta: 'Ahora no puedo responderte por acá. Escribinos por WhatsApp y te ayudamos.',
  whatsapp: { etiqueta: 'Escribir por WhatsApp', url: waUrl(pregunta ? `Hola, quería consultar: ${pregunta}` : WA_GENERAL) },
});

// Límite por instancia (la regla de Netlify es la principal)
const visitas = new Map();
function excedido(ip) {
  const ahora = Date.now();
  const lista = (visitas.get(ip) || []).filter((t) => ahora - t < 60_000);
  lista.push(ahora);
  visitas.set(ip, lista);
  if (visitas.size > 5000) visitas.clear();
  return lista.length > 8;
}

// FAQ y alquiler: se leen de la home publicada (misma fuente que ve el visitante) y se guardan 10 minutos.
let cacheInfo = { t: 0, info: null };
async function infoSitio(origen) {
  if (cacheInfo.info && Date.now() - cacheInfo.t < 600_000) return cacheInfo.info;
  let info = { faq: [], alquiler: null };
  try {
    const r = await fetch(origen + '/', { signal: AbortSignal.timeout(2500) });
    if (r.ok) info = infoDesdeHome(await r.text());
  } catch { /* sin FAQ: el asesor usa solo el catálogo */ }
  cacheInfo = { t: Date.now(), info };
  return info;
}

function limpiarHistorial(h) {
  if (!Array.isArray(h)) return [];
  return h
    .filter((m) => m && (m.rol === 'user' || m.rol === 'assistant') && typeof m.texto === 'string' && m.texto.trim())
    .slice(-MAX_HISTORIAL)
    .map((m) => ({ role: m.rol, content: m.texto.trim().slice(0, m.rol === 'user' ? MAX_MENSAJE : 900) }));
}

function textoSalida(r) {
  if (typeof r.output_text === 'string') return r.output_text;
  for (const item of r.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) {
      if (c.type === 'refusal') throw new Error('refusal');
      if (c.type === 'output_text') return c.text;
    }
  }
  return '';
}

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'metodo' }, { Allow: 'POST' });

  let body;
  try {
    const crudo = await req.text();
    if (crudo.length > MAX_BODY) return json(413, { error: 'muy_largo' });
    body = JSON.parse(crudo);
  } catch {
    return json(400, { error: 'json' });
  }
  const mensaje = typeof body?.mensaje === 'string' ? body.mensaje.trim() : '';
  if (!mensaje) return json(400, { error: 'vacio' });
  if (mensaje.length > MAX_MENSAJE) return json(413, { error: 'muy_largo', max: MAX_MENSAJE });

  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'local';
  if (excedido(ip)) return json(429, { error: 'demasiados', respuesta: 'Vamos más despacio 🙂 Probá de nuevo en un minuto o escribinos por WhatsApp.', whatsapp: { etiqueta: 'Escribir por WhatsApp', url: waUrl(WA_GENERAL) } });

  const clave = process.env.OPENAI_API_KEY;
  if (!clave) {
    console.error('chat: falta OPENAI_API_KEY');
    return sinServicio(503, 'sin_credenciales', mensaje);
  }

  const historial = limpiarHistorial(body.historial);
  const origen = new URL(req.url).origin;
  const info = await infoSitio(origen);

  // ¿Dio medidas del ambiente? (en este mensaje o en los 2 anteriores) → cálculo determinístico para el modelo
  const textosUsuario = [...historial.filter((m) => m.role === 'user').map((m) => m.content), mensaje].slice(-3);
  let amb = null;
  for (let i = textosUsuario.length - 1; i >= 0 && !amb; i--) amb = medidasAmbiente(textosUsuario[i]);
  const input = [...historial];
  if (amb) input.push({ role: 'developer', content: `CÁLCULO DE ESPACIO (hecho por la web con las medidas de las fichas):\n${evaluarEspacio(amb)}` });
  input.push({ role: 'user', content: mensaje });

  const pedido = {
    model: MODELO(),
    instructions: instrucciones(info),
    input,
    max_output_tokens: 400,
    store: false,
    text: { format: { type: 'json_schema', name: 'respuesta_asesor', strict: true, schema: ESQUEMA } },
  };
  if (ESFUERZO()) pedido.reasoning = { effort: ESFUERZO() };

  try {
    const r = await fetch(OPENAI_URL(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido),
      signal: AbortSignal.timeout(TIEMPO_OPENAI),
    });
    if (!r.ok) {
      console.error('chat: OpenAI', r.status, (await r.text()).slice(0, 300));
      return sinServicio(502, 'openai', mensaje);
    }
    const datos = await r.json();
    if (datos.status && datos.status !== 'completed') throw new Error('estado ' + datos.status);
    const salida = JSON.parse(textoSalida(datos));
    return json(200, armarRespuesta(salida, info));
  } catch (e) {
    console.error('chat: error', e?.name, e?.message);
    return sinServicio(502, e?.name === 'TimeoutError' ? 'timeout' : 'openai', mensaje);
  }
};
