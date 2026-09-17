const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const path = require('node:path');
const { getUrls } = require('../benchmark.js');

describe('getUrls', () => {
  const testDir = path.join(__dirname, 'temp-getUrls');
  const linksTxtPath = path.join(testDir, 'links.txt');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should read URLs from links.txt if it exists', async () => {
    await fs.writeFile(linksTxtPath, 'Test Page,http://test.com');

    const urls = await getUrls(testDir);
    assert.deepStrictEqual(urls, [
      { name: 'Test Page', url: 'http://test.com' },
    ]);
  });

  it('should throw an error if links.txt does not exist', async () => {
    await assert.rejects(getUrls(testDir), /links.txt not found/);
  });

  it('should handle empty links.txt gracefully', async () => {
    await fs.writeFile(linksTxtPath, '');
    const urls = await getUrls(testDir);
    assert.deepStrictEqual(urls, []);
  });

  it('should trim whitespace and CRLF line endings', async () => {
    await fs.writeFile(linksTxtPath, 'Test Page , http://test.com \r\n');
    const urls = await getUrls(testDir);
    assert.deepStrictEqual(urls, [
      { name: 'Test Page', url: 'http://test.com' },
    ]);
  });

  it('should filter out invalid lines', async () => {
    const content = [
      'Valid Page,http://valid.com',
      'InvalidLine',
      '',
      'Another Valid,http://another.com',
    ].join('\n');
    await fs.writeFile(linksTxtPath, content);
    const urls = await getUrls(testDir);
    assert.deepStrictEqual(urls, [
      { name: 'Valid Page', url: 'http://valid.com' },
      { name: 'Another Valid', url: 'http://another.com' },
    ]);
  });
});
