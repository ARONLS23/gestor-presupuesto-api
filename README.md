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

```bash
npm ci
npm run db:generar
npm run db:migrar
npm start
```

- No hay paso de compilación: Node ejecuta el código TypeScript directamente.
- `prisma` es dependencia de desarrollo; instala con las dependencias de desarrollo (como arriba) para poder generar el cliente y migrar.
- Usa un `JWT_SECRET` propio y distinto al de desarrollo.

## Seguridad

- Todas las rutas, salvo registro y login, exigen el encabezado `Authorization: Bearer <token>`.
- Cada consulta se filtra por el usuario de la sesión; acceder a datos de otro usuario responde 404.
- Login: máximo 5 intentos fallidos en 15 minutos **por email**. El conteo se guarda en memoria: se reinicia al reiniciar la API y, si se ejecutan varias instancias, habría que usar un almacén compartido.
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
