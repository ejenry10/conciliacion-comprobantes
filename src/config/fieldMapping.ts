export const fieldMapping = {
  ruc: 'sEmisorDoi',
  tipoComprobante: 'sDocTipo',
  serie: 'sDocSerie',
  numero: 'sDocCorrelativo',
  fechaEmision: 'sDocFechaEmision',
  importeTotal: 'sTotal',
  estadoInterno: 'estadoEnvioFiscal',
  observacionesEnvio: 'observacionesEnvio',
} as const;

export const TIPOS_COMPROBANTE_SUNAT = [
  'Factura',
  'Boleta',
  'Nota de Crédito F.',
  'Nota de Crédito B.',
  'Nota de Débito F.',
  'Nota de Débito B.',
] as const;

/** Proyeccion de Mongo derivada del mapeo: solo trae estos campos, nada mas. */
export function buildProjection(): Record<string, 1> {
  const projection: Record<string, 1> = { _id: 1 };
  for (const mongoField of Object.values(fieldMapping)) {
    projection[mongoField] = 1;
  }
  return projection;
}
