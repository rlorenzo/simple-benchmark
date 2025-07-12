const express = require('express');

function createTestServer() {
  const app = express();

  // Serve CSS file
  app.get('/styles.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.send(`
      body { font-family: Arial, sans-serif; }
      h1 { color: blue; }
      .container { max-width: 800px; margin: 0 auto; }
    `);
  });

  // Serve JS file
  app.get('/script.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(`
      console.log('Test JavaScript loaded');
      document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded');
      });
    `);
  });

  // Serve main HTML page with CSS and JS references
  app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
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
      </html>
    `);
  });

  return app.listen(0); // Listen on a random free port
}

module.exports = { createTestServer };
