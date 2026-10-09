import express, { type Express, type Request, type Response } from 'express';
import { env } from './config/env.ts';
import { manejarErrores, rutaNoEncontrada } from './middlewares/errores.ts';
import { authRouter } from './modules/auth/auth.routes.ts';
import { categoriasRouter } from './modules/categorias/categorias.routes.ts';

const app: Express = express();

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
    res.send('Hello World!');
});

app.use('/api/auth', authRouter);
app.use('/api/categorias', categoriasRouter);

app.use(rutaNoEncontrada);
app.use(manejarErrores);

app.listen(env.PORT);
