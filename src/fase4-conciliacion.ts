import fs from 'fs';
import { obtenerComprobantesParaVerificar } from './db/comprobantesRepository';
import { closeDb } from './db/mongoClient';
import { consultarComprobanteEnSunat } from './sunat/sunatClient';
import { conciliar, ReporteComprobante } from './conciliacion/comparador';
import { registrarCorrida } from './historial/historialStore';
import { fieldMapping } from './config/fieldMapping';
import { env } from './config/env';

const TAMANO_MUESTRA = 20;
const ESPERA_ENTRE_CONSULTAS_MS = 300;

// true = usa todos los RUCs que tengan credenciales en sunat-credenciales.json.
const PROBAR_TODOS_LOS_RUC = true;
const RUC_DE_PRUEBA = '20600565321';

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function obtenerRucsConCredenciales(): string[] {
  const raw = fs.readFileSync(env.sunatCredentialsPath, 'utf-8');
  return Object.keys(JSON.parse(raw) as Record<string, unknown>);
}

async function main() {
  const rucs = PROBAR_TODOS_LOS_RUC ? obtenerRucsConCredenciales() : [RUC_DE_PRUEBA];
  const filtro = { [fieldMapping.ruc]: { $in: rucs } };

  console.log('Obteniendo comprobantes desde MongoDB...');
  const comprobantes = await obtenerComprobantesParaVerificar(filtro);
  const muestra = comprobantes.slice(0, TAMANO_MUESTRA);

  const reportes: ReporteComprobante[] = [];

  for (const c of muestra) {
    const consulta = await consultarComprobanteEnSunat(c);
    reportes.push(conciliar(c, consulta));
    await esperar(ESPERA_ENTRE_CONSULTAS_MS);
  }

  const coincidentes = reportes.filter((r) => r.resultado === 'COINCIDE');
  const discrepancias = reportes.filter((r) => r.resultado === 'DISCREPANCIA');
  const errores = reportes.filter((r) => r.resultado === 'ERROR_CONSULTA');
  const noVerificables = reportes.filter((r) => r.resultado === 'NO_VERIFICABLE');

  registrarCorrida(reportes);

  console.log(`\nComprobantes revisados: ${reportes.length}`);
  console.log(`Coincidentes: ${coincidentes.length}`);
  console.log(`Discrepancias: ${discrepancias.length}`);
  console.log(`Errores de consulta: ${errores.length}`);
  console.log(`No verificables: ${noVerificables.length}`);

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