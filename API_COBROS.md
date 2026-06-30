# API de Cobros - Documentación

## Resumen General

La API de cobros permite a los cobradores:
- Ver sus rutas del día con clientes y ventas
- Registrar pagos directamente a clientes
- Consultar detalles y gestiones pendientes

---

## 1. GET `/api/cobros/ruta-hoy`

**Obtener clientes de las rutas asignadas para hoy**

### Request
```
GET /api/cobros/ruta-hoy
Authorization: Bearer {token}
```

### Response (200)
```json
{
  "dia": "jueves",
  "rutas": [
    {
      "id": 3,
      "nombre": "Zona 2 Gotera",
      "dia_semana": "jueves",
      "total_clientes": 86,
      "clientes": [
        {
          "id": 97,
          "nombre": "Florinda Perez",
          "dui": "00040202-4",
          "codigo_anterior": "7274",
          "telefono": "26543086",
          "saldo_total": 249.0,
          "cuotas_vencidas": 18,
          "para_estar_al_dia": 137.0,
          "ventas": [
            {
              "id": 20,
              "numero_venta": "VNT-SLEOVUSF",
              "fecha_venta": "13/11/2025",
              "total": 160.0,
              "monto_pagado": 35.0,
              "saldo_pendiente": 125.0,
              "cuotas_pendientes": 20,
              "cuotas_vencidas": 10
            },
            {
              "id": 90,
              "numero_venta": "VNT-1E7E23AC",
              "fecha_venta": "16/12/2025",
              "total": 160.0,
              "monto_pagado": 36.0,
              "saldo_pendiente": 124.0,
              "cuotas_pendientes": 20,
              "cuotas_vencidas": 8
            }
          ]
        }
      ]
    }
  ]
}
```

### Campos
| Campo | Descripción |
|-------|-------------|
| `saldo_total` | Deuda total acumulada del cliente |
| `cuotas_vencidas` | Cuántas cuotas ya pasaron su fecha límite |
| `para_estar_al_dia` | Monto exacto a pagar hoy para ponerse al día |
| `ventas` | Array de ventas activas del cliente |
| `cuotas_pendientes` | Cuotas sin cobrar de esa venta |
| `cuotas_vencidas` | Cuotas vencidas de esa venta |

---

## 2. GET `/api/cobros/rutas/{ruta_id}/clientes`

**Listar clientes de una ruta específica (igual a ruta-hoy pero para una ruta en particular)**

### Request
```
GET /api/cobros/rutas/3/clientes
Authorization: Bearer {token}
```

### Response
Mismo formato que `ruta-hoy`, pero solo clientes de esa ruta.

---

## 3. GET `/api/cobros/clientes/{id}`

**Ver detalle completo de un cliente con todas sus gestiones agrupadas por venta**

### Request
```
GET /api/cobros/clientes/97
Authorization: Bearer {token}
```

### Response (200)
```json
{
  "cliente": {
    "id": 97,
    "nombre": "Florinda Perez",
    "dui": "00040202-4",
    "codigo_anterior": "7274",
    "telefono": "26543086",
    "whatsapp": "26543086",
    "direccion": "Calle X, Gotera, Morazán",
    "saldo_total": 249.0,
    "ruta": "Zona 2 Gotera"
  },
  "resumen": {
    "total_ventas": 2,
    "cuotas_pendientes": 40,
    "cuotas_vencidas": 18
  },
  "ventas": [
    {
      "id": 20,
      "numero_venta": "VNT-SLEOVUSF",
      "fecha_venta": "13/11/2025",
      "total": 160.0,
      "monto_pagado": 35.0,
      "saldo_pendiente": 125.0,
      "estado": "activa",
      "resumen": {
        "total_cuotas": 24,
        "cobradas": 1,
        "pendientes": 23,
        "vencidas": 10,
        "monto_vencido": 70.0
      },
      "cuotas": [
        {
          "id": 42,
          "cuota": "1/24",
          "monto_cuota": 7.0,
          "monto_pagado": 7.0,
          "saldo_pendiente": 0.0,
          "fecha_vencimiento": "27/11/2025",
          "estado": "cobrado",
          "vencida": false
        },
        {
          "id": 43,
          "cuota": "2/24",
          "monto_cuota": 7.0,
          "monto_pagado": 0.0,
          "saldo_pendiente": 7.0,
          "fecha_vencimiento": "11/12/2025",
          "estado": "pendiente",
          "vencida": true
        }
      ]
    }
  ]
}
```

---

## 4. GET `/api/cobros/clientes/{id}/gestiones-pendientes`

**Listar solo las cuotas pendientes de un cliente (más rápido si solo quieres pendientes)**

### Request
```
GET /api/cobros/clientes/97/gestiones-pendientes
Authorization: Bearer {token}
```

### Response (200)
```json
{
  "cliente_id": 97,
  "total_pendiente": 249.0,
  "gestiones": [
    {
      "id": 43,
      "venta": "VNT-SLEOVUSF",
      "cuota": "2/24",
      "monto_cuota": 7.0,
      "monto_pagado": 0.0,
      "saldo_pendiente": 7.0,
      "fecha_vencimiento": "11/12/2025",
      "estado": "pendiente",
      "vencida": true
    }
  ]
}
```

---

## 5. POST `/api/cobros/clientes/{id}/pagar` ⭐

**Registrar un pago a un cliente para una venta específica**

El sistema distribuye el monto automáticamente entre las cuotas de esa venta, en orden de fecha de vencimiento.

### Request
```
POST /api/cobros/clientes/97/pagar
Authorization: Bearer {token}
Content-Type: application/json

{
  "monto": 45.0,
  "metodo_pago": "efectivo",
  "venta_id": 20,
  "referencia": "Pago en el hogar",
  "observaciones": "Cliente muy amable"
}
```

### Parámetros (Body)
| Campo | Tipo | Requerido | Descripción |
|-------|------|----------|-------------|
| `monto` | number | ✅ | Cantidad a pagar |
| `metodo_pago` | string | ✅ | `efectivo` \| `transferencia` \| `cheque` \| `deposito` |
| `venta_id` | integer | ✅ | ID de la venta a la que se abona |
| `referencia` | string | ❌ | Número de referencia o cheque |
| `observaciones` | string | ❌ | Notas del cobrador |

### Response (200)
```json
{
  "mensaje": "Pago registrado y distribuido en 6 cuota(s).",
  "monto_total": 45.0,
  "cuotas_pagadas": [
    {
      "id": 43,
      "cuota": "2/24",
      "monto_aplicado": 7.0,
      "saldo_pendiente": 0.0,
      "estado": "cobrado"
    },
    {
      "id": 44,
      "cuota": "3/24",
      "monto_aplicado": 7.0,
      "saldo_pendiente": 0.0,
      "estado": "cobrado"
    },
    {
      "id": 45,
      "cuota": "4/24",
      "monto_aplicado": 7.0,
      "saldo_pendiente": 0.0,
      "estado": "cobrado"
    },
    {
      "id": 46,
      "cuota": "5/24",
      "monto_aplicado": 7.0,
      "saldo_pendiente": 0.0,
      "estado": "cobrado"
    },
    {
      "id": 47,
      "cuota": "6/24",
      "monto_aplicado": 7.0,
      "saldo_pendiente": 0.0,
      "estado": "cobrado"
    },
    {
      "id": 48,
      "cuota": "7/24",
      "monto_aplicado": 4.0,
      "saldo_pendiente": 3.0,
      "estado": "parcialmente_cobrado"
    }
  ],
  "proxima_cuota": {
    "id": 48,
    "cuota": "7/24",
    "monto_cuota": 7.0,
    "saldo_pendiente": 3.0,
    "fecha_vencimiento": "04/01/2026",
    "estado": "parcialmente_cobrado"
  }
}
```

### Ejemplo de Flujo

1. **El cobrador entra a la ruta del día**: `GET /api/cobros/ruta-hoy`
2. **Selecciona a Florinda Perez** (id: 97) y ve que tiene 2 ventas:
   - VNT-SLEOVUSF: $125 pendientes (10 cuotas vencidas)
   - VNT-1E7E23AC: $124 pendientes (8 cuotas vencidas)
3. **Decide abonarle a la primera venta**: `POST /api/cobros/clientes/97/pagar`
   ```json
   {
     "monto": 45,
     "metodo_pago": "efectivo",
     "venta_id": 20
   }
   ```
4. **El sistema responde** que pagó 6 cuotas y devuelve la próxima pendiente
5. **Florinda ahora debe $204** (249 - 45 = 204)

---

## 6. POST `/api/cobros/gestiones/{id}/pagar`

**Pagar una cuota específica (alternativa avanzada)**

Si quieres pagar una cuota exacta sin distribuir, usa este endpoint.

### Request
```
POST /api/cobros/gestiones/43/pagar
Authorization: Bearer {token}
Content-Type: application/json

{
  "monto": 7.0,
  "metodo_pago": "efectivo"
}
```

### Response (200)
```json
{
  "mensaje": "Cuota pagada completamente.",
  "gestion": {
    "id": 43,
    "cuota": "2/24",
    "monto_cuota": 7.0,
    "monto_pagado": 7.0,
    "saldo_pendiente": 0.0,
    "estado": "cobrado"
  },
  "venta_saldo": 118.0
}
```

---

## Códigos de Error

| Código | Mensaje | Causa |
|--------|---------|-------|
| **403** | "No se encontró perfil de cobrador" | Usuario no es cobrador |
| **403** | "Este cliente no pertenece a tus rutas" | Cliente no está en tus rutas |
| **403** | "Esta venta no pertenece al cliente" | Venta no es del cliente |
| **422** | "El monto ${X} supera el saldo pendiente" | Intentó pagar más de lo que debe |
| **404** | "Ruta no encontrada o no te pertenece" | Ruta no existe o no es tuya |

---

## Flujo Recomendado

```
1. GET /api/cobros/ruta-hoy
   ↓ (ver todos los clientes del día)
   ↓
2. Seleccionar cliente y venta
   ↓
3. POST /api/cobros/clientes/{id}/pagar
   ├─ Ingresa monto
   ├─ Selecciona venta_id
   ├─ Selecciona metodo_pago
   └─ Envía
   ↓
4. Sistema distribuye el pago entre cuotas
   ↓
5. Ver próxima cuota en la respuesta
```

---

## Notas Importantes

- ✅ El **venta_id es obligatorio** — siempre debes especificar a cuál venta abonar
- ✅ El pago se distribuye **automáticamente** entre las cuotas de esa venta, en orden de fecha
- ✅ No puedes pagar más de lo que el cliente debe en esa venta
- ✅ Cada pago genera un registro en `pagos_ventas` con el user_id del cobrador
- ✅ Si una venta queda con saldo 0, cambia automáticamente a estado `completada`


---

## Registrar visita sin pago

### `POST /cobros/clientes/{id}/visita`

Registra que el cobrador visitó al cliente aunque no haya recibido ningún pago. Permite adjuntar una foto del hogar como comprobante.

**Requiere:** `multipart/form-data` (para poder enviar la foto)

**Parámetros del body:**

| Campo              | Tipo    | Requerido | Descripción                                                      |
|--------------------|---------|-----------|------------------------------------------------------------------|
| `resultado`        | string  | Sí        | `sin_pago`, `promesa_pago`, `no_encontrado`, `rechazo`           |
| `gestion_cobro_id` | integer | No        | ID de la cuota específica relacionada                            |
| `observaciones`    | string  | No        | Notas sobre la visita (max 500 chars)                            |
| `promesa_fecha`    | date    | Condicional | Requerido si `resultado = promesa_pago`. Fecha futura (YYYY-MM-DD) |
| `foto_hogar`       | file    | No        | Foto del hogar como comprobante (jpg/png/webp, máx 5MB)          |
| `latitud`          | decimal | No        | Coordenada GPS de la visita                                      |
| `longitud`         | decimal | No        | Coordenada GPS de la visita                                      |

**Valores de `resultado`:**

| Valor           | Descripción                                      |
|-----------------|--------------------------------------------------|
| `sin_pago`      | El cliente estaba pero no pagó                   |
| `promesa_pago`  | El cliente prometió pagar en una fecha específica|
| `no_encontrado` | No había nadie en la dirección                   |
| `rechazo`       | El cliente se negó a atender                     |

---

**Ejemplo 1 — Visita sin pago:**
```json
{
  "resultado": "sin_pago",
  "observaciones": "El cliente dice que no tiene efectivo hoy"
}
```

**Ejemplo 2 — Promesa de pago:**
```json
{
  "resultado": "promesa_pago",
  "promesa_fecha": "2026-06-25",
  "observaciones": "Dijo que cobra el viernes y paga el sábado"
}
```

**Ejemplo 3 — Con foto (multipart/form-data):**
```
POST /cobros/clientes/42/visita
Content-Type: multipart/form-data

resultado=sin_pago
observaciones=Casa cerrada, dejé nota
foto_hogar=<archivo imagen>
latitud=13.6929
longitud=-89.2182
```

---

**Respuesta 201:**
```json
{
  "mensaje": "Visita registrada.",
  "visita": {
    "id": 15,
    "cliente_id": 42,
    "resultado": "sin_pago",
    "promesa_fecha": null,
    "fecha_visita": "18/06/2026 09:45",
    "foto_hogar_url": "/storage/visitas/42/foto_abc123.jpg",
    "observaciones": "Casa cerrada, dejé nota"
  }
}
```

**Errores:**

| Código | Causa                                           |
|--------|-------------------------------------------------|
| 403    | El cliente no pertenece a tus rutas             |
| 422    | `promesa_fecha` faltante cuando resultado es `promesa_pago` |
| 422    | Archivo de foto muy grande (> 5MB) o formato inválido |

---

## Flujo recomendado en la app móvil

```
Cobrador llega a casa del cliente
        ↓
¿El cliente paga? → SÍ → POST /cobros/clientes/{id}/pagar
        ↓ NO
¿Qué pasó?
  ├─ No estaba      → resultado: no_encontrado
  ├─ No tiene dinero → resultado: sin_pago  (+foto opcional)
  ├─ Prometió pagar  → resultado: promesa_pago + promesa_fecha
  └─ Se negó         → resultado: rechazo
        ↓
POST /cobros/clientes/{id}/visita
(con foto del hogar si es necesario como comprobante)
```
