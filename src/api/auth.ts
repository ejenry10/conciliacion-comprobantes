import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

/**
 * Autenticacion simple por token compartido: Make debe enviar
 * "Authorization: Bearer <API_TOKEN>". No es OAuth ni JWT a proposito -
 * es un proyecto personal con un unico consumidor (Make).
 */
export function requireApiToken(req: Request, res: Response, next: NextFunction): void {
  if (!env.apiToken) {
    // Falla fuerte al arrancar seria mejor, pero por si acaso: sin token
    // configurado, no dejamos pasar nada (fail-closed, no fail-open).
    res.status(500).json({ error: 'API_TOKEN no configurado en el servidor' });
    return;
  }

  const authHeader = req.header('authorization') ?? '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || token !== env.apiToken) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  next();
}