# API de Clientes - Documentación

## Resumen General

Endpoints para buscar y consultar clientes del sistema.

---

## 1. GET `/api/clientes` — Buscar clientes

Busca clientes activos por nombre, DUI, código anterior o teléfono.

### Request
```
GET /api/clientes?q={busqueda}
Authorization: Bearer {token}
```

### Parámetros (Query)
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `q` | string | ❌ | Texto a buscar: nombre, apellido, DUI, código anterior o teléfono |
| `sucursal_id` | integer | ❌ | Filtrar por sucursal |
| `per_page` | integer | ❌ | Resultados por página (default: 50) |
| `page` | integer | ❌ | Número de página (default: 1) |

### Ejemplos de búsqueda

**Por código anterior:**
```
GET /api/clientes?q=7338
```

**Por DUI:**
```
GET /api/clientes?q=02741470-9
```

**Por nombre:**
```
GET /api/clientes?q=Maria
```

**Por teléfono:**
```
GET /api/clientes?q=77856915
```

### Response (200)
```json
{
  "current_page": 1,
  "data": [
    {
      "id": 78,
      "nombre": "Maria Del Carmen",
      "apellido": "Hernandez",
      "dui": "02741470-9",
      "codigo_anterior": "7338",
      "telefono_normal": "77856915",
      "telefono_whatsapp": "77856915",
      "email": null,
      "direccion": "Calle Principal",
      "limite_credito": "500.00",
      "saldo": "148.00",
      "activo": true,
      "sucursal_id": 1
    }
  ],
  "first_page_url": "...",
  "last_page": 1,
  "per_page": 50,
  "total": 1
}
```

---

## 2. GET `/api/clientes/{id}` — Detalle de cliente

Obtiene toda la información de un cliente por su ID.

### Request
```
GET /api/clientes/78
Authorization: Bearer {token}
```

### Response (200)
```json
{
  "id": 78,
  "nombre": "Maria Del Carmen",
  "apellido": "Hernandez",
  "dui": "02741470-9",
  "nit": null,
  "telefono_normal": "77856915",
  "telefono_whatsapp": "77856915",
  "email": null,
  "direccion": "Calle Principal",
  "departamento": "Morazán",
  "municipio": "Gotera",
  "distrito": null,
  "limite_credito": "500.00",
  "saldo": "148.00",
  "activo": true,
  "sucursal_id": 1,
  "ruta_cobro_id": 3
}
```

### Response (404)
```json
{
  "message": "No query results for model [App\\Models\\Cliente] 999"
}
```

---

## Campos de búsqueda disponibles

| Campo | Ejemplo | Descripción |
|-------|---------|-------------|
| `nombre` | `Maria` | Nombre del cliente |
| `apellido` | `Hernandez` | Apellido del cliente |
| `dui` | `02741470-9` | Número de DUI |
| `codigo_anterior` | `7338` | Código del sistema anterior |
| `telefono_normal` | `77856915` | Teléfono principal |
| `telefono_whatsapp` | `77856915` | Teléfono WhatsApp |

---

## 3. POST `/api/clientes` — Crear cliente

Crea un nuevo cliente. Soporta subida de foto de la casa.

### Request
```
POST /api/clientes
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

### Parámetros (Body — multipart/form-data)
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `nombre` | string | ✅ | Nombre del cliente |
| `apellido` | string | ✅ | Apellido del cliente |
| `dui` | string | ❌ | DUI (debe ser único) |
| `codigo_anterior` | string | ❌ | Código del sistema anterior |
| `telefono_normal` | string | ❌ | Teléfono principal |
| `telefono_whatsapp` | string | ❌ | Teléfono WhatsApp |
| `email` | string | ❌ | Correo electrónico |
| `direccion` | string | ❌ | Dirección |
| `departamento` | string | ❌ | Departamento |
| `municipio` | string | ❌ | Municipio |
| `latitud` | float | ❌ | Latitud GPS |
| `longitud` | float | ❌ | Longitud GPS |
| `ruta_cobro_id` | integer | ❌ | ID de la ruta de cobro |
| `foto_casa` | file | ❌ | Foto de la casa (JPG, PNG, WEBP, máx 4MB) |

### Response (201)
```json
{
  "mensaje": "Cliente creado exitosamente.",
  "cliente": {
    "id": 170,
    "nombre": "Maria Hernandez",
    "dui": "02741470-9",
    "codigo_anterior": "7338",
    "telefono": "77856915",
    "foto_casa": "https://tudominio.com/storage/casas/foto.jpg"
  }
}
```

---

## 4. PATCH `/api/clientes/{id}/ubicacion` — Actualizar ubicación GPS

Actualiza las coordenadas de un cliente. Ideal para registrar la ubicación exacta al momento de la visita.

### Request
```
PATCH /api/clientes/78/ubicacion
Authorization: Bearer {token}
Content-Type: application/json

{
  "latitud": 13.9450,
  "longitud": -87.8700
}
```

### Parámetros
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `latitud` | float | ✅ | Latitud GPS (-90 a 90) |
| `longitud` | float | ✅ | Longitud GPS (-180 a 180) |

### Response (200)
```json
{
  "mensaje": "Ubicación actualizada.",
  "cliente": {
    "id": 78,
    "nombre": "Maria Del Carmen Hernandez",
    "latitud": 13.945,
    "longitud": -87.87
  }
}
```

---

## 5. PATCH `/api/clientes/{id}/telefonos` — Actualizar teléfonos

Actualiza el teléfono normal y/o WhatsApp de un cliente.

### Request
```
PATCH /api/clientes/78/telefonos
Authorization: Bearer {token}
Content-Type: application/json

{
  "telefono_normal": "75123456",
  "telefono_whatsapp": "75123456"
}
```

### Parámetros
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `telefono_normal` | string | ❌ | Teléfono principal (máx 20 caracteres) |
| `telefono_whatsapp` | string | ❌ | Teléfono WhatsApp (máx 20 caracteres) |

> Al menos uno de los dos debe enviarse. Podés actualizar solo uno si el otro no cambia.

### Response (200)
```json
{
  "mensaje": "Teléfonos actualizados.",
  "cliente": {
    "id": 78,
    "nombre": "Maria Del Carmen Hernandez",
    "telefono_normal": "75123456",
    "telefono_whatsapp": "75123456"
  }
}
```

---

## Flujo recomendado para el cobrador

```
1. Buscar cliente por código anterior, DUI o nombre
   GET /api/clientes?q=7338

2. Con el id obtenido, ver su detalle completo de cobros
   GET /api/cobros/clientes/{id}

3. Registrar el pago a la venta correspondiente
   POST /api/cobros/clientes/{id}/pagar
```

---

## Códigos de Error

| Código | Causa |
|--------|-------|
| **401** | Token inválido o no enviado |
| **404** | Cliente no encontrado |
