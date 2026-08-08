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

- **cadenas**: ciclo de vida `BORRADOR → PENDIENTE_SORTEO → ACTIVA`. `numero_puestos` **no se pide al crear** — arranca en `0` y se deduce al cerrar el sorteo (ver `puestos_cadena` abajo); `valor_puesto_total = valor_aporte_quincenal * numero_puestos` se recalcula en ese momento. Puede clonarse desde una cadena origen (`cadena_origen_id`, `copiarCadena()` — solo copia participantes, nunca `numero_puestos`, porque el conteo de esta cadena puede terminar distinto al de la anterior).
- **participantes** y **cadena_participantes**: un participante puede vincularse a varias cadenas, con fracción de puesto.
- **puestos_cadena**: resultado del sorteo físico con balotas — cada número de puesto puede repartirse en fracciones (completo/3-4/medio/cuarto/lo que sea) que deben sumar exactamente 1 (`validarSorteo()`, sin límite superior mientras la cadena está `PENDIENTE_SORTEO`). El número de puesto **es** la quincena de entrega (`numero_puesto === numero_quincena`), no son conceptos separados. `validarSorteo()` recorre 1..máximo-número-asignado buscando huecos y devuelve ese máximo — así es como se deduce `numero_puestos`, no hay un tope fijado de antemano.
- **quincenas / obligaciones / pagos**: `cerrarSorteoYActivar()` (`cadenaService.js`) colapsa en un solo paso lo que antes eran tres endpoints (generar calendario, confirmar sorteo, activar) — genera el calendario si falta (usa `fecha_inicio`, ahora obligatoria al crear la cadena), valida que los puestos sumen 1, genera las obligaciones/entregas y activa la cadena. `generarObligacionesParaPuesto()` es la pieza reutilizable: la usa tanto el cierre de sorteo como `sorteoRoutes.js` cuando se asigna un puesto a una cadena ya `ACTIVA` (obligaciones retroactivas, caso borde). Los pagos actualizan `saldo_pendiente` y el estado (`PENDIENTE/PARCIAL/PAGADA`).
  - `generarFechasQuincenales()` (`cadenaService.js`) ancla cada quincena al **15 o al 30 real del calendario** (o al último día del mes si tiene menos de 30, ej. febrero) — nunca "cada 15 días corridos" desde `fecha_inicio`, porque eso se desalinea apenas un mes tiene 31 días (bug real detectado y corregido 2026-08-08: la 3ª quincena caía el 14, no el 15). Arranca en 15 si `fecha_inicio` cae entre el 1 y el 15 del mes, o en fin de mes si cae después del 15.
  - `cerrarQuincena(cadenaId, quincenaId, usuarioId)` (`POST /cadenas/:id/quincenas/:quincenaId/cerrar`): marca TODA una quincena como resuelta en un solo paso — paga el saldo pendiente de todas las obligaciones de esa quincena y entrega todo lo programado para ese ciclo, en una única transacción (si la caja no alcanza para la entrega, no se aplica nada). Marca `quincenas.estado = 'CERRADA'`. Pensado para el caso real de "ya sé que todos pagaron y ya se entregó, no quiero marcar uno por uno".
- **entregas**: una por puesto y quincena, con el turno de entrega calculado por `numero_puesto === numero_quincena`. Registrar una entrega valida que no exceda `saldoCaja()`.
- **caja_movimientos**: libro de entradas (pagos) y salidas (entregas) por cadena; `saldoCaja()` es la suma `entrada - salida`.
- **arqueos_caja / arqueo_items**: conteo físico de caja (ver `Cuentas` en `Cadena2026.xlsx`) — no es lo mismo que `caja_movimientos` (que es teórico, según lo registrado). `arqueoRoutes.js` calcula `esperado` en el servidor, nunca a mano ni confiando en el cliente — y **solo suma `valor_pagado` de las quincenas que todavía tienen algún pago pendiente** (`esperadoCadena()`): una quincena ya cerrada (todos pagaron, ya se entregó) es un ciclo resuelto, su plata ya entró y salió de la caja, así que no debe seguir sumando para siempre al esperado del arqueo. Cada arqueo guarda `efectivo_contado` (con el desglose de billetes en `denominaciones`, JSON) más una lista libre de `arqueo_items` (etiqueta + monto — cuentas digitales, préstamos, gastos por discriminar; no son dos casillas fijas). `faltaReponer = esperado - efectivo_contado - SUM(items.monto)` se calcula al leer, nunca se guarda (evita que quede desactualizado). Cada guardado es una foto nueva (historial), no se edita un arqueo existente.
- **auditoria**: cada mutación relevante pasa por `auditService.audit()` con antes/después.

Modelo de armado de una cadena, alineado a cómo se juega en la práctica (ver `Cadena2026.xlsx` de referencia): los participantes son un pool recurrente entre cadenas (`copiarCadena()` clona la lista de jugadores de una cadena origen a una nueva, vía `cadena_origen_id` al crear); el sorteo es un solo evento (asignar puesto a cada jugador) que la UI (`src/pages/Cadenas.tsx`) expone como un único flujo: crear/clonar → agregar o quitar jugadores → asignar puestos → "cerrar sorteo y activar". El dashboard (`src/components/cadena/CadenaGrid.tsx`) muestra la cadena activa como grilla participante×quincena, con click-to-pay/entregar, igual que el Excel.

**Edición y borrado** — reglas de negocio deliberadas, no accidentes de implementación:
- **Participante**: editar (nombre/celular/observaciones) sin restricción; **borrar bloqueado (409)** si está vinculado a alguna cadena (`cadena_participantes`) — evita perder historial de pagos por accidente. Hay que desvincularlo primero.
- **Cadena**: editar sin restricción de estado (incluso `ACTIVA`) — si se cambia `valor_aporte_quincenal`/`numero_puestos` después de cerrado el sorteo, las obligaciones/entregas ya generadas **no se recalculan** (la UI lo advierte, pero no lo bloquea). Borrar una cadena hace cascada completa (jugadores, puestos, calendario, obligaciones, pagos, entregas, caja, arqueos) y limpia `cadena_origen_id` en cualquier cadena clonada desde ella, para no romper la FK.
- **Quitar jugador de una cadena** (`DELETE /participantes/vincular/:cadenaId/:participanteId`) y **deshacer un puesto del sorteo** (`DELETE /sorteo/:puestoId`): solo mientras la cadena está `PENDIENTE_SORTEO`. Una vez cerrado el sorteo (`ACTIVA`) ya existen obligaciones/entregas/movimientos de caja reales — deshacer eso es una reversión financiera que este endpoint no intenta resolver; queda como límite conocido (§9).

## 5. Agente de reglas (`server/src/routes/iaRoutes.js`)

`POST /api/ia/consultar` es un motor de reglas por coincidencia de palabras clave sobre la pregunta (`mora`/`pendiente`, `caja`/`cuadra`, `entrega`) — **no es un LLM**, no hay tool-calling ni proveedor de IA configurado. Es de solo lectura: nunca escribe en la base de datos.

Si en el futuro se necesita un agente con lectura y escritura (por ejemplo, registrar un pago desde lenguaje natural), el patrón de referencia en el ecosistema es `cuentas-familiares/server/services/ai/`: tool-calling con `MUTATION_TOOLS`, ejecución inmediata de herramientas de solo lectura, y toda escritura devuelta como `pendingAction` que requiere confirmación explícita del usuario antes de ejecutarse. No diseñar un patrón de confirmación nuevo — replicar ese.

## 6. Despliegue

> `better-sqlite3@13.x` requiere Node ≥22 (ver `engines` en su `package.json`) — el `Dockerfile` usa `node:22-bookworm-slim` en las tres etapas por esto. Bajarlo a Node 20 crashea el proceso con SIGSEGV al cargar el binario nativo (visto en el primer deploy real, 2026-08-06).
>
> `server.js` importa `db/initDb.js` al arrancar (efecto de módulo, `CREATE TABLE IF NOT EXISTS` + seed del admin solo si no existe) — el esquema y el usuario inicial se garantizan en cada boot, sobre el volumen que sea. No usar `release_command` en `fly.toml` para esto: en apps con `[[mounts]]`, la máquina de `release_command` no siempre tiene el volumen adjunto.


Fly.io + GitHub Actions, nunca `fly deploy` local (el builder remoto de Fly falla desde la red de desarrollo local). Un solo contenedor: `Dockerfile` construye el frontend (`npm run build` → `dist/`) y el backend en etapas separadas; en runtime, `server/src/server.js` sirve `/api/*` y, cuando `NODE_ENV=production`, también sirve el `dist/` estático con fallback a `index.html` para las rutas de `react-router`.

`fly.toml` monta un volumen persistente en `/data` — `DB_PATH` en producción debe apuntar ahí (`/data/cadena.sqlite`), nunca a un path efímero del contenedor.

Pasos exactos: `loqui-platform/docs/CHECKLIST.md` §4-5.

## 7. Convenciones de código

- Backend en JS (ESM, `type: module`), frontend en TypeScript.
- Validación de entrada con `zod` en cada ruta que recibe body.
- Montos como `REAL` (no enteros) — deuda técnica conocida heredada del diseño original, ver §9.
- No definir colores/tipografía nuevos en el frontend — todo viene de `loqui-design-tokens` vía utilidades semánticas (`bg-surface`, `text-text-muted`, etc.). Los estados semánticos (pagada/pendiente/vencida) se implementan **reasignando el uso** de `success`/`warning`/`error` ya existentes, no agregando tokens de color nuevos — ver la nota en `CadenaGrid.tsx` sobre por qué "pendiente dentro de plazo" ya no usa `error`.
- Confirmaciones de acciones destructivas o irreversibles (borrar cadena, quitar jugador, cerrar sorteo, marcar pago/entrega) usan `components/ui/ConfirmPopover.tsx`, nunca `window.confirm`/`window.alert` — no son estilizables ni consistentes entre navegadores/lectores de pantalla.
- Botones que son solo un símbolo/ícono (sin texto) usan `Button variant="icon"` (24×24 mínimo, WCAG 2.5.8) y **siempre** llevan `aria-label` — nunca un `<button>` a mano con solo `×` o un ícono.
- Vista de matriz de pagos: en escritorio (`≥768px`) es `CadenaGrid.tsx`; en móvil es `AgendaQuincena.tsx` (vista por quincena, no la misma tabla comprimida) — el switch lo decide `useIsMobile()` (`src/hooks/useIsMobile.ts`), con el mismo umbral que el breakpoint `md` de Tailwind (768px). Si se ajusta uno, ajustar el otro.

## 8. Verificar antes de desplegar

- `cd server && npm install && npm run init-db && npm run dev` — `GET /health` responde `{ ok: true }`, login con `admin@cadena.local` / `Admin123*` funciona.
- `npm install && npm run build` en la raíz — build de TypeScript sin errores.
- Con el backend corriendo, `npm run dev` en la raíz y probar manualmente cada página (Dashboard — atención requerida, grilla/agenda y arqueo de caja incluidos, Cadenas — incluye el sorteo inline, Participantes, IA).
- **No hay navegador headless disponible en el entorno de desarrollo de este proyecto** — el comportamiento responsive (375/768/1024/1440/1920px) y el foco visible/lector de pantalla se verifican por inspección de las clases de Tailwind usadas, no con captura real. Verificar visualmente en un navegador real antes de confiar ciegamente en un cambio de layout grande.

## 9. Deuda técnica conocida

- Sin HTTPS local (se resuelve en producción vía Fly + certs).
- Sin refresh tokens (JWT expira a las 12h, requiere volver a loguear).
- Sin migraciones versionadas — `initDb.js` usa `CREATE TABLE IF NOT EXISTS`, cualquier cambio de esquema futuro necesita una estrategia de migración real.
- Sin backups automáticos del volumen SQLite.
- Sin logs persistentes más allá de `morgan('dev')` en stdout.
- Sin pruebas automatizadas.
- Montos financieros como `REAL` en vez de enteros (centavos) — a diferencia del patrón recomendado en `cuentas-familiares`; considerar migrar si crece el volumen de transacciones.
- Permisos de rol `PARTICIPANTE` no implementados (solo existe el rol, sin rutas específicas).
- `Cadenas.tsx` sigue siendo un componente grande que mezcla crear/listar/editar/sorteo en un solo archivo — se agregaron confirmaciones y mejoras puntuales (auditoría UX 2026-08-07) pero no se dividió en subcomponentes; queda pendiente si crece más.
- `POST /pagos/:obligacionId/deshacer` reversa el **último** pago de una obligación (no un pago arbitrario por id — el frontend nunca necesita saber el id del pago individual, solo el de la obligación). Recalcula `valor_pagado/saldo_pendiente/estado` desde `SUM(pagos)` restantes (no resta a mano) y borra el `caja_movimientos` asociado. Bloqueado (400) si `valor_pago > saldoCaja(cadena)` — o sea, si ese dinero ya salió en una entrega, no se puede deshacer el pago sin antes deshacer la entrega (no implementado; ver limitación siguiente). Expuesto en `CadenaGrid`/`AgendaQuincena` como un botón "↺" junto a cualquier celda con `valor_pagado > 0`.
- Sigue sin existir reversa de **entregas** — si el dinero de un pago ya se entregó, ese pago queda bloqueado para deshacer (por diseño, ver punto anterior). Sería una reversión financiera real (afecta `caja_movimientos` con un movimiento de signo contrario), no un simple `DELETE`.
- El pago parcial (`ConfirmPopover` con `children`, campo de monto editable en `CadenaGrid`/`AgendaQuincena`/`AtencionRequerida`) ya lo soportaba `POST /pagos` desde el principio (`valor_pago` siempre fue libre, el backend calcula `PARCIAL`/`PAGADA` solo) — el gap era puramente de UI, que solo ofrecía pagar el saldo completo con un click.
- `POST /pagos` acepta `fecha_pago` opcional (string) para registrar hoy un pago que ocurrió antes; si se omite, usa el `DEFAULT CURRENT_TIMESTAMP` de la columna. `metodo_pago` sigue siendo texto libre en el backend (`src/constants/metodosPago.ts` en el frontend solo da opciones sugeridas en el `<Select>`, no restringe el valor a nivel de API).
- `CadenaGrid.tsx` (desktop) tiene: rango de quincenas visibles (`rango: [desde,hasta]` sobre índices de `data.quincenas`, sin refetch — es slicing local), toggle "Por fecha" (matriz) / "Por participante" (lista con acordeón por fila), filtro "Solo participantes con pendientes" (oculta filas sin ninguna celda pendiente/vencida/parcial en el rango visible), filtro "Solo quincenas con pendientes" (oculta **columnas** enteras donde nadie debe nada — activo por defecto; se aplica después del rango, así que "rango" + este filtro se combinan), barra de progreso por fila, fracción de pagos recibidos por columna (`X/Y`) junto al total en dinero, y exportar CSV (client-side, `Blob` + link temporal, sin endpoint nuevo).
- No hay forma de deshacer un puesto/jugador de una cadena ya `ACTIVA`, ni de editar montos con recálculo de lo ya generado — ver "Edición y borrado" en §4. Si se necesita, requiere diseñar una reversión financiera explícita (no un simple `DELETE`).
- `documento` y `email` de `participantes` existen como columnas huérfanas en bases ya desplegadas antes de 2026-08-07 (la app ya no los lee ni escribe) — no se hizo una migración `DROP COLUMN`, solo se dejó de usarlas.
