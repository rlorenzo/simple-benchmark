const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createTestServer } = require('./testServer');
const { main } = require('../benchmark.js');

describe('Integration Test', () => {
  let server;
  let serverUrl;
  const tempDir = path.join(__dirname, 'temp-integration');
  const linksTxtPath = path.join(tempDir, 'links.txt');

  // The integration test checks wiring, not performance realism. Left on the
  // default profile it would throttle to 1.6 Mbps and wait 4s per run for LCP
  // to settle - about 25s for one URL, to prove only that the pieces connect.
  const originalProfile = process.env.BENCHMARK_PROFILE;
  const originalSettle = process.env.BENCHMARK_SETTLE_MS;

  before(async () => {
    process.env.BENCHMARK_PROFILE = 'unthrottled';
    process.env.BENCHMARK_SETTLE_MS = '100';
    // Start the test server
    server = createTestServer();
    await new Promise((resolve) => server.on('listening', resolve));
    serverUrl = `http://localhost:${server.address().port}`;
    console.log(`Test server running at ${serverUrl}`);

    // Create a temporary directory and links.txt
    await fs.mkdir(tempDir, { recursive: true });
    await fs.writeFile(linksTxtPath, `Test Page,${serverUrl}`);

    // Temporarily change the current working directory for the benchmark script
    process.chdir(tempDir);
  });

  after(async () => {
    if (originalProfile === undefined) {
      delete process.env.BENCHMARK_PROFILE;
    } else {
      process.env.BENCHMARK_PROFILE = originalProfile;
    }
    if (originalSettle === undefined) {
      delete process.env.BENCHMARK_SETTLE_MS;
    } else {
      process.env.BENCHMARK_SETTLE_MS = originalSettle;
    }
    // Stop the test server
    await new Promise((resolve) => server.close(resolve));
    console.log('Test server stopped.');

    // Clean up temporary files
    await fs.rm(tempDir, { recursive: true, force: true });

    // Restore original working directory
    process.chdir(path.join(__dirname, '..'));
  });

  it('should run the benchmark and generate an HTML report', async () => {
    // Run the main benchmark function
    await main(tempDir);

    // Verify that an HTML report was generated
    const files = await fs.readdir(tempDir);
    const reportFile = files.find(
      (file) => file.startsWith('results-') && file.endsWith('.html'),
    );
    assert.ok(reportFile, 'HTML report file was not generated.');

    // Optionally, read the report content and assert its structure
    const reportContent = await fs.readFile(
      path.join(tempDir, reportFile),
      'utf-8',
    );
    assert.ok(
      reportContent.includes('Website Performance Benchmark Results'),
      'Report content is missing expected title.',
    );
    assert.ok(
      reportContent.includes(serverUrl),
      'Report content is missing the benchmarked URL.',
    );

    // Verify CSS and JS size columns are present in the report
    assert.ok(
      reportContent.includes('CSS Size (avg &plusmn; std dev)'),
      'Report should contain CSS size column header',
    );
    assert.ok(
      reportContent.includes('JS Size (avg &plusmn; std dev)'),
      'Report should contain JS size column header',
    );

    // Verify that the report contains CSS and JS size data (should be > 0 since we serve CSS/JS)
    const cssPattern = /(\d+\.\d+) KB &plusmn; \d+\.\d+/g;
    const matches = reportContent.match(cssPattern);
    assert.ok(
      matches && matches.length >= 2,
      'Report should contain CSS and JS size measurements',
    );
  });
});
