import { Filter, Document } from 'mongodb';
import { getDb } from './mongoClient';
import { env } from '../config/env';
import {
  fieldMapping,
  buildProjection,
  TIPOS_COMPROBANTE_SUNAT,
} from '../config/fieldMapping';
import { ComprobanteInterno } from '../types/comprobante';

/**
 * Este archivo es de SOLO LECTURA por diseno: no existen metodos
 * insertOne/updateOne/deleteOne/etc. No los agregues aqui. Si en el futuro
 * hace falta escribir algo, que sea en un almacen propio (no en esta BD).
 */

function mapDocumento(doc: Document): ComprobanteInterno {
  return {
    id: String(doc._id),
    ruc: String(doc[fieldMapping.ruc] ?? ''),
    tipoComprobante: String(doc[fieldMapping.tipoComprobante] ?? ''),
    serie: String(doc[fieldMapping.serie] ?? ''),
    numero: String(doc[fieldMapping.numero] ?? ''),
    fechaEmision: doc[fieldMapping.fechaEmision]
      ? new Date(doc[fieldMapping.fechaEmision])
      : new Date(0),
    importeTotal:
      doc[fieldMapping.importeTotal] !== undefined &&
      doc[fieldMapping.importeTotal] !== null
        ? Number(doc[fieldMapping.importeTotal])
        : null,
    estadoInterno: String(doc[fieldMapping.estadoInterno] ?? ''),
    observacionesEnvio: doc[fieldMapping.observacionesEnvio]
      ? String(doc[fieldMapping.observacionesEnvio])
      : null,
  };
}

/**
 * Trae un lote de comprobantes candidatos a verificar contra SUNAT.
 *
 * Filtra de entrada solo los tipos que realmente se envian a SUNAT
 * (TIPOS_COMPROBANTE_SUNAT), porque la coleccion mezcla otros documentos
 * (ej. movimientos de caja) que no tiene sentido conciliar.
 *
 * Fase 1: sin logica de "ya verificado" todavia (eso llega en fases
 * posteriores, cuando exista un almacen propio de historial). Por ahora
 * simplemente trae los mas recientes, limitado por CONCILIACION_BATCH_SIZE.
 *
 * filtroAdicional permite sumar mas condiciones (ej. rango de fechas) sin
 * perder el filtro base de tipo de comprobante.
 */
export async function obtenerComprobantesParaVerificar(
  filtroAdicional: Filter<Document> = {}
): Promise<ComprobanteInterno[]> {
  const db = await getDb();
  const collection = db.collection(env.mongoCollection);

  const filtroBase: Filter<Document> = {
    [fieldMapping.tipoComprobante]: { $in: [...TIPOS_COMPROBANTE_SUNAT] },
  };

  const cursor = collection
    .find({ $and: [filtroBase, filtroAdicional] }, { projection: buildProjection() })
    .sort({ [fieldMapping.fechaEmision]: -1 })
    .limit(env.batchSize);

  const documentos = await cursor.toArray();
  return documentos.map(mapDocumento);
}