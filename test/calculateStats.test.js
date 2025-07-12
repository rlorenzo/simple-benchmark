const assert = require('assert');
const { calculateStats } = require('../benchmark.js');

describe('calculateStats', () => {
  it('should calculate statistics for all metrics including CSS and JS sizes', () => {
    const loadTimes = [100, 200, 300];
    const pageSizes = [10, 20, 30];
    const cssSizes = [1, 2, 3];
    const jsSizes = [5, 10, 15];

    const result = calculateStats(loadTimes, pageSizes, cssSizes, jsSizes);

    // Verify all expected properties exist
    assert.ok(result.avgLoadTime);
    assert.ok(result.stdDevLoadTime);
    assert.ok(result.avgPageSize);
    assert.ok(result.stdDevPageSize);
    assert.ok(result.avgCssSize);
    assert.ok(result.stdDevCssSize);
    assert.ok(result.avgJsSize);
    assert.ok(result.stdDevJsSize);

    // Verify calculated values
    assert.strictEqual(result.avgLoadTime, '200.00');
    assert.strictEqual(result.stdDevLoadTime, '81.65');
    assert.strictEqual(result.avgPageSize, '20.00');
    assert.strictEqual(result.stdDevPageSize, '8.16');
    assert.strictEqual(result.avgCssSize, '2.00');
    assert.strictEqual(result.stdDevCssSize, '0.82');
    assert.strictEqual(result.avgJsSize, '10.00');
    assert.strictEqual(result.stdDevJsSize, '4.08');
  });

  it('should handle empty arrays for CSS and JS sizes', () => {
    const loadTimes = [100, 200];
    const pageSizes = [10, 20];
    const cssSizes = [];
    const jsSizes = [];

    const result = calculateStats(loadTimes, pageSizes, cssSizes, jsSizes);

    assert.strictEqual(result.avgCssSize, 'N/A');
    assert.strictEqual(result.stdDevCssSize, 'N/A');
    assert.strictEqual(result.avgJsSize, 'N/A');
    assert.strictEqual(result.stdDevJsSize, 'N/A');
  });

  it('should handle zero values for CSS and JS sizes', () => {
    const loadTimes = [100, 200];
    const pageSizes = [10, 20];
    const cssSizes = [0, 0];
    const jsSizes = [0, 0];

    const result = calculateStats(loadTimes, pageSizes, cssSizes, jsSizes);

    assert.strictEqual(result.avgCssSize, '0.00');
    assert.strictEqual(result.stdDevCssSize, '0.00');
    assert.strictEqual(result.avgJsSize, '0.00');
    assert.strictEqual(result.stdDevJsSize, '0.00');
  });
});
