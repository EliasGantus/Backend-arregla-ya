# Notas de integración con el frontend

## Formato de errores

Todas las respuestas de error siguen este shape:

```json
{
  "message": "Descripción legible",
  "code": "ERROR_CODE",
  "details": {}
}
```

## Auth

- El frontend envía `Authorization: Bearer <accessToken>`.
- El refresh token se manda en el body de `POST /auth/refresh`.
- `POST /auth/logout` invalida el refresh token persistido.

## Reglas de acceso actuales

- `cliente` puede crear y gestionar sus propias solicitudes.
- `profesional` puede ver solicitudes abiertas/cotizadas y cotizar.
- `admin` puede ver usuarios y solicitudes globales.

## Seed útil para frontend

Después de correr `prisma migrate` y `prisma seed`, el frontend puede autenticarse con:

- `cliente@arreglaya.com`
- `pro@arreglaya.com`
- `admin@arreglaya.com`

Password común: `123456`
