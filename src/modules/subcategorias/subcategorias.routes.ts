import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.ts';
import { validarBody } from '../../middlewares/validar.ts';
import * as subcategoriasController from './subcategorias.controller.ts';
import { actualizarSubcategoriaSchema, crearSubcategoriaSchema } from './subcategorias.schemas.ts';

export const subcategoriasRouter = Router();

subcategoriasRouter.use(requireAuth);

subcategoriasRouter.post('/', validarBody(crearSubcategoriaSchema), subcategoriasController.crear);
subcategoriasRouter.put('/:id', validarBody(actualizarSubcategoriaSchema), subcategoriasController.actualizar);
subcategoriasRouter.delete('/:id', subcategoriasController.eliminar);
