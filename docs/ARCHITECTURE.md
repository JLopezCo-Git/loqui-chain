# LoQui Chain — Arquitectura

> Documento vivo, nivel producto. Para arquitectura a nivel de ecosistema (marca, tokens de diseño, patrón de despliegue compartido), ver `loqui-platform/docs/ARCHITECTURE.md`.

## 1. Qué es esto

Administración integral de cadenas de ahorro tipo "natilleras"/"cadenas": gestión de participantes, sorteo físico de puestos con balotas, calendario de quincenas, pagos, entregas y caja. Un solo tenant (una organización, sin aislamiento multi-cliente).

## 2. Stack

- **Frontend**: React 19 + Vite + TypeScript + Tailwind v4 + `loqui-design-tokens`, `react-router-dom` para las páginas.
- **Backend**: Node.js + Express bajo `server/`, API REST en `/api`.
- **Base de datos**: SQLite (`better-sqlite3`), un único archivo (`DB_PATH`), sin aislamiento por tenant.
- **Despliegue**: Fly.io + GitHub Actions (ver §6).

## 3. Autenticación y autorización

JWT (`jsonwebtoken`) con expiración de 12h, contraseñas con `bcryptjs`. Tres roles (`server/src/db/initDb.js`):

- `ADMIN_PRINCIPAL` / `ADMIN_SECUNDARIO`: acceso completo a todas las rutas de negocio (`requireAdmin` en `server/src/middleware/auth.js`).
- `PARTICIPANTE`: autenticado pero sin permisos de administración todavía (no hay rutas de solo-participante implementadas).

`requirePrincipal` existe para operaciones reservadas al admin principal, aún no usado en ninguna ruta — disponible para cuando se necesite (p. ej. gestión de usuarios).

## 4. Dominios de datos

Modelo en `server/src/db/initDb.js`, lógica de negocio en `server/src/services/cadenaService.js`:

- **cadenas**: ciclo de vida `BORRADOR → PENDIENTE_SORTEO → SORTEO_REGISTRADO → ACTIVA`. `valor_puesto_total = valor_aporte_quincenal * numero_puestos`. Puede clonarse desde una cadena origen (`cadena_origen_id`, `copiarCadena()`).
- **participantes** y **cadena_participantes**: un participante puede vincularse a varias cadenas, con fracción de puesto.
- **puestos_cadena**: resultado del sorteo físico con balotas — cada puesto puede repartirse en fracciones (completo/medio/cuarto) que deben sumar exactamente 1 (`validarSorteo()`).
- **quincenas / obligaciones / pagos**: al confirmar el sorteo (`confirmarSorteo()`) se genera el calendario de quincenas (si no existe) y una obligación de pago por participante y quincena. Los pagos actualizan `saldo_pendiente` y el estado (`PENDIENTE/PARCIAL/PAGADA`).
- **entregas**: una por puesto y quincena, con el turno de entrega calculado por `numero_puesto === numero_quincena`. Registrar una entrega valida que no exceda `saldoCaja()`.
- **caja_movimientos**: libro de entradas (pagos) y salidas (entregas) por cadena; `saldoCaja()` es la suma `entrada - salida`.
- **auditoria**: cada mutación relevante pasa por `auditService.audit()` con antes/después.

## 5. Agente de reglas (`server/src/routes/iaRoutes.js`)

`POST /api/ia/consultar` es un motor de reglas por coincidencia de palabras clave sobre la pregunta (`mora`/`pendiente`, `caja`/`cuadra`, `entrega`) — **no es un LLM**, no hay tool-calling ni proveedor de IA configurado. Es de solo lectura: nunca escribe en la base de datos.

Si en el futuro se necesita un agente con lectura y escritura (por ejemplo, registrar un pago desde lenguaje natural), el patrón de referencia en el ecosistema es `cuentas-familiares/server/services/ai/`: tool-calling con `MUTATION_TOOLS`, ejecución inmediata de herramientas de solo lectura, y toda escritura devuelta como `pendingAction` que requiere confirmación explícita del usuario antes de ejecutarse. No diseñar un patrón de confirmación nuevo — replicar ese.

## 6. Despliegue

Fly.io + GitHub Actions, nunca `fly deploy` local (el builder remoto de Fly falla desde la red de desarrollo local). Un solo contenedor: `Dockerfile` construye el frontend (`npm run build` → `dist/`) y el backend en etapas separadas; en runtime, `server/src/server.js` sirve `/api/*` y, cuando `NODE_ENV=production`, también sirve el `dist/` estático con fallback a `index.html` para las rutas de `react-router`.

`fly.toml` monta un volumen persistente en `/data` — `DB_PATH` en producción debe apuntar ahí (`/data/cadena.sqlite`), nunca a un path efímero del contenedor.

Pasos exactos: `loqui-platform/docs/CHECKLIST.md` §4-5.

## 7. Convenciones de código

- Backend en JS (ESM, `type: module`), frontend en TypeScript.
- Validación de entrada con `zod` en cada ruta que recibe body.
- Montos como `REAL` (no enteros) — deuda técnica conocida heredada del diseño original, ver §9.
- No definir colores/tipografía nuevos en el frontend — todo viene de `loqui-design-tokens` vía utilidades semánticas (`bg-surface`, `text-text-muted`, etc.).

## 8. Verificar antes de desplegar

- `cd server && npm install && npm run init-db && npm run dev` — `GET /health` responde `{ ok: true }`, login con `admin@cadena.local` / `Admin123*` funciona.
- `npm install && npm run build` en la raíz — build de TypeScript sin errores.
- Con el backend corriendo, `npm run dev` en la raíz y probar manualmente cada página (Dashboard, Cadenas, Participantes, Sorteo, Pagos, Entregas, IA).

## 9. Deuda técnica conocida

- Sin HTTPS local (se resuelve en producción vía Fly + certs).
- Sin refresh tokens (JWT expira a las 12h, requiere volver a loguear).
- Sin migraciones versionadas — `initDb.js` usa `CREATE TABLE IF NOT EXISTS`, cualquier cambio de esquema futuro necesita una estrategia de migración real.
- Sin backups automáticos del volumen SQLite.
- Sin logs persistentes más allá de `morgan('dev')` en stdout.
- Sin pruebas automatizadas.
- Montos financieros como `REAL` en vez de enteros (centavos) — a diferencia del patrón recomendado en `cuentas-familiares`; considerar migrar si crece el volumen de transacciones.
- Permisos de rol `PARTICIPANTE` no implementados (solo existe el rol, sin rutas específicas).
