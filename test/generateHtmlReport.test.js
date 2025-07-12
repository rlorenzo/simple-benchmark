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
      5,
      'Report should have 5 table headers (Page, Load Time, Page Size, CSS Size, JS Size)',
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
