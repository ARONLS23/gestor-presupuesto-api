import type { RequestHandler } from 'express';
import { reporteAnualSchema } from './reportes.schemas.ts';
import * as reportesService from './reportes.service.ts';

export const anual: RequestHandler = async (req, res) => {
  const { anio } = reporteAnualSchema.parse(req.query);
  res.json(await reportesService.reporteAnual(req.usuarioId!, anio));
};
