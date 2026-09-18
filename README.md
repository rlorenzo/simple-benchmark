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

## The per-resource waterfall

Every run records a waterfall: each request's start, end, transferred bytes and
resource type, in start order. It is in the HTML report under each page, behind
a collapsed **Waterfall** row. To print it to stdout as well:

```bash
BENCHMARK_WATERFALL=1 node benchmark.js
```

It is off by default because a run is URLs x profiles, and a full waterfall for
each would bury the summary table it exists to explain.

### What it is for

The summary metrics say a page is slow. The waterfall says *which kind* of slow,
and that changes what you do about it:

```text
    start    end     kb  type          resource
        0    281     12  Document      https://example.com/
      248   2214     83  Image         hero-1280x0.jpg
      252   1138     24  Stylesheet    style.css
      276   1761     24  Font          Reckless-Regular.woff2
      332   2391     42  Script        swiper.bundle.js
```

Everything starts within ~90 ms of everything else and they all finish together.
That flat block is the signature of a **shared pipe with no prioritisation** —
HTTP/1.1, which caps at ~6 connections per origin and has no stream priority. A
`fetchpriority="high"` hint on that hero has no mechanism to act through, so the
LCP image finishes last despite being the one thing that matters.

A staircase means the opposite: priority is being honoured, and the fix is to
remove bytes rather than to change transport.

Neither shape is visible in LCP alone.

### Why the timings come from CDP

`PerformanceResourceTiming.transferSize` reads **0** for cross-origin responses
that lack a `Timing-Allow-Origin` header. A page pulling fonts or scripts from a
CDN would silently under-report exactly the resources competing with its LCP
element. CDP reports the real encoded bytes regardless of origin, so the
waterfall and the page-weight totals agree.

A request that fails, or is still in flight when the settle window closes, is
kept and marked `FAIL` or `...` rather than dropped — an absent row reads as
"never requested", which is the opposite conclusion from "requested and failed".

Each hop of a redirect chain gets its own row for the same reason. A hop shares
its request id with the response that follows it, so folding the two together
would hide the hop and charge its round trip to the destination — which then
reads as a slow response rather than the extra redirect it actually is.

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
