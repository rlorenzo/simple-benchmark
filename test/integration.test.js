const assert = require('assert');
const fs = require('fs-extra');
const path = require('path');
const { createTestServer } = require('./testServer');
const { main } = require('../benchmark.js');

describe('Integration Test', () => {
  let server;
  let serverUrl;
  const tempDir = path.join(__dirname, 'temp-integration');
  const linksTxtPath = path.join(tempDir, 'links.txt');

  before(async () => {
    // Start the test server
    server = createTestServer();
    await new Promise((resolve) => server.on('listening', resolve));
    serverUrl = `http://localhost:${server.address().port}`;
    console.log(`Test server running at ${serverUrl}`);

    // Create a temporary directory and links.txt
    await fs.ensureDir(tempDir);
    await fs.writeFile(linksTxtPath, `Test Page,${serverUrl}`);

    // Temporarily change the current working directory for the benchmark script
    process.chdir(tempDir);
  });

  after(async () => {
    // Stop the test server
    await new Promise((resolve) => server.close(resolve));
    console.log('Test server stopped.');

    // Clean up temporary files
    await fs.remove(tempDir);

    // Restore original working directory
    process.chdir(path.join(__dirname, '..'));
  });

  it('should run the benchmark and generate an HTML report', async () => {
    // Run the main benchmark function
    await main(tempDir);

    // Verify that an HTML report was generated
    const files = await fs.readdir(tempDir);
    const reportFile = files.find((file) => file.startsWith('results-') && file.endsWith('.html'));
    assert.ok(reportFile, 'HTML report file was not generated.');

    // Optionally, read the report content and assert its structure
    const reportContent = await fs.readFile(path.join(tempDir, reportFile), 'utf-8');
    assert.ok(reportContent.includes('Website Performance Benchmark Results'), 'Report content is missing expected title.');
    assert.ok(reportContent.includes(serverUrl), 'Report content is missing the benchmarked URL.');
  }).timeout(20000); // Increase timeout for integration test
});
