import express from 'express';
import { router } from './routes';
import { requireApiToken } from './auth';
import { rateLimit } from './rateLimit';
import { env } from '../config/env';

const app = express();

app.use(express.json());
app.use(requireApiToken);
app.use(rateLimit);
app.use(router);

app.listen(env.apiPort, () => {
  console.log(`API de conciliacion escuchando en el puerto ${env.apiPort}`);
});