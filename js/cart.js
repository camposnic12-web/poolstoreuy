/* =========================================================
   CARRITO + CHECKOUT — Pool Store UY
   JS vanilla. Los precios que se muestran salen de /data/products.json,
   pero el servidor vuelve a calcular todo: acá nada es "de confianza".
   Los botones [data-add-to-cart] de las tarjetas y las fichas los genera
   scripts/build-productos.mjs (solo para productos disponibles con precio).
   ========================================================= */
(function(){
  'use strict';

  var CART_KEY = 'ps_cart';
  var BUYER_KEY = 'ps_buyer';
  var MAX_QTY = 10;
  var WA_NUMBER = '59897197654';
  // Aviso de envío del carrito y el checkout: se edita en data/checkout.json ("avisoEnvio").
  var shippingNotice = '';
  var DEPARTAMENTOS = [
    'Artigas','Canelones','Cerro Largo','Colonia','Durazno','Flores','Florida',
    'Lavalleja','Maldonado','Montevideo','Paysandú','Río Negro','Rivera','Rocha',
    'Salto','San José','Soriano','Tacuarembó','Treinta y Tres'
  ];

  var products = {};   // id -> producto (de data/products.json)
  var ready = false;   // true cuando cargó el catálogo
  var pending = [];    // clicks en "Agregar" antes de que cargue el catálogo
  var cart = [];       // [{id, qty}]
  var view = 'cart';   // 'cart' | 'checkout'
  var notice = '';
  var els = {};

  /* ---------- utilidades ---------- */
  function fmt(n){ return '$' + Number(n).toLocaleString('es-UY', {maximumFractionDigits:0}); }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function store(key, val){
    try{
      if(val === undefined){ return JSON.parse(localStorage.getItem(key)); }
      localStorage.setItem(key, JSON.stringify(val));
    }catch(e){ return null; }
  }
  function track(name, params){
    if(typeof window.gtag === 'function'){ try{ window.gtag('event', name, params); }catch(e){} }
  }
  function waLink(text){ return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(text); }
  function isBuyable(p){ return p && p.estado === 'disponible' && typeof p.precio === 'number' && p.precio > 0; }

  /* ---------- estado del carrito ---------- */
  function loadCart(){
    var saved = store(CART_KEY);
    cart = Array.isArray(saved) ? saved.filter(function(i){ return i && typeof i.id === 'string'; }) : [];
  }
  function saveCart(){ store(CART_KEY, cart); }

  // Saca del carrito lo que ya no existe o dejó de estar disponible.
  function sanitizeCart(){
    var removed = [];
    cart = cart.filter(function(i){
      var p = products[i.id];
      if(!isBuyable(p)){ removed.push(p ? p.nombre : 'un producto'); return false; }
      i.qty = Math.min(MAX_QTY, Math.max(1, parseInt(i.qty, 10) || 1));
      return true;
    });
    if(removed.length){
      notice = 'Quitamos del carrito: ' + removed.join(', ') + ' (ya no está disponible).';
      saveCart();
    }
  }

  function count(){ return cart.reduce(function(s, i){ return s + i.qty; }, 0); }
  function total(){ return cart.reduce(function(s, i){ return s + products[i.id].precio * i.qty; }, 0); }

  function add(id){
    if(!isBuyable(products[id])) return;
    var item = cart.find(function(i){ return i.id === id; });
    if(item){ item.qty = Math.min(MAX_QTY, item.qty + 1); }
    else { cart.push({id:id, qty:1}); }
    saveCart();
    track('add_to_cart', {currency:'UYU', value:products[id].precio, items:[{item_id:id, item_name:products[id].nombre, price:products[id].precio, quantity:1}]});
    render();
  }
  function setQty(id, qty){
    var item = cart.find(function(i){ return i.id === id; });
    if(!item) return;
    item.qty = Math.min(MAX_QTY, Math.max(1, qty));
    saveCart(); render();
  }
  function remove(id){
    cart = cart.filter(function(i){ return i.id !== id; });
    saveCart();
    if(!cart.length) view = 'cart';
    render();
  }

  /* ---------- DOM: drawer ---------- */
  function buildDrawer(){
    var overlay = document.createElement('div');
    overlay.className = 'cart-overlay';
    overlay.id = 'cartOverlay';

    var drawer = document.createElement('aside');
    drawer.className = 'cart-drawer';
    drawer.id = 'cartDrawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'cartTitle');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML =
      '<div class="cart-head">' +
        '<button type="button" class="cart-back" id="cartBack" hidden>&larr; Volver</button>' +
        '<h2 id="cartTitle">Tu carrito</h2>' +
        '<button type="button" id="cartClose" aria-label="Cerrar carrito">&times;</button>' +
      '</div>' +
      '<div class="cart-body" id="cartBody"></div>' +
      '<div class="cart-foot" id="cartFoot"></div>';

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    els.overlay = overlay;
    els.drawer = drawer;
    els.body = drawer.querySelector('#cartBody');
    els.foot = drawer.querySelector('#cartFoot');
    els.title = drawer.querySelector('#cartTitle');
    els.back = drawer.querySelector('#cartBack');

    overlay.addEventListener('click', close);
    drawer.querySelector('#cartClose').addEventListener('click', close);
    els.back.addEventListener('click', function(){ view = 'cart'; render(); });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && els.drawer.classList.contains('show')) close();
    });

    // Delegación de eventos dentro del drawer
    drawer.addEventListener('click', function(e){
      var t = e.target.closest('[data-action]');
      if(!t) return;
      var id = t.getAttribute('data-id');
      var item = cart.find(function(i){ return i.id === id; });
      switch(t.getAttribute('data-action')){
        case 'inc': if(item) setQty(id, item.qty + 1); break;
        case 'dec': if(item) setQty(id, item.qty - 1); break;
        case 'remove': remove(id); break;
        case 'checkout':
          view = 'checkout';
          track('begin_checkout', {currency:'UYU', value:total()});
          render();
          break;
        case 'keep-shopping': close(); break;
      }
    });
  }

  function open(){
    els.overlay.classList.add('show');
    els.drawer.classList.add('show');
    els.drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cart-open');
    if(els.toggle) els.toggle.setAttribute('aria-expanded', 'true');
    render();
    setTimeout(function(){
      var f = els.drawer.querySelector('#cartClose');
      if(f) f.focus();
    }, 50);
  }
  function close(){
    els.overlay.classList.remove('show');
    els.drawer.classList.remove('show');
    els.drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cart-open');
    if(els.toggle){ els.toggle.setAttribute('aria-expanded', 'false'); els.toggle.focus(); }
  }

  /* ---------- render ---------- */
  function renderBadge(){
    if(!els.count) return;
    var n = count();
    var prev = els.count.textContent;
    els.count.textContent = n;
    els.count.hidden = n === 0;
    if(String(n) !== prev && n > 0){
      els.count.classList.remove('bump'); void els.count.offsetWidth; els.count.classList.add('bump');
    }
  }

  function render(){
    renderBadge();
    if(!els.drawer) return;
    if(!cart.length) view = 'cart';
    els.back.hidden = view !== 'checkout';
    els.title.textContent = view === 'checkout' ? 'Tus datos' : 'Tu carrito';
    if(view === 'checkout') renderCheckout(); else renderCart();
  }

  function renderCart(){
    var html = notice ? '<div class="cart-notice">' + esc(notice) + '</div>' : '';
    notice = '';

    if(!cart.length){
      els.body.innerHTML = html +
        '<div class="cart-empty"><strong>Tu carrito está vacío</strong>Elegí tu mesa o accesorios en el catálogo.</div>';
      els.foot.innerHTML = '<button type="button" class="btn-cart-primary" data-action="keep-shopping">Ver catálogo</button>';
      return;
    }

    cart.forEach(function(i){
      var p = products[i.id];
      html +=
        '<div class="cart-item">' +
          '<img src="/' + esc(p.imagen) + '" alt="" loading="lazy">' +
          '<div>' +
            '<div class="cart-item-name">' + esc(p.nombre) + '</div>' +
            '<div class="cart-item-unit">' + fmt(p.precio) + ' c/u</div>' +
            '<div class="qty" role="group" aria-label="Cantidad de ' + esc(p.nombre) + '">' +
              '<button type="button" data-action="dec" data-id="' + esc(i.id) + '" aria-label="Restar uno"' + (i.qty <= 1 ? ' disabled' : '') + '>&minus;</button>' +
              '<span aria-live="polite">' + i.qty + '</span>' +
              '<button type="button" data-action="inc" data-id="' + esc(i.id) + '" aria-label="Sumar uno"' + (i.qty >= MAX_QTY ? ' disabled' : '') + '>+</button>' +
            '</div>' +
          '</div>' +
          '<div class="cart-item-right">' +
            '<div class="cart-item-sub">' + fmt(p.precio * i.qty) + '</div>' +
            '<button type="button" class="cart-remove" data-action="remove" data-id="' + esc(i.id) + '">Eliminar</button>' +
          '</div>' +
        '</div>';
    });
    els.body.innerHTML = html;

    els.foot.innerHTML =
      '<div class="cart-total"><span>Total</span><strong>' + fmt(total()) + '</strong></div>' +
      (shippingNotice ? '<p class="cart-shipping-note">🚚 ' + esc(shippingNotice) + '</p>' : '') +
      '<button type="button" class="btn-cart-primary" data-action="checkout">Continuar compra</button>' +
      '<a class="cart-wa-link" target="_blank" rel="noopener" href="' + esc(waLink(cartWaText())) + '">¿Preferís comprar por WhatsApp? Escribinos</a>';
  }

  function cartWaText(){
    var lines = cart.map(function(i){ return '• ' + i.qty + ' x ' + products[i.id].nombre; });
    return 'Hola, vengo de la web. Quiero comprar:\n' + lines.join('\n') + '\nTotal: ' + fmt(total());
  }

  function field(name, label, input, opt){
    return '<div class="co-field" data-field="' + name + '">' +
      '<label for="co_' + name + '">' + label + (opt ? ' <small>(opcional)</small>' : '') + '</label>' +
      input + '<div class="co-error" id="co_' + name + '_err" aria-live="polite"></div></div>';
  }

  function renderCheckout(){
    var b = store(BUYER_KEY) || {};
    var v = function(k){ return esc(b[k] || ''); };
    var entrega = b.entrega === 'retiro' ? 'retiro' : 'envio';

    var deptos = '<option value="">Elegí un departamento</option>' + DEPARTAMENTOS.map(function(d){
      return '<option' + (b.departamento === d ? ' selected' : '') + '>' + esc(d) + '</option>';
    }).join('');

    var summary = cart.map(function(i){
      var p = products[i.id];
      return '<div><span>' + i.qty + ' × ' + esc(p.nombre) + '</span><span>' + fmt(p.precio * i.qty) + '</span></div>';
    }).join('') + '<div class="co-summary-total"><span>Total</span><span>' + fmt(total()) + '</span></div>';

    els.body.innerHTML =
      '<form class="co-form" id="coForm" novalidate>' +
        '<div class="co-summary">' + summary + '</div>' +

        '<div class="co-section-title">Tus datos</div>' +
        field('nombre', 'Nombre y apellido', '<input id="co_nombre" name="nombre" autocomplete="name" maxlength="80" value="' + v('nombre') + '">') +
        field('email', 'Email', '<input id="co_email" name="email" type="email" autocomplete="email" maxlength="120" value="' + v('email') + '">') +
        field('telefono', 'Celular / teléfono', '<input id="co_telefono" name="telefono" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="09X XXX XXX" value="' + v('telefono') + '">') +
        field('cedula', 'Cédula', '<input id="co_cedula" name="cedula" inputmode="numeric" maxlength="12" placeholder="1.234.567-8" value="' + v('cedula') + '">', true) +

        '<div class="co-section-title">Entrega</div>' +
        (shippingNotice ? '<div class="co-shipping-notice">🚚 ' + esc(shippingNotice) + '</div>' : '') +
        '<div class="co-delivery" role="radiogroup" aria-label="Método de entrega">' +
          '<label><input type="radio" name="entrega" value="envio"' + (entrega === 'envio' ? ' checked' : '') + '> 🚚 Envío a domicilio</label>' +
          '<label><input type="radio" name="entrega" value="retiro"' + (entrega === 'retiro' ? ' checked' : '') + '> 🏬 Retiro en el local</label>' +
        '</div>' +
        '<div class="co-shipping" id="coShipping"' + (entrega === 'retiro' ? ' hidden' : '') + '>' +
          field('departamento', 'Departamento', '<select id="co_departamento" name="departamento">' + deptos + '</select>') +
          field('ciudad', 'Ciudad / localidad', '<input id="co_ciudad" name="ciudad" autocomplete="address-level2" maxlength="80" value="' + v('ciudad') + '">') +
          field('direccion', 'Dirección', '<input id="co_direccion" name="direccion" autocomplete="street-address" maxlength="150" placeholder="Calle, número, apto." value="' + v('direccion') + '">') +
        '</div>' +
        field('comentarios', 'Comentarios / horario preferido', '<textarea id="co_comentarios" name="comentarios" maxlength="500" placeholder="Ej: de tarde, después de las 15 h. Tocar timbre 2.">' + v('comentarios') + '</textarea>', true) +

        '<div class="co-alert" id="coAlert" role="alert" hidden></div>' +
      '</form>';

    els.foot.innerHTML =
      '<div class="cart-total"><span>Total a pagar</span><strong>' + fmt(total()) + '</strong></div>' +
      '<p class="cart-shipping-note">Vas a pagar de forma segura en Mercado Pago (tarjetas, Abitab, RedPagos y más).</p>' +
      '<button type="submit" form="coForm" class="btn-mp" id="coPay">Pagar con Mercado Pago</button>';

    var form = els.body.querySelector('#coForm');
    form.addEventListener('change', function(e){
      if(e.target.name === 'entrega'){
        els.body.querySelector('#coShipping').hidden = e.target.value !== 'envio';
      }
      saveBuyerDraft(form);
    });
    form.addEventListener('input', function(e){
      var f = e.target.closest('.co-field');
      if(f && f.classList.contains('invalid')){ f.classList.remove('invalid'); setError(e.target.name, ''); }
    });
    form.addEventListener('submit', function(e){ e.preventDefault(); submit(form); });
  }

  /* ---------- validación ---------- */
  function readForm(form){
    var fd = new FormData(form);
    var d = {};
    ['nombre','email','telefono','cedula','entrega','departamento','ciudad','direccion','comentarios'].forEach(function(k){
      d[k] = String(fd.get(k) || '').trim();
    });
    if(d.entrega === 'retiro'){ d.departamento = ''; d.ciudad = ''; d.direccion = ''; }
    return d;
  }
  function saveBuyerDraft(form){ store(BUYER_KEY, readForm(form)); }

  function ciValida(raw){
    var digits = raw.replace(/\D/g, '');
    if(digits.length < 7 || digits.length > 8) return false;
    digits = digits.padStart(8, '0');
    var w = [2,9,8,7,6,3,4], s = 0;
    for(var i = 0; i < 7; i++) s += parseInt(digits[i], 10) * w[i];
    return (10 - (s % 10)) % 10 === parseInt(digits[7], 10);
  }

  function validate(d){
    var err = {};
    if(d.nombre.length < 3 || d.nombre.split(/\s+/).length < 2) err.nombre = 'Ingresá tu nombre y apellido.';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) err.email = 'Ingresá un email válido.';
    var tel = d.telefono.replace(/[^\d]/g, '');
    if(tel.length < 8 || tel.length > 12) err.telefono = 'Ingresá un teléfono válido (ej: 097 197 654).';
    if(d.cedula && !ciValida(d.cedula)) err.cedula = 'La cédula no parece válida. Revisala o dejala vacía.';
    if(d.entrega !== 'envio' && d.entrega !== 'retiro') err.entrega = 'Elegí un método de entrega.';
    if(d.entrega === 'envio'){
      if(DEPARTAMENTOS.indexOf(d.departamento) === -1) err.departamento = 'Elegí un departamento.';
      if(d.ciudad.length < 2) err.ciudad = 'Ingresá tu ciudad o localidad.';
      if(d.direccion.length < 5) err.direccion = 'Ingresá la dirección de entrega.';
    }
    return err;
  }

  function setError(name, msg){
    var box = els.body.querySelector('#co_' + name + '_err');
    var f = els.body.querySelector('[data-field="' + name + '"]');
    if(box) box.textContent = msg;
    if(f) f.classList.toggle('invalid', !!msg);
    var input = els.body.querySelector('#co_' + name);
    if(input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function showAlert(html){
    var a = els.body.querySelector('#coAlert');
    a.innerHTML = html;
    a.hidden = !html;
    if(html) a.scrollIntoView({behavior:'smooth', block:'center'});
  }

  /* ---------- envío al backend ---------- */
  function submit(form){
    var d = readForm(form);
    store(BUYER_KEY, d);
    ['nombre','email','telefono','cedula','departamento','ciudad','direccion'].forEach(function(k){ setError(k, ''); });
    showAlert('');

    var err = validate(d);
    var keys = Object.keys(err);
    if(keys.length){
      keys.forEach(function(k){ setError(k, err[k]); });
      var first = els.body.querySelector('#co_' + keys[0]);
      if(first) first.focus();
      return;
    }

    var btn = els.foot.querySelector('#coPay');
    btn.disabled = true;
    btn.textContent = 'Conectando con Mercado Pago…';

    fetch('/api/create-preference', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        items: cart.map(function(i){ return {id:i.id, cantidad:i.qty}; }),
        comprador: d
      })
    })
    .then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(data){ return {ok:res.ok, data:data}; });
    })
    .then(function(r){
      if(!r.ok || !r.data.init_point){
        var e = new Error(r.data.error || 'No pudimos iniciar el pago.');
        e.fields = r.data.fields;
        throw e;
      }
      track('add_payment_info', {currency:'UYU', value:total(), payment_type:'mercadopago'});
      // Para registrar la compra en GA desde /pago/exito.html (solo analítica)
      store('ps_last_order', {
        pedido: r.data.pedido || null,
        total: total(),
        items: cart.map(function(i){ return {item_id:i.id, item_name:products[i.id].nombre, price:products[i.id].precio, quantity:i.qty}; })
      });
      window.location.href = r.data.init_point;
    })
    .catch(function(e){
      if(e.fields){ Object.keys(e.fields).forEach(function(k){ setError(k, e.fields[k]); }); }
      showAlert(esc(e.message || 'No pudimos iniciar el pago.') +
        ' Probá de nuevo en unos minutos o <a target="_blank" rel="noopener" href="' + esc(waLink(cartWaText())) + '">escribinos por WhatsApp</a>.');
      btn.disabled = false;
      btn.textContent = 'Pagar con Mercado Pago';
    });
  }

  /* ---------- botones "Agregar al carrito" / "Comprar" (generados) ---------- */
  function addButtons(){ return document.querySelectorAll('[data-add-to-cart]'); }

  // Por si el HTML quedó desactualizado respecto del JSON: nunca ofrecer algo que no se puede comprar.
  function syncButtons(){
    addButtons().forEach(function(btn){ btn.hidden = !isBuyable(products[btn.getAttribute('data-add-to-cart')]); });
  }

  function onAddClick(btn){
    var id = btn.getAttribute('data-add-to-cart');
    if(!ready){ if(pending.indexOf(id) === -1) pending.push(id); return; }
    if(!isBuyable(products[id])){ btn.hidden = true; return; }
    add(id);
    var label = btn.querySelector('.btn-cart-text');
    if(label){
      if(!btn._original) btn._original = label.innerHTML;
      btn.classList.add('added');
      label.textContent = '¡Agregado!';
      clearTimeout(btn._reset);
      btn._reset = setTimeout(function(){ btn.classList.remove('added'); label.innerHTML = btn._original; }, 1400);
    }
    open();
  }

  /* ---------- init ---------- */
  function init(){
    els.toggle = document.getElementById('cartToggle');
    els.count = document.getElementById('cartCount');
    loadCart();
    buildDrawer();
    if(els.toggle) els.toggle.addEventListener('click', open);
    document.addEventListener('click', function(e){
      var btn = e.target.closest('[data-add-to-cart]');
      if(btn) onAddClick(btn);
    });

    function getJSON(url){
      return fetch(url, {cache:'no-cache'}).then(function(r){ if(!r.ok) throw new Error(url + ' HTTP ' + r.status); return r.json(); });
    }
    // El aviso de envío es opcional: si no carga, el carrito funciona igual sin el aviso.
    var checkoutConfig = getJSON('/data/checkout.json').catch(function(e){ console.warn('[carrito]', e.message); return {}; });

    Promise.all([getJSON('/data/products.json'), checkoutConfig])
      .then(function(res){
        (res[0].products || []).forEach(function(p){ products[p.id] = p; });
        shippingNotice = typeof res[1].avisoEnvio === 'string' ? res[1].avisoEnvio.trim() : '';
        ready = true;
        sanitizeCart();
        syncButtons();
        var queued = pending; pending = [];
        queued.forEach(function(id){ if(isBuyable(products[id])) add(id); });
        render();
        if(queued.length || location.hash === '#carrito') open();
      })
      .catch(function(e){
        // Si falla, la web sigue funcionando con WhatsApp; solo no mostramos el carrito.
        console.error('[carrito] No se pudo cargar el catálogo:', e);
        if(els.toggle) els.toggle.hidden = true;
        addButtons().forEach(function(btn){ btn.hidden = true; });
      });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
