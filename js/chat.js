// Asesor de compra y alquiler (chat). Habla con /api/chat (netlify/functions/chat.mjs).
// Si el servicio no responde, ofrece WhatsApp con la consulta prearmada.
// El número de WhatsApp sale de los links que ya tiene la página (configurado en data/products.json).
(function () {
  'use strict';
  if (window.__psChat) return;
  window.__psChat = true;

  var API = '/api/chat';
  var MAX = 500;            // caracteres por mensaje (igual que el servidor)
  var MAX_TURNOS = 30;      // mensajes por conversación
  var CLAVE = 'ps-chat-v1';
  var SALUDO = '¡Buenas! 🎱 ¿Estás buscando comprar o alquilar una mesa de pool?';
  var RAPIDAS = ['Comprar una mesa', 'Alquilar una mesa', '¿Qué mesa me entra?'];

  // WhatsApp configurado en el sitio
  var waLink = document.querySelector('a[href*="wa.me/"]');
  var waNumero = waLink ? (waLink.getAttribute('href').match(/wa\.me\/(\d+)/) || [])[1] : '';
  function waUrl(msg) { return 'https://wa.me/' + waNumero + '?text=' + encodeURIComponent(msg); }

  var estado = { abierto: false, mensajes: [], enviando: false };
  try {
    var guardado = JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
    if (guardado && Array.isArray(guardado.mensajes)) estado.mensajes = guardado.mensajes.slice(-MAX_TURNOS);
  } catch (e) { /* sin sessionStorage: arranca vacío */ }
  function guardar() {
    try { sessionStorage.setItem(CLAVE, JSON.stringify({ mensajes: estado.mensajes.slice(-MAX_TURNOS) })); } catch (e) { }
  }

  function el(tag, attrs, hijos) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (hijos || []).forEach(function (h) { if (h) n.appendChild(h); });
    return n;
  }
  // Mascota del asesor (bola 8 de Pool Store, diseño propio; copia en images/asesor-bola8.svg)
  var MASCOTA = '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false"><ellipse cx="58" cy="112" rx="34" ry="5" fill="#000" opacity=".18"/> <g transform="rotate(-38 60 60)"> <rect x="56" y="-6" width="7" height="128" rx="3.5" fill="#E51820" stroke="#141414" stroke-width="3"/> <rect x="56" y="84" width="7" height="34" rx="3" fill="#141414"/> <rect x="56" y="-6" width="7" height="9" rx="3" fill="#2F7FD8" stroke="#141414" stroke-width="3"/> <rect x="56" y="78" width="7" height="4" fill="#fff"/> </g> <circle cx="58" cy="64" r="43" fill="#141414" stroke="#141414" stroke-width="3"/> <ellipse cx="40" cy="40" rx="15" ry="9" fill="#fff" opacity=".22" transform="rotate(-35 40 40)"/> <circle cx="74" cy="40" r="15" fill="#fff"/> <text x="74" y="47.5" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="21" fill="#141414">8</text> <ellipse cx="40" cy="64" rx="7" ry="9" fill="#fff"/> <ellipse cx="60" cy="64" rx="7" ry="9" fill="#fff"/> <circle cx="42" cy="66" r="3.6" fill="#141414"/> <circle cx="62" cy="66" r="3.6" fill="#141414"/> <circle cx="43.2" cy="64.6" r="1.2" fill="#fff"/> <circle cx="63.2" cy="64.6" r="1.2" fill="#fff"/> <path d="M38 81 Q50 93 63 81" fill="#E51820" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/> <ellipse cx="31" cy="76" rx="4.5" ry="2.6" fill="#E51820" opacity=".55"/> <ellipse cx="70" cy="76" rx="4.5" ry="2.6" fill="#E51820" opacity=".55"/> <g class="ps-mano"> <path d="M97 70 Q107 62 109 50" fill="none" stroke="#141414" stroke-width="5" stroke-linecap="round"/> <circle cx="109" cy="46" r="8.5" fill="#fff" stroke="#141414" stroke-width="3"/> <path d="M102 42 Q99 38 102 35" fill="none" stroke="#141414" stroke-width="2.5" stroke-linecap="round"/> </g></svg>';
  var ICONO_WA = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20zm4.4-5.9c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.7 2.7 0 0 0-.9 2c0 1.2.9 2.4 1 2.5.1.2 1.8 2.7 4.3 3.8 1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.4-.3z"/></svg>';

  // ---------- Botón flotante y panel ----------
  var lanzador = el('button', { type: 'button', class: 'ps-chat-lanzador', 'aria-label': 'Abrir asesor de Pool Store', 'aria-expanded': 'false', 'aria-controls': 'psChatPanel' });
  lanzador.innerHTML = '<span class="ps-chat-mascota">' + MASCOTA + '</span><span class="ps-chat-lanzador-txt">Asesor</span>';
  // Globito de saludo: aparece una vez por visita, unos segundos después de cargar
  var globo = el('button', { type: 'button', class: 'ps-chat-globo', hidden: '', 'aria-label': 'Abrir asesor: ¿Te ayudo a elegir tu mesa?' }, [
    el('strong', { text: '¡Hola! 🎱' }),
    el('span', { text: '¿Te ayudo a elegir tu mesa?' }),
  ]);

  var lista = el('div', { class: 'ps-chat-lista', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  var campo = el('textarea', { class: 'ps-chat-campo', rows: '1', maxlength: String(MAX), placeholder: 'Escribí tu consulta…', 'aria-label': 'Tu consulta' });
  var enviar = el('button', { type: 'submit', class: 'ps-chat-enviar', 'aria-label': 'Enviar' });
  enviar.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var form = el('form', { class: 'ps-chat-form' }, [campo, enviar]);
  var cerrar = el('button', { type: 'button', class: 'ps-chat-cerrar', 'aria-label': 'Cerrar asesor' });
  cerrar.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  var avatar = el('span', { class: 'ps-chat-avatar' });
  avatar.innerHTML = MASCOTA;
  var cabecera = el('div', { class: 'ps-chat-cabecera' }, [
    avatar,
    el('div', { class: 'ps-chat-titulo' }, [
      el('strong', { text: 'Asesor Pool Store' }),
      el('span', { text: 'Compra y alquiler de mesas' }),
    ]),
    cerrar,
  ]);
  var aviso = el('p', { class: 'ps-chat-aviso', text: 'Respuestas automáticas con IA. Precio, stock, flete y alquiler se confirman por WhatsApp.' });
  var panel = el('div', { class: 'ps-chat-panel', id: 'psChatPanel', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Asesor de Pool Store', hidden: '' }, [cabecera, lista, form, aviso]);
  document.body.appendChild(panel);
  document.body.appendChild(globo);
  document.body.appendChild(lanzador);

  // ---------- Mensajes ----------
  function burbuja(m) {
    var hijos = [el('p', { text: m.texto })];
    if (m.productos && m.productos.length) {
      hijos.push(el('div', { class: 'ps-chat-fichas' }, m.productos.map(function (p) {
        var a = el('a', { class: 'ps-chat-ficha', href: p.url }, [
          el('span', { class: 'ps-chat-ficha-nombre', text: p.nombre }),
          el('span', { class: 'ps-chat-ficha-precio', text: p.estado === 'agotado' ? p.precio + ' · Agotado' : p.precio }),
          el('span', { class: 'ps-chat-ficha-ver', text: 'Ver ficha →' }),
        ]);
        // Sin botón repetido: si el asesor ya ofrece "Avisame" para este producto, va una sola vez abajo
        if (!p.avisame || (m.whatsapp && m.whatsapp.url === p.avisame)) return a;
        var av = el('a', { class: 'ps-chat-wa ps-chat-wa-chico', href: p.avisame, target: '_blank', rel: 'noopener' });
        av.innerHTML = ICONO_WA;
        av.appendChild(document.createTextNode('Avisame cuando vuelva'));
        return el('div', { class: 'ps-chat-ficha-grupo' }, [a, av]);
      })));
    }
    if (m.whatsapp && m.whatsapp.url) {
      var wa = el('a', { class: 'ps-chat-wa', href: m.whatsapp.url, target: '_blank', rel: 'noopener' });
      wa.innerHTML = ICONO_WA;
      wa.appendChild(document.createTextNode(m.whatsapp.etiqueta || 'Escribir por WhatsApp'));
      hijos.push(wa);
    }
    return el('div', { class: 'ps-chat-msg ps-chat-' + (m.rol === 'user' ? 'yo' : 'bot') + (m.error ? ' ps-chat-error' : '') }, hijos);
  }

  function rapidas() {
    return el('div', { class: 'ps-chat-rapidas' }, RAPIDAS.map(function (t) {
      var b = el('button', { type: 'button', class: 'ps-chat-rapida', text: t });
      b.addEventListener('click', function () { mandar(t); });
      return b;
    }));
  }

  function pintar() {
    lista.textContent = '';
    lista.appendChild(burbuja({ rol: 'assistant', texto: SALUDO }));
    if (!estado.mensajes.length) lista.appendChild(rapidas());
    estado.mensajes.forEach(function (m) { lista.appendChild(burbuja(m)); });
    if (estado.enviando) lista.appendChild(el('div', { class: 'ps-chat-msg ps-chat-bot ps-chat-escribiendo', 'aria-label': 'El asesor está escribiendo' }, [el('span'), el('span'), el('span')]));
    lista.scrollTop = lista.scrollHeight;
  }

  function mandar(texto) {
    texto = String(texto || '').trim().slice(0, MAX);
    if (!texto || estado.enviando) return;
    if (estado.mensajes.length >= MAX_TURNOS) {
      estado.mensajes.push({ rol: 'assistant', texto: 'Para seguir, mejor hablemos por WhatsApp así te atiende el equipo.', whatsapp: { etiqueta: 'Seguir por WhatsApp', url: waUrl('Hola, vengo del asesor de la web de Pool Store.') } });
      pintar(); guardar(); return;
    }
    var historial = estado.mensajes.filter(function (m) { return !m.error; }).slice(-8).map(function (m) { return { rol: m.rol, texto: m.texto }; });
    estado.mensajes.push({ rol: 'user', texto: texto });
    estado.enviando = true;
    campo.value = '';
    pintar(); guardar();
    if (window.gtag) window.gtag('event', 'chat_mensaje');

    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje: texto, historial: historial }),
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (x) {
      if (x.ok && x.d.respuesta) {
        estado.mensajes.push({ rol: 'assistant', texto: x.d.respuesta, productos: x.d.productos || [], whatsapp: x.d.whatsapp || null });
      } else {
        falla(texto, x.d);
      }
    }).catch(function () {
      falla(texto);
    }).then(function () {
      clearTimeout(timer);
      estado.enviando = false;
      pintar(); guardar();
    });
  }

  function falla(texto, d) {
    estado.mensajes.push({
      rol: 'assistant', error: true,
      texto: (d && d.respuesta) || 'Ahora no puedo responderte por acá. Escribinos por WhatsApp y te ayudamos.',
      whatsapp: (d && d.whatsapp) || { etiqueta: 'Escribir por WhatsApp', url: waUrl('Hola, quería consultar: ' + texto) },
    });
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); mandar(campo.value); });
  campo.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); mandar(campo.value); }
  });
  campo.addEventListener('input', function () { campo.style.height = 'auto'; campo.style.height = Math.min(campo.scrollHeight, 110) + 'px'; });

  // ---------- Abrir / cerrar ----------
  function abrir() {
    ocultarGlobo();
    estado.abierto = true;
    panel.hidden = false;
    document.documentElement.classList.add('ps-chat-abierto');
    lanzador.setAttribute('aria-expanded', 'true');
    pintar();
    setTimeout(function () { campo.focus({ preventScroll: true }); }, 30);
    if (window.gtag) window.gtag('event', 'chat_abrir');
  }
  function cerrarPanel() {
    estado.abierto = false;
    panel.hidden = true;
    document.documentElement.classList.remove('ps-chat-abierto');
    lanzador.setAttribute('aria-expanded', 'false');
    lanzador.focus({ preventScroll: true });
  }
  lanzador.addEventListener('click', function () { estado.abierto ? cerrarPanel() : abrir(); });
  globo.addEventListener('click', abrir);

  function ocultarGlobo() { globo.hidden = true; }
  var yaSaludo = false;
  try { yaSaludo = sessionStorage.getItem(CLAVE + '-saludo') === '1'; } catch (e) { }
  if (!yaSaludo && !estado.mensajes.length) {
    setTimeout(function () {
      if (estado.abierto) return;
      globo.hidden = false;
      try { sessionStorage.setItem(CLAVE + '-saludo', '1'); } catch (e) { }
      setTimeout(ocultarGlobo, 9000);
    }, 3500);
  }
  cerrar.addEventListener('click', cerrarPanel);
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarPanel(); });

  // ---------- Posición: no tapar WhatsApp ni la barra fija de celular ----------
  var barra = document.getElementById('barraMovil');
  var waFlotante = document.querySelector('.wa-float');
  function visible(n) {
    if (!n) return false;
    var cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    var r = n.getBoundingClientRect();
    return r.height > 0 && r.top < window.innerHeight - 2;
  }
  function ubicar() {
    var abajo = 16;
    if (barra && visible(barra) && !barra.classList.contains('oculta')) {
      abajo = window.innerHeight - barra.getBoundingClientRect().top + 12;
    } else if (visible(waFlotante)) {
      abajo = window.innerHeight - waFlotante.getBoundingClientRect().top + 14;
    }
    document.documentElement.style.setProperty('--ps-chat-abajo', Math.round(abajo) + 'px');
  }
  ubicar();
  window.addEventListener('resize', ubicar);
  if (barra && window.MutationObserver) {
    new MutationObserver(function () { setTimeout(ubicar, 280); ubicar(); }).observe(barra, { attributes: true, attributeFilter: ['class'] });
  }
  window.addEventListener('load', ubicar);

  // Para links internos que quieran abrir el asesor: <a href="#asesor">
  if (location.hash === '#asesor') abrir();
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="#asesor"]');
    if (a) { e.preventDefault(); abrir(); }
  });
})();
