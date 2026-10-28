import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createBotEngine } from '../core/BotEngine.js';
import { ChannelAdapter } from './ChannelAdapter.js';

const MAX_BODY_BYTES = 1_000_000;

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export class HttpWebhookAdapter extends ChannelAdapter {
  constructor(engine) {
    super(engine, 'webhook');
  }

  createServer() {
    return http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://localhost');
      try {
        if (req.method === 'GET' && url.pathname === '/health') {
          sendJson(res, 200, { status: 'ok' });
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/messages') {
          const raw = await readBody(req);
          let body;
          try {
            body = JSON.parse(raw || '{}');
          } catch {
            sendJson(res, 400, { error: 'JSON inválido.' });
            return;
          }
          if (!body.userId || !body.conversationId || typeof body.text !== 'string') {
            sendJson(res, 400, { error: 'userId, conversationId e text são obrigatórios.' });
            return;
          }
          const result = await this.processActivity(body);
          sendJson(res, 200, result, { 'x-correlation-id': result.correlationId });
          return;
        }

        sendJson(res, 404, { error: 'Não encontrado.' });
      } catch (error) {
        const status = error.statusCode || 500;
        sendJson(res, status, { error: status === 413 ? 'Payload excede o limite.' : 'Falha interna.' });
      }
    });
  }

  listen(port = Number(process.env.PORT) || 3000) {
    const server = this.createServer();
    server.listen(port, () => {
      this.engine.logger.info('http adapter listening', { port: Number(port) });
    });
    return server;
  }
}

export function createHttpServer(engine) {
  return new HttpWebhookAdapter(engine).createServer();
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return fileURLToPath(import.meta.url).toLowerCase() === entry.toLowerCase();
}

if (isDirectRun()) {
  const engine = createBotEngine({ logToConsole: true });
  new HttpWebhookAdapter(engine).listen(Number(process.env.PORT) || 3000);
}
