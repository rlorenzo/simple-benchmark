# Website Performance Benchmark

This script is a simple tool to benchmark website performance. It measures page
load time and page size for a list of URLs.

## How to Use

1. **Create a `links.txt` file:**

    Create a file named `links.txt` in the root of the project. This file
    should contain a list of URLs to benchmark, with one URL per line. Each
    line should be in the format `Page Name,URL`.

    For example:

    ```text
    Homepage,https://www.example.com
    About Us,https://www.example.com/about
    ```

    If you don't create a `links.txt` file, the script will use the sample
    `links.txt.dist` file as a fallback.

2. **Install dependencies:**

    ```bash
    npm install
    ```

3. **Run the benchmark:**

    ```bash
    node benchmark.js
    ```

    The script will run the benchmark and generate an HTML report with the
    results. The report will be saved in a file named
    `results-<timestamp>.html`.

## For Contributors

If you want to contribute to the project, you can set up the pre-commit hooks to
automatically run the linters before each commit. This is an optional step, but
recommended to ensure code quality.

```bash
npm run prepare
```
