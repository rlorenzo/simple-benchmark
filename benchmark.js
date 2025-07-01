const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');

const NUM_RUNS = 3;

/**
 * Reads the list of URLs to benchmark from a file.
 * It first tries to read from `links.txt`, and if that doesn't exist, it falls back to `links.txt.dist`.
 * @returns {Promise<Array<{name: string, url: string}>>} A promise that resolves to an array of URL objects.
 */
async function getUrls(directory = __dirname) {
  const linksPath = path.join(directory, 'links.txt');
  const linksDistPath = path.join(directory, 'links.txt.dist');
  let sourcePath = linksPath;

  if (!(await fs.exists(linksPath))) {
    throw new Error(`links.txt not found at ${linksPath}. Please create this file with your benchmark URLs.`);
  }
  // If links.txt exists, always use it.
  sourcePath = linksPath;

  try {
    const linksFile = await fs.readFile(sourcePath, 'utf-8');
    return linksFile
      .split('\n')
      .map((line) => {
        const [name, url] = line.split(',');
        return { name, url };
      })
      .filter((item) => item.name && item.url);
  } catch (error) {
    console.error(`Error reading URLs from ${sourcePath}:`, error);
    return [];
  }
}

/**
 * Measures the load time and page size of a given URL.
 * @param {import('playwright').Page} page The Playwright page object.
 * @param {string} url The URL to measure.
 * @returns {Promise<{pageLoadTime: number, pageSize: number}>} A promise that resolves to an object containing the page load time and page size.
 */
async function measurePage(page, url) {
  let pageLoadTime = 0;
  let pageSize = 0;

  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  let currentRunTotalSize = 0;
  client.on('Network.dataReceived', (event) => {
    currentRunTotalSize += event.dataLength;
  });

  await page.goto(url, { waitUntil: 'networkidle' });

  const timing = await page.evaluate(() => {
    const navTiming = window.performance.getEntriesByType('navigation')[0];
    return {
      load: navTiming.loadEventEnd - navTiming.startTime,
    };
  });

  pageLoadTime = timing.load;
  pageSize = currentRunTotalSize / 1024; // in KB

  return { pageLoadTime, pageSize };
}

/**
 * Benchmarks a single URL by loading it multiple times and collecting performance metrics.
 * @param {import('playwright').Browser} browser The Playwright browser instance.
 * @param {string} name The name of the page being benchmarked.
 * @param {string} url The URL to benchmark.
 * @returns {Promise<object>} A promise that resolves to an object containing the benchmark results for the URL.
 */
async function benchmarkUrl(browser, name, url) {
  console.log(`Benchmarking: ${name} (${url})...`);
  const loadTimes = [];
  const pageSizes = [];

  for (let i = 1; i <= NUM_RUNS; i++) {
    console.log(`  Run ${i}/${NUM_RUNS}`);
    const page = await browser.newPage();
    try {
      const { pageLoadTime, pageSize } = await measurePage(page, url);
      loadTimes.push(pageLoadTime);
      pageSizes.push(pageSize);
    } catch (error) {
      console.error(`  Error during run ${i} for ${name} (${url}):`, error);
    } finally {
      await page.close();
    }
  }

  return calculateStats(loadTimes, pageSizes);
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
    data.map((x) => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / n;
  const stdDev = Math.sqrt(variance);

  return {
    avg: mean.toFixed(2),
    stdDev: stdDev.toFixed(2),
  };
}

/**
 * Calculates the statistics for the load times and page sizes.
 * @param {Array<number>} loadTimes An array of page load times.
 * @param {Array<number>} pageSizes An array of page sizes.
 * @returns {object} An object containing the calculated statistics.
 */
function calculateStats(loadTimes, pageSizes) {
  const loadTimeStats = calculateRunStats(loadTimes);
  const pageSizeStats = calculateRunStats(pageSizes);

  return {
    avgLoadTime: loadTimeStats.avg,
    stdDevLoadTime: loadTimeStats.stdDev,
    avgPageSize: pageSizeStats.avg,
    stdDevPageSize: pageSizeStats.stdDev,
  };
}

/**
 * Generates an HTML report from the benchmark results.
 * @param {Array<object>} results An array of benchmark result objects.
 * @returns {string} The HTML content of the report.
 */
function generateHtmlReport(results) {
  const tableRows = results
    .map(
      (result) => `
        <tr>
            <td><a href="${result.url}" target="_blank">${result.name}</a></td>
            <td>${result.avgLoadTime} ms &plusmn; ${result.stdDevLoadTime}</td>
            <td>${result.avgPageSize} KB &plusmn; ${result.stdDevPageSize}</td>
        </tr>
    `,
    )
    .join('');

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
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Website Performance Benchmark Results</h1>
            <table>
                <thead>
                    <tr>
                        <th>Page</th>
                        <th>Load Time (avg &plusmn; std dev)</th>
                        <th>Page Size (avg &plusmn; std dev)</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
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

  const browser = await chromium.launch();
  const results = [];

  for (const { name, url } of urls) {
    const result = await benchmarkUrl(browser, name, url);
    results.push({ name, url, ...result });
  }

  await browser.close();

  console.log('Benchmark complete. Generating report...');
  const htmlReport = generateHtmlReport(results);
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
  measurePage,
  benchmarkUrl,
  calculateRunStats,
  calculateStats,
  generateHtmlReport,
  main,
};
