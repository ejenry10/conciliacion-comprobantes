/**
 * Representacion interna, ya normalizada, de un comprobante leido desde Mongo.
 * Esta es la forma que usara el resto del sistema (SUNAT, comparacion, Make).
 * NO es el documento crudo de Mongo: eso se traduce en el repository.
 */
export interface ComprobanteInterno {
  /** _id del documento en Mongo, como string. Sirve para trazabilidad, no se reescribe nunca. */
  id: string;
  ruc: string;
  tipoComprobante: string; // ej. '01' factura, '03' boleta, etc. (ajustar segun tu catalogo interno)
  serie: string;
  numero: string;
  fechaEmision: Date;
  importeTotal: number | null;
  estadoInterno: string; // tal como esta almacenado en tu sistema, ej. 'ACEPTADO' | 'ANULADO'
}
