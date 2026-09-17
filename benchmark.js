const { chromium, devices } = require('playwright');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');

const NUM_RUNS = 3;
const BYTES_PER_KB = 1024;

/**
 * How long to keep observing after load before reading the metrics.
 *
 * LCP is not final at load: the browser keeps promoting larger candidates until
 * the first interaction. Reading it immediately reports whichever element
 * happened to paint first, which on an image-led page is usually a heading
 * rather than the hero. CLS accumulates over the same window.
 *
 * Overridable per call via profile.settleMs, or globally with BENCHMARK_SETTLE_MS
 * - a trivial local page settles far sooner than a real site and does not need
 * the full wait.
 */
// Read per call, not at require time: a test that sets the env var after
// importing this module would otherwise still get the 4000 ms default.
const settleMs = () => Number(process.env.BENCHMARK_SETTLE_MS) || 4000;

/**
 * Throttling profiles.
 *
 * `mobile-4g` mirrors the conditions PageSpeed Insights scores against, and is
 * the default because it is the one that surfaces problems. An unthrottled run
 * on a developer's connection makes a bandwidth-bound page look healthy: a site
 * measured at 674 ms unthrottled had a real LCP of 2648 ms on this profile.
 *
 * `desktop` is throttled too, to Lighthouse's desktop preset. A desktop run is
 * worth having, but an *unthrottled* one measures whoever happens to be running
 * it - their connection, their machine, that moment - so its numbers cannot be
 * compared between people or across time. `unthrottled` still exists for a
 * quick local look, and is labelled in the report as not reproducible.
 *
 * Running both profiles is what makes a result diagnostic rather than just a
 * number. The gap between them says what kind of problem it is:
 *
 *   slow on mobile, fine on desktop   -> page weight / bandwidth
 *   slow TTFB on both                 -> server-side
 *   slow LCP on both, TTFB fine       -> render-blocking, or a late-discovered
 *                                        LCP element
 *
 * Select with BENCHMARK_PROFILE, comma-separated for several:
 *   BENCHMARK_PROFILE=mobile-4g,desktop node benchmark.js
 */
const PROFILES = {
  'mobile-4g': {
    label: 'Mobile 4G (Pixel 7, 1.6 Mbps, 150 ms RTT, 4x CPU)',
    device: 'Pixel 7',
    latency: 150,
    downloadThroughput: (1638.4 * 1000) / 8,
    uploadThroughput: (750 * 1000) / 8,
    cpuSlowdown: 4,
  },
  desktop: {
    label: 'Desktop cable (10 Mbps, 40 ms RTT, no CPU slowdown)',
    device: null,
    latency: 40,
    downloadThroughput: (10240 * 1000) / 8,
    uploadThroughput: (10240 * 1000) / 8,
    cpuSlowdown: 1,
  },
  unthrottled: {
    label: 'Unthrottled (this machine, this connection - not reproducible)',
    device: null,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
    cpuSlowdown: 1,
  },
};

const DEFAULT_PROFILE = 'mobile-4g';

/**
 * Resolves the throttling profile to use.
 * @param {string} [name] Profile name; falls back to BENCHMARK_PROFILE, then the default.
 * @returns {object} The resolved profile.
 * @throws {Error} If the named profile does not exist.
 */
function getProfile(name) {
  const key = name || process.env.BENCHMARK_PROFILE || DEFAULT_PROFILE;
  const profile = PROFILES[key];
  if (!profile) {
    throw new Error(
      `Unknown profile '${key}'. Available: ${Object.keys(PROFILES).join(', ')}`,
    );
  }
  return { name: key, ...profile };
}

/**
 * Resolves one or more profiles to run.
 *
 * Accepts a comma-separated list so a single run can produce both a mobile and
 * a desktop view, which is what makes the result diagnostic - see PROFILES.
 *
 * @param {string} [names] Comma-separated profile names; falls back to BENCHMARK_PROFILE, then the default.
 * @returns {Array<object>} The resolved profiles, in the order given, without duplicates.
 * @throws {Error} If any named profile does not exist.
 */
function getProfiles(names) {
  const raw = names || process.env.BENCHMARK_PROFILE || DEFAULT_PROFILE;
  const keys = raw
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    return [getProfile(DEFAULT_PROFILE)];
  }

  return [...new Set(keys)].map((key) => getProfile(key));
}

/**
 * Reads the list of URLs to benchmark from a file.
 * @param {string} directory - The directory containing links.txt
 * @returns {Promise<Array<{name: string, url: string}>>} A promise that resolves to an array of URL objects.
 * @throws {Error} If links.txt does not exist, cannot be read, or contains invalid data.
 */
async function getUrls(directory = __dirname) {
  const linksPath = path.join(directory, 'links.txt');

  if (!existsSync(linksPath)) {
    throw new Error(
      `links.txt not found at ${linksPath}. Please create this file with your benchmark URLs.`,
    );
  }

  const linksFile = await fs.readFile(linksPath, 'utf-8');
  return linksFile
    .split('\n')
    .map((line) => {
      const [name, url] = line.split(',');
      return { name, url };
    })
    .filter((item) => item.name && item.url);
}

/**
 * Measures the load time and page size of a given URL.
 * @param {import('playwright').Page} page The Playwright page object.
 * @param {string} url The URL to measure.
 * @param {object} [profile] Throttling profile from getProfile(); unthrottled if omitted.
 * @returns {Promise<object>} Page load time, Core Web Vitals, and asset sizes.
 */
async function measurePage(page, url, profile) {
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');

  // Keyed on the individual settings rather than on the profile object, so a
  // caller can pass only settleMs without CDP being handed undefined values.
  if (profile?.downloadThroughput !== undefined) {
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latency ?? 0,
      downloadThroughput: profile.downloadThroughput,
      uploadThroughput: profile.uploadThroughput ?? -1,
    });
  }

  if (profile?.cpuSlowdown !== undefined) {
    await client.send('Emulation.setCPUThrottlingRate', {
      rate: profile.cpuSlowdown,
    });
  }

  // Transfer size is the compressed bytes on the wire; decoded size is what the
  // browser expands them to. Reporting only the latter roughly doubles the
  // apparent weight of a gzipped site and makes any compression change
  // invisible, so both are tracked.
  let transferSize = 0;
  let decodedSize = 0;
  let cssSize = 0;
  let jsSize = 0;
  const responseMap = new Map();

  client.on('Network.responseReceived', (event) => {
    responseMap.set(event.requestId, event.response);
  });

  client.on('Network.dataReceived', (event) => {
    decodedSize += event.dataLength;
    transferSize += event.encodedDataLength;

    const response = responseMap.get(event.requestId);
    if (response) {
      const responseUrl = response.url;
      const mimeType = response.mimeType || '';

      if (mimeType.includes('text/css') || responseUrl.endsWith('.css')) {
        cssSize += event.encodedDataLength;
      } else if (
        mimeType.includes('javascript') ||
        responseUrl.endsWith('.js')
      ) {
        jsSize += event.encodedDataLength;
      }
    }
  });

  // Observers must exist before navigation or the buffered entries are missed.
  await page.addInitScript(() => {
    window.__vitals = { lcp: 0, lcpUrl: '', cls: 0 };
    try {
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        window.__vitals.lcp = last.startTime;
        window.__vitals.lcpUrl = last.url || last.element?.tagName || '';
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__vitals.cls += entry.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Not every browser exposes both entry types; the rest still reports.
    }
  });

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(profile?.settleMs ?? settleMs());

  const timing = await page.evaluate(() => {
    const navTiming = window.performance.getEntriesByType('navigation')[0];
    const fcp = window.performance.getEntriesByName(
      'first-contentful-paint',
    )[0];
    return {
      load: navTiming.loadEventEnd - navTiming.startTime,
      ttfb: navTiming.responseStart - navTiming.startTime,
      fcp: fcp ? fcp.startTime : 0,
      lcp: window.__vitals.lcp,
      lcpUrl: window.__vitals.lcpUrl,
      cls: window.__vitals.cls,
    };
  });

  return {
    pageLoadTime: timing.load,
    ttfb: timing.ttfb,
    fcp: timing.fcp,
    lcp: timing.lcp,
    lcpUrl: timing.lcpUrl,
    cls: timing.cls,
    pageSize: transferSize / BYTES_PER_KB,
    decodedSize: decodedSize / BYTES_PER_KB,
    cssSize: cssSize / BYTES_PER_KB,
    jsSize: jsSize / BYTES_PER_KB,
  };
}

/**
 * Benchmarks a single URL by loading it multiple times and collecting performance metrics.
 * @param {import('playwright').Browser} browser The Playwright browser instance.
 * @param {string} name The name of the page being benchmarked.
 * @param {string} url The URL to benchmark.
 * @returns {Promise<object>} A promise that resolves to an object containing the benchmark results for the URL.
 */
async function benchmarkUrl(browser, name, url, profile) {
  console.log(`Benchmarking: ${name} (${url})...`);

  const samples = {
    pageLoadTime: [],
    ttfb: [],
    fcp: [],
    lcp: [],
    cls: [],
    pageSize: [],
    decodedSize: [],
    cssSize: [],
    jsSize: [],
  };
  let lcpUrl = '';

  const contextOptions = profile?.device ? { ...devices[profile.device] } : {};

  // One discarded warm-up. The first hit on a page is routinely a second or
  // more slower than the rest - a cold CDN edge, an empty page cache, a
  // just-restarted PHP worker - and averaging that in makes a run look worse
  // than the site is. Discarding it costs one load and removes the outlier
  // that would otherwise dominate a three-run mean.
  const totalRuns = NUM_RUNS + 1;

  for (let i = 1; i <= totalRuns; i++) {
    const isWarmup = i === 1;
    console.log(
      isWarmup ? '  Warm-up run (discarded)' : `  Run ${i - 1}/${NUM_RUNS}`,
    );

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    try {
      const result = await measurePage(page, url, profile);
      if (!isWarmup) {
        for (const key of Object.keys(samples)) {
          samples[key].push(result[key]);
        }
        lcpUrl = result.lcpUrl || lcpUrl;
      }
    } catch (error) {
      console.error(`  Error during run ${i} for ${name} (${url}):`, error);
    } finally {
      await context.close();
    }
  }

  return { ...calculateStats(samples), lcpUrl };
}

/**
 * Calculates the average and standard deviation for a set of data.
 * @param {Array<number>} data The data to calculate the statistics for.
 * @returns {{avg: string, stdDev: string}} An object containing the average and standard deviation.
 */
function calculateRunStats(data) {
  const n = data.length;
  if (n === 0) return { avg: 'N/A', stdDev: 'N/A' };

  const mean = data.reduce((a, b) => a + b, 0) / n;
  const variance =
    data.map((x) => (x - mean) ** 2).reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(variance);

  return {
    avg: mean.toFixed(2),
    stdDev: stdDev.toFixed(2),
  };
}

/**
 * Calculates avg/stdDev for every collected metric.
 *
 * Accepts either the samples object keyed by metric name, or the original
 * positional arrays, so existing callers and tests keep working.
 *
 * @param {object|Array<number>} samples Samples keyed by metric, or an array of load times.
 * @param {Array<number>} [pageSizes] Page sizes, when called positionally.
 * @param {Array<number>} [cssSizes] CSS sizes, when called positionally.
 * @param {Array<number>} [jsSizes] JS sizes, when called positionally.
 * @returns {object} Statistics keyed as avg<Metric> / stdDev<Metric>.
 */
function calculateStats(samples, pageSizes, cssSizes, jsSizes) {
  const collected = Array.isArray(samples)
    ? {
        pageLoadTime: samples,
        pageSize: pageSizes || [],
        cssSize: cssSizes || [],
        jsSize: jsSizes || [],
      }
    : samples;

  const stats = {};
  for (const [metric, values] of Object.entries(collected)) {
    const { avg, stdDev } = calculateRunStats(values);
    const capitalised = metric.charAt(0).toUpperCase() + metric.slice(1);
    stats[`avg${capitalised}`] = avg;
    stats[`stdDev${capitalised}`] = stdDev;
  }

  // Preserved for callers that predate the keyed metrics.
  stats.avgLoadTime = stats.avgPageLoadTime;
  stats.stdDevLoadTime = stats.stdDevPageLoadTime;

  return stats;
}

/**
 * Generates an HTML report from the benchmark results.
 * @param {Array<object>} results An array of benchmark result objects.
 * @returns {string} The HTML content of the report.
 */
function generateHtmlReport(runsOrResults, profile) {
  // Accepts either the grouped form, [{ profile, results }], or the original
  // (results, profile) pair, so existing callers keep working.
  const runs =
    Array.isArray(runsOrResults) && runsOrResults[0]?.results
      ? runsOrResults
      : [{ profile, results: runsOrResults || [] }];

  // LCP thresholds are Google's: good under 2.5s, poor over 4s.
  const lcpClass = (ms) => {
    const value = Number(ms);
    if (!Number.isFinite(value) || value === 0) return '';
    if (value <= 2500) return 'good';
    if (value <= 4000) return 'needs-work';
    return 'poor';
  };

  const renderRows = (results) =>
    results
      .map(
        (result) => `
        <tr>
            <td><a href="${result.url}" target="_blank">${result.name}</a></td>
            <td class="${lcpClass(result.avgLcp)}">${result.avgLcp} ms &plusmn; ${result.stdDevLcp}${
              result.lcpUrl
                ? `<br><span class="hint">${result.lcpUrl}</span>`
                : ''
            }</td>
            <td>${result.avgFcp} ms &plusmn; ${result.stdDevFcp}</td>
            <td>${result.avgCls}</td>
            <td>${result.avgTtfb} ms &plusmn; ${result.stdDevTtfb}</td>
            <td>${result.avgLoadTime} ms &plusmn; ${result.stdDevLoadTime}</td>
            <td>${result.avgPageSize} KB &plusmn; ${result.stdDevPageSize}<br><span class="hint">${result.avgDecodedSize} KB decoded</span></td>
            <td>${result.avgCssSize} KB &plusmn; ${result.stdDevCssSize}</td>
            <td>${result.avgJsSize} KB &plusmn; ${result.stdDevJsSize}</td>
        </tr>
    `,
      )
      .join('');

  const sections = runs
    .map(
      ({ profile: runProfile, results }) => `
            <h2>${runProfile ? runProfile.label : 'Unthrottled'}</h2>
            <table>
                <thead>
                    <tr>
                        <th>Page</th>
                        <th>LCP (avg &plusmn; std dev)</th>
                        <th>FCP (avg &plusmn; std dev)</th>
                        <th>CLS</th>
                        <th>TTFB (avg &plusmn; std dev)</th>
                        <th>Load Time (avg &plusmn; std dev)</th>
                        <th>Page Size (avg &plusmn; std dev)</th>
                        <th>CSS Size (avg &plusmn; std dev)</th>
                        <th>JS Size (avg &plusmn; std dev)</th>
                    </tr>
                </thead>
                <tbody>
                    ${renderRows(results)}
                </tbody>
            </table>`,
    )
    .join('');

  // Only worth saying when there is actually a gap to read.
  const comparisonNote = `
            <div class="note">
                <strong>Reading the gap.</strong> Slow on mobile but fine on desktop points at
                page weight or bandwidth. A slow TTFB on both points at the server. A slow LCP on
                both with a healthy TTFB points at render-blocking resources, or an LCP element
                the browser discovers late.
            </div>`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Website Performance Benchmark</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background-color: #f4f4f4; color: #333; }
            .container { max-width: 900px; margin: auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #0056b3; text-align: center; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 12px 15px; border: 1px solid #ddd; text-align: left; }
            th { background-color: #0056b3; color: white; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            tr:hover { background-color: #f1f1f1; }
            a { color: #0056b3; text-decoration: none; }
            a:hover { text-decoration: underline; }
            .footer { text-align: center; margin-top: 40px; font-size: 0.9em; color: #777; }
            .profile { text-align: center; color: #555; margin-bottom: 20px; }
            .hint { font-size: 0.8em; color: #777; }
            h2 { color: #0056b3; font-size: 1.1em; margin-top: 35px; }
            .note { margin-top: 30px; padding: 15px; background: #f0f6ff; border-left: 4px solid #0056b3; font-size: 0.9em; }
            td.good { background-color: #e6f4ea; }
            td.needs-work { background-color: #fef7e0; }
            td.poor { background-color: #fce8e6; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Website Performance Benchmark Results</h1>
            <p class="profile">${NUM_RUNS} runs per page, after one discarded warm-up</p>
            ${sections}
            ${runs.length > 1 ? comparisonNote : ''}
            <div class="footer">
                Benchmark conducted on: ${new Date().toLocaleString()}
            </div>
        </div>
    </body>
    </html>
`;
}

/**
 * The main function that orchestrates the benchmark.
 */
async function main(directory = __dirname) {
  console.log('Starting benchmark...');
  const urls = await getUrls(directory);
  if (urls.length === 0) {
    console.log('No URLs to benchmark. Exiting.');
    return;
  }

  const profiles = getProfiles();
  const browser = await chromium.launch();
  const runs = [];

  for (const profile of profiles) {
    console.log(`\nProfile: ${profile.label}`);
    const results = [];
    for (const { name, url } of urls) {
      const result = await benchmarkUrl(browser, name, url, profile);
      results.push({ name, url, ...result });
    }
    runs.push({ profile, results });
  }

  await browser.close();

  console.log('Benchmark complete. Generating report...');
  const htmlReport = generateHtmlReport(runs);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(directory, `results-${timestamp}.html`);

  try {
    await fs.writeFile(reportPath, htmlReport);
    console.log(`Report saved to ${reportPath}`);
    console.log('To view the report, open the HTML file in your browser.');
  } catch (error) {
    console.error(`Error writing report to ${reportPath}:`, error);
  }
}

if (require.main === module) {
  main(__dirname).catch((error) => {
    console.error('An unexpected error occurred:', error);
    process.exit(1);
  });
}

module.exports = {
  getUrls,
  getProfile,
  getProfiles,
  PROFILES,
  measurePage,
  benchmarkUrl,
  calculateRunStats,
  calculateStats,
  generateHtmlReport,
  main,
};
