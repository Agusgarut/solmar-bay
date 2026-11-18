// A tiny static server for game/ (Node 22, standard library only), so the
// entry can be played locally without a build step: `node serve.ts` serves
// game/ on http://localhost:8080. It sends the MIME types a browser game
// needs (including the vendored Anton font), refuses any path outside game/,
// and otherwise does nothing clever: this is a development convenience, not
// a web server for the internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

function mimeFor(file) {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

// `--port N` / `--host H`, with safe defaults and clamping.
function parseArgs(argv) {
  const portIndex = argv.indexOf('--port');
  const wantedPort = portIndex === -1 ? 8080 : Number(argv[portIndex + 1]);
  const port = Number.isInteger(wantedPort) && wantedPort > 0 && wantedPort < 65536 ? wantedPort : 8080;
  const hostIndex = argv.indexOf('--host');
  const rawHost = hostIndex === -1 ? undefined : argv[hostIndex + 1];
  // A flag after --host is another option, not a hostname: `serve.ts
  // --host --port 9000` must not try to listen on "--port".
  const host = !rawHost || rawHost.startsWith('-') ? '127.0.0.1' : rawHost;
  return { port, host };
}

const { port, host } = parseArgs(process.argv.slice(2));

// Resolve a request path inside game/ (or null when it escapes the root).
function resolveInside(requestPath) {
  let pathname = requestPath;
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) return null;
  return file;
}

function serveFile(file, response) {
  let size;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': mimeFor(file),
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}

createServer((request, response) => {
  // Read-only static server: anything but GET/HEAD is refused.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end('method not allowed');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  const file = resolveInside(pathname);
  if (!file) {
    response.writeHead(403).end('forbidden');
    return;
  }
  serveFile(file, response);
}).listen(port, host, () => {
  console.log(`game/ is on http://${host}:${port}`);
  console.log(`shots: http://${host}:${port}/?shot=start&seed=7  http://${host}:${port}/?shot=drive&seed=7  http://${host}:${port}/?shot=mission&seed=7  http://${host}:${port}/?shot=chase&seed=7`);
});
