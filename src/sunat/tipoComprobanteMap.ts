/**
 * Codigos oficiales de SUNAT para el parametro "codComp" del servicio de
 * consulta. Fuente: Manual de Consulta Integrada de Comprobante de Pago.
 * Nota de Credito y Nota de Debito usan el mismo codigo sin distinguir si
 * estan asociadas a Factura o Boleta.
 */
const CODIGOS_SUNAT: Record<string, string> = {
  Factura: '01',
  Boleta: '03',
  'Nota de Crédito F.': '07',
  'Nota de Crédito B.': '07',
  'Nota de Débito F.': '08',
  'Nota de Débito B.': '08',
};

export function obtenerCodigoSunat(tipoComprobante: string): string {
  const codigo = CODIGOS_SUNAT[tipoComprobante];
  if (!codigo) {
    throw new Error(
      `No hay codigo SUNAT mapeado para el tipo de comprobante "${tipoComprobante}". ` +
        `Revisa CODIGOS_SUNAT en tipoComprobanteMap.ts.`
    );
  }
  return codigo;
}