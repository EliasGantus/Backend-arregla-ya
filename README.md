# ArreglaYa Backend

API REST para ArreglaYa, separada del frontend y alineada con el contrato definido en el repo web.

## Stack

- Node + Express + TypeScript
- Prisma + PostgreSQL
- JWT access token + refresh token
- Zod para validación
- Vitest + Supertest para pruebas base

## Variables de entorno

Usa `.env.example` como base:

```bash
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/arreglaya"
JWT_ACCESS_SECRET="access-secret-dev"
JWT_REFRESH_SECRET="refresh-secret-dev"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
CORS_ORIGIN="http://localhost:5173"
MERCADOPAGO_ACCESS_TOKEN=""
MERCADOPAGO_API_BASE_URL="https://api.mercadopago.com"
PAYMENT_SUCCESS_URL="http://localhost:5173/pagos/exito"
PAYMENT_PENDING_URL="http://localhost:5173/pagos/pendiente"
PAYMENT_FAILURE_URL="http://localhost:5173/pagos/error"
MERCADOPAGO_WEBHOOK_SECRET=""
```

## Scripts

```bash
npm install
npm run prisma:generate
docker compose up -d
npm run prisma:push
npm run prisma:seed
npm run dev
```

El contenedor PostgreSQL de este proyecto se expone en `localhost:5433` para no chocar con otras instancias locales.

## Endpoints principales

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /me`
- `PATCH /me`
- `GET /users`
- `POST /users`
- `GET /users/:id`
- `PATCH /users/:id`
- `DELETE /users/:id`
- `GET /categories`
- `GET /categories/:id`
- `POST /categories`
- `PATCH /categories/:id`
- `DELETE /categories/:id`
- `GET /service-requests`
- `GET /service-requests/:id`
- `POST /service-requests`
- `PATCH /service-requests/:id`
- `GET /quotes/me`
- `POST /service-requests/:id/quotes`
- `GET /bookings`
- `GET /bookings/:id`
- `POST /bookings`
- `PATCH /bookings/:id`
- `GET /payments`
- `GET /payments/:id`
- `GET /payments/:id/receipt`
- `POST /bookings/:id/payments`
- `POST /payments/webhooks/mercadopago`
- `GET /professionals/search`
- `GET /professionals/:id/reviews`
- `POST /emergencies`
- `POST /reviews`
- `GET /admin/users`
- `GET /admin/service-requests`

## Usuarios seed

- `cliente@arreglaya.com`
- `pro@arreglaya.com`
- `admin@arreglaya.com`

Contraseña para los tres: `123456`
