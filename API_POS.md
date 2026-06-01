# API POS — SIDB

Documentación de uso de la API RESTful para el punto de venta.  
Autenticación: **Laravel Sanctum (Bearer Token)**.

**UI interactiva (Swagger):** `http://localhost/SIDB/public/api/documentation`

---

## Base URL

```
http://localhost/SIDB/public/api
```

> En emulador Android usar `http://10.0.2.2/SIDB/public/api`

---

## Autenticación

### Login

```http
POST /api/login
Content-Type: application/json
```

**Body:**
```json
{
  "email": "admin@sidb.local",
  "password": "tu-password"
}
```

**Respuesta `200`:**
```json
{
  "token": "1|abc123xyz...",
  "user": {
    "id": 1,
    "name": "Admin",
    "email": "admin@sidb.local",
    "roles": ["super_admin"]
  }
}
```

> Guarda el `token`. Todas las demás peticiones lo necesitan en el header:

```http
Authorization: Bearer 1|abc123xyz...
```

---

### Usuario actual

```http
GET /api/me
Authorization: Bearer {token}
```

**Respuesta `200`:**
```json
{
  "id": 1,
  "name": "Admin",
  "email": "admin@sidb.local",
  "roles": ["cajero"],
  "permisos": ["crear_ventas", "ver_productos"],
  "sucursales": [
    { "id": 1, "nombre": "Sucursal Central" }
  ]
}
```

---

### Logout

```http
POST /api/logout
Authorization: Bearer {token}
```

**Respuesta `200`:**
```json
{ "message": "Sesión cerrada correctamente." }
```

---

## Categorías

### Listar categorías activas

```http
GET /api/categorias
GET /api/categorias?sucursal_id=1
Authorization: Bearer {token}
```

**Respuesta `200`:**
```json
[
  { "id": 1, "nombre": "Electrónica", "descripcion": null, "icono": null },
  { "id": 2, "nombre": "Ropa",        "descripcion": null, "icono": null }
]
```

---

## Productos

### Listar / buscar productos

```http
GET /api/productos
GET /api/productos?q=televisor
GET /api/productos?q=TV-40-SAMSUNG
GET /api/productos?categoria_id=1&sucursal_id=1&per_page=20&page=1
Authorization: Bearer {token}
```

| Param | Tipo | Descripción |
|---|---|---|
| `q` | string | Busca en nombre y código |
| `categoria_id` | integer | Filtrar por categoría |
| `sucursal_id` | integer | Filtrar por sucursal |
| `per_page` | integer | Resultados por página (default `50`) |
| `page` | integer | Página (default `1`) |

**Respuesta `200`:**
```json
{
  "current_page": 1,
  "last_page": 3,
  "per_page": 20,
  "total": 55,
  "data": [
    {
      "id": 5,
      "nombre": "Televisor 40\"",
      "codigo": "TV-40-SAMSUNG",
      "precio_venta": "299.99",
      "precios_cuotas": { "12": 27.50, "24": 14.99 },
      "stock": 15,
      "categoria_id": 1,
      "imagen": null,
      "activo": true
    }
  ]
}
```

### Ver producto por ID

```http
GET /api/productos/{id}
Authorization: Bearer {token}
```

---

## Clientes

### Listar / buscar clientes

```http
GET /api/clientes
GET /api/clientes?q=juan
GET /api/clientes?q=01234567-8
GET /api/clientes?q=7000-0000&sucursal_id=1
Authorization: Bearer {token}
```

| Param | Tipo | Descripción |
|---|---|---|
| `q` | string | Busca en nombre, apellido, DUI y teléfonos |
| `sucursal_id` | integer | Filtrar por sucursal |
| `per_page` | integer | Default `50` |

### Ver cliente por ID

```http
GET /api/clientes/{id}
Authorization: Bearer {token}
```

---

## Ventas

### Listar ventas

```http
GET /api/ventas
GET /api/ventas?estado=pendiente
GET /api/ventas?estado=completada&sucursal_id=1&per_page=20
Authorization: Bearer {token}
```

| Param | Valores | Descripción |
|---|---|---|
| `estado` | `completada` \| `pendiente` \| `anulada` | Filtrar por estado |
| `sucursal_id` | integer | Filtrar por sucursal |

### Ver venta con detalles y pagos

```http
GET /api/ventas/{id}
Authorization: Bearer {token}
```

### Crear venta (contado)

```http
POST /api/ventas
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "cliente_id": 1,
  "sucursal_id": 1,
  "tipo_pago": "contado",
  "descuento_porcentaje": 5,
  "observaciones": "Cliente frecuente",
  "detalles": [
    {
      "producto_id": 5,
      "cantidad": 2,
      "precio_unitario": 299.99,
      "descuento_porcentaje": 0
    },
    {
      "producto_id": 8,
      "cantidad": 1,
      "precio_unitario": 49.99,
      "descuento_porcentaje": 10
    }
  ]
}
```

### Crear venta (crédito)

```json
{
  "cliente_id": 1,
  "sucursal_id": 1,
  "tipo_pago": "credito",
  "dias_credito": 30,
  "detalles": [
    {
      "producto_id": 5,
      "cantidad": 1,
      "precio_unitario": 299.99,
      "descuento_porcentaje": 0
    }
  ]
}
```

**Respuesta `201`:**
```json
{
  "id": 12,
  "numero_venta": "VNT-A1B2C3D4",
  "cliente_id": 1,
  "sucursal_id": 1,
  "tipo_pago": "contado",
  "estado": "completada",
  "subtotal": "599.98",
  "descuento_monto": "30.00",
  "total": "569.98",
  "monto_pagado": "569.98",
  "saldo_pendiente": "0.00",
  "fecha_venta": "2026-06-01T00:00:00.000000Z",
  "detalles": [ ... ]
}
```

#### Campos de detalle requeridos

| Campo | Tipo | Descripción |
|---|---|---|
| `producto_id` | integer | ID del producto |
| `cantidad` | integer | Cantidad (mín. 1) |
| `precio_unitario` | float | Precio de venta aplicado |
| `descuento_porcentaje` | float | Descuento por línea (0-100) |

---

## Pagos de venta

### Listar pagos de una venta

```http
GET /api/ventas/{venta}/pagos
Authorization: Bearer {token}
```

### Registrar un pago

```http
POST /api/ventas/{venta}/pagos
Authorization: Bearer {token}
Content-Type: application/json
```

**Body:**
```json
{
  "monto": 150.00,
  "metodo_pago": "efectivo",
  "fecha_pago": "2026-06-01",
  "referencia": null,
  "observaciones": "Abono mensual"
}
```

| Campo | Valores | Descripción |
|---|---|---|
| `monto` | float | Debe ser ≤ saldo pendiente |
| `metodo_pago` | `efectivo` \| `transferencia` \| `tarjeta` \| `cheque` | Requerido |
| `fecha_pago` | date | Opcional, default hoy |

**Respuesta `201`:**
```json
{
  "pago": { "id": 3, "monto": "150.00", "metodo_pago": "efectivo", ... },
  "saldo_pendiente": "149.99",
  "estado": "pendiente"
}
```

---

## Roles y Permisos

### Listar roles

```http
GET /api/roles
Authorization: Bearer {token}
```

**Respuesta `200`:**
```json
[
  {
    "id": 1,
    "name": "cajero",
    "guard_name": "web",
    "permissions": [
      { "id": 3, "name": "crear_ventas" },
      { "id": 5, "name": "ver_productos" }
    ]
  }
]
```

### Ver rol

```http
GET /api/roles/{id}
Authorization: Bearer {token}
```

### Crear rol

```http
POST /api/roles
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "cajero",
  "guard_name": "web"
}
```

### Actualizar nombre de rol

```http
PUT /api/roles/{id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "supervisor"
}
```

### Eliminar rol

```http
DELETE /api/roles/{id}
Authorization: Bearer {token}
```

> No se puede eliminar el rol `super_admin` (retorna `403`).

### Listar todos los permisos del sistema

```http
GET /api/permisos
Authorization: Bearer {token}
```

**Respuesta `200`:**
```json
[
  { "id": 1, "name": "crear_ventas" },
  { "id": 2, "name": "ver_ventas" },
  { "id": 3, "name": "ver_productos" }
]
```

### Asignar permisos a un rol (reemplaza todos)

```http
PUT /api/roles/{id}/permisos
Authorization: Bearer {token}
Content-Type: application/json

{
  "permisos": ["crear_ventas", "ver_ventas", "ver_productos", "ver_clientes"]
}
```

> Enviar arreglo vacío `[]` quita todos los permisos del rol.

---

## Códigos de respuesta

| Código | Significado |
|---|---|
| `200` | OK |
| `201` | Recurso creado |
| `401` | Token inválido o no enviado |
| `403` | Acción no permitida |
| `404` | Recurso no encontrado |
| `422` | Error de validación — ver campo `errors` |

**Formato error `422`:**
```json
{
  "message": "The given data was invalid.",
  "errors": {
    "email": ["The email field is required."],
    "detalles": ["The detalles field must have at least 1 items."]
  }
}
```

---

## Ejemplos de integración

### JavaScript (fetch)

```js
const API = 'http://localhost/SIDB/public/api'
let token = ''

// 1. Login
const loginRes = await fetch(`${API}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@sidb.local', password: 'secret' })
})
const { token: t } = await loginRes.json()
token = t

// Helper
const get = (path) => fetch(`${API}${path}`, {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json())

const post = (path, body) => fetch(`${API}${path}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify(body)
}).then(r => r.json())

// 2. Buscar producto por código
const { data: productos } = await get('/productos?q=TV-40-SAMSUNG')

// 3. Crear venta
const venta = await post('/ventas', {
  cliente_id: 1,
  sucursal_id: 1,
  tipo_pago: 'contado',
  detalles: [{ producto_id: 5, cantidad: 1, precio_unitario: 299.99, descuento_porcentaje: 0 }]
})
```

---

### Dart / Flutter

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

const baseUrl = 'http://10.0.2.2/SIDB/public/api'; // emulador Android
// const baseUrl = 'http://localhost/SIDB/public/api'; // web/iOS

String token = '';

Future<void> login() async {
  final res = await http.post(
    Uri.parse('$baseUrl/login'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({'email': 'admin@sidb.local', 'password': 'secret'}),
  );
  token = jsonDecode(res.body)['token'];
}

Map<String, String> get headers => {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $token',
};

Future<List> buscarProductos(String q) async {
  final res = await http.get(
    Uri.parse('$baseUrl/productos?q=${Uri.encodeComponent(q)}'),
    headers: headers,
  );
  return jsonDecode(res.body)['data'];
}

Future<Map> crearVenta(Map<String, dynamic> body) async {
  final res = await http.post(
    Uri.parse('$baseUrl/ventas'),
    headers: headers,
    body: jsonEncode(body),
  );
  return jsonDecode(res.body);
}
```

---

### Axios (Vue / React)

```js
import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost/SIDB/public/api' })

// Interceptor: agregar token automáticamente
api.interceptors.request.use(config => {
  const token = localStorage.getItem('pos_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Login
const { data } = await api.post('/login', { email, password })
localStorage.setItem('pos_token', data.token)

// Uso
const productos = await api.get('/productos', { params: { q: 'televisor' } })
const venta     = await api.post('/ventas', ventaPayload)
const pagos     = await api.get(`/ventas/${ventaId}/pagos`)
```
