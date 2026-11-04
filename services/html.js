// Escapa texto que se inserta en HTML (recibos y tickets que se imprimen o se
// convierten a PDF). Sin esto, un nombre o producto con "<", ">" o "&" rompe el
// recibo o deja huecos en blanco.
export const escHtml = (valor) => String(valor ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
