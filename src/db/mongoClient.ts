import { MongoClient, Db } from 'mongodb';
import { env } from '../config/env';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Conecta una unica vez y reutiliza la conexion.
 * IMPORTANTE: el usuario configurado en MONGO_URI debe tener permisos
 * estrictamente de lectura (readOnly / read) a nivel de MongoDB, como
 * segunda barrera ademas de que este codigo nunca haga writes.
 */
export async function getDb(): Promise<Db> {
  if (db) return db;

  client = new MongoClient(env.mongoUri, {
    serverSelectionTimeoutMS: 8000,
  });

  await client.connect();
  db = client.db(env.mongoDbName);
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
