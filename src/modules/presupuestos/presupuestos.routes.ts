import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.ts';
import { validarBody } from '../../middlewares/validar.ts';
import * as presupuestosController from './presupuestos.controller.ts';
import { guardarPresupuestosSchema, periodoSchema } from './presupuestos.schemas.ts';

export const presupuestosRouter = Router();

presupuestosRouter.use(requireAuth);

presupuestosRouter.get('/', presupuestosController.listar);
presupuestosRouter.put('/', validarBody(guardarPresupuestosSchema), presupuestosController.guardar);
presupuestosRouter.post('/copiar', validarBody(periodoSchema), presupuestosController.copiar);
