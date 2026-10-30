/*
  Galería de las páginas de producto.
  - Miniaturas: cambian la foto principal.
  - Escritorio: zoom siguiendo el mouse sobre la foto principal.
  - Click o toque: abre el lightbox. Ahí se hace zoom con la ruedita, doble click/doble toque
    o pellizcando (pinch), se arrastra la foto ampliada y se desliza para pasar de foto.
*/
(function(){
  const galeria = document.querySelector('[data-galeria]');
  if (!galeria) return;

  const principal = galeria.querySelector('.galeria-principal');
  const imgPrincipal = principal.querySelector('img');
  const sourcePrincipal = principal.querySelector('source');
  const pieGaleria = galeria.querySelector('.galeria-pie');
  const miniaturas = [...galeria.querySelectorAll('.galeria-miniaturas button')];
  const fotos = miniaturas.length
    ? miniaturas.map(b => ({ jpg: b.dataset.jpg, webp: b.dataset.webp, alt: b.dataset.alt, pie: b.dataset.pie, w: +b.dataset.w, h: +b.dataset.h }))
    : [{ jpg: imgPrincipal.getAttribute('src'), webp: sourcePrincipal ? sourcePrincipal.srcset : '', alt: imgPrincipal.alt,
         pie: pieGaleria ? pieGaleria.textContent : '', w: +imgPrincipal.getAttribute('width'), h: +imgPrincipal.getAttribute('height') }];
  let actual = 0;
  const mouse = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  const ZOOM_MAX = 5;

  function mostrar(i){
    actual = (i + fotos.length) % fotos.length;
    const f = fotos[actual];
    if (sourcePrincipal) sourcePrincipal.srcset = f.webp || f.jpg;
    imgPrincipal.src = f.jpg;
    imgPrincipal.alt = f.alt;
    if (f.w) { imgPrincipal.width = f.w; imgPrincipal.height = f.h; }
    if (pieGaleria) pieGaleria.textContent = f.pie || '';
    miniaturas.forEach((b, j) => b.setAttribute('aria-current', j === actual ? 'true' : 'false'));
  }
  miniaturas.forEach((b, i) => b.addEventListener('click', () => mostrar(i)));

  // Zoom con el mouse (solo con puntero fino y hover: en celular se usa el lightbox).
  // Nunca agranda la foto más que su tamaño real, para que no se vea pixelada.
  if (mouse) {
    principal.addEventListener('mousemove', e => {
      const r = principal.getBoundingClientRect(), f = fotos[actual];
      const visible = Math.min(1, r.width / f.w, r.height / f.h);   // la foto se muestra a esta fracción de su tamaño real
      const zoom = Math.min(2.5, 1 / visible);
      if (zoom < 1.05) return principal.classList.remove('zoom');
      principal.style.setProperty('--zs', zoom.toFixed(3));
      principal.style.setProperty('--zx', ((e.clientX - r.left) / r.width * 100) + '%');
      principal.style.setProperty('--zy', ((e.clientY - r.top) / r.height * 100) + '%');
      principal.classList.add('zoom');
    });
    principal.addEventListener('mouseleave', () => principal.classList.remove('zoom'));
  }

  // ---------- LIGHTBOX ----------
  const lb = document.querySelector('.lightbox');
  const escena = lb.querySelector('.lightbox-escena');
  const lbImg = lb.querySelector('.lightbox-img');
  const lbPie = lb.querySelector('.lightbox-pie');
  const btnCerrar = lb.querySelector('.lightbox-cerrar');
  let s = 1, tx = 0, ty = 0;           // escala y desplazamiento de la foto
  let volverFoco = null;

  // Zoom máximo en el lightbox: hasta el tamaño real de la foto (y no más de ZOOM_MAX)
  function maxZoom(){
    const ancho = lbImg.naturalWidth || fotos[actual].w;
    return lbImg.offsetWidth ? Math.max(1, Math.min(ZOOM_MAX, ancho / lbImg.offsetWidth)) : 1;
  }
  function actualizarPie(){
    const puede = maxZoom() > 1.05;
    lb.classList.toggle('sin-zoom', !puede);
    const ayuda = !puede ? 'Foto en tamaño real' : mouse ? 'Click o ruedita para ampliar' : 'Pellizcá o tocá dos veces para ampliar';
    lbPie.textContent = [fotos[actual].pie, fotos.length > 1 ? (actual + 1) + ' / ' + fotos.length : '', ayuda].filter(Boolean).join(' · ');
  }
  lbImg.addEventListener('load', actualizarPie);

  function aplicar(){
    // Que la foto ampliada no se pueda arrastrar fuera de la pantalla
    const w = lbImg.offsetWidth * s, h = lbImg.offsetHeight * s;
    const mx = Math.max(0, (w - escena.clientWidth) / 2), my = Math.max(0, (h - escena.clientHeight) / 2);
    tx = Math.min(mx, Math.max(-mx, tx));
    ty = Math.min(my, Math.max(-my, ty));
    lbImg.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + s + ')';
    lb.classList.toggle('zoomed', s > 1.01);
  }
  // Zoom manteniendo fijo el punto (cx, cy) de la pantalla
  function zoomEn(cx, cy, nueva){
    nueva = Math.min(maxZoom(), Math.max(1, nueva));
    const r = escena.getBoundingClientRect();
    const ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2);
    tx = ox - (nueva / s) * (ox - tx);
    ty = oy - (nueva / s) * (oy - ty);
    s = nueva;
    if (s === 1) { tx = 0; ty = 0; }
    aplicar();
  }
  function reset(){ s = 1; tx = 0; ty = 0; aplicar(); }

  function cargar(i){
    actual = (i + fotos.length) % fotos.length;
    lbImg.src = fotos[actual].jpg;
    lbImg.alt = fotos[actual].alt;
    reset();
    actualizarPie();
  }
  function abrir(){
    volverFoco = document.activeElement;
    cargar(actual);
    lb.hidden = false;
    actualizarPie();                     // recién visible se puede medir la foto
    document.body.classList.add('lightbox-abierto');
    btnCerrar.focus();
  }
  function cerrar(){
    lb.hidden = true;
    document.body.classList.remove('lightbox-abierto');
    mostrar(actual);
    if (volverFoco) volverFoco.focus();
  }
  principal.addEventListener('click', abrir);
  btnCerrar.addEventListener('click', cerrar);
  lb.querySelector('.lightbox-ant').addEventListener('click', () => cargar(actual - 1));
  lb.querySelector('.lightbox-sig').addEventListener('click', () => cargar(actual + 1));
  if (fotos.length < 2) lb.querySelectorAll('.lightbox-ant,.lightbox-sig').forEach(b => b.hidden = true);

  document.addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') cerrar();
    else if (e.key === 'ArrowLeft') cargar(actual - 1);
    else if (e.key === 'ArrowRight') cargar(actual + 1);
    else if (e.key === 'Tab') { e.preventDefault(); btnCerrar.focus(); }
  });

  escena.addEventListener('wheel', e => {
    e.preventDefault();
    zoomEn(e.clientX, e.clientY, s * Math.exp(-e.deltaY * 0.0025));
  }, { passive: false });

  // Gestos con Pointer Events: 1 dedo/mouse arrastra o desliza, 2 dedos pellizcan
  const punteros = new Map();
  let ultDist = 0, ultMedio = null, inicio = null, movio = false, ultToque = 0;

  function medio(){ const [a, b] = [...punteros.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function dist(){ const [a, b] = [...punteros.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }

  escena.addEventListener('pointerdown', e => {
    if (e.target !== lbImg && e.target !== escena) return;
    escena.setPointerCapture(e.pointerId);
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size === 1) { inicio = { x: e.clientX, y: e.clientY, t: Date.now() }; movio = false; }
    if (punteros.size === 2) { ultDist = dist(); ultMedio = medio(); movio = true; }
  });
  escena.addEventListener('pointermove', e => {
    if (!punteros.has(e.pointerId)) return;
    const prev = punteros.get(e.pointerId);
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size === 2) {
      const d = dist(), m = medio();
      zoomEn(m.x, m.y, s * d / ultDist);
      tx += m.x - ultMedio.x; ty += m.y - ultMedio.y; aplicar();
      ultDist = d; ultMedio = m;
    } else if (punteros.size === 1) {
      if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 6) movio = true;
      if (s > 1.01 && movio) {
        lb.classList.add('arrastrando');
        tx += e.clientX - prev.x; ty += e.clientY - prev.y; aplicar();
      }
    }
  });
  function soltar(e){
    if (!punteros.has(e.pointerId)) return;
    punteros.delete(e.pointerId);
    lb.classList.remove('arrastrando');
    if (punteros.size === 1) { const p = [...punteros.values()][0]; inicio = { x: p.x, y: p.y, t: Date.now() }; return; }
    if (punteros.size > 0 || e.type === 'pointercancel') return;
    const dx = e.clientX - inicio.x;
    if (s <= 1.01 && movio && Math.abs(dx) > 50 && fotos.length > 1) { cargar(actual + (dx < 0 ? 1 : -1)); return; }
    if (movio) return;
    // Toque o click sin arrastrar
    if (e.pointerType === 'mouse') {
      if (e.target === escena && s <= 1.01) cerrar();                 // click en el fondo
      else if (e.target === lbImg) s > 1.01 ? reset() : zoomEn(e.clientX, e.clientY, 2.5);
    } else {
      const ahora = Date.now();
      if (ahora - ultToque < 300) { ultToque = 0; s > 1.01 ? reset() : zoomEn(e.clientX, e.clientY, 2.5); }
      else ultToque = ahora;
    }
  }
  escena.addEventListener('pointerup', soltar);
  escena.addEventListener('pointercancel', soltar);
  window.addEventListener('resize', () => { if (!lb.hidden) aplicar(); });
})();
