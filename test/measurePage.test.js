const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');
const { measurePage, getProfile } = require('../benchmark.js');
const { createTestServer } = require('./testServer');

const BYTES_PER_KB = 1024;

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

  it('should match the bytes the server actually put on the wire', async () => {
    // Ground truth, not a threshold: a threshold cannot tell an under-count
    // from a correct count. Transfer size used to be summed from
    // Network.dataReceived, whose encodedDataLength is a running estimate -
    // it under-reported this fixture by ~35% and reported 0 KB of CSS against
    // a real site. Comparing against the socket bytes the server wrote is the
    // only check that catches the number drifting off reality again.
    //
    // Headers, the favicon 404 the browser requests unprompted, and
    // connection reuse all move the total a little, so 15% separates a
    // correct count from the bug comfortably without being flaky.
    const TOLERANCE = 0.15;

    // bytesWritten is live on an open socket and final on a closed one, so the
    // live set has to be added to the closed total, not replace it.
    let closedBytes = 0;
    const openSockets = new Set();
    const onConnection = (socket) => {
      openSockets.add(socket);
      socket.on('close', () => {
        closedBytes += socket.bytesWritten;
        openSockets.delete(socket);
      });
    };
    server.on('connection', onConnection);
    const bytesSent = () =>
      closedBytes +
      [...openSockets].reduce(
        (total, socket) => total + socket.bytesWritten,
        0,
      );

    const page = await browser.newPage();
    try {
      const before = bytesSent();
      const result = await measurePage(page, serverUrl, {
        ...getProfile('unthrottled'),
        ...FAST_SETTLE,
      });
      const actualKb = (bytesSent() - before) / BYTES_PER_KB;

      const drift = Math.abs(result.pageSize - actualKb) / actualKb;
      assert.ok(
        drift <= TOLERANCE,
        `measured transfer ${result.pageSize.toFixed(2)} KB but the server sent ${actualKb.toFixed(2)} KB (${(drift * 100).toFixed(0)}% off) - transfer size is coming from the wrong source`,
      );
    } finally {
      await page.close();
      server.off('connection', onConnection);
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

  it('should record every request in the waterfall, document first', async () => {
    // The CDP wiring behind the waterfall is only exercised against a real
    // browser: the unit tests feed buildWaterfall synthetic records, so nothing
    // else catches a renamed event field or a handler that stops firing.
    const page = await browser.newPage();
    try {
      const { waterfall, pageSize } = await measurePage(
        page,
        serverUrl,
        FAST_SETTLE,
      );

      assert.deepStrictEqual(
        waterfall.map((entry) => entry.name),
        // The document is an origin root, which has no basename to label it by.
        [`${serverUrl}/`, 'styles.css', 'script.js'],
        'every request should appear, in start order, document first',
      );
      assert.strictEqual(waterfall[0].type, 'Document');
      assert.strictEqual(waterfall[0].start, 0, 'document starts at time zero');

      for (const entry of waterfall) {
        assert.strictEqual(
          entry.failed,
          false,
          `${entry.name} should not fail`,
        );
        assert.ok(
          entry.end >= entry.start,
          `${entry.name} should not finish before it starts`,
        );
      }

      // The waterfall and the page-weight total are read off the same records,
      // so they have to agree about how many bytes arrived.
      const waterfallKb = waterfall.reduce((sum, entry) => sum + entry.kb, 0);
      assert.ok(
        Math.abs(waterfallKb - pageSize) <= waterfall.length,
        `waterfall total (${waterfallKb} KB) should match page size (${pageSize} KB) within per-row rounding`,
      );
    } finally {
      await page.close();
    }
  });

  it('should show each redirect hop as its own row', async () => {
    const page = await browser.newPage();
    try {
      const { waterfall } = await measurePage(
        page,
        `${serverUrl}/old`,
        FAST_SETTLE,
      );

      const documents = waterfall.filter((entry) => entry.type === 'Document');
      assert.deepStrictEqual(
        documents.map((entry) => entry.name),
        // The destination is an origin root, which has no basename to label it by.
        ['old', `${serverUrl}/`],
        'the redirect hop and its destination should be separate rows',
      );
      assert.strictEqual(documents[0].start, 0, 'the hop starts at time zero');
      assert.ok(
        documents[1].start >= documents[0].end,
        'the destination starts when the hop ends, not at time zero',
      );
    } finally {
      await page.close();
    }
  });
});
