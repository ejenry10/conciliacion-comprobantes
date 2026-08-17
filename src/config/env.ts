import 'dotenv/config';

/**
 * Config centralizada. Si falta una variable obligatoria, la app falla
 * al arrancar en vez de fallar a mitad de una consulta.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Falta la variable de entorno obligatoria: ${name}. Revisa tu archivo .env`
    );
  }
  return value;
}

function parseBatchSize(): number {
  const raw = Number(process.env.CONCILIACION_BATCH_SIZE);
  // Si no esta seteado, esta vacio, o es 0/negativo/no numerico,
  // usamos 200 en vez de dejar que Mongo lo interprete como "sin limite".
  if (!Number.isFinite(raw) || raw <= 0) return 200;
  return raw;
}

export const env = {
  mongoUri: required('MONGO_URI'),
  mongoDbName: required('MONGO_DB_NAME'),
  mongoCollection: required('MONGO_COLLECTION_COMPROBANTES'),
  batchSize: parseBatchSize(),
  // Ruta al JSON con credenciales SUNAT por RUC. No es 'required' porque
  // la Fase 1 (solo Mongo) no lo necesita para funcionar.
  sunatCredentialsPath:
    process.env.SUNAT_CREDENTIALS_PATH ?? './sunat-credenciales.json',
  // Carpeta donde se guarda el historial de consultas (fuera de la BD empresarial).
  historialDir: process.env.HISTORIAL_DIR ?? './historial',
};