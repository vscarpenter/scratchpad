#!/usr/bin/env node
// Local static server for development and the Playwright suite.
//
// Deliberately NOT `python3 -m http.server`: that serves the whole working
// tree -- .env.local, .git/, the security-review dossiers, operator scripts --
// with directory listings and no Host validation, so any local process (or a
// DNS-rebinding page the developer visits) could read them. This server
// exposes exactly what deploy.sh uploads and nothing else:
//   /                        -> index.html
//   /<shell>.html            -> the HTML shells named in deploy.sh
//   /service-worker.js       -> the root worker shim
//   /public/**               -> static assets
// Everything else is 404. Requests whose Host is not loopback are refused,
// which defeats DNS rebinding. Listens on 127.0.0.1 only.
//
// Usage: node scripts/dev-server.mjs [port]   (default 8080)
import { createServer } from 'node:http';
import { readFileSync, promises as fs } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 8080);

const deploySource = readFileSync(join(root, 'deploy.sh'), 'utf8');
const shellsMatch = deploySource.match(/^HTML_SHELLS=\(([^)]*)\)$/m);
if (!shellsMatch) {
  console.error('dev-server: could not derive HTML_SHELLS from deploy.sh');
  process.exit(1);
}
const HTML_SHELLS = new Set(shellsMatch[1].split(/\s+/).filter(Boolean));

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

// The Playwright suite hammers this single server from parallel workers, so
// cache file bodies keyed by mtime: hundreds of redundant disk reads per run
// become metadata checks, while a touched file still invalidates instantly
// during hands-on development.
const fileCache = new Map();

/** @param {string} file @returns {Promise<Buffer>} */
async function readDeployed(file) {
  const stats = await fs.stat(file);
  const cached = fileCache.get(file);
  if (cached && cached.mtimeMs === stats.mtimeMs) return cached.body;
  const body = await fs.readFile(file);
  fileCache.set(file, { mtimeMs: stats.mtimeMs, body });
  return body;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function deployedFileFor(pathname) {
  if (pathname === '/') return join(root, 'index.html');
  if (pathname === '/service-worker.js') return join(root, 'service-worker.js');
  const name = pathname.slice(1);
  if (HTML_SHELLS.has(name)) return join(root, name);
  if (pathname.startsWith('/public/')) {
    // normalize() collapses any ../ an encoded path smuggled in; the prefix
    // check then guarantees the resolved file stays under public/.
    const candidate = normalize(join(root, pathname.slice(1)));
    if (candidate.startsWith(join(root, 'public') + sep)) return candidate;
  }
  return null;
}

const server = createServer(async (req, res) => {
  const deny = (status, message) => {
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(message + '\n');
  };

  const hostname = (req.headers.host || '').replace(/:\d+$/, '');
  if (!ALLOWED_HOSTS.has(hostname)) return deny(403, 'Forbidden: unexpected Host header');
  if (req.method !== 'GET' && req.method !== 'HEAD') return deny(405, 'Method not allowed');

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://' + req.headers.host).pathname);
  } catch {
    return deny(400, 'Bad request');
  }

  const file = deployedFileFor(pathname);
  if (!file) return deny(404, 'Not found');

  try {
    const body = await readDeployed(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    deny(404, 'Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`dev-server: serving the deployable surface at http://127.0.0.1:${port}`);
});
