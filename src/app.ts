import express, { type Express, type Request, type Response } from 'express';
import { manejarErrores, rutaNoEncontrada } from './middlewares/errores.ts';
import { authRouter } from './modules/auth/auth.routes.ts';
import { categoriasRouter } from './modules/categorias/categorias.routes.ts';
import { movimientosRouter } from './modules/movimientos/movimientos.routes.ts';
import { presupuestosRouter } from './modules/presupuestos/presupuestos.routes.ts';
import { reportesRouter } from './modules/reportes/reportes.routes.ts';
import { subcategoriasRouter } from './modules/subcategorias/subcategorias.routes.ts';

export const app: Express = express();

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
    res.send('Hello World!');
});

app.use('/api/auth', authRouter);
app.use('/api/categorias', categoriasRouter);
app.use('/api/subcategorias', subcategoriasRouter);
app.use('/api/movimientos', movimientosRouter);
app.use('/api/reportes', reportesRouter);
app.use('/api/presupuestos', presupuestosRouter);

app.use(rutaNoEncontrada);
app.use(manejarErrores);
