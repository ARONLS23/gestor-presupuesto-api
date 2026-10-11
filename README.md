# Presupuesto Personal — API

API REST del sistema de presupuesto personal (montos en soles, S/). Gestiona usuarios, categorías, movimientos, presupuestos mensuales, reportes y la importación/exportación de Excel.

La usa la web [`gestor-presupuesto-web`](../gestor-presupuesto-web), que la llama desde su servidor (el navegador nunca la llama directamente).

## Tecnologías

- Node.js (ejecuta TypeScript directamente, sin compilar) + Express 5
- PostgreSQL + Prisma 7
- Zod (validación), JWT (sesión), bcryptjs (contraseñas)
- ExcelJS (importar/exportar), express-rate-limit (límite de intentos de login)
- Vitest + Supertest (tests)

## Requisitos

- **Node.js 22.18 o superior** (desde esa versión Node ejecuta archivos `.ts` sin flags).
- **PostgreSQL** (desarrollado con la versión 18).
- npm.

## Instalación

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Crea el archivo `.env` a partir del ejemplo y completa sus valores:

   ```bash
   cp .env.example .env
   ```

   | Variable | Descripción | Ejemplo |
   |---|---|---|
   | `PORT` | Puerto de la API | `4000` |
   | `DATABASE_URL` | Conexión a PostgreSQL | `postgresql://postgres:clave@localhost:5432/gestor_presupuesto` |
   | `JWT_SECRET` | Clave para firmar las sesiones (mínimo 32 caracteres) | ver abajo |
   | `JWT_EXPIRES_IN` | Duración de la sesión | `7d` |
   | `DIRECT_URL` | (Opcional) Conexión directa solo para las migraciones; en producción con Neon | ver [Producción](#producción) |

   Para generar un `JWT_SECRET` aleatorio:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   Si falta alguna variable o no es válida, la API no arranca y muestra cuál es.

3. Crea la base de datos vacía en PostgreSQL (por ejemplo `gestor_presupuesto`).

4. Genera el cliente de Prisma y aplica las migraciones:

   ```bash
   npm run db:generar
   npm run db:migrar
   ```

5. (Opcional) Carga datos de ejemplo: crea el usuario `aron@example.com` / `MiClave123` con sus categorías y 12 meses de movimientos hasta el mes actual. Si ese usuario ya tiene movimientos, no modifica nada.

   ```bash
   npm run db:seed
   ```

## Ejecutar

| Comando | Qué hace |
|---|---|
| `npm run dev` | Inicia la API y la reinicia al guardar cambios |
| `npm start` | Inicia la API (producción) |
| `npm test` | Ejecuta los tests |
| `npm run typecheck` | Revisa los tipos de TypeScript |

Al iniciar muestra `API escuchando en http://localhost:4000`.

### Tests

Los tests usan la base de datos de `DATABASE_URL`. Cada archivo crea usuarios temporales (`test-...@example.com`) y los borra al terminar, así que no tocan los datos existentes.

### Probar los endpoints a mano

La carpeta [`http/`](http) tiene peticiones de ejemplo de cada módulo para la extensión REST Client de VS Code. Primero ejecuta el login de `http/auth.http` y pega el token donde dice `PEGA_AQUI_EL_TOKEN_DEL_LOGIN`.

## Producción

La API se despliega en **Vercel** (plan gratis) y la base de datos en **Neon** (PostgreSQL, plan gratis).

### 1. Base de datos en Neon

1. Crea un proyecto en [neon.com](https://neon.com), región **AWS US East (N. Virginia)** (la misma región donde Vercel ejecuta la API).
2. En el botón **Connect** copia las dos cadenas de conexión:
   - con **Connection pooling** activado (dirección con `-pooler`): será `DATABASE_URL`;
   - con **Connection pooling** desactivado: será `DIRECT_URL`.

   El pooler reparte las conexiones entre las instancias de la API; las migraciones necesitan la conexión directa.

3. (Opcional) Aplica las migraciones desde tu computadora, sin esperar al despliegue. Usa la cadena **directa** entre comillas simples (la cadena tiene `&`):

   ```powershell
   # PowerShell
   $env:DIRECT_URL = 'postgresql://...cadena directa...'
   npm run db:migrar
   Remove-Item Env:DIRECT_URL
   ```

   ```bash
   # Bash
   DIRECT_URL='postgresql://...cadena directa...' npm run db:migrar
   ```

   La última línea de PowerShell borra la variable para que los comandos siguientes vuelvan a usar tu base local. Las migraciones solo crean tablas: no cargan datos ni el usuario de ejemplo.

### 2. API en Vercel

1. En [vercel.com](https://vercel.com) importa este repositorio (**Add New → Project**). Vercel detecta Express y publica la app que exporta `src/app.ts`.
2. En **Environment Variables** agrega:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | Cadena de Neon **con** pooler |
   | `DIRECT_URL` | Cadena de Neon **sin** pooler |
   | `JWT_SECRET` | Una clave nueva (ver [Instalación](#instalación)), distinta a la de desarrollo |
   | `JWT_EXPIRES_IN` | Duración de la sesión, por ejemplo `6h` |

3. Despliega. En cada despliegue, `npm run vercel-build` genera el cliente de Prisma y aplica las migraciones pendientes en Neon.
4. Comprueba que `https://<tu-api>.vercel.app/api/auth/me` responda `{"mensaje":"No autenticado"}`.

La URL `https://<tu-api>.vercel.app/api` es la que usará la web en su variable `API_URL`.

### En un servidor propio

```bash
npm ci
npm run db:generar
npm run db:migrar
npm start
```

No hay paso de compilación: Node ejecuta el código TypeScript directamente. `prisma` es dependencia de desarrollo; instala con las dependencias de desarrollo para poder generar el cliente y migrar.

## Seguridad

- Todas las rutas, salvo registro y login, exigen el encabezado `Authorization: Bearer <token>`.
- Cada consulta se filtra por el usuario de la sesión; acceder a datos de otro usuario responde 404.
- Login: máximo 5 intentos fallidos en 15 minutos **por email**. El conteo se guarda en la tabla `IntentoLogin`, así se comparte entre todas las instancias de la API.
- CORS está deshabilitado a propósito: la API solo recibe llamadas del servidor de la web.

## Estructura

```
prisma/              esquema, migraciones y datos de ejemplo (seed)
prisma7.config.ts    configuración de Prisma
src/
  app.ts             rutas y middlewares
  server.ts          arranque
  config/            variables de entorno, Prisma y JWT
  middlewares/       autenticación, validación, errores y límites
  modules/           un módulo por recurso (routes, controller, service, schemas)
    auth  categorias  subcategorias  movimientos  presupuestos  reportes  excel
  utils/             validaciones y fechas compartidas
tests/               tests de cada módulo
http/                peticiones de ejemplo
```

## Endpoints

| Recurso | Rutas |
|---|---|
| Autenticación | `POST /api/auth/registro`, `POST /api/auth/login`, `GET /api/auth/me` |
| Categorías | `GET/POST /api/categorias`, `PUT/DELETE /api/categorias/:id` |
| Subcategorías | `POST /api/subcategorias`, `PUT/DELETE /api/subcategorias/:id` |
| Movimientos | `GET/POST /api/movimientos`, `GET /api/movimientos/totales`, `GET/PUT/DELETE /api/movimientos/:id` |
| Presupuestos | `GET/PUT /api/presupuestos`, `POST /api/presupuestos/copiar` |
| Reportes | `GET /api/reportes/anual`, `/resumen-mensual`, `/historico`, `/kpis`, `/saldo` |
| Excel | `GET /api/excel/exportar`, `/plantilla`, `/movimientos`; `POST /api/excel/importar/previa`, `/importar` |

Los errores responden con el formato `{ "mensaje": "...", "errores": { "campo": ["..."] } }`.
