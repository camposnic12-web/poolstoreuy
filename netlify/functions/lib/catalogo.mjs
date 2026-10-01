// Catálogo y validaciones del lado del servidor.
// Los precios salen SIEMPRE de products.json; nunca de lo que manda el navegador.
import data from '../../../products.json' with { type: 'json' };

export const MONEDA = 'UYU';
export const MAX_CANTIDAD = 10;
export const MAX_LINEAS = 20;

export const DEPARTAMENTOS = [
  'Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores', 'Florida',
  'Lavalleja', 'Maldonado', 'Montevideo', 'Paysandú', 'Río Negro', 'Rivera', 'Rocha',
  'Salto', 'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres',
];

const PRODUCTOS = new Map(data.products.map((p) => [p.id, p]));

export function productoComprable(p) {
  return Boolean(p) && p.estado === 'disponible' && Number.isInteger(p.precio) && p.precio > 0;
}

/**
 * Valida el carrito contra products.json y calcula el total en el servidor.
 * @returns {{ lineas: Array, total: number, error?: string }}
 */
export function validarItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'El carrito está vacío.' };
  }
  if (items.length > MAX_LINEAS) {
    return { error: 'Demasiados productos en un mismo pedido.' };
  }

  // Unifica ids repetidos sumando cantidades.
  const cantidades = new Map();
  for (const item of items) {
    const id = typeof item?.id === 'string' ? item.id : '';
    const cantidad = Number(item?.cantidad);
    if (!id || !Number.isInteger(cantidad) || cantidad < 1) {
      return { error: 'El carrito tiene datos inválidos. Recargá la página e intentá de nuevo.' };
    }
    cantidades.set(id, (cantidades.get(id) || 0) + cantidad);
  }

  const lineas = [];
  for (const [id, cantidad] of cantidades) {
    const p = PRODUCTOS.get(id);
    if (!productoComprable(p)) {
      const nombre = p ? `"${p.nombre}"` : 'Un producto del carrito';
      return { error: `${nombre} ya no está disponible. Sacalo del carrito para continuar.` };
    }
    if (cantidad > MAX_CANTIDAD) {
      return { error: `Máximo ${MAX_CANTIDAD} unidades de "${p.nombre}" por pedido. Para más, escribinos por WhatsApp.` };
    }
    lineas.push({
      id: p.id,
      nombre: p.nombre,
      imagen: p.imagen,
      cantidad,
      precio_unitario: p.precio,
      subtotal: p.precio * cantidad,
    });
  }

  const total = lineas.reduce((s, l) => s + l.subtotal, 0);
  return { lineas, total };
}

export function ciValida(raw) {
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 8) return false;
  digits = digits.padStart(8, '0');
  const pesos = [2, 9, 8, 7, 6, 3, 4];
  const suma = pesos.reduce((s, w, i) => s + Number(digits[i]) * w, 0);
  return (10 - (suma % 10)) % 10 === Number(digits[7]);
}

const limpiar = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Valida los datos del comprador (mismas reglas que js/cart.js).
 * @returns {{ comprador: object, errores: object }}
 */
export function validarComprador(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const c = {
    nombre: limpiar(d.nombre, 80),
    email: limpiar(d.email, 120).toLowerCase(),
    telefono: limpiar(d.telefono, 20),
    cedula: limpiar(d.cedula, 12),
    entrega: d.entrega === 'retiro' ? 'retiro' : d.entrega === 'envio' ? 'envio' : '',
    departamento: limpiar(d.departamento, 40),
    ciudad: limpiar(d.ciudad, 80),
    direccion: limpiar(d.direccion, 150),
    // En comentarios se respetan los saltos de línea.
    comentarios: String(d.comentarios ?? '').trim().slice(0, 500),
  };
  if (c.entrega === 'retiro') {
    c.departamento = '';
    c.ciudad = '';
    c.direccion = '';
  }

  const errores = {};
  if (c.nombre.length < 3 || c.nombre.split(' ').length < 2) errores.nombre = 'Ingresá tu nombre y apellido.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) errores.email = 'Ingresá un email válido.';
  const tel = c.telefono.replace(/\D/g, '');
  if (tel.length < 8 || tel.length > 12) errores.telefono = 'Ingresá un teléfono válido (ej: 097 197 654).';
  if (c.cedula && !ciValida(c.cedula)) errores.cedula = 'La cédula no parece válida. Revisala o dejala vacía.';
  if (!c.entrega) errores.entrega = 'Elegí un método de entrega.';
  if (c.entrega === 'envio') {
    if (!DEPARTAMENTOS.includes(c.departamento)) errores.departamento = 'Elegí un departamento.';
    if (c.ciudad.length < 2) errores.ciudad = 'Ingresá tu ciudad o localidad.';
    if (c.direccion.length < 5) errores.direccion = 'Ingresá la dirección de entrega.';
  }
  return { comprador: c, errores };
}
