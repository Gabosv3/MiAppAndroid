# Lógica Backend POS

## Visión general

Este backend expone un API POS que permite a los vendedores y cobradores acceder solo a los datos que les corresponden.

- `POST /api/login` → login con email y contraseña.
- `GET /api/me` → devuelve usuario, roles, permisos y sucursales.
- `GET /api/productos` → productos disponibles según asignación del vendedor.
- `POST /api/ventas` → crear venta, solo para vendedores.
- `GET /api/asignacion/hoy` → obtener asignación del día del vendedor.
- `POST /api/asignaciones/{id}/liquidar` → liquidar la asignación diaria.
- `POST /api/ventas/{venta}/pagos` → registrar cobros, solo cobradores.

## Autenticación y permisos

### Login

- El endpoint `POST /api/login` valida credenciales.
- Si el usuario no es vendedor ni cobrador activo, devuelve `403`.
- La API usa `auth:sanctum` para proteger rutas.

### Tipos de usuarios

El backend distingue:

- `Vendedor`: usuario con perfil `vendedor` activo.
- `Cobrador`: usuario con perfil `cobrador` activo.

El método `User::puedeUsarApi()` permite el acceso si el usuario es vendedor o cobrador.

### Middlewares

- `pos.acceso` → valida que el usuario sea vendedor o cobrador.
- `solo.vendedor` → valida que sea vendedor activo.
- `solo.cobrador` → valida que sea cobrador activo o vendedor con flag `es_cobrador`.

## Flujo de asignación diaria

### Tablas principales

- `asignaciones_diarias`
  - `vendedor_id`
  - `sucursal_id`
  - `fecha`
  - `estado` (`activa`, `liquidada`)
  - totales calculados en liquidación

- `detalle_asignaciones`
  - `asignacion_id`
  - `producto_id`
  - `cantidad_asignada`
  - `cantidad_vendida`
  - `cantidad_devuelta`
  - `precio_venta`

### Comportamiento

- La asignación se crea por el sistema principal (Filament), no desde la API.
- Al crear un `DetalleAsignacion`, el stock global del producto se descuenta inmediatamente.
- Cuando se vende desde la API, solo se puede vender dentro de la cantidad asignada.
- Al liquidar la asignación, el sistema calcula las unidades vendidas y devuelve al inventario lo no vendido.

## Endpoints clave

### `GET /api/productos`

Para un vendedor activo:

- se busca la asignación activa de hoy (`AsignacionDiaria` por `vendedor_id`, `fecha` y `estado = activa`).
- solo devuelve productos que pertenecen a esa asignación.
- solo incluye productos cuyo `cantidad_asignada > cantidad_vendida`.

Campos devueltos para el frontend:

- `id`
- `nombre`
- `codigo`
- `descripcion`
- `unidad_medida`
- `precio_venta`
- `precios_cuotas`
- `stock_global` → inventario total actual del producto
- `stock_asignado` → cantidad que se le dio al vendedor hoy
- `stock_disponible` → `cantidad_asignada - cantidad_vendida`
- `cantidad_vendida` → lo que ya vendió hoy de esa asignación
- `categoria`
- `categoria_id`
- `sucursal_id`
- `imagen`

> El frontend debe usar `stock_disponible` como la cantidad máxima que puede vender del producto.
> Para ventas a cuotas, puede usar las opciones disponibles en `precios_cuotas` y enviar `cuotas` y `precio_cuota` en los detalles de venta.

### `GET /api/productos/{id}`

- Para vendedores, valida que el producto pertenezca a la asignación del día.
- Si no es un producto asignado, devuelve `404`.

### `POST /api/ventas`

El endpoint de venta valida:

- existe `cliente_id` y `sucursal_id`.
- existe una asignación activa del vendedor para hoy.
- todos los productos de la venta están en la asignación del día.
- la suma de las cantidades solicitadas no supera la cantidad asignada.

Al crear la venta:

- usa `precio_venta` del detalle de asignación si existe.
- crea `Venta` con `vendedor_id` y `user_id`.
- crea los `DetalleVenta` correspondientes.
- acepta `detalles.*.cuotas` y `detalles.*.precio_cuota` para ventas financiadas.
- calcula `precio_cuota` automáticamente si se envía `cuotas` sin `precio_cuota`.
- incrementa `DetalleAsignacion.cantidad_vendida`.
- actualiza `DetalleAsignacion.cantidad_devuelta` automáticamente.

### `GET /api/asignacion/hoy`

- Devuelve la asignación activa del día para el vendedor autenticado.
- Incluye productos asignados y sus cantidades.

### `POST /api/asignaciones/{id}/liquidar`

- Calcula las ventas reales del día para cada producto.
- Establece `cantidad_vendida`.
- Calcula `cantidad_devuelta = cantidad_asignada - cantidad_vendida`.
- Devuelve al inventario del producto la cantidad no vendida.
- Cambia la asignación a `estado = liquidada`.

## Modelo de datos y relaciones

### `AsignacionDiaria`

- `detalles()` → `DetalleAsignacion`
- `vendedor()` → `Vendedor`
- `sucursal()` → `Sucursal`
- `liquidar()` → cierra la jornada y actualiza stock no vendido
### `DetalleVenta`

- almacena `cuotas` y `precio_cuota` para líneas de venta a plazos
### `DetalleAsignacion`

- `producto()` → `Producto`
- Atributo calculado: `disponible = cantidad_asignada - cantidad_vendida`
- Descuenta stock global al crear la asignación.
- Si la asignación se elimina o se reduce, ajusta stock automáticamente.

## Prueba existente

Archivo: `tests/Feature/ProductoAsignacionTest.php`

Verifica:

- el vendedor solo ve productos asignados de hoy
- no ve productos no asignados
- `stock_asignado` es correcto
- `stock_disponible` es correcto
- `cantidad_vendida` es correcto

## Cómo verificar desde el frontend

1. Llamar `POST /api/login` y recibir token.
2. Usar `Authorization: Bearer <token>`.
3. Llamar `GET /api/productos`.
4. Mostrar solo productos con `stock_disponible > 0`.
5. Al actualizar una venta, enviar `detalles` con productos asignados y cantidades.

## Qué verificar si no aparecen productos

- Verificar que el usuario autenticado sea un `vendedor` activo con `user_id` vinculado.
- Llamar `GET /api/me` para confirmar el usuario actual y su perfil.
- Llamar `GET /api/asignacion/hoy` para comprobar si existe una asignación activa para hoy.
- Si `GET /api/asignacion/hoy` devuelve `No hay asignación activa para hoy`, entonces el vendedor actual no tiene asignación para la fecha actual.
- Si el usuario es un cobrador puro, `GET /api/productos` puede devolver un catálogo distinto y no debe usarse para ventas.

## Notas

- `GET /api/productos` no devuelve el catálogo completo para vendedores, solo devuelve lo asignado.
- El administrador gestiona la asignación diaria desde Filament.
- El backend mantiene la lógica de devolución de stock al liquidar.
