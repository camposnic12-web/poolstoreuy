// Pruebas headless de la home y las páginas de producto (Chrome a 1440 y 390 px):
// errores de JS, links internos, canonical, H1, sitemap, JSON-LD, zoom con mouse y touch, agotados y capturas.
//
// Uso (Chrome instalado en /Applications; puppeteer-core NO se agrega al repo):
//   npm i --no-save puppeteer-core@23.11.1
//   node tests/serve.mjs . 8787 &                       # o una Deploy Preview como URL base
//   node tests/paginas-producto.test.mjs http://localhost:8787 . ~/Desktop/capturas-productos
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const [BASE, REPO, CAPS] = process.argv.slice(2);
fs.mkdirSync(CAPS, { recursive: true });
const SITE = 'https://poolstore.uy';
const data = JSON.parse(fs.readFileSync(path.join(REPO, 'data/products.json'), 'utf8'));
const paginas = ['/', ...data.products.map(p => `/productos/${p.slug}/`)];
const fallas = [];
const ok = m => console.log('  ✓ ' + m);
const mal = m => { fallas.push(m); console.log('  ✗ ' + m); };

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const VIEWPORTS = { escritorio: { width: 1440, height: 900 }, celular: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };

async function abrir(url, vp) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORTS[vp]);
  const errores = [];
  page.on('pageerror', e => errores.push('JS: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/googletagmanager|google-analytics/.test(m.location()?.url || '')) errores.push('consola: ' + m.text()); });
  page.on('response', r => { if (r.url().startsWith(BASE) && r.status() >= 400) errores.push(`HTTP ${r.status()} ${r.url()}`); });
  page.on('requestfailed', r => { if (r.url().startsWith(BASE)) errores.push('falló ' + r.url()); });
  // Bloquea analytics y fuentes externas: no ensucian GA ni dependen de la red
  await page.setRequestInterception(true);
  page.on('request', r => (/googletagmanager|google-analytics/.test(r.url()) ? r.abort() : r.continue()));
  await page.goto(BASE + url, { waitUntil: 'networkidle0' });
  return { page, errores };
}

// ---------- 1. Errores de JS / recursos, canonical, H1, links ----------
console.log('\n1. Errores, canonical, H1 y links internos (1440 y 390)');
const links = new Set();
const jsonlds = {};
for (const vp of Object.keys(VIEWPORTS)) {
  for (const url of paginas) {
    const { page, errores } = await abrir(url, vp);
    const eager = await page.$$eval('img[loading=eager]', is => is.map(i => i.getAttribute('src')));
    await page.evaluate(async () => { for (const i of document.images) i.loading = 'eager'; window.scrollTo(0, document.body.scrollHeight); await new Promise(r => setTimeout(r, 300)); });
    await page.waitForNetworkIdle({ idleTime: 300 }).catch(() => {});
    const info = await page.evaluate(() => ({
      canonical: document.querySelector('link[rel=canonical]')?.href,
      h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()),
      title: document.title,
      desc: document.querySelector('meta[name=description]')?.content,
      hrefs: [...document.querySelectorAll('a[href], link[href], img[src], source[srcset], script[src]')].flatMap(e =>
        e.tagName === 'SOURCE' ? e.getAttribute('srcset').split(',').map(s => s.trim().split(' ')[0]) : [e.getAttribute('href') || e.getAttribute('src')]),
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent),
      contenido: (() => {
        const p = [];
        const visible = e => e.getClientRects().length > 0;
        // Texto real de los nodos visibles (no innerText: aplica text-transform y "todo" pasa a "TODO")
        const nodos = []; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('script,style,noscript') || !visible(n.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
        while (tw.nextNode()) nodos.push(tw.currentNode.nodeValue);
        const texto = nodos.join(' ') + ' ' + document.title + ' ' + (document.querySelector('meta[name=description]')?.content || '');
        for (const w of ['TODO', 'undefined', 'null', 'NaN', '{{']) if (new RegExp('(^|\\W)' + w.replace('{', '\\{') + '(\\W|$)').test(texto)) p.push('muestra "' + w + '"');
        document.querySelectorAll('.ficha-bloque').forEach(s => {
          const h = s.querySelector('h2')?.textContent.trim();
          const resto = [...s.children].filter(c => c.tagName !== 'H2').map(c => c.innerText.trim()).join('');
          if (!h || !resto) p.push('sección vacía: ' + (h || '(sin título)'));
        });
        document.querySelectorAll('.ficha-tabla th, .ficha-tabla td, .feat-list li, .migas li, .prod-name, .prod-desc, .prod-price, .btn-wa-card, .ficha-titulo, .ficha-resumen, .price-num, .ficha-cat, .ficha-estado, .btn-wa-grande')
          .forEach(e => { if (visible(e) && !e.innerText.trim()) p.push('elemento vacío: .' + e.className.split(' ')[0] + ' ' + e.tagName); });
        document.querySelectorAll('.galeria-pie').forEach(e => { if (visible(e) && !e.textContent.trim()) p.push('pie de foto vacío visible'); });
        document.querySelectorAll('.galeria-miniaturas').forEach(e => { if (e.children.length < 2) p.push('miniaturas con menos de 2 fotos'); });
        document.querySelectorAll('.productos-grid').forEach(g => { if (!g.querySelector('.prod-card')) p.push('grilla de productos vacía'); });
        if (document.querySelector('.galeria img[src*="mesa-instalada"], .galeria [data-jpg*="mesa-instalada"], .prod-card img[src*="mesa-instalada"]')) p.push('galería o tarjeta con foto de cliente (sin confirmar)');
        return p;
      })(),
      rotas: [...document.images].filter(i => i.complete && i.naturalWidth === 0 && !i.src.startsWith('data:')).map(i => i.src),
      scrollX: document.documentElement.scrollWidth > window.innerWidth,
      eager: [...document.querySelectorAll('img[loading=eager]')].map(i => i.getAttribute('src')),
    }));
    const esperado = SITE + url;
    if (info.canonical !== esperado) mal(`${vp} ${url}: canonical ${info.canonical} ≠ ${esperado}`);
    if (info.h1.length !== 1) mal(`${vp} ${url}: hay ${info.h1.length} H1`);
    if (info.rotas.length) mal(`${vp} ${url}: imágenes rotas ${info.rotas}`);
    if (info.scrollX) mal(`${vp} ${url}: scroll horizontal`);
    if (url !== '/' && (eager.length !== 1 || !(await page.$('.galeria-principal img[loading=eager][fetchpriority=high]')))) mal(`${vp} ${url}: fotos eager = ${eager.length} (esperado 1, la principal)`);
    const agrandada = await page.$eval('.galeria-principal img', i => { const r = i.getBoundingClientRect(); const k = Math.min(1, r.width / i.naturalWidth, r.height / i.naturalHeight); return { mostrada: Math.round(i.naturalWidth * k), real: +i.getAttribute('width'), natural: i.naturalWidth }; }).catch(() => null);
    if (agrandada && agrandada.mostrada > agrandada.real + 1) mal(`${vp} ${url}: foto principal mostrada a ${agrandada.mostrada}px, mide ${agrandada.real}px (se pixela)`);
    errores.forEach(e => mal(`${vp} ${url}: ${e}`));
    info.contenido.forEach(e => mal(`${vp} ${url}: ${e}`));
    for (const h of info.hrefs) if (h && !/^(https?:|data:|#|mailto:)/.test(h)) links.add(h);
    for (const h of info.hrefs) if (h?.startsWith(SITE)) links.add(h.slice(SITE.length));
    if (vp === 'escritorio') jsonlds[url] = info.ld;
    await page.close();
  }
  ok(`${vp}: ${paginas.length} páginas revisadas (sin TODO, undefined/null ni secciones o elementos vacíos, sin fotos de clientes en galerías)`);
}

// Links internos: rutas desde la raíz, barra final en /productos/, sin 404
const relativos = [...links].filter(h => !h.startsWith('/'));
relativos.length ? mal('links internos relativos (sin / inicial): ' + relativos.join(', ')) : ok('todos los links internos empiezan con /');
const sinBarra = [...links].filter(h => h.startsWith('/productos/') && !h.endsWith('/'));
sinBarra.length ? mal('links a productos sin barra final: ' + sinBarra) : ok('links a productos con barra final');
let rotos = 0;
for (const h of links) {
  const u = h.split('#')[0] || '/';
  const r = await fetch(BASE + u, { redirect: 'manual' });
  if (r.status !== 200) { rotos++; mal(`link ${h} → HTTP ${r.status}`); }
}
if (!rotos) ok(`${links.size} links/recursos internos responden 200`);
for (const f of ['/sitemap.xml', '/robots.txt']) { const r = await fetch(BASE + f); r.status === 200 ? ok(f + ' 200') : mal(f + ' ' + r.status); }
const sm = await (await fetch(BASE + '/sitemap.xml')).text();
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
JSON.stringify(locs) === JSON.stringify(paginas.map(u => SITE + u)) ? ok(`sitemap con ${locs.length} URLs (home + ${locs.length - 1} productos)`) : mal('sitemap no coincide con las páginas');
for (const l of locs) { const r = await fetch(BASE + l.slice(SITE.length)); if (r.status !== 200) mal('sitemap: ' + l + ' → ' + r.status); }

// ---------- 2. JSON-LD ----------
console.log('\n2. JSON-LD');
const AV = { disponible: 'https://schema.org/InStock', agotado: 'https://schema.org/OutOfStock', proximamente: 'https://schema.org/PreOrder' };
function validarProducto(o, p, donde) {
  const req = ['name', 'image', 'description', 'sku', 'brand', 'offers', 'url'];
  for (const k of req) if (!o[k]) mal(`${donde}: Product sin ${k}`);
  if (o.brand?.['@type'] !== 'Brand' || o.brand?.name !== 'Pool Store') mal(`${donde}: brand`);
  const of = o.offers || {};
  if (of['@type'] !== 'Offer') mal(`${donde}: offers.@type`);
  if (String(of.price) !== String(p.precio) || !/^\d+(\.\d+)?$/.test(of.price)) mal(`${donde}: price ${of.price}`);
  if (of.priceCurrency !== 'UYU') mal(`${donde}: priceCurrency`);
  if (of.availability !== AV[p.estado]) mal(`${donde}: availability ${of.availability} (estado ${p.estado})`);
  if (of.url !== `${SITE}/productos/${p.slug}/`) mal(`${donde}: offers.url`);
  for (const i of [].concat(o.image)) if (!i.startsWith(SITE + '/images/') || !fs.existsSync(path.join(REPO, i.slice(SITE.length)))) mal(`${donde}: imagen ${i}`);
}
for (const p of data.products) {
  const url = `/productos/${p.slug}/`;
  const ld = jsonlds[url].map(t => JSON.parse(t));      // JSON.parse falla si es inválido
  const prod = ld.find(o => o['@type'] === 'Product');
  const bc = ld.find(o => o['@type'] === 'BreadcrumbList');
  if (!prod || !bc) { mal(`${url}: falta Product o BreadcrumbList`); continue; }
  validarProducto(prod, p, url);
  const items = bc.itemListElement;
  if (items.length !== 3 || items.some((x, i) => x.position !== i + 1 || !x.name || !x.item?.startsWith(SITE)) || items[2].item !== SITE + url) mal(`${url}: BreadcrumbList`);
  if (items[1].name !== data.categorias[p.categoria]) mal(`${url}: breadcrumb categoría`);
}
ok('Product y BreadcrumbList de las 15 fichas: JSON válido y campos requeridos');
const home = jsonlds['/'].map(t => JSON.parse(t));
const lista = home.find(o => o['@type'] === 'ItemList');
if (lista.itemListElement.length !== data.products.length) mal('ItemList de la home no tiene todos los productos');
lista.itemListElement.forEach((li, i) => { const o = li.item; if (li['@type'] !== 'ListItem' || li.position !== i + 1) mal('ItemList posiciones'); validarProducto({ ...o, sku: 'x', brand: { '@type': 'Brand', name: 'Pool Store' } }, data.products[i], 'home ItemList #' + (i + 1)); });
ok(`home: ${home.length} bloques JSON-LD válidos, ItemList con ${lista.itemListElement.length} productos (agotado = OutOfStock)`);

// ---------- 3. Zoom ----------
console.log('\n3. Zoom');
const escalaDe = (page, sel) => page.$eval(sel, el => { const m = getComputedStyle(el).transform; return m === 'none' ? 1 : new DOMMatrix(m).a; });

// 3a. Escritorio: hover sobre la foto principal
{
  const { page } = await abrir('/productos/mesa-pool-pano-rojo/', 'escritorio');
  const box = await (await page.$('.galeria-principal')).boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await new Promise(r => setTimeout(r, 300));
  const s = await escalaDe(page, '.galeria-principal img');
  const tope = await page.$eval('.galeria-principal', el => { const r = el.getBoundingClientRect(); return 1 / Math.min(1, r.width / 800, r.height / 463); });
  s > 1.05 && s <= Math.min(2.5, tope) + 0.01 ? ok(`hover mesa roja: zoom ${s.toFixed(2)}x (tope tamaño real ${tope.toFixed(2)}x)`) : mal(`hover mesa roja: escala ${s}, tope ${tope}`);
  await page.mouse.move(5, 5); await new Promise(r => setTimeout(r, 300));
  (await escalaDe(page, '.galeria-principal img')) === 1 ? ok('al salir el mouse vuelve a 1x') : mal('no vuelve a 1x');
  await page.close();
}
{
  const { page } = await abrir('/productos/lampara-pool-3-pantallas/', 'escritorio');
  const box = await (await page.$('.galeria-principal')).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await new Promise(r => setTimeout(r, 300));
  const s = await escalaDe(page, '.galeria-principal img');
  const vis = await page.$eval('.galeria-principal img', i => i.naturalWidth);
  s === 1 ? ok(`hover lámpara (foto de ${vis}px): sin zoom, no se pixela`) : mal(`lámpara agrandada ${s}x`);
  await page.close();
}
// 3b. Escritorio: lightbox con click, ruedita y tope
{
  const { page } = await abrir('/productos/futbolito/', 'escritorio');
  await page.click('.galeria-principal');
  await page.waitForSelector('.lightbox:not([hidden])');
  await page.waitForFunction(() => document.querySelector('.lightbox-img').complete);
  const lb = await (await page.$('.lightbox-img')).boundingBox();
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 3);
  for (let i = 0; i < 10; i++) { await page.mouse.wheel({ deltaY: -200 }); }
  await new Promise(r => setTimeout(r, 200));
  const s = await escalaDe(page, '.lightbox-img');
  const tope = await page.$eval('.lightbox-img', i => i.naturalWidth / i.offsetWidth);
  s > 1.05 && Math.abs(s - tope) < 0.02 ? ok(`lightbox futbolito: ruedita hasta ${s.toFixed(2)}x = tamaño real (${tope.toFixed(2)}x)`) : mal(`lightbox ruedita: ${s} tope ${tope}`);
  const pie = await page.$eval('.lightbox-pie', e => e.textContent);
  await page.screenshot({ path: path.join(CAPS, 'zoom-escritorio-futbolito-lightbox.png') });
  await page.keyboard.press('Escape');
  (await page.$eval('.lightbox', e => e.hidden)) ? ok('Escape cierra el lightbox · pie: "' + pie + '"') : mal('Escape no cierra');
  await page.close();
}
// 3c. Celular: pinch-zoom y doble toque en el lightbox
async function toques(cdp, type, pts) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
}
{
  const { page } = await abrir('/productos/mesa-pool-pano-rojo/', 'celular');
  await page.tap('.galeria-principal');
  await page.waitForSelector('.lightbox:not([hidden])');
  await page.waitForFunction(() => document.querySelector('.lightbox-img').complete);
  const cdp = await page.createCDPSession();
  const cx = 195, cy = 422;
  await toques(cdp, 'touchStart', [[cx - 30, cy], [cx + 30, cy]]);
  for (let d = 30; d <= 160; d += 10) await toques(cdp, 'touchMove', [[cx - d, cy], [cx + d, cy]]);
  await toques(cdp, 'touchEnd', []);
  await new Promise(r => setTimeout(r, 200));
  const s = await escalaDe(page, '.lightbox-img');
  const tope = await page.$eval('.lightbox-img', i => i.naturalWidth / i.offsetWidth);
  s > 1.05 && s <= tope + 0.01 ? ok(`pinch mesa roja (390px): ${s.toFixed(2)}x, tope tamaño real ${tope.toFixed(2)}x`) : mal(`pinch: ${s} tope ${tope}`);
  await page.screenshot({ path: path.join(CAPS, 'zoom-celular-mesa-roja-pinch.png') });
  // arrastrar con un dedo mueve la foto ampliada
  const antes = await page.$eval('.lightbox-img', e => e.style.transform);
  await toques(cdp, 'touchStart', [[cx, cy]]);
  for (let d = 0; d <= 80; d += 10) await toques(cdp, 'touchMove', [[cx + d, cy]]);
  await toques(cdp, 'touchEnd', []);
  const despues = await page.$eval('.lightbox-img', e => e.style.transform);
  antes !== despues ? ok('con zoom, arrastrar con un dedo mueve la foto') : mal('arrastre no mueve');
  // doble toque vuelve a 1x
  for (let k = 0; k < 2; k++) { await toques(cdp, 'touchStart', [[cx, cy]]); await toques(cdp, 'touchEnd', []); await new Promise(r => setTimeout(r, 80)); }
  await new Promise(r => setTimeout(r, 200));
  (await escalaDe(page, '.lightbox-img')) === 1 ? ok('doble toque con zoom → vuelve a 1x') : mal('doble toque no resetea');
  for (let k = 0; k < 2; k++) { await toques(cdp, 'touchStart', [[cx, cy]]); await toques(cdp, 'touchEnd', []); await new Promise(r => setTimeout(r, 80)); }
  await new Promise(r => setTimeout(r, 200));
  const s2 = await escalaDe(page, '.lightbox-img');
  s2 > 1.05 ? ok(`doble toque sin zoom → ${s2.toFixed(2)}x`) : mal('doble toque no amplía');
  await page.close();
}
{
  // Foto chica en celular (lámpara de 300 px): el pinch no la agranda más que su tamaño real y el pie lo avisa
  const { page } = await abrir('/productos/lampara-pool-3-pantallas/', 'celular');
  await page.tap('.galeria-principal');
  await page.waitForSelector('.lightbox:not([hidden])');
  await page.waitForFunction(() => document.querySelector('.lightbox-img').complete);
  const cdp = await page.createCDPSession();
  await toques(cdp, 'touchStart', [[165, 422], [225, 422]]);
  for (let d = 30; d <= 160; d += 10) await toques(cdp, 'touchMove', [[195 - d, 422], [195 + d, 422]]);
  await toques(cdp, 'touchEnd', []);
  const s = await escalaDe(page, '.lightbox-img');
  const lbPie = await page.$eval('.lightbox-pie', e => e.textContent);
  s === 1 && lbPie.includes('tamaño real') ? ok(`lámpara 300px: pinch no agranda (${s}x) · pie "${lbPie}"`) : mal(`foto chica agrandada ${s}x · ${lbPie}`);
  await page.close();
}
{
  // Swipe en el lightbox (mesa 3 en 1, 4 fotos): izquierda → siguiente, derecha → anterior; al cerrar vuelve el foco
  const { page } = await abrir('/productos/mesa-3-en-1-pool-ping-pong-comedor/', 'celular');
  await page.tap('.galeria-principal');
  await page.waitForSelector('.lightbox:not([hidden])');
  const cdp = await page.createCDPSession();
  const src = () => page.$eval('.lightbox-img', i => i.getAttribute('src'));
  const deslizar = async (x0, x1) => { await toques(cdp, 'touchStart', [[x0, 422]]); for (let k = 1; k <= 10; k++) await toques(cdp, 'touchMove', [[x0 + (x1 - x0) * k / 10, 422]]); await toques(cdp, 'touchEnd', []); };
  await deslizar(320, 100); const s1 = await src();
  await deslizar(100, 320); const s2 = await src();
  s1.includes('pingpool1') && s2.endsWith('pingpool.jpg') ? ok('swipe izquierda → foto 2, derecha → foto 1') : mal(`swipe: ${s1} / ${s2}`);
  await page.tap('.lightbox-cerrar');
  const foco = await page.evaluate(() => document.activeElement.className);
  foco === 'galeria-principal' ? ok('cerrar devuelve el foco a la foto') : mal('foco al cerrar: ' + foco);
  await page.close();
}

// ---------- 4. Agotado ----------
console.log('\n4. Agotado');
{
  const { page } = await abrir('/productos/mesa-pool-profesional-con-tapa/', 'escritorio');
  const r = await page.evaluate(() => ({
    estado: document.querySelector('.ficha-estado').textContent,
    precio: getComputedStyle(document.querySelector('.price-num')).textDecorationLine,
    btn: document.querySelector('.btn-wa-grande').textContent.trim(),
    href: decodeURIComponent(document.querySelector('.btn-wa-grande').href),
  }));
  r.estado === 'Agotado' && r.precio === 'none' && r.btn === 'Avisame cuando vuelva' && r.href.includes('avisen') ? ok(`ficha: ${r.estado}, precio sin tachar, botón "${r.btn}" → ${r.href.split('text=')[1]}`) : mal('agotado ficha: ' + JSON.stringify(r));
  await page.close();
  const h = await abrir('/', 'escritorio');
  const c = await h.page.evaluate(() => { const card = [...document.querySelectorAll('.prod-card')].find(c => c.textContent.includes('con Tapa')); return { badge: card.querySelector('.stock-badge')?.textContent, btn: card.querySelector('.btn-wa-card').textContent.trim(), tag: card.querySelector('.btn-wa-card').tagName, deco: getComputedStyle(card.querySelector('.prod-price')).textDecorationLine }; });
  c.badge === 'Agotado' && c.btn === 'Avisame cuando vuelva' && c.tag === 'A' && c.deco === 'none' ? ok('tarjeta home: badge Agotado, precio normal, botón activo "Avisame cuando vuelva"') : mal('agotado home ' + JSON.stringify(c));
  await h.page.close();
}

// ---------- 5. Home: tarjetas llevan a la ficha ----------
console.log('\n5. Home → fichas');
{
  const { page } = await abrir('/', 'escritorio');
  const n = await page.$$eval('.prod-card', cs => cs.filter(c => c.querySelector('.prod-name a[href^="/productos/"]') && c.querySelector('.prod-img-link[href^="/productos/"]') && c.querySelector('.btn-wa-card[href*="wa.me"]')).length);
  n === data.products.length ? ok(`${n} tarjetas con link en foto y nombre, y botón de WhatsApp`) : mal(`tarjetas con links: ${n}`);
  const card = await page.$('.prod-card .prod-img-wrap');
  await Promise.all([page.waitForNavigation(), card.click()]);
  page.url().endsWith('/productos/mesa-pool-pano-verde/') ? ok('click en la foto de la tarjeta → ' + new URL(page.url()).pathname) : mal('click foto → ' + page.url());
  await page.goto(BASE + '/');
  // galería de la tarjeta 3 en 1: las flechas siguen funcionando y no navegan
  const flecha = await page.$('.prod-gallery .gallery-next');
  await flecha.click();
  const activa = await page.$eval('.prod-gallery .gallery-img.active', i => i.getAttribute('src'));
  page.url() === BASE + '/' && activa.includes('pingpool1') ? ok('flecha del carrusel 3 en 1 cambia foto sin navegar') : mal('flecha 3en1: ' + page.url() + ' ' + activa);
  await page.close();
}

// ---------- 6. Capturas ----------
console.log('\n6. Capturas');
for (const [url, nombre] of [['/', 'home'], ['/productos/mesa-pool-pano-rojo/', 'mesa-pool-pano-rojo'], ['/productos/mesa-pool-pano-verde/', 'mesa-pool-pano-verde'], ['/productos/mesa-3-en-1-pool-ping-pong-comedor/', 'mesa-3-en-1'], ['/productos/mesa-pool-profesional-con-tapa/', 'mesa-con-tapa-agotada']]) {
  for (const [vp, w] of [['escritorio', 1440], ['celular', 390]]) {
    const { page } = await abrir(url, vp);
    await page.evaluate(async () => { for (const i of document.images) i.loading = 'eager'; await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); await document.fonts.ready; });
    await page.screenshot({ path: path.join(CAPS, `${nombre}-${w}.png`), fullPage: true });
    await page.close();
  }
}
ok('capturas en ' + CAPS);

await browser.close();
console.log(fallas.length ? `\n${fallas.length} FALLAS` : '\nTODO OK');
process.exit(fallas.length ? 1 : 0);
