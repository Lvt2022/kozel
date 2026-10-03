import express from 'express';
import { createServer } from 'node:http';
import { createSocketServer } from './socketServer.js';

const PORT = Number(process.env.PORT ?? 3001);

const app = express();
app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
createSocketServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Kozel server listening on http://localhost:${PORT}`);
});
