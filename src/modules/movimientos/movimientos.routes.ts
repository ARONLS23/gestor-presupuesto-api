import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.ts';
import { validarBody } from '../../middlewares/validar.ts';
import * as movimientosController from './movimientos.controller.ts';
import { actualizarMovimientoSchema, crearMovimientoSchema } from './movimientos.schemas.ts';

export const movimientosRouter = Router();

movimientosRouter.use(requireAuth);

movimientosRouter.get('/', movimientosController.listar);
movimientosRouter.get('/totales', movimientosController.totales);
movimientosRouter.get('/:id', movimientosController.obtener);
movimientosRouter.post('/', validarBody(crearMovimientoSchema), movimientosController.crear);
movimientosRouter.put('/:id', validarBody(actualizarMovimientoSchema), movimientosController.actualizar);
movimientosRouter.delete('/:id', movimientosController.eliminar);
