import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { env } from './env.js'; 

const app = Fastify({
  logger: { level: 'info' }, 
});

await app.register(cors, {
  origin: env.frontendOrigin,
  credentials: true,
});

await app.register(cookie, {
  secret: env.cookieSecret,
  hook: 'onRequest',
});

app.get('/health', async () => ({
  ok: true,
  service: 'xenia-api',
  time: new Date().toISOString(),
  env: env.nodeEnv,
}));

app.setNotFoundHandler((req, reply) => {
  reply.code(404).send({ ok: false, error: 'Not Found' });
});

app.setErrorHandler((err, req, reply) => {
  // imprime algo mínimo en stderr si quieres
  console.error(err);
  reply.code(500).send({ ok: false, error: 'Internal Server Error' });
});

app.listen({ port: env.port, host: '0.0.0.0' })
  .then(() => {
    console.log(`xenia-api up on http://localhost:${env.port}`);
    console.log(`CORS origin: ${env.frontendOrigin}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
