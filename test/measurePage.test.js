const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
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
  });
});

describe('measurePage - vitals and throttling', () => {
  // measurePage keeps observing after load so LCP can settle; these run against
  // a local page, so a short settle is enough.
  const FAST_SETTLE = { settleMs: 250 };

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

  it('should report Core Web Vitals alongside the load time', async () => {
    const page = await browser.newPage();
    try {
      const result = await measurePage(page, serverUrl, FAST_SETTLE);

      for (const metric of ['lcp', 'fcp', 'ttfb', 'cls']) {
        assert.ok(
          typeof result[metric] === 'number',
          `${metric} should be a number`,
        );
        assert.ok(result[metric] >= 0, `${metric} should not be negative`);
      }
      assert.ok(result.fcp > 0, 'fcp should be recorded for a rendered page');
    } finally {
      await page.close();
    }
  });

  it('should report transfer size separately from decoded size', async () => {
    const page = await browser.newPage();
    try {
      const result = await measurePage(page, serverUrl, FAST_SETTLE);

      assert.ok(typeof result.pageSize === 'number', 'pageSize is a number');
      assert.ok(
        typeof result.decodedSize === 'number',
        'decodedSize is a number',
      );
      assert.ok(result.pageSize > 0, 'transfer size should be recorded');
    } finally {
      await page.close();
    }
  });

  it('should actually slow the page down when a profile is applied', async () => {
    // The point of the profile is that it changes the measurement. If a
    // throttled run is not measurably slower than an unthrottled one on the
    // same page, the throttling is not being applied and every number the tool
    // reports is a fast-connection number.
    const fastPage = await browser.newPage();
    const slowPage = await browser.newPage();
    try {
      const fast = await measurePage(fastPage, serverUrl, FAST_SETTLE);
      const slow = await measurePage(slowPage, serverUrl, {
        ...FAST_SETTLE,
        latency: 300,
        downloadThroughput: (400 * 1000) / 8,
        uploadThroughput: (400 * 1000) / 8,
        cpuSlowdown: 1,
      });

      assert.ok(
        slow.pageLoadTime > fast.pageLoadTime,
        `throttled load (${slow.pageLoadTime}ms) should exceed unthrottled (${fast.pageLoadTime}ms)`,
      );
    } finally {
      await fastPage.close();
      await slowPage.close();
    }
  });
});
