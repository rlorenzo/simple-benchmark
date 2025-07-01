const assert = require('assert');
const fs = require('fs-extra');
const path = require('path');
const { getUrls } = require('../benchmark.js');

describe('getUrls', () => {
  const testDir = path.join(__dirname, 'temp-getUrls');
  const linksTxtPath = path.join(testDir, 'links.txt');
  const linksDistPath = path.join(testDir, 'links.txt.dist');

  beforeEach(async () => {
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  it('should read URLs from links.txt if it exists', async () => {
    await fs.writeFile(linksTxtPath, 'Test Page,http://test.com');

    const urls = await getUrls(testDir);
    assert.deepStrictEqual(urls, [{ name: 'Test Page', url: 'http://test.com' }]);
  });

  it('should throw an error if links.txt does not exist', async () => {
    await assert.rejects(getUrls(testDir), /links.txt not found/);
  });

  it('should handle empty links.txt gracefully', async () => {
    await fs.writeFile(linksTxtPath, '');
    const urls = await getUrls(testDir);
    assert.deepStrictEqual(urls, []);
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