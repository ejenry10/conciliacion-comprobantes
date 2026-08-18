import express from 'express';
import { router } from './routes';
import { requireApiToken } from './auth';
import { env } from '../config/env';
import { rateLimit } from './ratelimit';

const app = express();

app.use(express.json());
app.use(requireApiToken);
app.use(rateLimit);
app.use(router);

app.listen(env.apiPort, () => {
  console.log(`API de conciliacion escuchando en el puerto ${env.apiPort}`);
});