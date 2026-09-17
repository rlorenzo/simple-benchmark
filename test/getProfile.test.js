const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const { getProfile, PROFILES } = require('../benchmark.js');

describe('getProfile', () => {
  const original = process.env.BENCHMARK_PROFILE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.BENCHMARK_PROFILE;
    } else {
      process.env.BENCHMARK_PROFILE = original;
    }
  });

  it('should default to the throttled mobile profile', () => {
    delete process.env.BENCHMARK_PROFILE;
    const profile = getProfile();

    // The default has to be throttled. Unthrottled is the setting that makes a
    // bandwidth-bound site look healthy, so it must never be what you get by
    // accident.
    assert.strictEqual(profile.name, 'mobile-4g');
    assert.ok(profile.cpuSlowdown > 1, 'default profile should throttle CPU');
    assert.ok(
      profile.downloadThroughput > 0,
      'default profile should cap download throughput',
    );
  });

  it('should read the profile from BENCHMARK_PROFILE', () => {
    process.env.BENCHMARK_PROFILE = 'desktop';
    assert.strictEqual(getProfile().name, 'desktop');
  });

  it('should let an explicit argument win over the environment', () => {
    process.env.BENCHMARK_PROFILE = 'desktop';
    assert.strictEqual(getProfile('mobile-4g').name, 'mobile-4g');
  });

  it('should throw a helpful error for an unknown profile', () => {
    assert.throws(
      () => getProfile('nope'),
      (error) =>
        error.message.includes('nope') &&
        Object.keys(PROFILES).every((key) => error.message.includes(key)),
      'Error should name the bad profile and list the valid ones',
    );
  });
});
