import { Request, Response, NextFunction } from 'express';

const VENTANA_MS = 60_000;
const MAX_REQUESTS_POR_VENTANA = 20;

const contadores = new Map<string, { count: number; reiniciaEn: number }>();

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const clave = req.ip ?? 'desconocido';
  const ahora = Date.now();
  const entrada = contadores.get(clave);

  if (!entrada || entrada.reiniciaEn < ahora) {
    contadores.set(clave, { count: 1, reiniciaEn: ahora + VENTANA_MS });
    next();
    return;
  }

  if (entrada.count >= MAX_REQUESTS_POR_VENTANA) {
    res.status(429).json({ error: 'Demasiadas solicitudes, intenta de nuevo en un momento' });
    return;
  }

  entrada.count += 1;
  next();
}