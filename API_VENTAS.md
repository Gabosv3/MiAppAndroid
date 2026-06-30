# API Ventas — SIDB

**Base URL:** `http://{host}/api`  
**Autenticación:** Bearer Token (Laravel Sanctum)  
**Content-Type:** `application/json`

---

## Índice

1. [Listar ventas](#1-listar-ventas)
2. [Ver detalle de venta](#2-ver-detalle-de-venta)
3. [Crear venta](#3-crear-venta)
   - [Venta contado](#31-venta-contado)
   - [Venta crédito](#32-venta-crédito)
   - [Venta mixta](#33-venta-mixta-con-prima)
4. [Tipos de pago](#4-tipos-de-pago)
5. [Reglas de negocio](#5-reglas-de-negocio)

---

## 1. Listar ventas

### `GET /ventas`

Devuelve las ventas del vendedor autenticado, paginadas.

**Query params:**

| Parámetro    | Tipo    | Requerido | Descripción                                 |
|--------------|---------|-----------|---------------------------------------------|
| `sucursal_id`| integer | No        | Filtrar por sucursal                        |
| `estado`     | string  | No        | `pendiente`, `completada`, `anulada`        |
| `per_page`   | integer | No        | Resultados por página (default: 20)         |
| `page`       | integer | No        | Página (default: 1)                         |

**Respuesta 200:**
```json
{
  "data": [
    {
      "id": 1,
      "numero_venta": "VNT-AB12CD34",
      "cliente": { "id": 5, "nombre": "Juan", "apellido": "Pérez" },
      "fecha_venta": "2025-07-31T00:00:00.000000Z",
      "estado": "pendiente",
      "tipo_pago": "credito",
      "total": "250.00",
      "prima": "0.00",
      "monto_pagado": "0.00",
      "saldo_pendiente": "250.00"
    }
  ],
  "current_page": 1,
  "per_page": 20,
  "total": 110
}
```

---

## 2. Ver detalle de venta

### `GET /ventas/{id}`

Devuelve una venta con sus líneas de detalle y pagos registrados.

**Respuesta 200:**
```json
{
  "id": 1,
  "numero_venta": "VNT-AB12CD34",
  "tipo_pago": "mixta",
  "prima": "50.00",
  "subtotal": "300.00",
  "total": "300.00",
  "monto_pagado": "150.00",
  "saldo_pendiente": "150.00",
  "estado": "pendiente",
  "cliente": {
    "id": 5,
    "nombre": "Juan",
    "apellido": "Pérez",
    "dui": "01234567-8",
    "telefono_normal": "7000-0000"
  },
  "detalles": [
    {
      "id": 1,
      "producto": { "id": 10, "nombre": "Colchón King", "codigo": "PROD-010" },
      "cantidad": 1,
      "precio_unitario": "200.00",
      "subtotal": "200.00",
      "tipo_pago": "credito"
    },
    {
      "id": 2,
      "producto": { "id": 15, "nombre": "Almohada", "codigo": "PROD-015" },
      "cantidad": 1,
      "precio_unitario": "100.00",
      "subtotal": "100.00",
      "tipo_pago": "contado"
    }
  ],
  "pagos": [
    {
      "id": 1,
      "monto": "150.00",
      "fecha_pago": "2025-07-31",
      "metodo_pago": "efectivo"
    }
  ]
}
```

---

## 3. Crear venta

### `POST /ventas`

Crea una venta con una o más líneas de detalle.

**Body:**

| Campo                         | Tipo    | Requerido | Descripción                                                  |
|-------------------------------|---------|-----------|--------------------------------------------------------------|
| `cliente_id`                  | integer | Sí        | ID del cliente                                               |
| `sucursal_id`                 | integer | Sí        | ID de la sucursal                                            |
| `prima`                       | decimal | No        | Abono inicial al crédito (default: 0)                        |
| `dias_credito`                | integer | No        | Días plazo para pagar (default: 30)                          |
| `descuento_porcentaje`        | decimal | No        | Descuento global en % (default: 0)                           |
| `observaciones`               | string  | No        | Notas adicionales                                            |
| `detalles`                    | array   | Sí        | Mínimo 1 línea                                               |
| `detalles.*.producto_id`      | integer | Sí        | ID del producto                                              |
| `detalles.*.cantidad`         | integer | Sí        | Cantidad (mínimo 1)                                          |
| `detalles.*.precio_unitario`  | decimal | Sí        | Precio por unidad                                            |
| `detalles.*.descuento_porcentaje` | decimal | No   | Descuento por línea (default: 0)                             |
| `detalles.*.tipo_pago`        | string  | No        | `contado` o `credito` por línea                              |
| `detalles.*.cuotas`           | integer | No        | Número de cuotas si la línea es a crédito                    |
| `detalles.*.precio_cuota`     | decimal | No        | Monto por cuota (se calcula automáticamente si no se envía)  |

---

### 3.1 Venta contado

Todas las líneas se pagan en el momento. No genera gestiones de cobro.

```json
{
  "cliente_id": 5,
  "sucursal_id": 1,
  "detalles": [
    {
      "producto_id": 10,
      "cantidad": 1,
      "precio_unitario": 200.00,
      "tipo_pago": "contado"
    }
  ]
}
```

**Resultado:**
- `tipo_pago`: `contado`
- `monto_pagado`: 200.00
- `saldo_pendiente`: 0.00
- `estado`: `completada`

---

### 3.2 Venta crédito

El cliente paga en cuotas. Se generan gestiones de cobro automáticamente.

```json
{
  "cliente_id": 5,
  "sucursal_id": 1,
  "dias_credito": 30,
  "detalles": [
    {
      "producto_id": 10,
      "cantidad": 1,
      "precio_unitario": 200.00,
      "tipo_pago": "credito",
      "cuotas": 5
    }
  ]
}
```

**Resultado:**
- `tipo_pago`: `credito`
- `prima`: 0.00
- `monto_pagado`: 0.00
- `saldo_pendiente`: 200.00
- `estado`: `pendiente`
- Se generan **5 gestiones de cobro** de $40.00 cada una

---

### 3.3 Venta mixta con prima

Un producto al contado y otro al crédito. La `prima` es un abono inicial que reduce el saldo del crédito.

```json
{
  "cliente_id": 5,
  "sucursal_id": 1,
  "prima": 50.00,
  "detalles": [
    {
      "producto_id": 10,
      "cantidad": 1,
      "precio_unitario": 200.00,
      "tipo_pago": "credito",
      "cuotas": 5
    },
    {
      "producto_id": 15,
      "cantidad": 1,
      "precio_unitario": 100.00,
      "tipo_pago": "contado"
    }
  ]
}
```

**Cálculo:**
```
total_contado  = 100.00
total_credito  = 200.00
prima          = 50.00  (abono al crédito)
monto_pagado   = total_contado + prima = 150.00
saldo_pendiente= total_credito - prima = 150.00
```

**Resultado:**
- `tipo_pago`: `mixta`
- `prima`: 50.00
- `monto_pagado`: 150.00
- `saldo_pendiente`: 150.00
- `estado`: `pendiente`
- Se generan **5 gestiones de cobro** de $30.00 cada una (sobre el saldo de 150.00)

---

## 4. Tipos de pago

| Valor     | Descripción                                                     |
|-----------|-----------------------------------------------------------------|
| `contado` | Todo se cobra al momento. No genera gestiones de cobro.         |
| `credito` | Todo a cuotas. Genera gestiones de cobro por el total.          |
| `mixta`   | Mezcla de líneas contado y crédito. El sistema lo detecta solo. |

> El `tipo_pago` de la venta se determina automáticamente según las líneas:
> - Todas contado → `contado`
> - Todas crédito → `credito`
> - Mezcla → `mixta`

---

## 5. Reglas de negocio

- La `prima` no puede superar el `total_credito`. Si se envía un valor mayor, se recorta automáticamente.
- Las gestiones de cobro solo se crean para las líneas marcadas como `credito` y solo sobre el `saldo_pendiente` (después de descontar la prima).
- Si el vendedor tiene una **asignación diaria activa**, el sistema valida que los productos vendidos estén en la asignación y que no se supere la cantidad asignada.
- Si una venta queda con `saldo_pendiente = 0`, su estado es `completada` automáticamente.
- El `numero_venta` se genera automáticamente con formato `VNT-XXXXXXXX`.

---

## Errores comunes

| Código | Causa                                                                 |
|--------|-----------------------------------------------------------------------|
| 401    | Token inválido o expirado                                             |
| 422    | Validación fallida (ver campo `errors` en la respuesta)               |
| 422    | No tienes asignación activa para hoy (si el usuario es vendedor)      |
| 422    | Cantidad solicitada supera lo asignado para el producto               |
| 404    | Venta no encontrada o no pertenece al usuario autenticado             |
