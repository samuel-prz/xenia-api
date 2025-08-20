/**
 * Xenia API Server
 * 
 * This server provides the API for the Xenia application.
 * It handles CORS, cookies, and health checks.
 */

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import chalk from "chalk";
import { env } from './env.js'; 
import { pingDb } from './db/index.js';
import { authRoutes } from "./routes/auth.js";
import { propertyRoutes } from "./routes/properties.js";
import { reservationRoutes } from "./routes/reservations.js";


// Check if the database is reachable
// This is a simple ping to ensure the database connection is alive
const isDataBaseUp = await pingDb().catch(() => false);


// Disable logging for production, enable for development
const app = Fastify({
  logger: false, 
});

// Register plugins
// CORS allows cross-origin requests, for frontend-backend communication
await app.register(cors, {
  origin: env.frontendOrigin,
  credentials: true,
});

// Cookie plugin for handling cookies in requests
// This is used for session management and authentication
await app.register(cookie, {
  secret: env.cookieSecret,
  hook: 'onRequest',
});

// Register routes
// Auth
await app.register(authRoutes, { prefix: "/auth" });
//
await app.register(propertyRoutes);
await app.register(reservationRoutes);



// Import and register the routes from the routes directory
app.setNotFoundHandler((req, reply) => {
  reply.code(404).send({ ok: false, error: 'Not Found' });
});

// Hook Logging with morgan-like readable output
// Logs each request with method, URL, status code, and response time
declare module "fastify" {
  // Extend FastifyRequest to include a custom property for start time
  interface FastifyRequest {
    _startTime?: number;
  }
}

// This regex will match UUIDs in the format xxxxxxxx-xxxx-xxxx-xxxx
const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

app.addHook("onRequest", async (req) => {
  // Initialize the start time for the request
  req._startTime = performance.now();
});

app.addHook("onResponse", async (req, reply) => {
  // Calculate the response time in milliseconds
  const ms =
    req._startTime !== undefined ? performance.now() - req._startTime : 0;

  const status = reply.statusCode;
  const method = chalk.magenta(req.method);

  // Replace UUIDs in the URL with a placeholder for cleaner logging
  const cleanUrl = chalk.white(req.url.replace(UUID_REGEX, ""));

  const statusColored =
    status >= 500 ? chalk.red(status) :
    status >= 400 ? chalk.yellow(status) :
    status >= 300 ? chalk.cyan(status) :
    chalk.green(status);

  const time = chalk.gray(`${ms.toFixed(1)} ms`);
  console.log(`${method} ${cleanUrl} ${statusColored} - ${time}`);
});

// ------

// Error handler for unexpected errors
app.setErrorHandler((err, req, reply) => {
  console.error(err);
  reply.code(500).send({ ok: false, error: 'Internal Server Error' });
});


// Start the server
// This function initializes the server and listens on the specified port
const startServer = async () => {
  try {
    // Check if the database is up before starting the server
    await app.listen({ port: env.port, host: '0.0.0.0' }); //Is avisable to listen on 0.0.0.0 for docker containers
    console.log(`\x1b[34mServer Xenia-API running on port:\x1b[0m ${env.port}!`);
    console.log(`CORS origin: ${env.frontendOrigin}`);
    console.log(`Environment: ${env.nodeEnv}`);
    console.log(`Database status: ${isDataBaseUp ? '\x1b[32mconnected\x1b[0m' : '\x1b[31mdisconnected\x1b[0m'}`);
    if (!isDataBaseUp) {
      console.error(chalk.red('Database is not reachable. Please check your connection.'));
      process.exit(1);
    }
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
};

startServer();
