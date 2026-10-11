import type { RequestHandler } from 'express';
import { reporteAnualSchema } from '../reportes/reportes.schemas.ts';
import * as excelService from './excel.service.ts';

export const exportar: RequestHandler = async (req, res) => {
  const { anio } = reporteAnualSchema.parse(req.query);
  res.attachment(`presupuesto-${anio}.xlsx`).send(await excelService.exportarAnual(req.usuarioId!, anio));
};
