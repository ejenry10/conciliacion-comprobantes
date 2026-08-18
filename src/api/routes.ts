import { Router, Request, Response } from 'express';
import { obtenerComprobantesParaVerificar } from '../db/comprobantesRepository';
import { ejecutarConciliacion } from '../conciliacion/ejecutarConciliacion';
import { fieldMapping } from '../config/fieldMapping';

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
 * body: { "rucs": ["20600565321"], "limit": 50 }
 * Ejecuta el flujo completo: Mongo -> SUNAT -> comparacion -> historial.
 * "rucs" vacio o ausente = usa todos los comprobantes que matcheen el resto
 * de filtros (sin restringir por RUC).
 */
router.post('/api/conciliacion/verificar', async (req: Request, res: Response) => {
  try {
    const { rucs, limit } = req.body ?? {};

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

    const tamanoMuestra = Math.min(limit ?? LIMITE_MAX_VERIFICAR, LIMITE_MAX_VERIFICAR);

    const filtro =
      Array.isArray(rucs) && rucs.length > 0
        ? { [fieldMapping.ruc]: { $in: rucs } }
        : {};

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
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error interno' });
  }
});