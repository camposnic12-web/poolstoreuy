# Productos: cómo editarlos

Todo el catálogo sale de **`data/products.json`**. De ahí se generan:

- las páginas `/productos/<slug>/index.html` (con la plantilla `templates/producto.html`),
- las tarjetas del catálogo y el JSON-LD de productos de `index.html` (entre los marcadores `PRODUCTOS:INICIO/FIN` y `JSONLD-PRODUCTOS:INICIO/FIN`),
- `sitemap.xml`.

Esos archivos generados **no se editan a mano**: tienen el comentario "GENERADO por scripts/build-productos.mjs".

## Regenerar (siempre, después de cualquier cambio)

```sh
node scripts/build-productos.mjs          # escribe las páginas, la home y el sitemap
node scripts/build-productos.mjs --check  # comprueba que todo coincide con el JSON (no escribe nada)
```

Solo hace falta Node 18 o más nuevo, sin `npm install`. Después de regenerar hay que commitear **el JSON y los archivos generados juntos**: Netlify publica tal cual lo que está en el repo.

Si el JSON tiene un error (precio con texto, foto que no existe, slug con tildes, etc.), el script lo avisa y no genera nada.

## Cambiar un precio

En el producto, cambiá `"precio"` (número entero en pesos, sin punto ni `$`): `"precio": 23000`.
Si el mensaje de WhatsApp menciona el precio (`"whatsappMensaje"`), actualizalo también. Regenerá.

## Marcar un producto agotado (o volver a disponible)

Cambiá `"estado"` a `"agotado"`, `"disponible"` o `"proximamente"`. Regenerá.

Si está agotado, la tarjeta y la página muestran el badge "Agotado", el precio normal y el botón "Avisame cuando vuelva", con un mensaje de WhatsApp ya armado. La página sigue en Google, marcada como `OutOfStock`.

Solo los productos `"disponible"` con precio tienen botón de compra online ("Agregar al carrito" en las tarjetas, "Comprar" en la ficha). Los agotados y los "próximamente" no lo tienen, y el servidor de pagos también los rechaza si alguien intenta comprarlos igual.

## Agregar fotos a un producto

1. Copiá la foto a `images/` (JPG, idealmente de **1200 px o más** de ancho, para que el zoom tenga detalle). Usá un nombre sin espacios ni tildes, por ejemplo `mesa-pool-pano-rojo-detalle.jpg`.
2. Agregala a la lista `"fotos"` del producto, con su ancho y alto en píxeles y un texto alternativo que describa la foto:
   ```json
   { "src": "/images/mesa-pool-pano-rojo-detalle.jpg", "w": 1200, "h": 900, "alt": "Detalle del paño rojo y las troneras" }
   ```
   - La **primera** foto de la lista es la principal: la de la tarjeta, la de Google y la que aparece al compartir el link. Tiene que ser una foto del producto, no una foto de cliente.
   - Las fotos de clientes llevan además `"pie"` (por ejemplo `"Instalada por Pool Store en un quincho"`). Se muestra debajo de la foto y conviene que el `alt` diga lo mismo.
   - El ancho y el alto se ven en Finder (Cmd+I, "Más información") o con `sips -g pixelWidth -g pixelHeight foto.jpg`.
3. Opcional (recomendado): versión WebP, más liviana. Guardala como `images/productos/<mismo-nombre>.webp`. Si la foto mide más de 600 px, guardá también una de 480 px de ancho como `images/productos/<mismo-nombre>-480.webp`. Se pueden hacer en https://squoosh.app (calidad 80) o con `cwebp -q 80 foto.jpg -o foto.webp` (`brew install webp`). Si no existen, la página usa el JPG.
4. Regenerá.

El zoom nunca agranda una foto más allá de su tamaño real, para que no se vea pixelada. Por eso las fotos chicas casi no tienen zoom.

## Fotos de clientes pendientes (mesas verde y azul)

Hay 6 fotos de mesas instaladas en casas y locales de clientes que **están fuera de la galería** hasta que el cliente confirme que son del mismo modelo que la mesa de cada página. Los archivos siguen en `images/` y sus WebP en `images/productos/`, así que no hay que volver a generarlas.

Para volver a ponerlas, una vez confirmadas:

1. En `data/products.json`, en la mesa `"slug": "mesa-pool-pano-verde"`, agregá una coma al final de la foto que ya está en `"fotos"` y pegá debajo:
   ```json
   { "src": "/images/mesa-instalada-en-quincho-pano-verde.jpg", "w": 400, "h": 400, "alt": "Instalada por Pool Store en un quincho", "pie": "Instalada por Pool Store en un quincho" },
   { "src": "/images/mesa-instalada-en-local-pano-verde.jpg", "w": 400, "h": 400, "alt": "Instalada por Pool Store en un local", "pie": "Instalada por Pool Store en un local" },
   { "src": "/images/mesa-instalada-con-bar-pano-verde.jpg", "w": 400, "h": 400, "alt": "Instalada por Pool Store junto a un bar", "pie": "Instalada por Pool Store junto a un bar" }
   ```
2. En la mesa `"slug": "mesa-pool-pano-azul"`, lo mismo con:
   ```json
   { "src": "/images/mesa-instalada-en-hogar-pano-azul.jpg", "w": 400, "h": 400, "alt": "Instalada por Pool Store en un hogar", "pie": "Instalada por Pool Store en un hogar" },
   { "src": "/images/mesa-instalada-en-barberia-pano-azul.jpg", "w": 400, "h": 400, "alt": "Instalada por Pool Store en una barbería", "pie": "Instalada por Pool Store en una barbería" },
   { "src": "/images/mesa-instalada-en-restaurant-pano-azul.jpg", "w": 400, "h": 400, "alt": "Instalada por Pool Store en un restaurant", "pie": "Instalada por Pool Store en un restaurant" }
   ```
   Tienen que ir **después** de la foto del producto: la primera de la lista es la principal, y el script no deja que una foto de cliente sea la principal.
3. Si el cliente confirma solo algunas, pegá solo esas. Si alguna resulta ser de otro modelo, no la uses en ninguna de las dos mesas.
4. Borrá de la lista `"TODO"` (la general y la de cada mesa) el aviso de fotos de clientes, regenerá con `node scripts/build-productos.mjs` y commiteá.

## Agregar un producto nuevo

Copiá un producto parecido dentro de `"products"` y cambiá:
- `id`: único, sin espacios. Lo usa también el carrito de Mercado Pago.
- `slug`: es la URL. Va en minúsculas, sin tildes, con guiones.
- `nombre` (el de la tarjeta), `nombrePagina` (el del título de la página), `categoria`, `etiqueta`, `precio`, `fotos`, las descripciones, `caracteristicas`, `incluye`, `whatsappMensaje` y `botonTexto`.

Regenerá. La página, la tarjeta, los productos relacionados y el sitemap se actualizan solos.

Las `caracteristicas` con `"valor": ""` no se muestran. Sirven como recordatorio de datos que faltan, junto con la lista `"TODO"` de cada producto.

Los pendientes van **solo** en la lista `"TODO"`, que nunca se publica. Si un texto que se muestra (nombre, descripción, característica, alt, etc.) contiene "TODO", el script avisa y no genera nada.

## Tema de temporada (Halloween)

En las páginas de producto depende solo de `templates/producto.html`: son 3 líneas marcadas `HALLOWEEN`. Para quitarlo, borrá esas líneas y regenerá. Los pasos de la home están en el comentario al principio de `index.html`.

## Pruebas

`tests/paginas-producto.test.mjs` revisa con Chrome headless, a 1440 y 390 px:
- errores de JS, links internos, canonical, H1 y sitemap;
- JSON-LD;
- zoom con mouse y con touch;
- agotados.

Además saca capturas. La forma de correrlo está al principio del archivo.

## Carrito y pagos online (Mercado Pago)

- Los botones de compra los genera el script (atributo `data-add-to-cart` con el `id`): **no se escriben a mano**. Los maneja `js/cart.js`, que la home y las fichas cargan junto con `css/cart.css`.
- Los precios del carrito y del cobro salen del mismo `data/products.json`. El servidor (`netlify/functions/lib/catalogo.mjs`) nunca usa el precio que manda el navegador. Si cambiás un precio, regenerá, commiteá y esperá el deploy: la función de pago toma el JSON en cada deploy.
- No cambies el `id` de un producto que ya se vendió: lo usan el carrito guardado en el navegador de los clientes y los pedidos.

### Aviso de envío del carrito

El texto que aparece en el carrito y en el checkout ("Envío a Montevideo/armado incluido…") está en **`data/checkout.json`**, campo `"avisoEnvio"`. Para cambiarlo, editá ese texto y commiteá (no hace falta regenerar). Si lo dejás vacío (`""`), no se muestra ningún aviso.

Ojo: ese aviso es distinto del texto de envío de las fichas (`"envio"` en `data/products.json`). Si cambia la política de envíos, revisá los dos.

Cobrar el envío por zona todavía **no está implementado**. Está preparado: ver los pasos en `netlify/functions/lib/envio.mjs`.
