const assert = require('assert');
const { chromium } = require('playwright');
const { measurePage } = require('../benchmark.js');
const { createTestServer } = require('./testServer');

describe('measurePage', () => {
  let browser;
  let server;
  let serverUrl;

  before(async () => {
    browser = await chromium.launch();
    server = createTestServer();
    await new Promise((resolve) => server.on('listening', resolve));
    serverUrl = `http://localhost:${server.address().port}`;
  });

  after(async () => {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });

  it('should measure page load time, page size, CSS size, and JS size', async () => {
    const page = await browser.newPage();

    try {
      const result = await measurePage(page, serverUrl);

      // Verify all expected properties are present
      assert.ok(
        typeof result.pageLoadTime === 'number',
        'pageLoadTime should be a number',
      );
      assert.ok(
        typeof result.pageSize === 'number',
        'pageSize should be a number',
      );
      assert.ok(
        typeof result.cssSize === 'number',
        'cssSize should be a number',
      );
      assert.ok(typeof result.jsSize === 'number', 'jsSize should be a number');

      // Verify that values are reasonable (> 0 since we serve CSS and JS)
      assert.ok(
        result.pageLoadTime > 0,
        'pageLoadTime should be greater than 0',
      );
      assert.ok(result.pageSize > 0, 'pageSize should be greater than 0');
      assert.ok(
        result.cssSize > 0,
        'cssSize should be greater than 0 (server serves CSS)',
      );
      assert.ok(
        result.jsSize > 0,
        'jsSize should be greater than 0 (server serves JS)',
      );
    } finally {
      await page.close();
    }
  }).timeout(10000);
});
