/*
  Videos livianos (hero "Entrega real" y, si se suma, la sección "Entregas reales").

  Marcado: un contenedor con data-video="/videos/<nombre>" y adentro la foto/poster (<picture><img>).
  Este script busca /videos/<nombre>.webm y /videos/<nombre>.mp4.

  - No baja nada hasta que el contenedor entra en pantalla y la página terminó de cargar:
    el video nunca compite con el texto del hero (LCP).
  - Con ahorro de datos o prefers-reduced-motion queda la foto con un botón de play.
  - El <video> reemplaza a la foto recién cuando ya puede reproducirse (sin parpadeo).
*/
(function () {
  var conts = document.querySelectorAll('[data-video]');
  if (!conts.length) return;

  var ahorro = !!(navigator.connection && navigator.connection.saveData);
  var quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var auto = !ahorro && !quieto;
  var PLAY = '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

  function crearVideo(c, conControles) {
    var base = c.getAttribute('data-video');
    var img = c.querySelector('img');
    var v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('loop', '');
    v.preload = 'auto';
    if (conControles) v.controls = true;
    if (img) {
      v.poster = img.currentSrc || img.src;
      v.width = img.width; v.height = img.height;
    }
    v.setAttribute('aria-label', c.getAttribute('data-video-label') || (img && img.alt) || 'Video');
    [['webm', 'video/webm'], ['mp4', 'video/mp4']].forEach(function (t) {
      var s = document.createElement('source');
      s.src = base + '.' + t[0]; s.type = t[1];
      v.appendChild(s);
    });
    return v;
  }

  function montar(c, conControles) {
    if (c.getAttribute('data-video-montado')) return;
    c.setAttribute('data-video-montado', '1');
    var v = crearVideo(c, conControles);
    var pic = c.querySelector('picture') || c.querySelector('img');
    v.style.position = 'absolute'; v.style.inset = '0'; v.style.opacity = '0';
    c.appendChild(v);
    var listo = function () {
      v.style.position = ''; v.style.inset = ''; v.style.opacity = '';
      if (pic && pic.parentNode) pic.parentNode.removeChild(pic);
    };
    v.addEventListener('playing', listo, { once: true });
    var p = v.play();
    if (p && p.catch) p.catch(function () { listo(); v.controls = true; }); // si el navegador no deja autoplay, quedan los controles
  }

  function botonPlay(c) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'phone-play'; b.innerHTML = PLAY;
    b.setAttribute('aria-label', 'Reproducir video');
    b.addEventListener('click', function () { b.hidden = true; montar(c, true); });
    c.appendChild(b);
  }

  function iniciar() {
    if (!auto) { conts.forEach(botonPlay); return; }
    if (!('IntersectionObserver' in window)) { conts.forEach(function (c) { montar(c); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { io.unobserve(e.target); montar(e.target); }
      });
    }, { rootMargin: '200px 0px' });
    conts.forEach(function (c) { io.observe(c); });
    // Fuera de pantalla: pausar (ahorra batería); al volver, seguir
    var pausa = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var v = e.target.querySelector('video');
        if (!v || v.controls) return;
        if (e.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause();
      });
    });
    conts.forEach(function (c) { pausa.observe(c); });
  }

  if (document.readyState === 'complete') iniciar();
  else window.addEventListener('load', iniciar, { once: true });
})();
