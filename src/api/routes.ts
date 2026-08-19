import { Router, Request, Response } from 'express';
import { Filter, Document } from 'mongodb';
import { obtenerComprobantesParaVerificar } from '../db/comprobantesRepository';
import { ejecutarConciliacion } from '../conciliacion/ejecutarConciliacion';
import { fieldMapping } from '../config/fieldMapping';
import {
  inicioDiaPeruUTC,
  finDiaPeruUTC,
  fechaDeAyer,
  fechaHaceNDias,
} from '../utils/fechas';

export const router = Router();

// Tope duro: aunque Make (o un error) pida mas, nunca disparamos mas de
// esto en una sola llamada. Protege el cupo de consultas a SUNAT.
const LIMITE_MAX_VERIFICAR = 200;

/**
 * GET /api/conciliacion/pendientes?ruc=20600565321,20603618816&limit=50
 * Solo lee Mongo, no llama a SUNAT. Util para que Make vea cuantos hay
 * antes de decidir si dispara la verificacion.
 */
router.get('/api/conciliacion/pendientes', async (req: Request, res: Response) => {
  try {
    const rucsParam = typeof req.query.ruc === 'string' ? req.query.ruc : undefined;
    const limitParam =
      typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

    if (limitParam !== undefined && (!Number.isFinite(limitParam) || limitParam <= 0)) {
      res.status(400).json({ error: 'limit debe ser un numero positivo' });
      return;
    }

    const filtro = rucsParam
      ? { [fieldMapping.ruc]: { $in: rucsParam.split(',').map((r) => r.trim()) } }
      : {};

    const comprobantes = await obtenerComprobantesParaVerificar(filtro);
    const limitados = limitParam ? comprobantes.slice(0, limitParam) : comprobantes;

    res.json({
      total: limitados.length,
      comprobantes: limitados.map((c) => ({
        ruc: c.ruc,
        tipoComprobante: c.tipoComprobante,
        serie: c.serie,
        numero: c.numero,
        fechaEmision: c.fechaEmision.toISOString().slice(0, 10),
        estadoInterno: c.estadoInterno,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno' });
  }
});

/**
 * POST /api/conciliacion/verificar
 * body: {
 *   "rucs": ["20600565321"],       // opcional, default: todos con credenciales
 *   "limit": 50,                    // opcional, tope duro 200
 *   "fechaDesde": "2026-08-17",     // opcional, YYYY-MM-DD
 *   "fechaHasta": "2026-08-17",     // opcional, YYYY-MM-DD (incluye todo ese dia)
 *   "diaAnterior": true,            // opcional, atajo: equivale a fechaDesde=fechaHasta=ayer
 *   "diasAtrasBajas": 3             // opcional: ADEMAS del rango normal, siempre revisa
 *                                    // tambien cualquier comprobante en estado B (dado de
 *                                    // baja) emitido en los ultimos N dias, sin importar si
 *                                    // cae fuera del rango de fecha principal. Sirve porque
 *                                    // una anulacion puede pasar dias despues de la emision.
 * }
 * Ejecuta el flujo completo: Mongo -> SUNAT -> comparacion -> historial.
 */
router.post('/api/conciliacion/verificar', async (req: Request, res: Response) => {
  try {
    const { rucs, limit, fechaDesde, fechaHasta, diaAnterior, diasAtrasBajas } = req.body ?? {};

    if (
      rucs !== undefined &&
      (!Array.isArray(rucs) || rucs.some((r: unknown) => typeof r !== 'string'))
    ) {
      res.status(400).json({ error: 'rucs debe ser un arreglo de strings' });
      return;
    }
    if (limit !== undefined && (typeof limit !== 'number' || limit <= 0)) {
      res.status(400).json({ error: 'limit debe ser un numero positivo' });
      return;
    }
    if (diaAnterior !== undefined && typeof diaAnterior !== 'boolean') {
      res.status(400).json({ error: 'diaAnterior debe ser true o false' });
      return;
    }
    if (
      diasAtrasBajas !== undefined &&
      (typeof diasAtrasBajas !== 'number' || diasAtrasBajas <= 0)
    ) {
      res.status(400).json({ error: 'diasAtrasBajas debe ser un numero positivo' });
      return;
    }

    const tamanoMuestra = Math.min(limit ?? LIMITE_MAX_VERIFICAR, LIMITE_MAX_VERIFICAR);

    const condicionesRuc: Filter<Document>[] =
      Array.isArray(rucs) && rucs.length > 0 ? [{ [fieldMapping.ruc]: { $in: rucs } }] : [];

    // "diaAnterior" es un atajo; si ademas mandan fechaDesde/fechaHasta
    // explicitos, esos tienen prioridad.
    const desdeStr = fechaDesde ?? (diaAnterior ? fechaDeAyer() : undefined);
    const hastaStr = fechaHasta ?? (diaAnterior ? fechaDeAyer() : undefined);

    const condicionesPrincipal: Filter<Document>[] = [...condicionesRuc];
    if (desdeStr || hastaStr) {
      const rangoFecha: Record<string, Date> = {};
      if (desdeStr) rangoFecha.$gte = inicioDiaPeruUTC(desdeStr, 'fechaDesde');
      if (hastaStr) rangoFecha.$lte = finDiaPeruUTC(hastaStr, 'fechaHasta');
      condicionesPrincipal.push({ [fieldMapping.fechaEmision]: rangoFecha });
    }

    const filtroPrincipal: Filter<Document> =
      condicionesPrincipal.length > 0 ? { $and: condicionesPrincipal } : {};

    let filtro: Filter<Document> = filtroPrincipal;

    if (diasAtrasBajas !== undefined) {
      const filtroBajas: Filter<Document> = {
        $and: [
          ...condicionesRuc,
          { [fieldMapping.estadoInterno]: 'B' },
          { [fieldMapping.fechaEmision]: { $gte: inicioDiaPeruUTC(fechaHaceNDias(diasAtrasBajas), 'diasAtrasBajas') } },
        ],
      };
      // Sin rango de fecha principal (ej. solo mandaron diasAtrasBajas): usamos
      // directo el filtro de bajas. Con rango principal: OR entre ambos.
      filtro =
        condicionesPrincipal.length > 0
          ? { $or: [filtroPrincipal, filtroBajas] }
          : filtroBajas;
    }

    const resultado = await ejecutarConciliacion(filtro, tamanoMuestra);

    res.json({
      resumen: resultado.resumen,
      discrepancias: resultado.reportes
        .filter((r) => r.resultado === 'DISCREPANCIA')
        .map((r) => ({
          ruc: r.ruc,
          serie: r.serie,
          numero: r.numero,
          estadoInterno: r.estadoInterno,
          estadoSunat: r.estadoSunat,
          tipoDiscrepancia: r.tipoDiscrepancia,
          detalle: r.detalle,
        })),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Error interno' });
  }
});