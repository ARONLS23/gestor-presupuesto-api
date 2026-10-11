import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.ts';
import * as excelController from './excel.controller.ts';

export const excelRouter = Router();

excelRouter.use(requireAuth);

excelRouter.get('/exportar', excelController.exportar);
