# LoQui Chain

Administración integral de cadenas de ahorro: participantes, sorteo físico de puestos, calendario de quincenas, pagos, entregas y caja.

Parte del ecosistema [LoQui Projects](https://github.com/JLopezCo-Git/loqui-platform) — usa `loqui-design-tokens` para diseño y el patrón de despliegue Fly.io + GitHub Actions documentado ahí. Arquitectura específica de este producto en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack

- Frontend: React + Vite + TypeScript + Tailwind v4 + `loqui-design-tokens`
- Backend: Node.js + Express (`server/`)
- Base de datos: SQLite (`better-sqlite3`)

## Desarrollo local

```bash
# Backend
cd server
npm install
cp .env.example .env
npm run init-db
npm run dev        # http://127.0.0.1:3001

# Frontend (otra terminal, desde la raíz)
npm install
npm run dev         # http://127.0.0.1:5173, proxy /api -> backend
```

Usuario inicial (creado por `npm run init-db`):

- Email: `admin@cadena.local`
- Contraseña: `Admin123*`

## Despliegue

Fly.io + GitHub Actions, nunca `fly deploy` local. Ver `docs/ARCHITECTURE.md` §6 y `loqui-platform/docs/CHECKLIST.md` §4-5 para los pasos exactos (crear app, volumen, secrets, DNS).

Secrets requeridos en Fly (no van en `fly.toml`):

```bash
fly secrets set JWT_SECRET=<valor-seguro> --app loqui-chain
```
