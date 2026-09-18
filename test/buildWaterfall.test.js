const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildWaterfall, formatWaterfall } = require('../benchmark.js');

// CDP timestamps are monotonic seconds, so t0 is subtracted and scaled to ms.
const records = (entries) => new Map(Object.entries(entries));

describe('buildWaterfall', () => {
  it('converts CDP timestamps to ms from navigation start', () => {
    const [entry] = buildWaterfall(
      records({
        1: {
          url: 'https://example.com/hero.jpg?ver=9',
          type: 'Image',
          start: 100.25,
          end: 102.5,
          encodedDataLength: 84331,
        },
      }),
      100,
    );

    assert.strictEqual(entry.start, 250);
    assert.strictEqual(entry.end, 2500);
    assert.strictEqual(entry.kb, 82);
    assert.strictEqual(entry.type, 'Image');
    // Basename only, query string dropped - it is cache-busting noise.
    assert.strictEqual(entry.name, 'hero.jpg');
    assert.strictEqual(entry.failed, false);
  });

  it('names a resource by basename, not by whatever the query holds', () => {
    const names = buildWaterfall(
      records({
        // A query string carrying a path must not supply the basename.
        1: { url: 'https://cdn.example.com/app.js?next=/a/b', start: 1 },
        // An origin root has no basename, so the URL itself is the label.
        2: { url: 'https://example.com/', start: 2 },
        3: { url: `https://example.com/${'x'.repeat(80)}.js`, start: 3 },
        // A fragment is noise for the same reason a query string is.
        4: { url: 'https://example.com/hero.jpg#preload', start: 4 },
      }),
      0,
    ).map((entry) => entry.name);

    assert.strictEqual(names[0], 'app.js');
    assert.strictEqual(names[1], 'https://example.com/');
    // Long names are cut so the fixed columns to their left stay aligned.
    assert.strictEqual(names[2].length, 44);
    assert.strictEqual(names[3], 'hero.jpg');
  });

  it('sorts by start time so the shape is readable', () => {
    const order = buildWaterfall(
      records({
        1: { url: '/c.js', start: 3, end: 4 },
        2: { url: '/a.css', start: 1, end: 4 },
        3: { url: '/b.woff2', start: 2, end: 4 },
      }),
      0,
    ).map((entry) => entry.name);

    assert.deepStrictEqual(order, ['a.css', 'b.woff2', 'c.js']);
  });

  it('keeps failed requests instead of dropping them', () => {
    // A dropped failure reads as "never requested", which is the opposite
    // conclusion from "requested and failed".
    const [entry] = buildWaterfall(
      records({ 1: { url: '/gone.woff2', start: 1, end: 2, failed: true } }),
      0,
    );

    assert.strictEqual(entry.failed, true);
    assert.match(formatWaterfall([entry]), /FAIL/);
  });

  it('keeps a request that never finished, with no end time', () => {
    const [entry] = buildWaterfall(
      records({ 1: { url: '/slow.js', start: 1 } }),
      0,
    );

    assert.strictEqual(entry.end, null);
    assert.match(formatWaterfall([entry]), /\.\.\./);
  });

  it('skips records that never started, and survives a missing t0', () => {
    assert.deepStrictEqual(
      buildWaterfall(records({ 1: { url: '/orphan.js', end: 5 } }), 0),
      [],
    );
    assert.deepStrictEqual(
      buildWaterfall(records({ 1: { start: 1 } }), undefined),
      [],
    );
  });
});

describe('formatWaterfall', () => {
  it('returns empty string for nothing to show', () => {
    assert.strictEqual(formatWaterfall([]), '');
    assert.strictEqual(formatWaterfall(undefined), '');
  });

  it('emits a header and one aligned line per entry', () => {
    const lines = formatWaterfall(
      buildWaterfall(
        records({
          1: {
            url: '/a.css',
            type: 'Stylesheet',
            start: 0,
            end: 1,
            encodedDataLength: 24141,
          },
          2: {
            url: '/b.js',
            type: 'Script',
            start: 0,
            end: 2,
            encodedDataLength: 49134,
          },
        }),
        0,
      ),
    ).split('\n');

    assert.match(lines[0], /start\s+end\s+kb\s+type\s+resource/);
    assert.strictEqual(lines.length, 3);
    assert.match(lines[1], /a\.css$/);
    assert.match(lines[2], /b\.js$/);
  });
});
