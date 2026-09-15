import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/index.html', 'text/html; charset=utf-8'],
  ['/style.css', 'text/css; charset=utf-8'],
  ['/game.js', 'text/javascript; charset=utf-8'],
  ['/engine.js', 'text/javascript; charset=utf-8'],
  ['/levels.js', 'text/javascript; charset=utf-8'],
  ['/icon.svg', 'image/svg+xml'],
]);
const portText = process.env.PORT ?? '4180';
const port = Number(portText);
if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  let path;
  try {
    path = decodeURIComponent((request.url ?? '/').split('?')[0]);
  } catch {
    response.writeHead(400).end('Invalid path');
    return;
  }
  if (path.includes('\\') || path.split('/').some(part => part === '.' || part === '..')) {
    response.writeHead(400).end('Invalid path');
    return;
  }
  if (path === '/') path = '/index.html';
  const type = files.get(path);
  if (!type) {
    response.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await readFile(new URL(`.${path}`, import.meta.url));
    response.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const missing = error.code === 'ENOENT';
    if (!missing) console.error('Unable to serve a public file:', error.code);
    response.writeHead(missing ? 404 : 500).end(missing ? 'Not found' : 'Server error');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Echo Shift: http://127.0.0.1:${port}`);
});
