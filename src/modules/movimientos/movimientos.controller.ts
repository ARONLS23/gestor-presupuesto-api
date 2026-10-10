import type { RequestHandler } from 'express';
import { listarMovimientosSchema } from './movimientos.schemas.ts';
import * as movimientosService from './movimientos.service.ts';

export const listar: RequestHandler = async (req, res) => {
  res.json(await movimientosService.listarMovimientos(req.usuarioId!, listarMovimientosSchema.parse(req.query)));
};

export const obtener: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await movimientosService.obtenerMovimiento(req.usuarioId!, req.params.id));
};

export const crear: RequestHandler = async (req, res) => {
  res.status(201).json(await movimientosService.crearMovimiento(req.usuarioId!, req.body));
};

export const actualizar: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await movimientosService.actualizarMovimiento(req.usuarioId!, req.params.id, req.body));
};

export const eliminar: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await movimientosService.eliminarMovimiento(req.usuarioId!, req.params.id));
};
