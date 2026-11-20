import http from 'node:http';
import { createApp } from './app.mjs';

const app = await createApp();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

http.createServer(app).listen(PORT, HOST, () => {
  console.log(`Synnex quotations running at http://localhost:${PORT}  (storage: ${app.store.kind}${process.env.ACCESS_PIN ? ', PIN protected' : ''})`);
});
