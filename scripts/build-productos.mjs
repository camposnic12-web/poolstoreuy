#!/usr/bin/env node
/*
  Genera, a partir de data/products.json:
    - /productos/<slug>/index.html (con templates/producto.html)
    - el catálogo de index.html (entre <!-- PRODUCTOS:INICIO --> y <!-- PRODUCTOS:FIN -->)
    - el JSON-LD de productos de index.html (entre JSONLD-PRODUCTOS:INICIO/FIN)
    - sitemap.xml

  Uso:
    node scripts/build-productos.mjs           escribe los archivos
    node scripts/build-productos.mjs --check   no escribe nada; falla si algún archivo no coincide con el JSON

  Sin dependencias: solo Node (18 o más nuevo).
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const GENERADO = 'GENERADO por scripts/build-productos.mjs — no editar a mano';

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.json'), 'utf8'));
const SITE = data.site.replace(/\/$/, '');
const productos = data.products;

const WA_PATH = '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.138.558 4.147 1.534 5.893L.054 23.25a.75.75 0 0 0 .916.917l5.412-1.482A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.98 0-3.83-.575-5.385-1.568l-.385-.234-3.994 1.094 1.083-3.908-.254-.405A9.938 9.938 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>';

const AVAILABILITY = {
  disponible: 'https://schema.org/InStock',
  agotado: 'https://schema.org/OutOfStock',
  proximamente: 'https://schema.org/PreOrder',
};
const ESTADO_TEXTO = { disponible: 'Disponible', agotado: 'Agotado', proximamente: 'Próximamente' };

// ---------- VALIDACIÓN ----------
const errores = [];
const slugs = new Set();
for (const p of productos) {
  const q = `"${p.id || '?'}"`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug || '')) errores.push(`${q}: slug inválido "${p.slug}" (solo minúsculas sin tildes, números y guiones)`);
  if (slugs.has(p.slug)) errores.push(`${q}: slug repetido "${p.slug}"`);
  slugs.add(p.slug);
  if (!data.categorias[p.categoria]) errores.push(`${q}: categoría desconocida "${p.categoria}"`);
  if (!ESTADO_TEXTO[p.estado]) errores.push(`${q}: estado inválido "${p.estado}" (disponible | agotado | proximamente)`);
  if (p.precio !== null && !(Number.isInteger(p.precio) && p.precio > 0)) errores.push(`${q}: precio debe ser un entero en UYU o null`);
  if (!p.fotos?.length) errores.push(`${q}: falta al menos una foto`);
  for (const f of p.fotos || []) {
    if (!f.src?.startsWith('/')) errores.push(`${q}: la foto "${f.src}" tiene que empezar con /`);
    else if (!fs.existsSync(path.join(ROOT, f.src))) errores.push(`${q}: no existe la foto ${f.src}`);
    if (!f.alt) errores.push(`${q}: falta el alt de ${f.src}`);
    if (!f.w || !f.h) errores.push(`${q}: faltan w/h de ${f.src}`);
  }
  if (p.fotos?.[0] && (p.fotos[0].pie || /mesa-instalada/.test(p.fotos[0].src))) errores.push(`${q}: la foto principal tiene que ser la del producto, no una foto de cliente/instalada`);
}
if (errores.length) {
  console.error('data/products.json tiene errores:\n  - ' + errores.join('\n  - '));
  process.exit(1);
}

// ---------- AYUDAS ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const precioTexto = n => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const urlProducto = p => `/productos/${p.slug}/`;
const waUrl = msg => `https://wa.me/${data.whatsapp}?text=${encodeURIComponent(msg)}`;
const mensajeAvisame = p => p.whatsappAvisame ||
  `Hola, quiero que me avisen cuando vuelva a haber stock de: ${p.nombre}${p.precio ? ` (${precioTexto(p.precio)})` : ''}.`;
const jsonld = obj => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
const textoPrecio = p => p.precio === null ? 'Consultar precio' : precioTexto(p.precio) + (p.precioSufijo || '');

// WebP generadas en /images/productos/<nombre>.webp (y <nombre>-480.webp si la foto es grande).
// Si no existen se usa solo la foto original.
function webp(f) {
  const base = path.basename(f.src, path.extname(f.src));
  const out = [];
  if (fs.existsSync(path.join(ROOT, `images/productos/${base}-480.webp`))) out.push(`/images/productos/${base}-480.webp 480w`);
  if (fs.existsSync(path.join(ROOT, `images/productos/${base}.webp`))) out.push(`/images/productos/${base}.webp ${f.w}w`);
  return out.join(', ');
}
function picture(f, { sizes, attrs = '' }) {
  const s = webp(f);
  const source = s ? `<source type="image/webp" srcset="${s}" sizes="${sizes}">` : '';
  return `<picture>${source}<img src="${esc(f.src)}" alt="${esc(f.alt)}"${attrs} width="${f.w}" height="${f.h}"></picture>`;
}

// ---------- TARJETA (home y relacionados) ----------
function tarjeta(p, ind = '      ') {
  const url = urlProducto(p);
  const sinStock = p.estado !== 'disponible';
  const wrap = ['prod-img-wrap', p.fondoOscuro && 'img-oscura', sinStock && 'img-dimmed'].filter(Boolean).join(' ');
  const sizes = '(max-width:600px) 50vw, 280px';
  const l = [];
  l.push(`<!-- ${p.nombre} -->`);
  l.push(`<div class="prod-card" data-cat="${p.categoria}">`);
  l.push(`  <div class="${wrap}">`);
  l.push(`    <span class="prod-cat-tag">${esc(p.etiqueta)}</span>`);
  if (sinStock) l.push(`    <span class="stock-badge ${p.estado}">${ESTADO_TEXTO[p.estado]}</span>`);
  else if (p.badge) l.push(`    <span class="best-seller-badge"${p.badgeHalloween ? ` data-halloween-text="${esc(p.badgeHalloween)}"` : ''}>${esc(p.badge)}</span>`);
  if (p.tarjetaGaleria && p.fotos.length > 1) {
    l.push(`    <div class="prod-gallery">`);
    p.fotos.forEach((f, i) => {
      const s = webp(f);
      const img = `<img class="gallery-img${i === 0 ? ' active' : ''}" src="${esc(f.src)}" alt="${esc(f.alt)}" loading="lazy" width="${f.w}" height="${f.h}">`;
      l.push('      ' + (s ? `<picture><source type="image/webp" srcset="${s}" sizes="${sizes}">${img}</picture>` : img));
    });
    l.push(`      <a class="prod-img-link" href="${url}" tabindex="-1" aria-hidden="true"></a>`);
    l.push(`      <button type="button" class="gallery-arrow gallery-prev" onclick="galleryNav(this,-1)" aria-label="Foto anterior">‹</button>`);
    l.push(`      <button type="button" class="gallery-arrow gallery-next" onclick="galleryNav(this,1)" aria-label="Foto siguiente">›</button>`);
    l.push(`      <div class="gallery-dots">`);
    p.fotos.forEach((f, i) => l.push(`        <span class="dot${i === 0 ? ' active' : ''}"></span>`));
    l.push(`      </div>`);
    l.push(`    </div>`);
  } else {
    l.push(`    ${picture(p.fotos[0], { sizes, attrs: ' loading="lazy"' })}`);
    l.push(`    <a class="prod-img-link" href="${url}" tabindex="-1" aria-hidden="true"></a>`);
  }
  l.push(`  </div>`);
  l.push(`  <div class="prod-body">`);
  l.push(`    <div class="prod-name"><a href="${url}">${esc(p.nombre)}</a></div>`);
  l.push(`    <div class="prod-desc">${esc(p.descripcionCorta)}</div>`);
  l.push(`    <div class="prod-price">${esc(textoPrecio(p))}</div>`);
  const [msg, texto] = p.estado === 'agotado' ? [mensajeAvisame(p), 'Avisame cuando vuelva'] : [p.whatsappMensaje, p.botonTexto];
  l.push(`    <a href="${esc(waUrl(msg))}" target="_blank" class="btn-wa-card">`);
  l.push(`      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">${WA_PATH}</svg>`);
  l.push(`      ${esc(texto)}`);
  l.push(`    </a>`);
  l.push(`  </div>`);
  l.push(`</div>`);
  return l.map(x => ind + x).join('\n');
}

// Relacionados: primero la misma categoría, después las afines (mesas | accesorios en general), disponibles primero
function relacionados(p, n = 4) {
  const grupo = c => (c === 'mesas' ? 'mesas' : 'accesorios');
  const rank = q => (q.categoria === p.categoria ? 0 : grupo(q.categoria) === grupo(p.categoria) ? 1 : 2) * 2 + (q.estado === 'disponible' ? 0 : 1);
  return productos
    .filter(q => q.slug !== p.slug)
    .map((q, i) => ({ q, i, r: rank(q) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, n)
    .map(x => x.q);
}

// ---------- PÁGINA DE PRODUCTO ----------
const plantilla = fs.readFileSync(path.join(ROOT, 'templates/producto.html'), 'utf8');

function pagina(p) {
  const url = SITE + urlProducto(p);
  const cat = data.categorias[p.categoria];
  const precio = textoPrecio(p);
  const principal = p.fotos[0];
  const agotado = p.estado === 'agotado';

  const title = `${p.nombrePagina} ${p.precio === null ? '' : precioTexto(p.precio) + ' '}| Envíos a todo Uruguay | Pool Store UY`;
  let description = `${p.nombrePagina}${p.precio === null ? '' : ` a ${precio}`}. ${p.descripcionCorta}`;
  if (agotado) description += ' Agotado: pedí que te avisemos cuando vuelva.';
  else if (!/env[ií]os? a todo uruguay/i.test(description)) description += ' Envíos a todo Uruguay.';

  const producto = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.nombrePagina,
    image: p.fotos.map(f => SITE + f.src),
    description: p.descripcion || p.descripcionCorta,
    sku: p.sku || p.id,
    category: cat,
    brand: { '@type': 'Brand', name: 'Pool Store' },
    url,
  };
  if (p.precio !== null) {
    producto.offers = {
      '@type': 'Offer',
      price: String(p.precio),
      priceCurrency: data.currency,
      availability: AVAILABILITY[p.estado],
      itemCondition: 'https://schema.org/NewCondition',
      url,
      seller: { '@type': 'Organization', name: 'Pool Store Uruguay' },
    };
  }
  const migasLD = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: cat, item: SITE + '/#catalogo' },
      { '@type': 'ListItem', position: 3, name: p.nombrePagina, item: url },
    ],
  };

  const migas = [
    `    <li><a href="/">Inicio</a></li>`,
    `    <li><a href="/#catalogo">${esc(cat)}</a></li>`,
    `    <li><span aria-current="page">${esc(p.nombrePagina)}</span></li>`,
  ].join('\n');

  // Galería
  const g = [];
  g.push(`  <div class="galeria${p.fondoOscuro ? ' galeria-oscura' : ''}" data-galeria>`);
  g.push(`    <button type="button" class="galeria-principal" aria-label="Ampliar foto">`);
  // Si la foto es más chica que el recuadro, sizes = su ancho real: así el navegador no la agranda (se vería pixelada)
  const sizesPrincipal = principal.w > 600 ? '(max-width:900px) 100vw, 600px' : `${principal.w}px`;
  g.push(`      ${picture(principal, { sizes: sizesPrincipal, attrs: ' loading="eager" fetchpriority="high"' })}`);
  g.push(`      <span class="galeria-lupa" aria-hidden="true">🔍 Tocá para ampliar</span>`);
  g.push(`    </button>`);
  g.push(`    <p class="galeria-pie" aria-live="polite">${esc(principal.pie || '')}</p>`);
  if (p.fotos.length > 1) {
    g.push(`    <ul class="galeria-miniaturas">`);
    p.fotos.forEach((f, i) => {
      const s = webp(f);
      g.push(`      <li><button type="button" aria-label="Ver foto ${i + 1}: ${esc(f.alt)}" aria-current="${i === 0}" data-jpg="${esc(f.src)}" data-webp="${s}" data-alt="${esc(f.alt)}" data-pie="${esc(f.pie || '')}" data-w="${f.w}" data-h="${f.h}">${picture(f, { sizes: '76px', attrs: ' loading="lazy"' }).replace(/ alt="[^"]*"/, ' alt=""')}</button></li>`);
    });
    g.push(`    </ul>`);
  }
  g.push(`  </div>`);

  // Info
  const i = [];
  i.push(`    <span class="ficha-cat">${esc(cat)}</span>`);
  i.push(`    <h1 class="ficha-titulo">${esc(p.nombrePagina)}</h1>`);
  i.push(`    <p class="ficha-estado estado-${p.estado}">${ESTADO_TEXTO[p.estado]}</p>`);
  i.push(`    <div class="price-block">`);
  i.push(`      <span class="price-num">${esc(precio)}</span>`);
  i.push(`      <span class="price-note">Pesos uruguayos<br>Envíos a todo Uruguay</span>`);
  i.push(`    </div>`);
  i.push(`    <p class="ficha-resumen">${esc(p.descripcionCorta)}</p>`);
  const [msg, texto] = agotado ? [mensajeAvisame(p), 'Avisame cuando vuelva'] : [p.whatsappMensaje, 'Consultar por WhatsApp'];
  i.push(`    <a href="${esc(waUrl(msg))}" target="_blank" class="btn-wa-grande">`);
  i.push(`      <svg width="22" height="22" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">${WA_PATH}</svg>`);
  i.push(`      ${texto}`);
  i.push(`    </a>`);
  if (p.descripcion) {
    i.push(`    <section class="ficha-bloque">`);
    i.push(`      <h2>Descripción</h2>`);
    i.push(`      <p>${esc(p.descripcion)}</p>`);
    i.push(`    </section>`);
  }
  const caracteristicas = (p.caracteristicas || []).filter(c => c.nombre && c.valor);
  if (caracteristicas.length) {
    i.push(`    <section class="ficha-bloque">`);
    i.push(`      <h2>Características</h2>`);
    i.push(`      <table class="ficha-tabla"><tbody>`);
    for (const c of caracteristicas) i.push(`        <tr><th scope="row">${esc(c.nombre)}</th><td>${esc(c.valor)}</td></tr>`);
    i.push(`      </tbody></table>`);
    i.push(`    </section>`);
  }
  if (p.incluye?.length) {
    i.push(`    <section class="ficha-bloque">`);
    i.push(`      <h2>Qué incluye</h2>`);
    i.push(`      <ul class="feat-list">`);
    for (const x of p.incluye) i.push(`        <li>${esc(x)}</li>`);
    i.push(`      </ul>`);
    i.push(`    </section>`);
  }
  const envio = p.envio || data.envio[p.categoria] || data.envio.default;
  i.push(`    <section class="ficha-bloque ficha-envio">`);
  i.push(`      <h2>${/armado/i.test(envio) ? 'Envío y armado' : 'Envío y retiro'}</h2>`);
  i.push(`      <p>${esc(envio)}</p>`);
  i.push(`    </section>`);

  const og = principal;
  const vars = {
    title: esc(title),
    description: esc(description),
    url,
    ogTitle: esc(`${p.nombrePagina}${p.precio === null ? '' : ' · ' + precio} | Pool Store UY`),
    ogImage: SITE + og.src,
    ogImageW: og.w,
    ogImageH: og.h,
    ogImageAlt: esc(og.alt),
    ogPrecio: p.precio === null ? '' :
      `<meta property="product:price:amount" content="${p.precio}">\n<meta property="product:price:currency" content="${data.currency}">\n`,
    jsonldProducto: jsonld(producto),
    jsonldMigas: jsonld(migasLD),
    migas,
    galeria: g.join('\n'),
    info: i.join('\n'),
    relacionados: relacionados(p).map(q => tarjeta(q)).join('\n\n'),
    waUrl: esc(waUrl(agotado ? mensajeAvisame(p) : p.whatsappMensaje)),
    waPath: WA_PATH,
  };
  return plantilla.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in vars)) throw new Error(`templates/producto.html: campo desconocido {{${k}}}`);
    return vars[k];
  });
}

// ---------- HOME ----------
function reemplazarEntre(texto, inicio, fin, contenido, archivo) {
  const a = texto.indexOf(inicio), b = texto.indexOf(fin);
  if (a < 0 || b < a) throw new Error(`${archivo}: no encuentro los marcadores ${inicio} / ${fin}`);
  return texto.slice(0, a + inicio.length) + '\n' + contenido + '\n' + texto.slice(texto.lastIndexOf('\n', b) + 1);
}

function home() {
  let h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const tarjetas = `      <!-- ${GENERADO}. Datos: data/products.json -->\n\n` +
    productos.map(p => tarjeta(p)).join('\n\n') + '\n';
  h = reemplazarEntre(h, '<!-- PRODUCTOS:INICIO -->', '<!-- PRODUCTOS:FIN -->', tarjetas, 'index.html');

  const lista = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: productos.map((p, i) => {
      const url = SITE + urlProducto(p);
      const item = {
        '@type': 'Product',
        position: i + 1,
        name: p.nombre,
        description: p.descripcionCorta,
        image: SITE + p.fotos[0].src,
        url,
      };
      if (p.precio !== null) item.offers = { '@type': 'Offer', price: String(p.precio), priceCurrency: data.currency, availability: AVAILABILITY[p.estado], url };
      return item;
    }),
  };
  const ld = `<!-- ${GENERADO}. Datos: data/products.json -->\n<script type="application/ld+json">\n${jsonld(lista)}\n</script>`;
  h = reemplazarEntre(h, '<!-- JSONLD-PRODUCTOS:INICIO -->', '<!-- JSONLD-PRODUCTOS:FIN -->', ld, 'index.html');
  return h;
}

// ---------- SITEMAP ----------
function sitemap() {
  const urls = [
    { loc: SITE + '/', freq: 'weekly', pri: '1.0' },
    ...productos.map(p => ({ loc: SITE + urlProducto(p), freq: 'weekly', pri: '0.8' })),
  ];
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<!-- ${GENERADO}. Datos: data/products.json -->\n` +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`).join('\n') +
    '\n</urlset>\n';
}

// ---------- ESCRIBIR O COMPROBAR ----------
const salida = new Map();
for (const p of productos) salida.set(`productos/${p.slug}/index.html`, pagina(p));
salida.set('index.html', home());
salida.set('sitemap.xml', sitemap());

// Carpetas de productos que ya no están en el JSON (solo si las generó este script)
const dirProductos = path.join(ROOT, 'productos');
const sobrantes = fs.existsSync(dirProductos)
  ? fs.readdirSync(dirProductos).filter(d => !slugs.has(d)).filter(d => {
      const f = path.join(dirProductos, d, 'index.html');
      return fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(GENERADO);
    })
  : [];

if (CHECK) {
  const distintos = [...salida].filter(([f, c]) => !fs.existsSync(path.join(ROOT, f)) || fs.readFileSync(path.join(ROOT, f), 'utf8') !== c).map(([f]) => f);
  distintos.push(...sobrantes.map(d => `productos/${d}/ (ya no está en el JSON)`));
  if (distintos.length) {
    console.error('Estos archivos no coinciden con data/products.json:\n  - ' + distintos.join('\n  - ') +
      '\nCorré: node scripts/build-productos.mjs');
    process.exit(1);
  }
  console.log(`OK: ${salida.size} archivos coinciden con data/products.json`);
} else {
  for (const [f, c] of salida) {
    fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, f), c);
  }
  for (const d of sobrantes) fs.rmSync(path.join(dirProductos, d), { recursive: true });
  console.log(`Generados ${productos.length} productos, index.html y sitemap.xml` + (sobrantes.length ? `. Borrados: ${sobrantes.join(', ')}` : ''));
}
