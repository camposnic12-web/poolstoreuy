// Pruebas del asesor (/api/chat) sin red ni clave real: se simula OpenAI y la home.
// Uso: node tests/chat.test.mjs        (Node 20+, sin dependencias)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/chat.mjs';
import { medidasAmbiente, medidasMesa, productoPorSlug, infoDesdeHome } from '../netlify/functions/lib/asesor.mjs';

const HOME = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const WA = 'https://wa.me/59897197654?text=';
let ultimoPedido = null;
let respuestaOpenAI = null; // función (pedido) => {status, body}

globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url === 'https://poolstore.test/') return new Response(HOME, { status: 200 });
  if (url.endsWith('/responses')) {
    ultimoPedido = JSON.parse(opts.body);
    const r = respuestaOpenAI(ultimoPedido);
    if (r.demora) await new Promise((res, rej) => opts.signal?.addEventListener('abort', () => rej(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))));
    return new Response(JSON.stringify(r.body), { status: r.status || 200 });
  }
  throw new Error('fetch inesperado ' + url);
};
const salida = (o) => ({ status: 200, body: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(o) }] }] } });
let ipN = 0;
async function chat(mensaje, historial = [], ip) {
  const req = new Request('https://poolstore.test/api/chat', { method: 'POST', body: JSON.stringify({ mensaje, historial }) });
  const r = await handler(req, { ip: ip || 'ip' + ipN++ });
  return { status: r.status, d: await r.json() };
}
const casos = [];
const caso = (n, f) => casos.push([n, f]);

caso('medidas del ambiente y de las mesas', () => {
  assert.deepEqual(medidasAmbiente('tengo 4 x 3,5'), { largo: 400, ancho: 350 });
  assert.deepEqual(medidasAmbiente('400x350 cm'), { largo: 400, ancho: 350 });
  assert.deepEqual(medidasAmbiente('4 metros de largo por 3 de ancho'), { largo: 400, ancho: 300 });
  assert.equal(medidasAmbiente('hola, quiero una mesa'), null);
  assert.deepEqual(medidasMesa(productoPorSlug('mesa-pool-pano-verde')), { largo: 215, ancho: 120 });
  assert.deepEqual(medidasMesa(productoPorSlug('mesa-pool-plegable-ping-pong')), { largo: 182, ancho: 99 });
  assert.equal(medidasMesa(productoPorSlug('mesa-pool-pano-rojo')), null);
});

caso('FAQ y alquiler salen de la home', () => {
  const info = infoDesdeHome(HOME);
  assert.ok(info.faq.length >= 4);
  assert.match(info.alquiler.descripcion, /Alquilamos mesas de pool/);
  assert.deepEqual(info.alquiler.modalidades, ['Por día', 'Fin de semana', 'Eventos']);
});

caso('sin OPENAI_API_KEY → 503 con WhatsApp y la consulta', async () => {
  delete process.env.OPENAI_API_KEY;
  const { status, d } = await chat('¿Cuánto sale la mesa verde?');
  assert.equal(status, 503);
  assert.ok(d.whatsapp.url.startsWith(WA));
  assert.match(decodeURIComponent(d.whatsapp.url), /mesa verde/);
});

caso('compra: catálogo real, ficha enlazada, slugs inventados descartados', async () => {
  process.env.OPENAI_API_KEY = 'sk-test';
  respuestaOpenAI = () => salida({ respuesta: 'La Profesional paño verde sale $22.000.', productos: ['mesa-pool-pano-verde', 'mesa-inventada'], accion: 'whatsapp_compra', mensaje_whatsapp: 'Hola, quiero confirmar stock de la mesa paño verde.' });
  const { status, d } = await chat('Quiero comprar una mesa');
  assert.equal(status, 200);
  assert.deepEqual(d.productos.map((p) => p.url), ['/productos/mesa-pool-pano-verde/']);
  assert.equal(d.productos[0].precio, '$22.000');
  assert.equal(d.whatsapp.etiqueta, 'Confirmar por WhatsApp');
  assert.ok(d.whatsapp.url.startsWith(WA));
  const p = ultimoPedido;
  assert.equal(p.model, 'gpt-6-luna');
  assert.equal(p.store, false);
  assert.equal(p.max_output_tokens, 400);
  assert.deepEqual(p.reasoning, { effort: 'none' });
  assert.equal(p.text.format.type, 'json_schema');
  assert.equal(p.text.format.strict, true);
  for (const t of ['$22.000', '$23.000', '$20.000', '$27.000', '$26.000', '$7.500', '$28.500', '$2.500 el par', '$999', 'estado en la web: agotado', '182 × 99 × 79 cm', '214 x 122 cm', '¿Hacen envíos a todo Uruguay?', 'Alquilamos mesas de pool'])
    assert.ok(p.instructions.includes(t), 'falta en las instrucciones: ' + t);
});

caso('OPENAI_MODEL y OPENAI_REASONING_EFFORT configurables', async () => {
  process.env.OPENAI_MODEL = 'otro-modelo';
  process.env.OPENAI_REASONING_EFFORT = '';
  respuestaOpenAI = () => salida({ respuesta: 'ok', productos: [], accion: 'ninguna', mensaje_whatsapp: '' });
  await chat('hola');
  assert.equal(ultimoPedido.model, 'otro-modelo');
  assert.equal(ultimoPedido.reasoning, undefined);
  delete process.env.OPENAI_MODEL; delete process.env.OPENAI_REASONING_EFFORT;
});

caso('medidas: la web calcula el espacio y se lo pasa al modelo', async () => {
  respuestaOpenAI = () => salida({ respuesta: 'La mesa entra; el espacio para jugar lo confirmamos.', productos: ['mesa-pool-pano-azul'], accion: 'whatsapp_medidas', mensaje_whatsapp: 'Hola, tengo un ambiente de 4 x 3,5 m, ¿me entra la mesa paño azul para jugar cómodo?' });
  const { d } = await chat('tengo 4 x 3,5', [{ rol: 'user', texto: '¿Qué mesa me entra?' }, { rol: 'assistant', texto: 'Pasame el largo y el ancho libres.' }]);
  const calc = ultimoPedido.input.find((m) => m.role === 'developer');
  assert.match(calc.content, /4,00 m × 3,50 m/);
  assert.match(calc.content, /mesa-pool-pano-azul \(2,15 m × 1,20 m\): la mesa entra/);
  assert.match(calc.content, /taco: SIN DATO/);
  assert.equal(d.whatsapp.etiqueta, 'Confirmar medidas por WhatsApp');
  assert.match(decodeURIComponent(d.whatsapp.url), /4 x 3,5/);
});

caso('alquiler: botón "Consultar alquiler" con los datos', async () => {
  respuestaOpenAI = () => salida({ respuesta: 'Te lo confirma el equipo.', productos: [], accion: 'whatsapp_alquiler', mensaje_whatsapp: 'Hola, quiero alquilar una mesa de pool el sábado 13 de diciembre en Pocitos para un cumpleaños.' });
  const { d } = await chat('El 13/12 en Pocitos, mesa de pool');
  assert.equal(d.whatsapp.etiqueta, 'Consultar alquiler');
  assert.match(decodeURIComponent(d.whatsapp.url), /13 de diciembre en Pocitos/);
});

caso('agotado: "Avisame cuando vuelva" con el mensaje de la web', async () => {
  respuestaOpenAI = () => salida({ respuesta: 'La de tapa está agotada.', productos: ['mesa-pool-profesional-con-tapa'], accion: 'avisame', mensaje_whatsapp: 'x' });
  const { d } = await chat('¿Tienen la mesa con tapa?');
  assert.equal(d.productos[0].estado, 'agotado');
  assert.ok(d.productos[0].avisame.startsWith(WA));
  assert.equal(d.whatsapp.etiqueta, 'Avisame cuando vuelva');
  assert.match(decodeURIComponent(d.whatsapp.url), /avisen cuando vuelva a haber stock de: Mesa de Pool Profesional con Tapa \(\$26\.000\)/);
});

caso('OpenAI caído → 502 con WhatsApp', async () => {
  respuestaOpenAI = () => ({ status: 500, body: { error: 'x' } });
  const { status, d } = await chat('¿Qué mesa me recomendás?');
  assert.equal(status, 502);
  assert.ok(d.whatsapp.url.startsWith(WA));
});

caso('límites: vacío, largo, historial y frecuencia', async () => {
  assert.equal((await chat('')).status, 400);
  assert.equal((await chat('a'.repeat(501))).status, 413);
  respuestaOpenAI = () => salida({ respuesta: 'ok', productos: [], accion: 'ninguna', mensaje_whatsapp: '' });
  const largo = Array.from({ length: 20 }, (_, i) => ({ rol: i % 2 ? 'assistant' : 'user', texto: 'm' + i }));
  await chat('hola', largo);
  assert.equal(ultimoPedido.input.length, 9); // 8 de historial + el mensaje
  let ultimo;
  for (let i = 0; i < 9; i++) ultimo = await chat('hola', [], 'misma-ip');
  assert.equal(ultimo.status, 429);
});

let fallas = 0;
for (const [n, f] of casos) {
  try { await f(); console.log('  ✓ ' + n); } catch (e) { fallas++; console.log('  ✗ ' + n + '\n    ' + e.message); }
}
console.log(fallas ? `\n${fallas} pruebas fallaron` : `\nTodas las pruebas del asesor pasaron (${casos.length})`);
process.exit(fallas ? 1 : 0);
