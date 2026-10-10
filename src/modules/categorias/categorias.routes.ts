import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.ts';
import { validarBody } from '../../middlewares/validar.ts';
import * as categoriasController from './categorias.controller.ts';
import { actualizarCategoriaSchema, crearCategoriaSchema } from './categorias.schemas.ts';

export const categoriasRouter = Router();

categoriasRouter.use(requireAuth);

categoriasRouter.get('/', categoriasController.listar);
categoriasRouter.post('/', validarBody(crearCategoriaSchema), categoriasController.crear);
categoriasRouter.put('/:id', validarBody(actualizarCategoriaSchema), categoriasController.actualizar);
categoriasRouter.delete('/:id', categoriasController.eliminar);
