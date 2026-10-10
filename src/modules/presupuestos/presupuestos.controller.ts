import type { RequestHandler } from 'express';
import { periodoSchema } from './presupuestos.schemas.ts';
import * as presupuestosService from './presupuestos.service.ts';

export const listar: RequestHandler = async (req, res) => {
  res.json(await presupuestosService.listarPresupuestos(req.usuarioId!, periodoSchema.parse(req.query)));
};

export const guardar: RequestHandler = async (req, res) => {
  res.json(await presupuestosService.guardarPresupuestos(req.usuarioId!, req.body));
};

export const copiar: RequestHandler = async (req, res) => {
  res.json(await presupuestosService.copiarPresupuestoAnterior(req.usuarioId!, req.body));
};
