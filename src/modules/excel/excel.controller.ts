import type { Request, RequestHandler } from 'express';
import { HttpError } from '../../middlewares/errores.ts';
import { exportarMovimientosSchema } from '../movimientos/movimientos.schemas.ts';
import { exportarSchema, guardarImportacionSchema, plantillaSchema, previaImportacionSchema } from './excel.schemas.ts';
import * as excelService from './excel.service.ts';
import * as importarService from './importar.service.ts';

export const exportar: RequestHandler = async (req, res) => {
  const { alcance, ...periodo } = exportarSchema.parse(req.query);
  const { archivo, nombre } = await excelService.exportarReporte(req.usuarioId!, periodo, alcance);
  res.attachment(nombre).send(archivo);
};

export const plantilla: RequestHandler = async (req, res) => {
  const { alcance, ...periodo } = plantillaSchema.parse(req.query);
  const { archivo, nombre } = await excelService.exportarReporte(req.usuarioId!, periodo, alcance, true);
  res.attachment(nombre).send(archivo);
};

export const movimientos: RequestHandler = async (req, res) => {
  const { archivo, nombre } = await excelService.exportarMovimientos(req.usuarioId!, exportarMovimientosSchema.parse(req.query));
  res.attachment(nombre).send(archivo);
};

function archivoDe(req: Request) {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Adjunta un archivo .xlsx');
  return req.body;
}

export const previaImportacion: RequestHandler = async (req, res) => {
  const { anio, alcance } = previaImportacionSchema.parse(req.query);
  res.json(await importarService.previaImportacion(req.usuarioId!, anio, alcance, archivoDe(req)));
};

export const importar: RequestHandler = async (req, res) => {
  res.status(201).json(await importarService.guardarImportacion(req.usuarioId!, guardarImportacionSchema.parse(req.body)));
};
