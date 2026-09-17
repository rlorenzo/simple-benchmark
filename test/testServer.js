const http = require('node:http');

const ROUTES = {
  '/styles.css': [
    'text/css',
    `body { font-family: Arial, sans-serif; }
h1 { color: blue; }
.container { max-width: 800px; margin: 0 auto; }`,
  ],
  '/script.js': [
    'application/javascript',
    `console.log('Test JavaScript loaded');
document.addEventListener('DOMContentLoaded', function () {
  console.log('DOM loaded');
});`,
  ],
  '/': [
    'text/html',
    `<!DOCTYPE html>
<html>
  <head>
    <title>Test Page</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <div class="container">
      <h1>Test Page</h1>
      <p>This is a test page with CSS and JavaScript.</p>
    </div>
    <script src="/script.js"></script>
  </body>
</html>`,
  ],
};

/**
 * Starts a local server on a random free port serving a fixed test page.
 * @returns {import('node:http').Server} The listening server.
 */
function createTestServer() {
  const server = http.createServer((req, res) => {
    const route = ROUTES[req.url];
    if (!route) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': route[0] });
    res.end(route[1]);
  });

  return server.listen(0); // Listen on a random free port
}

module.exports = { createTestServer };
