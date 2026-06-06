# API POS — Crear cliente desde el POS

## Objetivo

Permitir que un vendedor cree un cliente nuevo desde la API POS con los datos mínimos necesarios y opcionalmente agregar coordenadas y fotos del DUI.

## Endpoint

- Método: `POST`
- URL: `/api/clientes`
- Requiere: `Authorization: Bearer <token>`
- Acceso: solo usuarios con perfil `vendedor` activo

## Campos permitidos

### Requeridos
- `nombre`: string
- `apellido`: string
- `dui`: string único en la tabla `clientes`
- `telefono_normal`: string

### Opcionales
- `telefono_whatsapp`: string
- `latitud`: número decimal entre `-90` y `90`
- `longitud`: número decimal entre `-180` y `180`
- `dui_foto_frente`: archivo de imagen (`jpeg`, `png`, `webp`, max 4 MB)
- `dui_foto_reverso`: archivo de imagen (`jpeg`, `png`, `webp`, max 4 MB)
- `sucursal_id`: integer (si no se envía, se usará la sucursal del vendedor)

## Ejemplo de uso en Postman

1. Configura la petición como `POST http://192.168.100.5:8000/api/clientes`
2. Agrega el header:
   - `Authorization: Bearer <token>`
3. En el body selecciona `form-data` y agrega los campos:
   - `nombre`: `Juan`
   - `apellido`: `Pérez`
   - `dui`: `01234567-8`
   - `telefono_normal`: `2222-3333`
   - `telefono_whatsapp`: `7000-0000`
   - `latitud`: `13.69294`
   - `longitud`: `-89.21819`
   - `dui_foto_frente`: archivo de imagen
   - `dui_foto_reverso`: archivo de imagen

## Ejemplo de uso con curl

```bash
curl -X POST http://192.168.100.5:8000/api/clientes \
  -H "Authorization: Bearer TU_TOKEN" \
  -F "nombre=Juan" \
  -F "apellido=Pérez" \
  -F "dui=01234567-8" \
  -F "telefono_normal=2222-3333" \
  -F "telefono_whatsapp=7000-0000" \
  -F "latitud=13.69294" \
  -F "longitud=-89.21819" \
  -F "dui_foto_frente=@/ruta/a/dui_frente.jpg" \
  -F "dui_foto_reverso=@/ruta/a/dui_reverso.jpg"
```

## Respuesta exitosa

- Código HTTP: `201`
- Retorna el cliente creado en JSON.

Ejemplo de respuesta:

```json
{
  "id": 123,
  "nombre": "Juan",
  "apellido": "Pérez",
  "dui": "01234567-8",
  "telefono_normal": "2222-3333",
  "telefono_whatsapp": "7000-0000",
  "latitud": "13.69294",
  "longitud": "-89.21819",
  "dui_foto_frente": "dui/frente/archivo.jpg",
  "dui_foto_reverso": "dui/reverso/archivo.jpg",
  "activo": true,
  "sucursal_id": 1
}
```

## Notas importantes

- El campo `dui` debe ser único.
- Si el vendedor no envía `sucursal_id`, se asigna automáticamente su sucursal.
- Las imágenes del DUI se guardan en almacenamiento público y quedan registradas en los campos `dui_foto_frente` y `dui_foto_reverso`.
- Si no usa fotos, puede omitir los campos `dui_foto_frente` y `dui_foto_reverso`.
