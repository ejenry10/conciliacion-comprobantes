# Conciliación SUNAT — Fase 1

Conexión de solo lectura a MongoDB y obtención de comprobantes.

## Antes de correr esto contra la BD real

1. Confirma con quien administra la infraestructura de la empresa que estás
   autorizado a usar un usuario de solo lectura para este proyecto personal.
2. Pide (o crea, si tienes permisos) un usuario Mongo con rol `read` (no
   `readWrite`) sobre la base de datos de comprobantes. Esa es tu segunda
   barrera de seguridad, además de que este código nunca escribe.

## Instalación

```bash
npm install
cp .env.example .env
# edita .env con tu MONGO_URI de solo lectura, DB y colección reales
```

## Ajustar el esquema

Antes de correr nada, abre `src/config/fieldMapping.ts` y verifica que los
nombres de campo coincidan con tu colección real (por ejemplo, si el RUC se
llama `rucEmisor` en vez de `ruc`). Es el único archivo donde deberías tocar
nombres de campos de Mongo.

## Probar

```bash
npm run dev
```

Deberías ver algo como:

```
Conectando a MongoDB (solo lectura)...
Comprobantes obtenidos: 200

F001-100 | RUC 20123456789 | tipo 01 | estado interno: ACEPTADO | 2026-08-01
F001-101 | RUC 20123456789 | tipo 01 | estado interno: ANULADO | 2026-08-02
...
```

Si ves 0 comprobantes, revisa `MONGO_COLLECTION_COMPROBANTES` y el
`fieldMapping` — probablemente el nombre no coincide.

## Errores comunes

- **`MongoServerSelectionError`**: URI mal formada, IP no whitelisteada en
  Atlas, o el usuario no tiene permisos ni siquiera de lectura.
- **`Falta la variable de entorno obligatoria`**: no copiaste `.env.example`
  a `.env`, o falta una variable.
- **Comprobantes con campos vacíos ("")**: el `fieldMapping.ts` no coincide
  con los nombres reales de la colección.

## Qué NO hace este código (a propósito)

- No tiene ningún método de escritura (`insertOne`, `updateOne`,
  `deleteOne`) en `comprobantesRepository.ts`. No los agregues aquí.
- No filtra todavía "ya verificados" — eso llega en una fase posterior,
  cuando exista un almacén propio de historial fuera de esta BD.
- No llama a SUNAT — eso es la Fase 2.

## Siguiente paso (Fase 2)

Consulta al servicio oficial de SUNAT (API1 — Consulta Integrada de
Comprobante de Pago) usando las credenciales Clave SOL de la empresa,
generando un token antes de cada consulta.
