import fs from 'fs';
import { obtenerComprobantesParaVerificar } from './db/comprobantesRepository';
import { closeDb } from './db/mongoClient';
import { consultarComprobanteEnSunat } from './sunat/sunatClient';
import { fieldMapping } from './config/fieldMapping';
import { env } from './config/env';

// Muestra chica a proposito para probar: no queremos gastar el cupo de
// consultas a SUNAT contra los 200 mientras solo estamos verificando que
// la conexion funcione.
const TAMANO_MUESTRA = 25;
const ESPERA_ENTRE_CONSULTAS_MS = 300;

// true = usa todos los RUCs que tengan credenciales en sunat-credenciales.json.
// false = usa solo RUC_DE_PRUEBA.
const PROBAR_TODOS_LOS_RUC = true;
const RUC_DE_PRUEBA = '20600565321';

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function obtenerRucsConCredenciales(): string[] {
  const raw = fs.readFileSync(env.sunatCredentialsPath, 'utf-8');
  const credenciales = JSON.parse(raw) as Record<string, unknown>;
  return Object.keys(credenciales);
}

async function main() {
  console.log('Obteniendo comprobantes desde MongoDB...');

  const rucs = PROBAR_TODOS_LOS_RUC
    ? obtenerRucsConCredenciales()
    : [RUC_DE_PRUEBA];

  console.log(`RUCs a probar: ${rucs.join(', ')}\n`);

  const filtro = {
    $and: [
        { [fieldMapping.ruc]: { $in: rucs } },
        { [fieldMapping.estadoInterno]: 'B' },
        {
        [fieldMapping.fechaEmision]: {
            $gte: new Date('2026-08-01'),
            $lte: new Date('2026-08-17'),
        },
        },
    ],
  };

  const comprobantes = await obtenerComprobantesParaVerificar(filtro);
  const muestra = comprobantes.slice(0, TAMANO_MUESTRA);

  console.log(`Consultando ${muestra.length} comprobantes contra SUNAT...\n`);

  for (const c of muestra) {
    const resultado = await consultarComprobanteEnSunat(c);

    if (resultado.ok) {
      console.log(
        `${c.ruc} | ${c.serie}-${c.numero} | interno: ${c.estadoInterno} | SUNAT: ${resultado.estadoCp}`
      );
    } else {
      console.log(
        `${c.ruc} | ${c.serie}-${c.numero} | ERROR consultando SUNAT: ${resultado.message}`
      );
    }

    await esperar(ESPERA_ENTRE_CONSULTAS_MS);
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error('Error en la prueba de Fase 2:', err);
  await closeDb();
  process.exitCode = 1;
});