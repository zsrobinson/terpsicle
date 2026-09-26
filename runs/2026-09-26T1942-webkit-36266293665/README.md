# Mobile lab: webkit

**Passed**: 0 failed check(s), 2 warning(s), 0 error(s).

- URL: https://pr-73-terpsicle.zsrobinson.workers.dev/schedule
- Device: Playwright webkit 26.6, iPhone 15 viewport (emulated touch, no keyboard)
- Started: 2026-09-26T19:42:58.449Z, took 224 s
- Workflow run: https://github.com/zsrobinson/terpsicle/actions/runs/36266293665
- Every step's full probe (viewport, drawer, focus, events, per-frame trace) is in `summary.json`.

| Scenario | Result | Steps | Time | Recording |
|---|---|---|---|---|
| [Search with the on-screen keyboard from half: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-half) | ok | 10 | 28 s | [video](keyboard-at-half/video.webm) |
| [Search with the on-screen keyboard from full: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-full) | ok | 10 | 14 s | [video](keyboard-at-full/video.webm) |
| [Search with the on-screen keyboard from peek: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-peek) | ok | 10 | 15 s | [video](keyboard-at-peek/video.webm) |
| [First load](#first-load) | ok | 2 | 5 s | [video](first-load/video.webm) |
| [Tap each drawer tab, then the open one again](#tabs) | ok | 8 | 14 s | [video](tabs/video.webm) |
| [Drag the grabber peek → half → full → peek](#grabber-drag) | skipped | 0 | 0 s | none |
| [Pull down on a list at its top, at each snap](#pull-lists) | ok | 7 | 23 s | [video](pull-lists/video.webm) |
| [Scroll a long list down, then back up: the drawer stays](#scroll-list-back) | warn | 2 | 9 s | [video](scroll-list-back/video.webm) |
| [Scroll the calendar, then pull down at its top](#calendar-pull) | ok | 2 | 8 s | [video](calendar-pull/video.webm) |
| [Rotate to landscape and back](#rotate) | ok | 4 | 10 s | [video](rotate/video.webm) |
| [Scroll to collapse and expand the browser's toolbar](#url-bar) | ok | 5 | 13 s | [video](url-bar/video.webm) |
| [A long course (ENGL101, 90+ sections) scrolled to the bottom](#long-course) | ok | 3 | 19 s | [video](long-course/video.webm) |
| [Search, scroll, put the keyboard away and open a result, six times](#open-results) | ok | 6 | 45 s | [video](open-results/video.webm) |
| [Add a section from course details, then switch it three times](#add-sections) | warn | 4 | 18 s | [video](add-sections/video.webm) |

<a id="keyboard-at-half"></a>

## Search with the on-screen keyboard from half: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-half` · [recording](keyboard-at-half/video.webm)

| Screen | Step |
|---|---|
| <img src="keyboard-at-half/01-loaded.jpg" width="220"> | **1. loaded** (ok, 15 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 550 MB (1, largest 550 MB)<br>panel "Plan A"<br>events: installed |
| <img src="keyboard-at-half/02-search-tab-at-half.jpg" width="220"> | **2. Search tab at half** (ok, 17 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":548}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 577 MB (1, largest 577 MB)<br>focus button[aria-label="Raise the panel"] at y 330–354<br>panel "Search" |
| <img src="keyboard-at-half/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 18 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":432}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 576 MB (1, largest 576 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-half/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 19 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 576 MB (1, largest 576 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-half/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 19 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 576 MB (1, largest 576 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-half/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 21 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 572 MB (1, largest 572 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-half/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 22 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 598 MB (1, largest 598 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-half/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 23 s)<br>after: swipe {"from":null,"start":{"x":197,"y":576},"end":{"x":197,"y":376},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 598 MB (1, largest 598 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-half/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 24 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 600 MB (1, largest 600 MB)<br>panel "Search" |
| <img src="keyboard-at-half/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 26 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":294}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 630 MB (1, largest 630 MB)<br>focus section[aria-label="CMSC132"] at y 402–660<br>panel "Object-Oriented Programming II" |

<a id="keyboard-at-full"></a>

## Search with the on-screen keyboard from full: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-full` · [recording](keyboard-at-full/video.webm)

| Screen | Step |
|---|---|
| <img src="keyboard-at-full/01-loaded.jpg" width="220"> | **1. loaded** (ok, 3 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1055 MB (2, largest 575 MB)<br>panel "Plan A"<br>events: installed |
| <img src="keyboard-at-full/02-search-tab-at-full.jpg" width="220"> | **2. Search tab at full** (ok, 4 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1078 MB (2, largest 597 MB)<br>focus button at y 73–116<br>panel "Search" |
| <img src="keyboard-at-full/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 4 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":151}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1080 MB (2, largest 600 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-full/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 5 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1077 MB (2, largest 596 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-full/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 6 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1076 MB (2, largest 596 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-full/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 7 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1070 MB (2, largest 591 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-full/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 8 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1100 MB (2, largest 620 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-full/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 9 s)<br>after: swipe {"from":null,"start":{"x":197,"y":576},"end":{"x":197,"y":376},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 618 MB (1, largest 618 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-full/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 10 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 620 MB (1, largest 620 MB)<br>panel "Search" |
| <img src="keyboard-at-full/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 12 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":294}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 667 MB (1, largest 667 MB)<br>focus section[aria-label="CMSC132"] at y 402–660<br>panel "Object-Oriented Programming II" |

<a id="keyboard-at-peek"></a>

## Search with the on-screen keyboard from peek: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-peek` · [recording](keyboard-at-peek/video.webm)

| Screen | Step |
|---|---|
| <img src="keyboard-at-peek/01-loaded.jpg" width="220"> | **1. loaded** (ok, 3 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1063 MB (2, largest 571 MB)<br>panel "Plan A"<br>events: installed |
| <img src="keyboard-at-peek/02-search-tab-at-peek.jpg" width="220"> | **2. Search tab at peek** (ok, 5 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 1066 MB (2, largest 574 MB)<br>focus button[aria-label="Raise the panel"] at y 536–560<br>panel "Search" |
| <img src="keyboard-at-peek/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 6 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":638}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1063 MB (2, largest 570 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-peek/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 6 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1063 MB (2, largest 570 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-peek/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 7 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1059 MB (2, largest 570 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-peek/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 8 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1056 MB (2, largest 571 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-peek/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 10 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 589 MB (1, largest 589 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-peek/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 11 s)<br>after: swipe {"from":null,"start":{"x":197,"y":576},"end":{"x":197,"y":376},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 588 MB (1, largest 588 MB)<br>focus input[aria-label="Search courses"] at y 134–168<br>panel "Search" |
| <img src="keyboard-at-peek/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 12 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 586 MB (1, largest 586 MB)<br>panel "Search" |
| <img src="keyboard-at-peek/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 14 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":294}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 651 MB (1, largest 651 MB)<br>focus section[aria-label="CMSC132"] at y 402–660<br>panel "Object-Oriented Programming II" |

<a id="first-load"></a>

## First load

`first-load` · [recording](first-load/video.webm)

| Screen | Step |
|---|---|
| <img src="first-load/01-shell-up.jpg" width="220"> | **1. shell up** (ok, 1 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 63.6, inside 611px<br>page processes 1066 MB (2, largest 548 MB)<br>panel "Plan A"<br>events: installed |
| <img src="first-load/02-settled.jpg" width="220"> | **2. settled** (ok, 4 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1110 MB (2, largest 562 MB)<br>panel "Plan A" |

<a id="tabs"></a>

## Tap each drawer tab, then the open one again

`tabs` · [recording](tabs/video.webm)

| Screen | Step |
|---|---|
| <img src="tabs/01-search-tab.jpg" width="220"> | **1. Search tab** (ok, 3 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1573 MB (3, largest 565 MB)<br>focus button at y 73–116<br>panel "Search"<br>events: installed |
| <img src="tabs/02-problems-tab.jpg" width="220"> | **2. Problems tab** (ok, 4 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Problems\"","at":{"x":142,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1031 MB (2, largest 565 MB)<br>focus button at y 73–116<br>panel "Problems" |
| <img src="tabs/03-travel-tab.jpg" width="220"> | **3. Travel tab** (ok, 7 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Travel\"","at":{"x":197,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1029 MB (2, largest 565 MB)<br>focus button at y 73–116<br>panel "Travel" |
| <img src="tabs/04-blocks-tab.jpg" width="220"> | **4. Blocks tab** (ok, 8 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Blocks\"","at":{"x":252,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1039 MB (2, largest 576 MB)<br>focus button at y 73–116<br>panel "Blocks" |
| <img src="tabs/05-generate-tab.jpg" width="220"> | **5. Generate tab** (ok, 9 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Generate\"","at":{"x":307,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1049 MB (2, largest 585 MB)<br>focus button at y 73–116<br>panel "Generate" |
| <img src="tabs/06-export-tab.jpg" width="220"> | **6. Export tab** (ok, 10 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Export\"","at":{"x":362,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 583 MB (1, largest 583 MB)<br>focus button at y 73–116<br>panel "Export" |
| <img src="tabs/07-courses-tab.jpg" width="220"> | **7. Courses tab** (ok, 11 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 586 MB (1, largest 586 MB)<br>focus button at y 73–116<br>panel "Plan A" |
| <img src="tabs/08-tapped-the-open-tab.jpg" width="220"> | **8. tapped the open tab** (ok, 13 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 598 MB (1, largest 598 MB)<br>focus button at y 560–603<br>panel "Plan A" |

<a id="grabber-drag"></a>

## Drag the grabber peek → half → full → peek

`grabber-drag`

Skipped on this engine: Playwright can't send WebKit a touch drag, and vaul doesn't follow its mouse drags as a finger's.

<a id="pull-lists"></a>

## Pull down on a list at its top, at each snap

`pull-lists` · [recording](pull-lists/video.webm)

| Screen | Step |
|---|---|
| <img src="pull-lists/01-results-at-full.jpg" width="220"> | **1. results at full** (ok, 6 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":151}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1053 MB (2, largest 593 MB)<br>panel "Search"<br>events: installed |
| <img src="pull-lists/02-pulled-down-at-full.jpg" width="220"> | **2. pulled down at full** (ok, 9 s)<br>after: swipe {"from":null,"start":{"x":197,"y":262},"end":{"x":197,"y":562},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 616 MB (1, largest 616 MB)<br>focus section[aria-label="CMSC115"] at y 402–660<br>panel "Gender, Race and Computing" |
| <img src="pull-lists/03-results-at-half.jpg" width="220"> | **3. results at half** (ok, 9 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 616 MB (1, largest 616 MB)<br>focus section[aria-label="CMSC115"] at y 402–660<br>panel "Gender, Race and Computing" |
| <img src="pull-lists/04-pulled-down-at-half.jpg" width="220"> | **4. pulled down at half** (ok, 12 s)<br>after: swipe {"from":null,"start":{"x":197,"y":362},"end":{"x":197,"y":662},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 636 MB (1, largest 636 MB)<br>focus button at y 354–397<br>panel "Travel" |
| <img src="pull-lists/05-results-at-peek.jpg" width="220"> | **5. results at peek** (ok, 14 s)<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 641 MB (1, largest 641 MB)<br>focus button[aria-label="Raise the panel"] at y 536–560<br>panel "Travel" |
| <img src="pull-lists/06-pulled-down-at-peek.jpg" width="220"> | **6. pulled down at peek** (ok, 17 s)<br>after: swipe {"from":null,"start":{"x":197,"y":568},"end":{"x":197,"y":868},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 640 MB (1, largest 640 MB)<br>focus button at y 354–397<br>panel "Travel" |
| <img src="pull-lists/07-pulled-down-on-courses-at-half.jpg" width="220"> | **7. pulled down on Courses at half** (ok, 20 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":376}}<br>after: swipe {"from":null,"start":{"x":197,"y":474},"end":{"x":197,"y":774},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 645 MB (1, largest 645 MB)<br>focus section at y 608–660<br>panel "Plan A" |

<a id="scroll-list-back"></a>

## Scroll a long list down, then back up: the drawer stays

`scroll-list-back` · [recording](scroll-list-back/video.webm)

| Screen | Step |
|---|---|
| <img src="scroll-list-back/01-scrolled-down.jpg" width="220"> | **1. scrolled down** (warn, 7 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":151}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>after: swipe {"from":null,"start":{"x":197,"y":556},"end":{"x":197,"y":206},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1071 MB (2, largest 594 MB)<br>panel "Search"<br>events: installed<br>**warn drawer-moves-one-way**: 2 reversal(s) over 19 frames (48–555) |
| <img src="scroll-list-back/02-scrolled-back-up.jpg" width="220"> | **2. scrolled back up** (ok, 8 s)<br>after: swipe {"from":null,"start":{"x":197,"y":367},"end":{"x":197,"y":617},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 593 MB (1, largest 593 MB)<br>panel "Search" |

<a id="calendar-pull"></a>

## Scroll the calendar, then pull down at its top

`calendar-pull` · [recording](calendar-pull/video.webm)

| Screen | Step |
|---|---|
| <img src="calendar-pull/01-scrolled-the-calendar-down.jpg" width="220"> | **1. scrolled the calendar down** (ok, 4 s)<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>after: swipe {"from":null,"start":{"x":197,"y":340},"end":{"x":197,"y":90},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 1015 MB (2, largest 566 MB)<br>focus button[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A"<br>events: installed |
| <img src="calendar-pull/02-pulled-down-at-the-top.jpg" width="220"> | **2. pulled down at the top** (ok, 7 s)<br>after: swipe {"from":null,"start":{"x":197,"y":121},"end":{"x":197,"y":471},"ms":500,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":121},"end":{"x":197,"y":471},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 1011 MB (2, largest 565 MB)<br>focus button[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A" |

<a id="rotate"></a>

## Rotate to landscape and back

`rotate` · [recording](rotate/video.webm)

| Screen | Step |
|---|---|
| <img src="rotate/01-portrait.jpg" width="220"> | **1. portrait** (ok, 2 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1061 MB (2, largest 572 MB)<br>panel "Plan A"<br>events: installed |
| <img src="rotate/02-landscape.jpg" width="220"> | **2. landscape** (ok, 5 s)<br>after: rotate {"orientation":"landscape"}<br>viewport 659×393, visual 393 tall at 0, scrollY 0<br>drawer full, top 48, inside 345px<br>page processes 1155 MB (2, largest 666 MB)<br>panel "Plan A"<br>events: orientationchange, resize, vv-resize |
| <img src="rotate/03-landscape-half.jpg" width="220"> | **3. landscape, half** (ok, 6 s)<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":330,"y":61}}<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":330,"y":282}}<br>viewport 659×393, visual 393 tall at 0, scrollY 0<br>drawer half, top 48, inside 345px<br>page processes 1158 MB (2, largest 669 MB)<br>focus button[aria-label="Raise the panel"] at y 49–73<br>panel "Plan A" |
| <img src="rotate/04-portrait-again.jpg" width="220"> | **4. portrait again** (ok, 9 s)<br>after: rotate {"orientation":"portrait"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 1184 MB (2, largest 697 MB)<br>focus button[aria-label="Raise the panel"] at y 330–354<br>panel "Plan A"<br>events: orientationchange, resize, vv-resize |

<a id="url-bar"></a>

## Scroll to collapse and expand the browser's toolbar

`url-bar` · [recording](url-bar/video.webm)

| Screen | Step |
|---|---|
| <img src="url-bar/01-start.jpg" width="220"> | **1. start** (ok, 3 s)<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 1141 MB (2, largest 574 MB)<br>focus button[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A"<br>events: installed |
| <img src="url-bar/02-scrolled-the-calendar-up-toolbar-may-hide.jpg" width="220"> | **2. scrolled the calendar up (toolbar may hide)** (ok, 5 s)<br>after: swipe {"from":null,"start":{"x":197,"y":389},"end":{"x":197,"y":89},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 1138 MB (2, largest 574 MB)<br>focus button[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A" |
| <img src="url-bar/03-scrolled-it-back-toolbar-may-show.jpg" width="220"> | **3. scrolled it back (toolbar may show)** (ok, 6 s)<br>after: swipe {"from":null,"start":{"x":197,"y":389},"end":{"x":197,"y":689},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 1136 MB (2, largest 572 MB)<br>focus button[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A" |
| <img src="url-bar/04-scrolled-the-results.jpg" width="220"> | **4. scrolled the results** (ok, 11 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":582}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":432}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>after: swipe {"from":null,"start":{"x":197,"y":576},"end":{"x":197,"y":176},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 589 MB (1, largest 589 MB)<br>panel "Search" |
| <img src="url-bar/05-scrolled-them-back.jpg" width="220"> | **5. scrolled them back** (ok, 12 s)<br>after: swipe {"from":null,"start":{"x":197,"y":576},"end":{"x":197,"y":976},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 595 MB (1, largest 595 MB)<br>panel "Search" |

<a id="long-course"></a>

## A long course (ENGL101, 90+ sections) scrolled to the bottom

`long-course` · [recording](long-course/video.webm)

| Screen | Step |
|---|---|
| <img src="long-course/01-engl101.jpg" width="220"> | **1. ENGL101** (ok, 8 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":151}}<br>after: type {"text":"engl101"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"ENGL101\"]","at":{"x":197,"y":278}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 1196 MB (2, largest 673 MB)<br>focus section[aria-label="ENGL101"] at y 402–660<br>panel "Academic Writing"<br>events: installed |
| <img src="long-course/02-engl101-at-full.jpg" width="220"> | **2. ENGL101 at full** (ok, 10 s)<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 672 MB (1, largest 672 MB)<br>focus button[aria-label="Lower the panel"] at y 49–73<br>panel "Academic Writing" |
| <img src="long-course/03-scrolled-to-the-bottom.jpg" width="220"> | **3. scrolled to the bottom** (ok, 16 s)<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 692 MB (1, largest 692 MB)<br>focus button[aria-label="Lower the panel"] at y 49–73<br>panel "Academic Writing" |

<a id="open-results"></a>

## Search, scroll, put the keyboard away and open a result, six times

`open-results` · [recording](open-results/video.webm)

| Screen | Step |
|---|---|
| <img src="open-results/01-opened-a-result-1.jpg" width="220"> | **1. opened a result (1)** (ok, 9 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":151}}<br>after: type {"text":"cmsc"}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":194,"y":151}}<br>after: swipe {"from":null,"start":{"x":197,"y":576},"end":{"x":197,"y":416},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":262}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 624 MB (1, largest 624 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I"<br>events: installed |
| <img src="open-results/02-opened-a-result-2.jpg" width="220"> | **2. opened a result (2)** (ok, 15 s)<br>after: tap {"target":"nav[aria-label=\"Breadcrumb\"] button \"Search\"","at":{"x":35,"y":426}}<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":194,"y":151}}<br>after: swipe {"from":null,"start":{"x":197,"y":576},"end":{"x":197,"y":416},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":262}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 636 MB (1, largest 636 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results/03-opened-a-result-3.jpg" width="220"> | **3. opened a result (3)** (ok, 21 s)<br>after: tap {"target":"nav[aria-label=\"Breadcrumb\"] button \"Search\"","at":{"x":35,"y":426}}<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":194,"y":151}}<br>after: swipe {"from":null,"start":{"x":197,"y":576},"end":{"x":197,"y":416},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":262}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 639 MB (1, largest 639 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results/04-opened-a-result-4.jpg" width="220"> | **4. opened a result (4)** (ok, 27 s)<br>after: tap {"target":"nav[aria-label=\"Breadcrumb\"] button \"Search\"","at":{"x":35,"y":426}}<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":194,"y":151}}<br>after: swipe {"from":null,"start":{"x":197,"y":576},"end":{"x":197,"y":416},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":262}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 653 MB (1, largest 653 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results/05-opened-a-result-5.jpg" width="220"> | **5. opened a result (5)** (ok, 33 s)<br>after: tap {"target":"nav[aria-label=\"Breadcrumb\"] button \"Search\"","at":{"x":35,"y":426}}<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":194,"y":151}}<br>after: swipe {"from":null,"start":{"x":197,"y":576},"end":{"x":197,"y":416},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":262}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 656 MB (1, largest 656 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results/06-opened-a-result-6.jpg" width="220"> | **6. opened a result (6)** (ok, 39 s)<br>after: tap {"target":"nav[aria-label=\"Breadcrumb\"] button \"Search\"","at":{"x":35,"y":426}}<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":194,"y":151}}<br>after: swipe {"from":null,"start":{"x":197,"y":576},"end":{"x":197,"y":416},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":262}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 658 MB (1, largest 658 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |

<a id="add-sections"></a>

## Add a section from course details, then switch it three times

`add-sections` · [recording](add-sections/video.webm)

| Screen | Step |
|---|---|
| <img src="add-sections/01-tapped-add-0101.jpg" width="220"> | **1. tapped Add 0101** (warn, 11 s)<br>after: tap {"target":"[data-vaul-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":151}}<br>after: type {"text":"cmsc131"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"CMSC131\"]","at":{"x":197,"y":278}}<br>after: tap {"target":"[data-vaul-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"]","at":{"x":363,"y":481}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 646 MB (1, largest 646 MB)<br>focus button[aria-label="Remove 0101 from Plan A"] at y 467–495<br>panel "Object-Oriented Programming I"<br>events: installed<br>**warn drawer-moves-one-way**: 2 reversal(s) over 43 frames (48–554) |
| <img src="add-sections/02-tapped-switch-to-0102.jpg" width="220"> | **2. tapped Switch to 0102** (ok, 12 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"]","at":{"x":363,"y":554}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 650 MB (1, largest 650 MB)<br>focus button[aria-label="Remove 0102 from Plan A"] at y 540–568<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/03-tapped-switch-to-0101.jpg" width="220"> | **3. tapped Switch to 0101** (ok, 14 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"]","at":{"x":363,"y":481}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 649 MB (1, largest 649 MB)<br>focus button[aria-label="Remove 0101 from Plan A"] at y 467–495<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/04-tapped-switch-to-0102.jpg" width="220"> | **4. tapped Switch to 0102** (ok, 16 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"]","at":{"x":363,"y":554}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 655 MB (1, largest 655 MB)<br>focus button[aria-label="Remove 0102 from Plan A"] at y 540–568<br>panel "Object-Oriented Programming I" |
