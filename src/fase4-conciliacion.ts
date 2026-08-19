import fs from 'fs';
import { Filter, Document } from 'mongodb';
import { closeDb } from './db/mongoClient';
import { ejecutarConciliacion } from './conciliacion/ejecutarConciliacion';
import { fieldMapping } from './config/fieldMapping';
import { env } from './config/env';
import { inicioDiaPeruUTC, finDiaPeruUTC } from './utils/fechas';

const TAMANO_MUESTRA = 100;

// true = usa todos los RUCs que tengan credenciales en sunat-credenciales.json.
const PROBAR_TODOS_LOS_RUC = false; // Cambiar a true para probar todos los RUCs con credenciales.
const RUC_DE_PRUEBA = '20482254200';

// --- Filtro de fecha (opcional) ---
// Deja ambos en null para no filtrar por fecha (trae los mas recientes, sin importar el dia).
// Para un dia especifico: pon la misma fecha en los dos, formato YYYY-MM-DD.
// Para un rango: FECHA_DESDE distinto de FECHA_HASTA.
const FECHA_DESDE: string | null = '2026-08-05';
const FECHA_HASTA: string | null = '2026-08-05';

function obtenerRucsConCredenciales(): string[] {
  const raw = fs.readFileSync(env.sunatCredentialsPath, 'utf-8');
  return Object.keys(JSON.parse(raw) as Record<string, unknown>);
}

function construirFiltro(): Filter<Document> {
  const rucs = PROBAR_TODOS_LOS_RUC ? obtenerRucsConCredenciales() : [RUC_DE_PRUEBA];
  const condiciones: Filter<Document>[] = [{ [fieldMapping.ruc]: { $in: rucs } }];

  if (FECHA_DESDE || FECHA_HASTA) {
    const rangoFecha: Record<string, Date> = {};
    if (FECHA_DESDE) rangoFecha.$gte = inicioDiaPeruUTC(FECHA_DESDE, 'FECHA_DESDE');
    if (FECHA_HASTA) rangoFecha.$lte = finDiaPeruUTC(FECHA_HASTA, 'FECHA_HASTA');
    condiciones.push({ [fieldMapping.fechaEmision]: rangoFecha });
  }

  return { $and: condiciones };
}

async function main() {
  const filtro = construirFiltro();

  console.log('Ejecutando conciliacion...');
  if (FECHA_DESDE || FECHA_HASTA) {
    console.log(`Filtrando por fecha: ${FECHA_DESDE ?? '(sin limite inferior)'} a ${FECHA_HASTA ?? '(sin limite superior)'}`);
  }

  const { resumen, reportes } = await ejecutarConciliacion(filtro, TAMANO_MUESTRA);

  const discrepancias = reportes.filter((r) => r.resultado === 'DISCREPANCIA');
  const errores = reportes.filter((r) => r.resultado === 'ERROR_CONSULTA');

  console.log(`\nComprobantes revisados: ${resumen.revisados}`);
  console.log(`Coincidentes: ${resumen.coincidentes}`);
  console.log(`Discrepancias: ${resumen.discrepancias}`);
  console.log(`Errores de consulta: ${resumen.errores}`);
  console.log(`No verificables: ${resumen.noVerificables}`);

  if (discrepancias.length > 0) {
    console.log('\n--- DISCREPANCIAS ---');
    for (const r of discrepancias) {
      console.log(`\n${r.serie}-${r.numero} (RUC ${r.ruc})`);
      console.log(`Estado interno: ${r.estadoInterno}`);
      console.log(`Estado SUNAT: ${r.estadoSunat}`);
      console.log(`Tipo de discrepancia: ${r.tipoDiscrepancia}`);
      console.log(`Detalle: ${r.detalle}`);
    }
  }

  if (errores.length > 0) {
    console.log('\n--- ERRORES DE CONSULTA (no se pudieron verificar) ---');
    for (const r of errores) {
      console.log(`${r.serie}-${r.numero} (RUC ${r.ruc}): ${r.detalle}`);
    }
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error('Error en la conciliacion:', err);
  await closeDb();
  process.exitCode = 1;
});