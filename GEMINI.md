# Gemini Project Context

This document provides context for the Gemini agent to understand and work with this project.

## Project Overview

This project is a website performance benchmarking tool. It uses Playwright to automate the process of visiting a list of web pages, measuring performance metrics like page load time and page size for each. The script runs these benchmarks multiple times for each URL to provide an average and standard deviation, giving a more stable and informative result. The final output is a self-contained HTML report.

## Key Technologies

-   **Runtime:** Node.js
-   **Core Logic:** JavaScript (ESM)
-   **Browser Automation:** Playwright (using Chromium)
-   **File System Operations:** `fs-extra`
-   **Linting:** ESLint for JavaScript, `markdownlint-cli` for Markdown.
-   **Code Formatting:** Prettier
-   **Git Hooks:** Husky
-   **Testing:** Mocha

## File Structure

```
/
├── .github/workflows/lint.yml  # GitHub Action for running linters.
├── .husky/pre-commit           # Pre-commit hook to run linters.
├── test/                       # Directory for test files.
│   └── calculateRunStats.test.js # Unit tests for the stats calculation.
├── benchmark.js                # The main script that runs the benchmark.
├── links.txt.dist              # A sample file with a list of URLs to benchmark.
├── links.txt                   # A user-created file with the list of URLs to benchmark (ignored by git).
├── package.json                # Project metadata and dependencies.
├── package-lock.json           # Exact versions of dependencies.
├── README.md                   # Instructions for users.
├── .gitignore                  # Files and directories to be ignored by git.
├── eslint.config.js            # ESLint configuration.
├── .prettierrc.json            # Prettier configuration.
└── results-*.html              # The output HTML reports (ignored by git).
```

## Development Workflow

-   **Install Dependencies:** `npm install`
-   **Run the Benchmark:** `node benchmark.js`
-   **Run Tests:** `npm test`

## Linting

The project uses ESLint and Prettier for code quality and consistency, and `markdownlint-cli` for Markdown files. Linters are configured to run automatically as a pre-commit hook using Husky.

-   **Run Linters:** `npx eslint . && npx markdownlint-cli *.md`
-   **Fix Linting Issues:** `npx eslint . --fix && npx markdownlint-cli *.md --fix`

## Configuration

The list of URLs to benchmark is managed through `links.txt`. Users should create this file by copying `links.txt.dist` and adding their desired URLs. The format is `Page Name,URL`, with one entry per line. If `links.txt` is not found, the script will fall back to using `links.txt.dist`.
