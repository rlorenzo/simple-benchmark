const express = require('express');

function createTestServer() {
  const app = express();

  app.get('/', (req, res) => {
    res.send('<html><body><h1>Test Page</h1></body></html>');
  });

  return app.listen(0); // Listen on a random free port
}

module.exports = { createTestServer };
