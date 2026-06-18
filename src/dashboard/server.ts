// DriftLens - Fastify dashboard server

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../shared/logger.js';
import { registerApiRoutes } from './api.js';

interface DashboardOptions {
  cwd: string;
  port: number;
  openBrowser: boolean;
}

export async function startDashboard(opts: DashboardOptions): Promise<void> {
  const fastify = Fastify({ logger: false });

  // Security headers. The dashboard binds to localhost only, but these defend
  // against drive-by / DNS-rebinding style attacks and MIME sniffing. The CSP
  // permits inline scripts/styles used by the bundled static pages while
  // restricting every other origin.
  fastify.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"
    );
  });

  // Resolve static dir - works in both ESM (import.meta.url) and CJS (__dirname)
  let staticDir: string;
  try {
    // ESM context
    const metaUrl = new Function('return import.meta.url')() as string;
    staticDir = path.join(fileURLToPath(metaUrl), '../../dashboard/static');
  } catch {
    // CJS context - __dirname is relative to the compiled output dir
    staticDir = path.resolve(__dirname, '../dashboard/static');
  }
  await fastify.register(fastifyStatic, {
    root: staticDir,
    prefix: '/',
  });

  // API routes
  await registerApiRoutes(fastify, opts.cwd);

  await fastify.listen({ port: opts.port, host: 'localhost' });

  logger.success(`Dashboard running at http://localhost:${opts.port}`);
  logger.info('Press Ctrl+C to stop');

  if (opts.openBrowser) {
    try {
      const { default: open } = await import('open').catch(() => ({ default: null }));
      if (open) {
        await open(`http://localhost:${opts.port}`);
      }
    } catch {
      // open not available - that's fine
    }
  }
}
