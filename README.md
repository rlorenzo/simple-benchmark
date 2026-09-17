# Website Performance Benchmark

This script is a simple tool to benchmark website performance. It measures Core
Web Vitals (LCP, FCP, CLS, TTFB), page load time and asset sizes for a list of
URLs, under a throttled mobile connection by default.

## Why it throttles by default

An unthrottled run on a developer's connection makes a bandwidth-bound site look
healthy. The same page measured both ways:

| | Unthrottled | Mobile 4G profile |
| --- | --- | --- |
| Reported load time | 674 ms | 2493 ms |
| LCP | not measured | **2127 ms** |
| Page size | 851 KB | **360 KB** |

The first column says the site is fast. The second shows an LCP close to
Google's 2.5 s threshold, on a page whose real weight over the wire is 360 KB —
the 851 KB figure was the *decoded* size, which roughly doubles the apparent
weight of a gzipped site.

Load time is also the wrong headline metric: it was never what users perceive,
and optimising it leads to different work than optimising LCP.

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

    Each URL is loaded once as a discarded warm-up, then `NUM_RUNS` times for
    the recorded average. The warm-up exists because the first hit on a page is
    routinely a second or more slower — a cold CDN edge, an empty page cache, a
    just-restarted PHP worker — and that outlier would otherwise dominate a
    three-run mean.

## Throttling profiles

| Profile | What it emulates |
| --- | --- |
| `mobile-4g` *(default)* | Pixel 7, 1.6 Mbps, 150 ms RTT, 4x CPU |
| `desktop` | Cable: 10 Mbps, 40 ms RTT, no CPU slowdown |
| `unthrottled` | This machine, this connection |

`mobile-4g` matches the conditions PageSpeed Insights scores against. `desktop`
matches Lighthouse's desktop preset.

`desktop` is throttled on purpose. An *unthrottled* run measures whoever happens
to be running it, so its numbers cannot be compared between people or across
time; `unthrottled` is still there for a quick local look and is labelled in the
report as not reproducible.

```bash
BENCHMARK_PROFILE=desktop node benchmark.js
BENCHMARK_PROFILE=mobile-4g,desktop node benchmark.js   # both, one report
```

## Run both, and read the gap

A single profile gives you a number. Two give you a diagnosis, because what the
difference between them looks like tells you where the problem is:

| Symptom | Where to look |
| --- | --- |
| Slow on mobile, fine on desktop | Page weight / bandwidth |
| Slow TTFB on both | Server-side |
| Slow LCP on both, TTFB fine | Render-blocking, or a late-found LCP element |

A real example — the same site on both profiles:

| | Mobile 4G | Desktop cable |
| --- | --- | --- |
| LCP | **2672 ms** | 349 ms |
| TTFB | 94 ms | 96 ms |

LCP differs by 7.6x while TTFB is identical. The server is not the problem; the
bytes are. Neither profile on its own says that: mobile alone cannot rule out
the backend, and desktop alone reports a healthy site.

The report puts each profile in its own table, since numbers from different
profiles are not comparable.

## What the report shows

- **LCP** — colour-coded against Google's thresholds (good under 2.5 s, poor
  over 4 s) and annotated with the element that was the LCP candidate, which is
  usually the thing to fix.
- **FCP**, **CLS**, **TTFB**
- **Load time** — kept for continuity, but read LCP first.
- **Page size** — transfer (compressed, what crosses the wire) with the decoded
  size shown beneath it. A large gap between the two means compression is
  working.
- **CSS / JS size** — transfer bytes.

## Caveats

- Lab measurements on your own connection, not field data. Use them to compare a
  before and an after, not as an absolute score.
- If the site sits behind a page cache, flush it before measuring a deploy. A
  cached page can serve pre-deploy HTML for minutes and a real improvement will
  read as no change at all.

## For Contributors

If you want to contribute to the project, you can set up the pre-commit hooks to
automatically run the linters before each commit. This is an optional step, but
recommended to ensure code quality.

```bash
npm run prepare
```
