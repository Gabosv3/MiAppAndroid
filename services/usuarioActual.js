// Id del usuario con sesión iniciada, accesible desde servicios sin pasar por React.
// Lo usan las colas offline para marcar de quién es cada operación pendiente, de modo
// que si la sesión muere y OTRA persona inicia sesión en el mismo teléfono, sus
// ventas y cobros no se envíen con la identidad equivocada.
let _id = null;
export const setUsuarioActual = (id) => { _id = id ?? null; };
export const getUsuarioActual = () => _id;
