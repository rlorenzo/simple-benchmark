#!/usr/bin/env node
/**
 * Regression gate for CI.
 *
 * Runs the benchmark against the local fixture server (test/testServer.js) and
 * fails if any of the bugs previously found in benchmark.js are back:
 *
 *   - transfer size measured from the wrong CDP event, which under-reports it
 *     (and reported 0 KB of CSS against a real site)
 *   - a URL producing zero usable samples, reported as a clean run
 *   - a hostile page name landing unescaped in the generated report
 *
 * The transfer check is against ground truth - the bytes the fixture server
 * actually wrote to its sockets - because a threshold cannot tell an
 * under-count from a correct count. Nothing here is timing-based; wall-clock
 * budgets are flaky on a shared CI runner.
 */
const assert = require('node:assert');
const { chromium, devices } = require('playwright');
const { createTestServer } = require('./test/testServer');
const {
  benchmarkUrl,
  generateHtmlReport,
  getProfile,
  measurePage,
} = require('./benchmark');

process.env.BENCHMARK_SETTLE_MS ||= '100';

// Headers, the 404 for the favicon the browser asks for unprompted, and
// connection reuse all move the total a little. The bug this guards against
// under-reports by ~35% on this fixture, so 15% separates them comfortably.
const TOLERANCE = 0.15;
const BYTES_PER_KB = 1024;

async function main() {
  const server = createTestServer();
  await new Promise((resolve) => server.on('listening', resolve));
  const url = `http://localhost:${server.address().port}`;

  // Ground truth: bytesWritten is live on an open socket and final on a closed
  // one, so the live set has to be added to the closed total, not replace it.
  let closedBytes = 0;
  const openSockets = new Set();
  server.on('connection', (socket) => {
    openSockets.add(socket);
    socket.on('close', () => {
      closedBytes += socket.bytesWritten;
      openSockets.delete(socket);
    });
  });
  const bytesSent = () =>
    closedBytes +
    [...openSockets].reduce((total, socket) => total + socket.bytesWritten, 0);

  const browser = await chromium.launch();

  try {
    const profile = getProfile('unthrottled');

    // One isolated load, so the server's byte count maps to exactly what was
    // measured. A full benchmarkUrl pass would fold in four.
    const context = await browser.newContext(
      profile.device ? { ...devices[profile.device] } : {},
    );
    const page = await context.newPage();
    const before = bytesSent();
    const measured = await measurePage(page, url, profile);
    const actualKb = (bytesSent() - before) / BYTES_PER_KB;
    await context.close();

    const drift = Math.abs(measured.pageSize - actualKb) / actualKb;
    assert.ok(
      drift <= TOLERANCE,
      `gate: measured transfer ${measured.pageSize.toFixed(2)} KB but the server sent ${actualKb.toFixed(2)} KB (${(drift * 100).toFixed(0)}% off) - transfer size is coming from the wrong source`,
    );
    assert.ok(
      measured.cssSize > 0 && measured.jsSize > 0,
      `gate: fixture serves CSS and JS but they measured ${measured.cssSize.toFixed(2)} / ${measured.jsSize.toFixed(2)} KB`,
    );

    const result = await benchmarkUrl(browser, 'Fixture', url, profile);
    assert.ok(
      result.sampleCount > 0,
      'gate: fixture URL produced zero samples but was not reported as failed',
    );

    const hostileName = '<script>alert(1)</script>';
    const report = generateHtmlReport(
      [{ name: hostileName, url, ...result }],
      profile,
    );
    assert.ok(
      !report.includes(hostileName),
      'gate: a page name landed unescaped in the report',
    );

    console.log('Gate passed:', {
      measuredKb: measured.pageSize.toFixed(2),
      serverSentKb: actualKb.toFixed(2),
      drift: `${(drift * 100).toFixed(1)}%`,
      sampleCount: result.sampleCount,
    });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
