import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.ts';
import * as reportesController from './reportes.controller.ts';

export const reportesRouter = Router();

reportesRouter.use(requireAuth);

reportesRouter.get('/anual', reportesController.anual);
reportesRouter.get('/resumen-mensual', reportesController.resumenMensual);
reportesRouter.get('/historico', reportesController.historico);
reportesRouter.get('/kpis', reportesController.kpis);
