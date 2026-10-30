/*
  TEMA HALLOWEEN 2026 — temporal. Ver el comentario al principio de index.html.
  - Cambia los textos marcados con data-halloween-text.
  - Agrega telas de araña, fantasmas y un murciélago (SVG decorativos, aria-hidden).
  Si se borra este archivo, el sitio queda con los textos y el HTML normales.
*/
(function(){
  if(!document.body.classList.contains('halloween'))return;

  document.querySelectorAll('[data-halloween-text]').forEach(function(el){
    el.textContent=el.dataset.halloweenText;
  });

  // Tela de araña de esquina: radios desde (0,0) y hilos curvos entre radios
  function telaSVG(){
    var R=150,radios=7,anillos=[30,58,88,120,148],p='';
    var ang=[];
    for(var i=0;i<radios;i++)ang.push((Math.PI/2)*i/(radios-1));
    ang.forEach(function(a){p+='M0 0L'+(R*Math.cos(a)).toFixed(1)+' '+(R*Math.sin(a)).toFixed(1);});
    anillos.forEach(function(r){
      for(var i=0;i<radios-1;i++){
        var a1=ang[i],a2=ang[i+1],am=(a1+a2)/2,rc=r*0.82;
        p+='M'+(r*Math.cos(a1)).toFixed(1)+' '+(r*Math.sin(a1)).toFixed(1)+
           'Q'+(rc*Math.cos(am)).toFixed(1)+' '+(rc*Math.sin(am)).toFixed(1)+' '+
           (r*Math.cos(a2)).toFixed(1)+' '+(r*Math.sin(a2)).toFixed(1);
      }
    });
    return '<svg viewBox="0 0 150 150" width="100%" height="100%"><path d="'+p+'" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
  }
  var FANTASMA='<svg viewBox="0 0 64 80" width="100%" height="100%"><path d="M32 2C15 2 4 15 4 32v44l9-8 9 8 10-8 10 8 9-8 9 8V32C60 15 49 2 32 2z" fill="#f5f5f5"/><ellipse cx="23" cy="32" rx="4.5" ry="6.5" fill="#111"/><ellipse cx="41" cy="32" rx="4.5" ry="6.5" fill="#111"/><ellipse cx="32" cy="49" rx="5" ry="3.5" fill="#111"/></svg>';
  var MURCIELAGO='<svg viewBox="0 0 54 28" width="100%" height="100%"><path d="M27 8c-2 0-3-3-3-3l-1 4C18 6 12 2 2 4c5 3 7 8 6 13 3-2 7-2 9 1 2-3 6-3 8 1 1-2 1-3 2-3s1 1 2 3c2-4 6-4 8-1 2-3 6-3 9-1-1-5 1-10 6-13-10-2-16 2-21 5l-1-4s-1 3-3 3z" fill="currentColor"/></svg>';

  function deco(contenedor,clase,svg){
    if(!contenedor)return;
    var d=document.createElement('div');
    d.className='hw-deco '+clase;
    d.setAttribute('aria-hidden','true');
    d.innerHTML=svg;
    contenedor.appendChild(d);
  }
  var hero=document.querySelector('.hero');
  var catalogo=document.querySelector('.catalogo-sec');
  var pasos=document.querySelector('.pasos-sec');
  var faq=document.querySelector('.faq-sec');

  deco(hero,'hw-web hw-web--tr',telaSVG());
  deco(catalogo,'hw-web hw-web--tl',telaSVG());
  deco(catalogo,'hw-web hw-web--tr',telaSVG());
  deco(faq,'hw-web hw-web--tr',telaSVG());

  deco(catalogo,'hw-ghost hw-ghost--1',FANTASMA);
  deco(catalogo,'hw-ghost hw-ghost--2',FANTASMA);
  deco(faq,'hw-ghost hw-ghost--3',FANTASMA);
  deco(pasos,'hw-bat hw-bat--1',MURCIELAGO);
})();
