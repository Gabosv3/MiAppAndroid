# Lógica de Cuotas en el POS

## Objetivo

Explicar cómo funciona la venta a cuotas en la API POS para el equipo de frontend y backend.

## Contexto

El sistema de ventas POS ahora admite que un vendedor envíe una venta con líneas de producto a plazo usando:

- `cuotas`
- `precio_cuota`

Esto está pensado para ventas de productos con financiamiento desde el mismo endpoint `POST /api/ventas`.

## Qué datos devuelve `GET /api/productos`

Para el vendedor activo, el endpoint devuelve los productos asignados del día y deja disponible el campo:

- `precios_cuotas`

Este campo es un JSON opcional con los planes de financiamiento disponibles para cada producto.

### Uso recomendado en frontend

- Mostrar al usuario las opciones de cuotas disponibles para cada producto.
- Permitir seleccionar el plan de cuotas antes de enviar la venta.
- Calcular y mostrar el valor de cada cuota.

## `POST /api/ventas` — cómo funciona ahora

El endpoint acepta un payload de venta con los campos habituales y líneas de detalle con estos campos adicionales:

- `detalles.*.cuotas` (opcional): número de cuotas para el producto.
- `detalles.*.precio_cuota` (opcional): valor de cada cuota.

### Validación en el backend

El servidor valida que:

- el vendedor tiene una asignación activa para hoy.
- todos los productos enviados pertenecen a esa asignación.
- la suma de cantidades solicitadas no supera lo asignado por producto.

Si se envía `cuotas` y no se envía `precio_cuota`, el backend calcula el precio de cada cuota como:

- `precio_cuota = subtotal_linea / cuotas`

### Qué se guarda en la base de datos

En la tabla `detalle_ventas` ahora se almacenan también:

- `cuotas`
- `precio_cuota`

Esto permite luego generar comprobantes o reportes de ventas financiadas.

## Ejemplo de request

```json
{
  "cliente_id": 1,
  "sucursal_id": 1,
  "tipo_pago": "credito",
  "dias_credito": 30,
  "descuento_porcentaje": 0,
  "observaciones": "Venta a cuotas",
  "detalles": [
    {
      "producto_id": 5,
      "cantidad": 2,
      "precio_unitario": 299.99,
      "descuento_porcentaje": 0,
      "cuotas": 6,
      "precio_cuota": 99.99
    }
  ]
}
```

## Resultado esperado

- Se crea la `Venta` con el total correcto.
- Se crean los `DetalleVenta` con `cuotas` y `precio_cuota`.
- Si el producto pertenece a la asignación, se actualiza `DetalleAsignacion.cantidad_vendida`.
- El stock asignado se reduce correctamente y el inventario general es consistente.

## Reglas clave para el frontend

1. Usar `stock_disponible` como máximo vendible por producto.
2. Si el producto tiene `precios_cuotas`, mostrar las opciones de pago a plazos.
3. Al enviar la venta, incluir `cuotas` y opcionalmente `precio_cuota`.
4. El backend puede calcular `precio_cuota` si no se provee.

## Recomendación

Para evitar errores, el frontend debe enviar siempre:

- `cuotas` cuando la venta será a plazo.
- `precio_cuota` si ya se conoce el valor por cuota.

Si no se envía `precio_cuota`, el backend calcula el valor automáticamente.
