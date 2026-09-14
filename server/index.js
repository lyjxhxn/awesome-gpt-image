import express from 'express';
import http from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getSupabaseAdminClient, getSupabaseConfig } from '../api/_lib/supabase.js';

const serverDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(serverDir, '..');
const apiRoot = join(projectRoot, 'api');
const distRoot = join(projectRoot, 'dist');
const authTemplatesRoot = join(projectRoot, 'auth-templates');

function proxySupabase(req, res) {
  const incoming = new URL(req.originalUrl, 'http://local.invalid');
  const target = new URL(process.env.SUPABASE_URL || 'http://gateway');
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;
  delete headers['content-length'];

  const upstream = http.request(target, { method: req.method, headers }, (upstreamResponse) => {
    res.status(upstreamResponse.statusCode || 502);
    for (const [name, value] of Object.entries(upstreamResponse.headers)) {
      if (value !== undefined && name !== 'connection' && name !== 'transfer-encoding') {
        res.setHeader(name, value);
      }
    }
    upstreamResponse.pipe(res);
  });
  upstream.setTimeout(10_000, () => upstream.destroy(new Error('UPSTREAM_TIMEOUT')));
  upstream.on('error', () => {
    if (!res.headersSent) res.status(502).json({ ok: false, error: 'SUPABASE_UNAVAILABLE' });
    else if (!res.writableEnded) res.end();
  });
  req.pipe(upstream);
}

function apiFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '_lib' ? [] : apiFiles(path);
    return entry.isFile() && extname(entry.name) === '.js' ? [path] : [];
  });
}

function routeForFile(path) {
  return `/api/${relative(apiRoot, path).replaceAll('\\', '/').replace(/\.js$/, '')}`;
}

async function readyState() {
  const config = getSupabaseConfig();
  const client = getSupabaseAdminClient();
  if (!config.configured || !client) return { ok: false, error: 'SERVER_NOT_CONFIGURED' };
  try {
    const authUrl = `${config.url.replace(/\/$/, '')}/auth/v1/health`;
    const [authResponse, profileResult] = await Promise.all([
      fetch(authUrl, { signal: AbortSignal.timeout(5000) }),
      client.from('profiles').select('id', { head: true, count: 'exact' }).limit(1)
    ]);
    if (!authResponse.ok || profileResult.error) return { ok: false, error: 'DEPENDENCY_NOT_READY' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'DEPENDENCY_NOT_READY' };
  }
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.get('/healthz', (_req, res) => res.status(200).json({ ok: true }));
  app.get('/readyz', async (_req, res) => {
    const state = await readyState();
    return res.status(state.ok ? 200 : 503).json(state);
  });

  if (existsSync(authTemplatesRoot)) {
    app.use('/auth-templates', express.static(authTemplatesRoot, { index: false, maxAge: '5m' }));
  }

  app.use(['/auth/v1', '/rest/v1'], proxySupabase);

  for (const file of apiFiles(apiRoot)) {
    const route = routeForFile(file);
    app.all(route, async (req, res) => {
      try {
        const module = await import(pathToFileURL(file).href);
        await module.default(req, res);
      } catch (error) {
        console.warn('API handler failed', {
          route,
          message: String(error?.message || 'unknown').slice(0, 240)
        });
        if (!res.headersSent) res.status(500).json({ ok: false, error: 'INTERNAL_SERVER_ERROR' });
        else if (!res.writableEnded) res.end();
      }
    });
  }

  if (existsSync(distRoot)) {
    app.use(express.static(distRoot, { index: false, maxAge: '1h' }));
    app.get(['/community', '/community/', '/community/result', '/community/result/'], (_req, res) => {
      res.sendFile(join(distRoot, 'index.html'));
    });
    app.get(['/', '/index.html'], (_req, res) => res.sendFile(join(distRoot, 'index.html')));
    app.get(['/gpt-image-2-5', '/gpt-image-2-5/'], (_req, res) => {
      res.sendFile(join(distRoot, 'gpt-image-2-5', 'index.html'));
    });
  }

  app.use((_req, res) => res.status(404).json({ ok: false, error: 'NOT_FOUND' }));
  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  createApp().listen(port, process.env.HOST || '127.0.0.1', () => {
    console.log(`Node API listening on http://${process.env.HOST || '127.0.0.1'}:${port}`);
  });
}
