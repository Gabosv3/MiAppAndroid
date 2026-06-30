# API de Reintegros - Documentación

## Resumen General

El módulo de **reintegros** gestiona la recuperación de productos cuando un cliente no ha pagado.
Permite identificar candidatos (ventas con cuotas vencidas), asignar la recuperación a un vendedor
y hacer seguimiento del estado.

---

## Flujo típico

```
1. Consultar candidatos con cuotas vencidas
   GET /api/reintegros/candidatos

2. Ver vendedores disponibles para asignar
   GET /api/reintegros/vendedores

3. Asignar recuperación a un vendedor
   POST /api/reintegros

4. El vendedor consulta sus reintegros pendientes
   GET /api/reintegros

5. Actualizar estado cuando el vendedor visita al cliente
   PATCH /api/reintegros/{id}/estado
```

---

## 1. GET `/api/reintegros/candidatos`

Devuelve ventas con cuotas vencidas que son candidatas a reintegro, con los productos de cada venta.

### Request
```
GET /api/reintegros/candidatos?dias_vencidos=30
Authorization: Bearer {token}
```

### Parámetros (Query)
| Parámetro | Tipo | Requerido | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `dias_vencidos` | integer | ❌ | 30 | Días mínimos de vencimiento para considerar candidato |
| `per_page` | integer | ❌ | 30 | Resultados por página |
| `page` | integer | ❌ | 1 | Número de página |

### Response (200)
```json
{
  "current_page": 1,
  "data": [
    {
      "venta_id": 12,
      "numero_venta": "VNT-0012",
      "fecha_venta": "2026-01-15",
      "saldo_pendiente": 320.00,
      "cuotas_vencidas": 4,
      "monto_adeudado_vencido": 160.00,
      "ya_en_reintegro": false,
      "cliente": {
        "id": 45,
        "nombre": "Juan Carlos Pérez",
        "dui": "01234567-8",
        "codigo_anterior": "4521",
        "telefono": "75123456",
        "direccion": "Colonia El Progreso, San Francisco Gotera"
      },
      "productos": [
        {
          "id": 3,
          "codigo": "TV-55",
          "nombre": "Televisor 55 pulgadas",
          "cantidad": 1.0
        }
      ]
    }
  ],
  "last_page": 2,
  "per_page": 30,
  "total": 41
}
```

### Notas
- `ya_en_reintegro: true` significa que esa venta ya tiene un reintegro activo (`pendiente` o `en_proceso`). Aun así aparece en la lista para visibilidad.
- Solo muestra ventas de la sucursal del usuario autenticado.

---

## 2. GET `/api/reintegros/vendedores`

Lista los vendedores activos disponibles para asignar un reintegro.

### Request
```
GET /api/reintegros/vendedores
Authorization: Bearer {token}
```

### Response (200)
```json
{
  "vendedores": [
    {
      "id": 2,
      "codigo": "VEND-002",
      "nombre": "Carlos Martínez",
      "telefono": "76543210"
    },
    {
      "id": 5,
      "codigo": "VEND-005",
      "nombre": "Ana López",
      "telefono": "78901234"
    }
  ]
}
```

---

## 3. POST `/api/reintegros`

Asigna la recuperación de una venta a un vendedor.

### Request
```
POST /api/reintegros
Authorization: Bearer {token}
Content-Type: application/json

{
  "venta_id": 12,
  "vendedor_id": 2,
  "motivo": "4 cuotas sin pagar, cliente no contesta llamadas",
  "observaciones": "Verificar que los productos estén completos"
}
```

### Body
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `venta_id` | integer | ✅ | ID de la venta a recuperar |
| `vendedor_id` | integer | ✅ | ID del vendedor asignado |
| `motivo` | string | ❌ | Razón del reintegro |
| `observaciones` | string | ❌ | Notas adicionales para el vendedor |

### Response (201)
```json
{
  "mensaje": "Reintegro asignado exitosamente.",
  "reintegro": {
    "id": 7,
    "venta_id": 12,
    "numero_venta": "VNT-0012",
    "cliente": "Juan Carlos Pérez",
    "vendedor": "Carlos Martínez",
    "estado": "pendiente",
    "monto_adeudado": 160.00,
    "cuotas_vencidas": 4,
    "fecha_asignacion": "2026-06-15"
  }
}
```

### Error — Reintegro ya existe (422)
```json
{
  "message": "Esta venta ya tiene un reintegro activo.",
  "reintegro_id": 5,
  "estado": "en_proceso"
}
```

### Error — Venta sin saldo (422)
```json
{
  "message": "Esta venta no tiene saldo pendiente."
}
```

---

## 4. GET `/api/reintegros`

Lista los reintegros asignados. Si el usuario es vendedor, solo muestra los suyos.

### Request
```
GET /api/reintegros?estado=pendiente
Authorization: Bearer {token}
```

### Parámetros (Query)
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `estado` | string | ❌ | Filtrar: `pendiente`, `en_proceso`, `recuperado`, `no_recuperado` |
| `per_page` | integer | ❌ | Resultados por página (default: 20) |

### Response (200)
```json
{
  "current_page": 1,
  "data": [
    {
      "id": 7,
      "estado": "pendiente",
      "monto_adeudado": 160.00,
      "cuotas_vencidas": 4,
      "fecha_asignacion": "2026-06-15",
      "fecha_recuperacion": null,
      "motivo": "4 cuotas sin pagar, cliente no contesta llamadas",
      "observaciones": "Verificar que los productos estén completos",
      "venta": {
        "id": 12,
        "numero_venta": "VNT-0012",
        "saldo_pendiente": 320.00
      },
      "cliente": {
        "id": 45,
        "nombre": "Juan Carlos Pérez",
        "dui": "01234567-8",
        "telefono": "75123456"
      },
      "vendedor": {
        "id": 2,
        "nombre": "Carlos Martínez",
        "codigo": "VEND-002"
      }
    }
  ],
  "total": 3
}
```

---

## 5. PATCH `/api/reintegros/{id}/estado`

Actualiza el estado de un reintegro luego de la visita al cliente.

### Request
```
PATCH /api/reintegros/7/estado
Authorization: Bearer {token}
Content-Type: application/json

{
  "estado": "recuperado",
  "observaciones": "Se recogieron todos los productos en buen estado"
}
```

### Body
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `estado` | string | ✅ | `en_proceso`, `recuperado`, `no_recuperado` |
| `observaciones` | string | ❌ | Notas de la visita |

### Response (200)
```json
{
  "mensaje": "Estado actualizado.",
  "reintegro": {
    "id": 7,
    "estado": "recuperado",
    "fecha_recuperacion": "2026-06-16"
  }
}
```

---

## Estados del reintegro

| Estado | Descripción |
|--------|-------------|
| `pendiente` | Recién asignado, el vendedor aún no ha actuado |
| `en_proceso` | El vendedor está gestionando la recuperación |
| `recuperado` | Los productos fueron recuperados exitosamente |
| `no_recuperado` | No fue posible recuperar los productos |

---

## Códigos de error

| Código | Causa |
|--------|-------|
| **401** | Token inválido o no enviado |
| **404** | Reintegro o venta no encontrada |
| **422** | Validación fallida o reintegro ya activo |
