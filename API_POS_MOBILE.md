# API de Monitor POS - Documentación

## Resumen General

El módulo POS permite que cada dispositivo Android envíe su estado periódicamente al servidor.
El administrador ve todos los dispositivos en tiempo real desde el panel **Monitoreo de POS** en Filament.

### Flujo general

```
POS Android                         Servidor Laravel
     │                                     │
     │── POST /api/pos/heartbeat ─────────▶│
     │   (cada 2 minutos aprox.)           │  Actualiza pos_devices
     │                                     │  Calcula estado automático
     │◀─ { ok: true, estado: "activo" } ───│
     │                                     │
```

### Estados posibles

| Estado | Condición |
|---|---|
| `activo` | Último ping hace menos de 10 minutos y batería > 20% |
| `bateria_baja` | Último ping reciente pero batería ≤ 20% |
| `sin_conexion` | Último ping hace más de 10 minutos |
| `apagado` | Nunca ha enviado heartbeat |

---

## Autenticación

Todos los endpoints usan **Laravel Sanctum**. El token se obtiene al hacer login.

```
Authorization: Bearer {token}
```

---

## POST `/api/pos/heartbeat`

Envía el estado actual del dispositivo al servidor. Debe llamarse cada **2 minutos** mientras la app esté activa.

Si el dispositivo no existe en la base de datos, se crea automáticamente usando el `device_serial`.

### Request

```
POST /api/pos/heartbeat
Authorization: Bearer {token}
Content-Type: application/json
```

### Body

```json
{
  "device_serial": "SN-ABC123456",
  "device_nombre": "POS-001",
  "lat": 13.6929,
  "lng": -89.2182,
  "bateria": 72,
  "app_version": "1.2.0",
  "error": null
}
```

### Campos

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `device_serial` | string | Sí | Número de serie o ID único del dispositivo (IMEI, Android ID, etc.) |
| `device_nombre` | string | No | Nombre amigable del POS (ej. "POS-001"). Solo se usa al crear por primera vez |
| `lat` | float | No | Latitud GPS actual. `null` si el usuario tiene ubicación desactivada |
| `lng` | float | No | Longitud GPS actual |
| `bateria` | integer 0–100 | No | Porcentaje de batería actual |
| `app_version` | string | No | Versión de la app instalada (ej. `"1.2.0"`) |
| `error` | string\|null | No | Último error interno de la app, si existe. `null` si todo está bien |

### Response exitoso (200)

```json
{
  "ok": true,
  "estado": "activo",
  "server_time": "2026-06-18T14:35:00-06:00"
}
```

### Respuesta — campos

| Campo | Descripción |
|---|---|
| `ok` | `true` si el heartbeat fue recibido correctamente |
| `estado` | Estado calculado por el servidor: `activo`, `bateria_baja`, `sin_conexion`, `apagado` |
| `server_time` | Hora del servidor en ISO 8601. Útil para sincronizar el reloj del POS |

### Response de error — dispositivo no autorizado (404)

Ocurre si el token Sanctum es inválido o el usuario no tiene acceso POS.

```json
{
  "message": "Unauthenticated."
}
```

---

## Ejemplos de integración Android

### Ejemplo 1 — Heartbeat normal (activo con GPS)

```json
POST /api/pos/heartbeat
{
  "device_serial": "SN-001-XYZ",
  "device_nombre": "POS-001",
  "lat": 13.6929,
  "lng": -89.2182,
  "bateria": 85,
  "app_version": "1.3.0",
  "error": null
}
```

**Response:**
```json
{
  "ok": true,
  "estado": "activo",
  "server_time": "2026-06-18T08:10:00-06:00"
}
```

---

### Ejemplo 2 — Batería baja (≤ 20%)

```json
POST /api/pos/heartbeat
{
  "device_serial": "SN-002-ABC",
  "lat": 13.7012,
  "lng": -89.1998,
  "bateria": 15,
  "app_version": "1.3.0",
  "error": null
}
```

**Response:**
```json
{
  "ok": true,
  "estado": "bateria_baja",
  "server_time": "2026-06-18T09:45:00-06:00"
}
```

> El servidor retorna `bateria_baja` para que la app pueda alertar al cobrador.

---

### Ejemplo 3 — GPS desactivado

```json
POST /api/pos/heartbeat
{
  "device_serial": "SN-003-DEF",
  "lat": null,
  "lng": null,
  "bateria": 60,
  "app_version": "1.3.0",
  "error": null
}
```

**Response:**
```json
{
  "ok": true,
  "estado": "activo",
  "server_time": "2026-06-18T10:20:00-06:00"
}
```

> Sin GPS el dispositivo sigue marcando `activo`. En el mapa del panel aparecerá sin marcador.

---

### Ejemplo 4 — Error de impresión reportado

```json
POST /api/pos/heartbeat
{
  "device_serial": "SN-004-GHI",
  "lat": 13.6750,
  "lng": -89.2300,
  "bateria": 45,
  "app_version": "1.3.0",
  "error": "Printer timeout: no response after 5000ms"
}
```

**Response:**
```json
{
  "ok": true,
  "estado": "activo",
  "server_time": "2026-06-18T11:05:00-06:00"
}
```

> El error se guarda en `ultimo_error` y se muestra en el panel del administrador.

---

## Implementación recomendada en Android (WorkManager)

Para enviar el heartbeat cada 2 minutos en segundo plano, usar `PeriodicWorkRequest`:

```kotlin
// HeartbeatWorker.kt
class HeartbeatWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val token    = PrefsHelper.getSanctumToken() ?: return Result.failure()
        val serial   = Settings.Secure.getString(applicationContext.contentResolver,
                           Settings.Secure.ANDROID_ID)
        val battery  = getBatteryLevel()
        val location = getLastLocation() // nullable

        val body = JSONObject().apply {
            put("device_serial", serial)
            put("device_nombre", "POS-${serial.takeLast(4).uppercase()}")
            put("lat",           location?.latitude)
            put("lng",           location?.longitude)
            put("bateria",       battery)
            put("app_version",   BuildConfig.VERSION_NAME)
            put("error",         PosErrorLog.lastError)
        }

        val response = ApiClient.post("/api/pos/heartbeat", token, body)
        return if (response.isSuccessful) Result.success() else Result.retry()
    }
}

// Registrar al iniciar sesión:
val request = PeriodicWorkRequestBuilder<HeartbeatWorker>(2, TimeUnit.MINUTES)
    .setConstraints(Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build())
    .build()

WorkManager.getInstance(context).enqueueUniquePeriodicWork(
    "pos_heartbeat",
    ExistingPeriodicWorkPolicy.KEEP,
    request
)
```

---

## Panel de administración

El administrador ve el estado en tiempo real en **Filament → POS → Monitor POS**.

El panel muestra:
- Cantidad de POS en línea / offline / batería baja
- Mapa con ubicación de cada dispositivo
- Tabla con estado, batería, última conexión, versión y ubicación
- Alertas para dispositivos con problemas
- Se actualiza automáticamente cada **30 segundos**

---

## Notas técnicas

- El `device_serial` debe ser **único por dispositivo**. Se recomienda usar el **Android ID** (`Settings.Secure.ANDROID_ID`) o el IMEI (requiere permiso `READ_PHONE_STATE`).
- Si un dispositivo no envía heartbeat por más de **10 minutos**, el panel lo marca automáticamente como `sin_conexion`.
- El estado `sin_conexion` se calcula en tiempo real al cargar el panel — no se almacena permanentemente.
- El campo `error` puede contener cualquier texto (máx. 65535 chars). Se recomienda enviar solo el mensaje de error más reciente, no un log completo.
