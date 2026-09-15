// Owned by Playwright's webServer. It stays alive and accepts HTTP, but deliberately stops
// answering the phase under test. Run through e2e-readiness.config.mjs in the existing queue.
import { createServer } from 'node:http';
import { devPort } from './dev-port.mjs';

const mode = process.argv[2] ?? 'guard-root';
if (!['readiness', 'guard-root', 'guard-config', 'guard-body'].includes(mode)) {
  throw new Error(`Unknown readiness fixture mode: ${mode}`);
}
let rootRequests = 0;
const server = createServer((request, response) => {
  console.log(`fixture request ${request.url} at=${Date.now()}`);
  if (mode === 'readiness') return;
  if (request.url === '/') {
    rootRequests += 1;
    if (mode === 'guard-root' && rootRequests > 1) return;
    response.end('ready');
  } else if (request.url === '/app') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><body>Offline guard fixture</body></html>');
  } else if (request.url === '/e2e/_env-probe.ts') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end('export const VITE_RENDER_API = "1";');
  } else if (request.url === '/api/ai/config') {
    if (mode === 'guard-body') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"providers":'); // Headers arrive, but the JSON body never finishes.
    }
  } else {
    response.writeHead(404).end();
  }
});
server.listen(devPort(), '127.0.0.1', () => {
  console.log(`fixture mode=${mode} pid=${process.pid} port=${devPort()} started=${Date.now()}`);
});
