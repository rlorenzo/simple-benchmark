const assert = require('assert');
const { generateHtmlReport } = require('../benchmark.js');

describe('generateHtmlReport', () => {
  it('should include CSS and JS size columns in the HTML report', () => {
    const mockResults = [
      {
        name: 'Test Page',
        url: 'http://example.com',
        avgLoadTime: '250.00',
        stdDevLoadTime: '10.00',
        avgPageSize: '150.00',
        stdDevPageSize: '5.00',
        avgCssSize: '25.00',
        stdDevCssSize: '2.00',
        avgJsSize: '75.00',
        stdDevJsSize: '8.00',
      },
    ];

    const htmlReport = generateHtmlReport(mockResults);

    // Check that the report contains the CSS and JS size headers
    assert.ok(
      htmlReport.includes('CSS Size (avg &plusmn; std dev)'),
      'Report should contain CSS size column header',
    );
    assert.ok(
      htmlReport.includes('JS Size (avg &plusmn; std dev)'),
      'Report should contain JS size column header',
    );

    // Check that the report contains the actual CSS and JS size data
    assert.ok(
      htmlReport.includes('25.00 KB &plusmn; 2.00'),
      'Report should contain CSS size data',
    );
    assert.ok(
      htmlReport.includes('75.00 KB &plusmn; 8.00'),
      'Report should contain JS size data',
    );

    // Verify the table structure includes all expected columns
    const thCount = (htmlReport.match(/<th>/g) || []).length;
    assert.strictEqual(
      thCount,
      9,
      'Report should have 9 table headers (Page, LCP, FCP, CLS, TTFB, Load Time, Page Size, CSS Size, JS Size)',
    );
  });

  it('should handle N/A values for CSS and JS sizes', () => {
    const mockResults = [
      {
        name: 'Test Page',
        url: 'http://example.com',
        avgLoadTime: '250.00',
        stdDevLoadTime: '10.00',
        avgPageSize: '150.00',
        stdDevPageSize: '5.00',
        avgCssSize: 'N/A',
        stdDevCssSize: 'N/A',
        avgJsSize: 'N/A',
        stdDevJsSize: 'N/A',
      },
    ];

    const htmlReport = generateHtmlReport(mockResults);

    // Check that N/A values are properly displayed
    assert.ok(
      htmlReport.includes('N/A KB &plusmn; N/A'),
      'Report should handle N/A values correctly',
    );
  });
});

describe('generateHtmlReport - Core Web Vitals', () => {
  const result = (overrides) => ({
    name: 'Test Page',
    url: 'http://example.com',
    avgLoadTime: '250.00',
    stdDevLoadTime: '10.00',
    avgLcp: '1800.00',
    stdDevLcp: '50.00',
    avgFcp: '600.00',
    stdDevFcp: '20.00',
    avgCls: '0.0100',
    avgTtfb: '120.00',
    stdDevTtfb: '5.00',
    avgPageSize: '150.00',
    stdDevPageSize: '5.00',
    avgDecodedSize: '400.00',
    avgCssSize: '25.00',
    stdDevCssSize: '2.00',
    avgJsSize: '75.00',
    stdDevJsSize: '8.00',
    ...overrides,
  });

  it('should render the vitals columns and their data', () => {
    const html = generateHtmlReport([result()]);

    for (const header of ['LCP', 'FCP', 'CLS', 'TTFB']) {
      assert.ok(
        html.includes(`<th>${header}`),
        `Report should contain the ${header} column header`,
      );
    }
    assert.ok(
      html.includes('1800.00 ms &plusmn; 50.00'),
      'Report should contain LCP data',
    );
    assert.ok(html.includes('0.0100'), 'Report should contain CLS data');
  });

  it('should show decoded size alongside transfer size', () => {
    // Reporting only decoded size roughly doubles the apparent weight of a
    // gzipped site, so both have to be visible to tell them apart.
    const html = generateHtmlReport([result()]);
    assert.ok(
      html.includes('150.00 KB &plusmn; 5.00'),
      'Report should contain transfer size',
    );
    assert.ok(
      html.includes('400.00 KB decoded'),
      'Report should label the decoded size separately',
    );
  });

  it('should flag LCP against Google thresholds', () => {
    assert.ok(
      generateHtmlReport([result({ avgLcp: '1800.00' })]).includes(
        'td class="good"',
      ),
      'LCP under 2.5s should be marked good',
    );
    assert.ok(
      generateHtmlReport([result({ avgLcp: '3000.00' })]).includes(
        'td class="needs-work"',
      ),
      'LCP between 2.5s and 4s should be marked as needing work',
    );
    assert.ok(
      generateHtmlReport([result({ avgLcp: '5000.00' })]).includes(
        'td class="poor"',
      ),
      'LCP over 4s should be marked poor',
    );
  });

  it('should name the profile the numbers were measured under', () => {
    const html = generateHtmlReport([result()], {
      label: 'Mobile 4G (Pixel 7, 1.6 Mbps, 150 ms RTT, 4x CPU)',
    });
    assert.ok(
      html.includes('Mobile 4G (Pixel 7, 1.6 Mbps, 150 ms RTT, 4x CPU)'),
      'Report should state the throttling profile',
    );
  });
});
