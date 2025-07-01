const assert = require('assert');
const { calculateRunStats } = require('../benchmark.js');

describe('calculateRunStats', () => {
  it('should return N/A for empty data', () => {
    const { avg, stdDev } = calculateRunStats([]);
    assert.strictEqual(avg, 'N/A');
    assert.strictEqual(stdDev, 'N/A');
  });

  it('should calculate the average and standard deviation correctly', () => {
    const data = [10, 20, 30, 40, 50];
    const { avg, stdDev } = calculateRunStats(data);
    assert.strictEqual(avg, '30.00');
    assert.strictEqual(stdDev, '14.14');
  });
});
