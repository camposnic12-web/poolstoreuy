# Asesor de compra y alquiler (chatbot)

Botón "Asesor" flotante en la home y en todas las fichas. Ayuda a elegir mesa según el espacio, explica lo que
ofrece la tienda y deriva a WhatsApp para confirmar precio final, stock, flete, entrega o alquiler.
`/docs/*` no se publica (da 404).

## Cómo está armado

| Parte | Archivo |
|---|---|
| Función (servidor) | `netlify/functions/chat.mjs` → `POST /api/chat` |
| Conocimiento, instrucciones y validación | `netlify/functions/lib/asesor.mjs` |
| Widget | `js/chat.js` + `css/chat.css` (cargados en `index.html` y `templates/producto.html`) |
| Pruebas | `tests/chat.test.mjs` (`node tests/chat.test.mjs`, sin dependencias ni clave real) |

**Fuentes de información (no hay copias a mano):**
- `data/products.json`: productos, precios, estado (agotado → "Avisame cuando vuelva"), medidas, qué incluye,
  texto de envío/armado y el número de WhatsApp. Si cambia algo ahí, regenerás como siempre y el próximo deploy
  lo toma también el asesor.
- La home publicada: preguntas frecuentes (el JSON-LD `FAQPage`) y la sección de alquiler (texto, modalidades y
  mensaje del botón "Consultar por alquiler"). La función la lee y la guarda 10 minutos.

**Qué hace la web y qué hace el modelo:**
- El modelo (OpenAI, Responses API con salida estructurada) redacta la respuesta y elige qué fichas enlazar y si
  ofrecer WhatsApp. Solo puede elegir slugs del catálogo: los links y precios de las tarjetas los arma el servidor.
- "¿Qué mesa me entra?": la cuenta la hace la web, no el modelo. Toma las medidas de cada ficha
  (`caracteristicas → Medidas`) y el largo del taco (`caracteristicas → Largo` de los tacos).
  **Hoy el largo del taco está vacío**, así que el asesor solo dice si la mesa entra en el ambiente y deriva a
  WhatsApp para confirmar que se pueda jugar cómodo. Cuando se complete el largo del taco, empieza a decir
  "cómodo" o "justo" (regla: largo de la mesa + 2 tacos, ancho de la mesa + 2 tacos).
  Mesas sin medidas numéricas (roja, 3 en 1, con tapa, futbolito, combo) → siempre deriva.
- El mensaje de WhatsApp sale prearmado con el modelo, las medidas o los datos de alquiler que dio el visitante.

## Variables de entorno (Netlify)

Netlify → Project configuration → Environment variables → Add a variable. Scope: **Functions**.

| Variable | Obligatoria | Valor |
|---|---|---|
| `OPENAI_API_KEY` | sí (secreta: marcar "Contains secret values") | API key de platform.openai.com (proyecto "Pool Store") |
| `OPENAI_MODEL` | no | por defecto `gpt-6-luna` (el más económico de OpenAI para respuestas cortas, con salidas estructuradas) |
| `OPENAI_REASONING_EFFORT` | no | por defecto `none` (rápido y barato). Si un modelo no acepta el parámetro, poné la variable vacía |

Sin `OPENAI_API_KEY` el sitio funciona igual: el asesor muestra "Ahora no puedo responderte por acá" con un botón
de WhatsApp que lleva la consulta escrita. Después de cargar o cambiar variables: **Deploys → Trigger deploy**.

En platform.openai.com conviene poner un tope de gasto mensual (Settings → Limits).

## Límites de consumo

- Mensaje del visitante: hasta 500 caracteres. Conversación: hasta 30 mensajes (después ofrece seguir por WhatsApp).
- Al modelo van solo los últimos 8 mensajes y la respuesta tiene un tope de 400 tokens.
- Frecuencia: regla de Netlify de 20 pedidos por minuto por IP (en `export const config` de la función; el plan
  Personal permite 2 reglas por proyecto y la otra la usa `create-preference` en la rama de pagos) + un límite de
  8 por minuto por IP dentro de la función.
- `store: false`: OpenAI no guarda las conversaciones.
- Si OpenAI tarda más de 8,5 s o falla, se ofrece WhatsApp.

## Pruebas

```
node tests/chat.test.mjs
```
Simula OpenAI y la home: compra, alquiler, medidas, agotado, servicio caído, sin clave, límites.
La prueba de interfaz (escritorio y celular) se hizo con Playwright contra un servidor local con OpenAI simulado.
**Falta** probar con la clave real en la Deploy Preview (ver docs/PENDIENTES.md).
