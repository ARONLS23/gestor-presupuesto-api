import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.ts';
import * as categoriasController from './categorias.controller.ts';

export const categoriasRouter = Router();

categoriasRouter.use(requireAuth);

categoriasRouter.get('/', categoriasController.listar);
