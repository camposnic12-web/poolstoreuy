# Pendientes del catálogo (notas internas)

Lo que falta confirmar o completar en `data/products.json`. Esto **no se publica**: `/docs/*` da 404 en el sitio.
`data/products.json`, en cambio, sí es público (lo lee el carrito), así que ahí no van notas internas: el generador no genera si encuentra un campo `"TODO"`.
Cuando algo se resuelve, borralo de esta lista.

## Generales

- [ ] Confirmar con el cliente el costo del envío y si el armado incluido aplica en todo el país.
- [ ] Confirmar que las fotos de clientes (mesa instalada) son del mismo modelo que las mesas verde y azul. Mientras tanto están fuera de la galería: ver docs/PRODUCTOS.md, "Fotos de clientes pendientes".

## Video del hero ("Entrega real")

- [ ] **Falta el video.** `~/Downloads/video-entrega.mov` no estaba en la Mac el 2026-11-25. Mientras tanto, el marco de celular del hero muestra una foto real de entrega (`images/entregas/entrega-quincho-*.webp`, mesa verde recién instalada en un quincho; misma serie que las fotos de "Nuestras mesas en acción").
  Para poner el video:
  1. `FFMPEG=$(npx -y -p ffmpeg-static node -p "require('ffmpeg-static')") scripts/video-entrega.sh ~/Downloads/video-entrega.mov entrega` → `videos/entrega.mp4`, `.webm` y el poster. Revisá que el MP4 pese ≤ 1,5 MB.
  2. En `index.html`, al `<div class="phone">` del hero sumale `data-video="/videos/entrega"` y cambiá la foto de adentro por `videos/entrega-poster.webp` (+ `.jpg`), con `width="540" height="960"`.
  3. `js/video.js` ya hace el resto: no baja el video hasta que la página cargó y el marco está en pantalla, autoplay muteado en loop, y con ahorro de datos o movimiento reducido deja el poster con un botón de play.
  4. Correr las pruebas: la home tiene que seguir dando el H1 como LCP.
- [ ] Si llegan más videos de entregas (`video-entrega-2…`): sección "Entregas reales" con 2–3 videos en fila (en celular, carrusel horizontal), cada uno con `data-video` (el mismo script los carga recién cuando entran en pantalla).

## Por producto

### Mesa Pool Profesional — Paño Verde (`mesa-pool-pano-verde`)

- [ ] Completar materiales, altura y peso
- [ ] Confirmar la lista de accesorios incluidos
- [ ] Fotos de clientes fuera de la galería hasta que el cliente confirme el modelo (ver docs/PRODUCTOS.md)

### Mesa Pool Profesional — Paño Azul (`mesa-pool-pano-azul`)

- [ ] Completar materiales, altura y peso
- [ ] Confirmar la lista de accesorios incluidos
- [ ] Fotos de clientes fuera de la galería hasta que el cliente confirme el modelo (ver docs/PRODUCTOS.md)

### Mesa Pool Plegable + Ping Pong (`mesa-pool-plegable-ping-pong`)

- [ ] Detallar los accesorios de pool y de ping pong
- [ ] Más fotos (plegada y en modo ping pong)
- [ ] Confirmar si necesita armado

### Mesa 3 en 1 — Pool + Ping Pong + Comedor (`mesa-3-en-1-pool-ping-pong-comedor`)

- [ ] Completar medidas exactas (largo, ancho y alto)
- [ ] Detallar los accesorios incluidos

### Mesa de Pool — Paño Rojo (`mesa-pool-pano-rojo`)

- [ ] Completar medidas exactas
- [ ] Confirmar la lista de accesorios incluidos
- [ ] Más fotos (detalle del paño, troneras, patas)
- [ ] **Pedirle al cliente una foto mejor de la mesa roja** (en un interior o con fondo limpio). La actual (2026-11-25) es un recorte de `PLS_mesa-roja_exterior_horizontal-2.jpg` (CHULA_FABRICA): se ve algo del piso de un estacionamiento. La foto anterior era un recorte del banner de Halloween y se sacó.

### Mesa de Pool Profesional con Tapa (`mesa-pool-profesional-con-tapa`)

- [ ] Completar medidas y color de paño
- [ ] Más fotos (con y sin tapa)

### Futbolito (`futbolito`)

- [ ] Completar medidas
- [ ] Qué incluye (pelotas, contadores)
- [ ] Confirmar si se entrega armado

### Mesa de Pool + Futbolito (`combo-mesa-pool-futbolito`)

- [ ] Aclarar qué modelo y color de mesa entra en el combo

### Tejo Electrónico (`tejo-electronico`)

- [ ] Alimentación (220 V), marcador electrónico y altura
- [ ] Confirmar si se entrega armado

### Par de Tacos — Modelo Básico (`par-de-tacos-basicos`)

- [ ] Completar largo, peso y diámetro de suela

### Par de Tacos — Modelo Premium (`par-de-tacos-premium`)

- [ ] Completar material, largo y peso
- [ ] Listar los colores disponibles

### Lámpara Pool — 3 Pantallas (`lampara-pool-3-pantallas`)

- [ ] Completar largo, tipo de lámpara/rosca y si incluye lámparas
- [ ] Foto más grande (la actual es de 300 px)

### Lámpara Pool — 2 Pantallas (`lampara-pool-2-pantallas`)

- [ ] Completar largo, tipo de lámpara/rosca y si incluye lámparas
- [ ] Foto más grande (la actual es de 300 px)

### Taquera de Pared (`taquera-de-pared`)

- [ ] Completar cuántos tacos entran y medidas

### Funda Cobertor para Mesa de Pool (`funda-cobertor-mesa-de-pool`)

- [ ] Completar material
