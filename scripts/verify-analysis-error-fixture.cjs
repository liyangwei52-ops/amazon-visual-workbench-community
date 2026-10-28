// Local UI fixture: all model endpoints stop here. No provider requests or keys are logged.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const calls = [];
const output = path.resolve('verification/edge-real-20261017/local-error-calls.json');
const backendPort = Number(process.env.FIXTURE_BACKEND_PORT || 3035);
const fixtureMessage = process.env.FIXTURE_ERROR_MESSAGE || '本地模拟：服务商暂不可用（request id: edge-fixture-503）';
http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    req.resume();
    calls.push({ route: req.url, method: req.method, at: new Date().toISOString() });
    fs.writeFileSync(output, JSON.stringify(calls, null, 2));
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/provider-transport') {
      res.end(JSON.stringify({ mode: 'proxy', baseURL: 'https://api.openlux.ai/v1' }));
    } else {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: fixtureMessage, outcome: 'failed' }));
    }
    return;
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: backendPort, path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${backendPort}` } }, response => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  upstream.on('error', () => { res.statusCode = 502; res.end('Local fixture backend unavailable'); });
  req.pipe(upstream);
}).listen(3036, '127.0.0.1', () => console.log('Local error fixture at http://localhost:3036; model endpoints are mocked.'));
