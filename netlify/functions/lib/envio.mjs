// Costo de envío que se cobra en el checkout.
//
// HOY: siempre 0. El flete se coordina aparte con el comprador; el carrito solo muestra
// el aviso de data/checkout.json ("avisoEnvio").
//
// PARA COBRAR ENVÍO POR ZONA (todavía no implementado):
//   1. Sumar las tarifas a data/checkout.json, por ejemplo
//      "costoEnvio": { "Montevideo": 0, "Canelones": 800, "otros": 1500 }
//   2. Importar ese JSON acá (y agregarlo a included_files en netlify.toml) y devolver el
//      costo según comprador.entrega ("retiro" = 0) y comprador.departamento.
//   3. En js/cart.js, mostrar el costo en el checkout al elegir el departamento.
// create-preference ya suma lo que devuelva esta función al total y lo manda a Mercado Pago
// como una línea "Envío" (también en la metadata), así el webhook controla el monto con
// envío incluido y los emails lo muestran sin más cambios.

/** @returns {number} costo de envío en UYU (entero, 0 = sin cargo / se coordina aparte) */
export function costoEnvio(comprador) {
  return 0;
}
