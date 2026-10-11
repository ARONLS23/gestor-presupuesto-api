import type { RequestHandler } from 'express';
import { periodoSchema } from '../../utils/esquemas.ts';
import { historicoSchema, kpisSchema, reporteAnualSchema } from './reportes.schemas.ts';
import * as reportesService from './reportes.service.ts';

export const anual: RequestHandler = async (req, res) => {
  const { anio } = reporteAnualSchema.parse(req.query);
  res.json(await reportesService.reporteAnual(req.usuarioId!, anio));
};

export const resumenMensual: RequestHandler = async (req, res) => {
  res.json(await reportesService.resumenMensual(req.usuarioId!, periodoSchema.parse(req.query)));
};

export const historico: RequestHandler = async (req, res) => {
  res.json(await reportesService.historico(req.usuarioId!, historicoSchema.parse(req.query)));
};

export const kpis: RequestHandler = async (req, res) => {
  const { alcance, ...periodo } = kpisSchema.parse(req.query);
  res.json(await reportesService.kpis(req.usuarioId!, periodo, alcance));
};

export const saldo: RequestHandler = async (req, res) => {
  res.json(await reportesService.saldo(req.usuarioId!));
};
