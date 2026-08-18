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
  // Token compartido que Make debe enviar en el header Authorization: Bearer <token>.
  // No 'required' porque los scripts sueltos (fase1/2/4) no levantan la API.
  apiToken: process.env.API_TOKEN ?? '',
  // Render (y la mayoria de hostings) asignan el puerto via PORT. API_PORT
  // queda como fallback para correrlo local con un puerto fijo.
  apiPort: Number(process.env.PORT || process.env.API_PORT) || 3000,
};