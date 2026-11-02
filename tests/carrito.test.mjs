// Prueba headless del carrito y el checkout (Chrome a 1440 y 390 px), con y sin el tema Halloween:
// agregar desde la home y desde una ficha, cantidades, aviso de envío (data/checkout.json),
// formulario del checkout y lo que se manda a /api/create-preference, agotado sin botón de compra.
//
// /api/create-preference se simula (el servidor local no tiene funciones): no se crea ningún pago.
// Uso (igual que tests/paginas-producto.test.mjs):
//   npm i --no-save puppeteer-core@23.11.1
//   node tests/serve.mjs "$PWD" 8787 &
//   node tests/carrito.test.mjs http://localhost:8787 . ~/Desktop/capturas-pagos
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const [BASE, REPO, CAPS] = process.argv.slice(2);
fs.mkdirSync(CAPS, { recursive: true });
const data = JSON.parse(fs.readFileSync(path.join(REPO, 'data/products.json'), 'utf8'));
const checkoutCfg = JSON.parse(fs.readFileSync(path.join(REPO, 'data/checkout.json'), 'utf8'));
const porId = Object.fromEntries(data.products.map(p => [p.id, p]));
const fallas = [];
const ok = m => console.log('  ✓ ' + m);
const mal = m => { fallas.push(m); console.log('  ✗ ' + m); };
const check = (c, m, det) => (c ? ok(m) : mal(m + (det ? ' — ' + JSON.stringify(det) : '')));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const VIEWPORTS = { 1440: { width: 1440, height: 900 }, 390: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };

// Contraste WCAG entre dos colores rgb()
function contraste(a, b) {
  const lum = c => {
    const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

async function nuevaPagina(vp, { halloween }) {
  const context = await browser.createBrowserContext(); // localStorage limpio
  const page = await context.newPage();
  await page.setViewport(VIEWPORTS[vp]);
  const errores = [];
  const pedidos = [];
  page.on('pageerror', e => errores.push('JS: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/googletagmanager|google-analytics|facebook|\/\.netlify\/scripts\//.test(m.location()?.url || '')) errores.push('consola: ' + m.text()); });
  page.on('response', r => { if (r.url().startsWith(BASE) && r.status() >= 400) errores.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (/googletagmanager|google-analytics|facebook/.test(r.url())) return r.abort();
    // Barra "Collaborate" de las Deploy Previews: en celular tapa el botón de pagar (en producción no existe)
    if (r.url().startsWith(BASE + '/.netlify/scripts/')) return r.abort();
    if (r.url() === BASE + '/api/create-preference') {
      pedidos.push(JSON.parse(r.postData()));
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ init_point: BASE + '/pago/exito.html?simulado=1', pedido: 'PS-261030-TEST' }) });
    }
    r.continue();
  });
  if (!halloween) await page.evaluateOnNewDocument(() => document.addEventListener('DOMContentLoaded', () => document.body.classList.remove('halloween'), { once: true }));
  return { page, errores, pedidos, cerrar: () => context.close() };
}

const esperarCarrito = page => page.waitForFunction(() => document.querySelector('#cartDrawer.show') && new DOMMatrix(getComputedStyle(document.querySelector('#cartDrawer')).transform).m41 === 0, { timeout: 5000 });
// Cerrado = sin .show y, al terminar la animación, visibility:hidden (false si no llega a ocultarse)
const cerrarCarrito = async page => {
  await page.click('#cartClose');
  return page.waitForFunction(() => !document.querySelector('#cartDrawer.show') && getComputedStyle(document.querySelector('#cartDrawer')).visibility === 'hidden', { timeout: 3000 }).then(() => true, () => false);
};
const badge = page => page.$eval('#cartCount', e => (e.hidden ? 0 : Number(e.textContent)));

for (const halloween of [true, false]) {
  for (const vp of Object.keys(VIEWPORTS)) {
    const tema = halloween ? 'halloween' : 'normal';
    console.log(`\n${vp} px · tema ${tema}`);
    const { page, errores, pedidos, cerrar } = await nuevaPagina(vp, { halloween });
    const cap = n => page.screenshot({ path: path.join(CAPS, `${vp}-${tema}-${n}.png`) });

    // ---- 1. Home: agregar la mesa verde desde la tarjeta ----
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
    check(await page.evaluate(() => document.body.classList.contains('halloween')) === halloween, `home con tema ${tema}`);
    const home = await page.evaluate(() => ({
      botones: [...document.querySelectorAll('.prod-card [data-add-to-cart]')].filter(b => !b.hidden && b.getClientRects().length).map(b => b.dataset.addToCart),
      agotado: [...document.querySelectorAll('.prod-card')].filter(c => c.querySelector('.stock-badge.agotado')).map(c => ({ cart: !!c.querySelector('[data-add-to-cart]'), wa: c.querySelector('.btn-wa-card').textContent.trim() })),
      popup: !!document.querySelector('#promoModal, .promo-modal-overlay'),
    }));
    const comprables = data.products.filter(p => p.estado === 'disponible' && p.precio > 0).map(p => p.id);
    check(home.botones.length === comprables.length && comprables.every(id => home.botones.includes(id)), `home: ${home.botones.length} botones "Agregar al carrito" visibles, uno por producto comprable`);
    check(home.agotado.length > 0 && home.agotado.every(a => !a.cart && a.wa === 'Avisame cuando vuelva'), 'home: el agotado no tiene botón de compra y queda "Avisame cuando vuelva"');
    check(!home.popup, 'home: sin popup');

    const verde = '.prod-card[data-product-id="mesa-pool-verde"] [data-add-to-cart]';
    await page.$eval(verde, b => b.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await new Promise(r => setTimeout(r, 300));
    await cap('1-home-tarjeta');
    await page.click(verde);
    await esperarCarrito(page);
    const c1 = await page.evaluate(() => ({
      items: [...document.querySelectorAll('.cart-item-name')].map(e => e.textContent),
      total: document.querySelector('.cart-total strong').textContent,
      aviso: document.querySelector('.cart-shipping-note')?.textContent || '',
    }));
    check(c1.items.length === 1 && c1.items[0] === porId['mesa-pool-verde'].nombre && c1.total === '$22.000', 'agregar desde la home abre el carrito con la mesa verde ($22.000)', c1);
    check(c1.aviso.includes(checkoutCfg.avisoEnvio), 'aviso de envío del carrito sale de data/checkout.json');
    check(await badge(page) === 1, 'contador del carrito = 1');

    // Legibilidad del drawer (con Halloween el body tiene texto claro)
    const col = await page.evaluate(() => {
      const d = getComputedStyle(document.querySelector('#cartDrawer')).backgroundColor;
      return ['.cart-item-name', '.cart-item-unit', '.cart-total span', '.qty span'].map(s => [s, getComputedStyle(document.querySelector(s)).color, d]);
    });
    const bajos = col.filter(([, c, d]) => contraste(c, d) < 4.5).map(([s, c]) => `${s} ${c}`);
    check(bajos.length === 0, `texto del carrito legible (contraste ≥ 4,5:1)`, bajos);
    await cap('2-carrito');

    // Cantidades
    await page.click('.cart-item [data-action="inc"]');
    check(await page.$eval('.cart-total strong', e => e.textContent) === '$44.000' && await badge(page) === 2, '+1 → 2 unidades, $44.000');
    await page.click('.cart-item [data-action="dec"]');
    check(await page.$eval('.cart-total strong', e => e.textContent) === '$22.000', '−1 → $22.000');
    check(await cerrarCarrito(page), 'carrito cerrado: oculto (sin sombra en el borde ni foco con Tab)');

    // ---- 2. Ficha: "Comprar" junto a WhatsApp ----
    await page.goto(BASE + '/productos/taquera-de-pared/', { waitUntil: 'networkidle0' });
    const ficha = await page.evaluate(() => {
      const b = document.querySelector('.ficha-acciones .btn-comprar-grande');
      const w = document.querySelector('.ficha-acciones .btn-wa-grande');
      const rb = b.getBoundingClientRect(), rw = w.getBoundingClientRect();
      return { texto: b.textContent.trim(), alto: Math.round(rb.height), mismaFila: Math.abs(rb.top - rw.top) < 2, debajo: rw.top >= rb.bottom - 1, badge: document.querySelector('#cartCount').textContent, desborde: document.documentElement.scrollWidth > innerWidth };
    });
    check(ficha.texto === 'Comprar' && ficha.alto >= 48, `ficha: botón grande "Comprar" (${ficha.alto}px de alto)`);
    check(vp === '1440' ? ficha.mismaFila : ficha.debajo, vp === '1440' ? 'ficha 1440: "Comprar" y WhatsApp en la misma fila' : 'ficha 390: "Comprar" arriba, WhatsApp debajo');
    check(!ficha.desborde, 'ficha sin scroll horizontal');
    check(await badge(page) === 1, 'el carrito se conserva al pasar de la home a la ficha');
    await page.$eval('.btn-comprar-grande', b => b.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await new Promise(r => setTimeout(r, 300));
    await cap('3-ficha-comprar');
    await page.click('.btn-comprar-grande');
    await esperarCarrito(page);
    const c2 = await page.evaluate(() => [...document.querySelectorAll('.cart-item-name')].map(e => e.textContent));
    check(c2.length === 2 && c2[1] === porId['taquera-pared'].nombre && await page.$eval('.cart-total strong', e => e.textContent) === '$22.700', '"Comprar" en la ficha suma la taquera: 2 productos, $22.700', c2);
    await cap('4-carrito-dos-productos');

    // ---- 3. Checkout ----
    await page.click('[data-action="checkout"]');
    await page.waitForSelector('#coForm');
    const avisoCo = await page.$eval('.co-shipping-notice', e => e.textContent);
    check(avisoCo.includes(checkoutCfg.avisoEnvio), 'aviso de envío del checkout sale de data/checkout.json');
    await page.click('#coPay');
    const errs = await page.$$eval('.co-field.invalid', fs => fs.map(f => f.dataset.field));
    check(['nombre', 'email', 'telefono', 'departamento', 'ciudad', 'direccion'].every(f => errs.includes(f)) && pedidos.length === 0, 'enviar vacío marca los campos obligatorios y no llama al servidor', errs);
    await cap('5-checkout-errores');
    await page.type('#co_nombre', 'Juan Pérez');
    await page.type('#co_email', 'juan@test.com');
    await page.type('#co_telefono', '097 197 654');
    await page.type('#co_cedula', '1.234.567-2');
    await page.select('#co_departamento', 'Canelones');
    await page.type('#co_ciudad', 'Pando');
    await page.type('#co_direccion', 'Av. Artigas 1234');
    await page.type('#co_comentarios', 'De tarde');
    await page.$eval('#coForm', f => f.scrollTop = 0);
    await cap('6-checkout-completo');
    const coDesborde = await page.$eval('#cartDrawer', d => d.scrollWidth > d.clientWidth);
    check(!coDesborde, 'checkout sin scroll horizontal');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('#coPay')]);
    const env = pedidos[0];
    check(pedidos.length === 1 && JSON.stringify(env.items) === JSON.stringify([{ id: 'mesa-pool-verde', cantidad: 1 }, { id: 'taquera-pared', cantidad: 1 }]) && !('precio' in env.items[0]),
      'POST /api/create-preference con ids y cantidades (sin precios)', env?.items);
    check(env?.comprador.departamento === 'Canelones' && env?.comprador.entrega === 'envio' && env?.comprador.email === 'juan@test.com', 'comprador con entrega y departamento');
    check(page.url().includes('/pago/exito.html'), 'redirige al init_point de Mercado Pago (simulado)');

    // ---- 4. Ficha del agotado ----
    await page.goto(BASE + '/productos/mesa-pool-profesional-con-tapa/', { waitUntil: 'networkidle0' });
    const ag = await page.evaluate(() => ({ comprar: !!document.querySelector('.ficha-acciones [data-add-to-cart]'), wa: document.querySelector('.ficha-acciones .btn-wa-grande').textContent.trim(), ancho: document.querySelector('.btn-wa-grande').getBoundingClientRect().width, fila: document.querySelector('.ficha-acciones').getBoundingClientRect().width }));
    check(!ag.comprar && ag.wa === 'Avisame cuando vuelva' && Math.abs(ag.ancho - ag.fila) < 2, 'ficha agotada: sin "Comprar", "Avisame cuando vuelva" a todo el ancho', ag);
    await cap('7-ficha-agotada');

    check(errores.length === 0, 'sin errores de JS ni recursos', errores);
    await cerrar();
  }
}

// ---- 5. Si el catálogo no carga, no se ofrece comprar ----
console.log('\nCatálogo caído');
{
  const { page, cerrar } = await nuevaPagina('1440', { halloween: true });
  page.removeAllListeners('request');
  page.on('request', r => (r.url().endsWith('/data/products.json') ? r.respond({ status: 500, body: '' }) : /googletagmanager|google-analytics|facebook/.test(r.url()) ? r.abort() : r.continue()));
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  const r = await page.evaluate(() => ({ visibles: [...document.querySelectorAll('[data-add-to-cart]')].filter(b => b.getClientRects().length).length, toggle: document.querySelector('#cartToggle').getClientRects().length, wa: document.querySelectorAll('.btn-wa-card').length }));
  check(r.visibles === 0 && r.toggle === 0 && r.wa === data.products.length, 'sin catálogo: se ocultan los botones de compra y el carrito; WhatsApp sigue', r);
  await cerrar();
}

await browser.close();
console.log(fallas.length ? `\n${fallas.length} FALLAS` : '\nTODO OK');
process.exit(fallas.length ? 1 : 0);
