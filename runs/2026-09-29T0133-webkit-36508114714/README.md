# Mobile lab: webkit

**Passed**: 0 failed check(s), 10 warning(s), 0 error(s).

- URL: https://pr-212-terpsicle.zsrobinson.workers.dev/schedule
- Device: Playwright webkit 26.6, iPhone 15 viewport (emulated touch, no keyboard)
- Started: 2026-09-29T01:33:15.018Z, took 356 s
- Workflow run: https://github.com/zsrobinson/terpsicle/actions/runs/36508114714
- Every step's full probe (viewport, drawer, focus, events, per-frame trace) is in `summary.json`.

| Scenario | Result | Steps | Time | Recording |
|---|---|---|---|---|
| [Search with the on-screen keyboard from half: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-half) | ok | 10 | 22 s | [video](keyboard-at-half/video.webm) |
| [Search with the on-screen keyboard from full: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-full) | ok | 10 | 18 s | [video](keyboard-at-full/video.webm) |
| [Search with the on-screen keyboard from peek: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-peek) | warn | 10 | 19 s | [video](keyboard-at-peek/video.webm) |
| [First load](#first-load) | ok | 2 | 6 s | [video](first-load/video.webm) |
| [Tap each drawer tab, then the open one again](#tabs) | ok | 8 | 18 s | [video](tabs/video.webm) |
| [Drag the grabber peek → half → full → peek](#grabber-drag) | skipped | 0 | 0 s | none |
| [Pull down on a list at its top, at each snap](#pull-lists) | ok | 7 | 27 s | [video](pull-lists/video.webm) |
| [Scroll a long list down, then back up: the drawer stays](#scroll-list-back) | warn | 2 | 12 s | [video](scroll-list-back/video.webm) |
| [Scroll the calendar, then pull down at its top](#calendar-pull) | ok | 2 | 11 s | [video](calendar-pull/video.webm) |
| [Rotate to landscape and back](#rotate) | ok | 4 | 10 s | [video](rotate/video.webm) |
| [Scroll to collapse and expand the browser's toolbar](#url-bar) | ok | 5 | 17 s | [video](url-bar/video.webm) |
| [A long course (ENGL101, 90+ sections) scrolled to the bottom](#long-course) | ok | 3 | 22 s | [video](long-course/video.webm) |
| [Search, scroll, put the keyboard away and open a result, six times](#open-results-webkit-crash-1) | warn | 4 | 44 s | [video](open-results-webkit-crash-1/video.webm) |
| [Search, scroll, put the keyboard away and open a result, six times](#open-results-webkit-crash-2) | warn | 6 | 58 s | [video](open-results-webkit-crash-2/video.webm) |
| [Search, scroll, put the keyboard away and open a result, six times](#open-results) | ok | 6 | 49 s | [video](open-results/video.webm) |
| [Add a section from course details, then switch it three times](#add-sections) | warn | 4 | 22 s | [video](add-sections/video.webm) |

<a id="keyboard-at-half"></a>

## Search with the on-screen keyboard from half: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-half` · [recording](keyboard-at-half/video.webm)

| Screen | Step |
|---|---|
| <img src="keyboard-at-half/01-loaded.jpg" width="220"> | **1. loaded** (ok, 8 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 849 MB (2, largest 612 MB)<br>panel "Plan A"<br>events: installed |
| <img src="keyboard-at-half/02-search-tab-at-half.jpg" width="220"> | **2. Search tab at half** (ok, 10 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 875 MB (2, largest 638 MB)<br>focus button#base-ui-_r_15_ at y 354–397<br>panel "Search" |
| <img src="keyboard-at-half/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 11 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 886 MB (2, largest 650 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 11 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 883 MB (2, largest 646 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 12 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 878 MB (2, largest 642 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 14 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 870 MB (2, largest 633 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 15 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 900 MB (2, largest 683 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 17 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":378},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 910 MB (2, largest 693 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 18 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 907 MB (2, largest 690 MB)<br>panel "Search" |
| <img src="keyboard-at-half/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 20 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":302}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 933 MB (2, largest 715 MB)<br>focus section[aria-label="CMSC132"] at y 402–660<br>panel "Object-Oriented Programming II" |

<a id="keyboard-at-full"></a>

## Search with the on-screen keyboard from full: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-full` · [recording](keyboard-at-full/video.webm)

| Screen | Step |
|---|---|
| <img src="keyboard-at-full/01-loaded.jpg" width="220"> | **1. loaded** (ok, 4 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 882 MB (2, largest 630 MB)<br>panel "Plan A"<br>events: installed |
| <img src="keyboard-at-full/02-search-tab-at-full.jpg" width="220"> | **2. Search tab at full** (ok, 6 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 881 MB (2, largest 629 MB)<br>focus button#base-ui-_r_v_[aria-label="Lower the panel"] at y 49–73<br>panel "Search" |
| <img src="keyboard-at-full/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 7 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":155}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 881 MB (2, largest 629 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 7 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 881 MB (2, largest 629 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 8 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 881 MB (2, largest 629 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 10 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 881 MB (2, largest 629 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 11 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 902 MB (2, largest 676 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 13 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":378},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 901 MB (2, largest 676 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 14 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 903 MB (2, largest 677 MB)<br>panel "Search" |
| <img src="keyboard-at-full/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 16 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":302}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 937 MB (2, largest 711 MB)<br>focus section[aria-label="CMSC132"] at y 402–660<br>panel "Object-Oriented Programming II" |

<a id="keyboard-at-peek"></a>

## Search with the on-screen keyboard from peek: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-peek` · [recording](keyboard-at-peek/video.webm)

| Screen | Step |
|---|---|
| <img src="keyboard-at-peek/01-loaded.jpg" width="220"> | **1. loaded** (warn, 3 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 860 MB (2, largest 629 MB)<br>panel "Plan A"<br>events: installed<br>**warn drawer-moves-one-way**: 2 reversal(s) over 11 frames (329–535) |
| <img src="keyboard-at-peek/02-search-tab-at-peek.jpg" width="220"> | **2. Search tab at peek** (ok, 6 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 862 MB (2, largest 631 MB)<br>focus button#base-ui-_r_v_[aria-label="Raise the panel"] at y 536–560<br>panel "Search" |
| <img src="keyboard-at-peek/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 7 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":642}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 858 MB (2, largest 627 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 8 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 858 MB (2, largest 627 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 9 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 858 MB (2, largest 627 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 10 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 858 MB (2, largest 627 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 12 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 878 MB (2, largest 665 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 13 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":378},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 880 MB (2, largest 667 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 14 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 880 MB (2, largest 668 MB)<br>panel "Search" |
| <img src="keyboard-at-peek/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 16 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":302}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 912 MB (2, largest 699 MB)<br>focus section[aria-label="CMSC132"] at y 402–660<br>panel "Object-Oriented Programming II" |

<a id="first-load"></a>

## First load

`first-load` · [recording](first-load/video.webm)

| Screen | Step |
|---|---|
| <img src="first-load/01-shell-up.jpg" width="220"> | **1. shell up** (ok, 1 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 832 MB (2, largest 577 MB)<br>panel "Plan A"<br>events: installed |
| <img src="first-load/02-settled.jpg" width="220"> | **2. settled** (ok, 5 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 870 MB (2, largest 616 MB)<br>panel "Plan A" |

<a id="tabs"></a>

## Tap each drawer tab, then the open one again

`tabs` · [recording](tabs/video.webm)

| Screen | Step |
|---|---|
| <img src="tabs/01-search-tab.jpg" width="220"> | **1. Search tab** (ok, 4 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 863 MB (2, largest 631 MB)<br>focus button#base-ui-_r_1l_ at y 354–397<br>panel "Search"<br>events: installed |
| <img src="tabs/02-problems-tab.jpg" width="220"> | **2. Problems tab** (ok, 6 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Problems\"","at":{"x":142,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 863 MB (2, largest 631 MB)<br>focus button#base-ui-_r_1o_ at y 354–397<br>panel "Problems" |
| <img src="tabs/03-travel-tab.jpg" width="220"> | **3. Travel tab** (ok, 9 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Travel\"","at":{"x":197,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 874 MB (2, largest 642 MB)<br>focus button#base-ui-_r_1r_ at y 354–397<br>panel "Travel" |
| <img src="tabs/04-blocks-tab.jpg" width="220"> | **4. Blocks tab** (ok, 10 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Blocks\"","at":{"x":252,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 884 MB (2, largest 653 MB)<br>focus button#base-ui-_r_1u_ at y 354–397<br>panel "Blocks" |
| <img src="tabs/05-generate-tab.jpg" width="220"> | **5. Generate tab** (ok, 12 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Generate\"","at":{"x":307,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 873 MB (2, largest 660 MB)<br>focus button#base-ui-_r_21_ at y 354–397<br>panel "Generate" |
| <img src="tabs/06-register-tab.jpg" width="220"> | **6. Register tab** (ok, 13 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Register\"","at":{"x":362,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 874 MB (2, largest 661 MB)<br>focus button#base-ui-_r_24_ at y 354–397<br>panel "Register" |
| <img src="tabs/07-courses-tab.jpg" width="220"> | **7. Courses tab** (ok, 15 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 884 MB (2, largest 671 MB)<br>focus button#base-ui-_r_1i_ at y 354–397<br>panel "Plan A" |
| <img src="tabs/08-tapped-the-open-tab.jpg" width="220"> | **8. tapped the open tab** (ok, 16 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 885 MB (2, largest 672 MB)<br>focus button#base-ui-_r_1i_ at y 560–603<br>panel "Plan A" |

<a id="grabber-drag"></a>

## Drag the grabber peek → half → full → peek

`grabber-drag`

Skipped on this engine: Playwright can't send WebKit a touch drag, and Base UI's drawer takes no mouse drag that starts on a button (the grabber).

<a id="pull-lists"></a>

## Pull down on a list at its top, at each snap

`pull-lists` · [recording](pull-lists/video.webm)

| Screen | Step |
|---|---|
| <img src="pull-lists/01-results-at-full.jpg" width="220"> | **1. results at full** (ok, 7 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 898 MB (2, largest 667 MB)<br>panel "Search"<br>events: installed |
| <img src="pull-lists/02-pulled-down-at-full.jpg" width="220"> | **2. pulled down at full** (ok, 10 s)<br>after: swipe {"from":null,"start":{"x":197,"y":270},"end":{"x":197,"y":570},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 909 MB (2, largest 677 MB)<br>focus div#search-result-0 at y 250–322<br>panel "Search" |
| <img src="pull-lists/03-results-at-half.jpg" width="220"> | **3. results at half** (ok, 12 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":548}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 892 MB (2, largest 680 MB)<br>focus button#base-ui-_r_17_[aria-label="Raise the panel"] at y 330–354<br>panel "Search" |
| <img src="pull-lists/04-pulled-down-at-half.jpg" width="220"> | **4. pulled down at half** (ok, 15 s)<br>after: swipe {"from":null,"start":{"x":197,"y":551},"end":{"x":197,"y":851},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 895 MB (2, largest 682 MB)<br>focus div#search-result-0 at y 531–603<br>panel "Search" |
| <img src="pull-lists/05-results-at-peek.jpg" width="220"> | **5. results at peek** (ok, 17 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 891 MB (2, largest 678 MB)<br>focus button#base-ui-_r_17_[aria-label="Raise the panel"] at y 536–560<br>panel "Search" |
| <img src="pull-lists/06-pulled-down-at-peek.jpg" width="220"> | **6. pulled down at peek** (ok, 20 s)<br>after: swipe {"from":null,"start":{"x":197,"y":568},"end":{"x":197,"y":868},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 892 MB (2, largest 680 MB)<br>focus button#base-ui-_r_1j_ at y 560–603<br>panel "Search" |
| <img src="pull-lists/07-pulled-down-on-courses-at-half.jpg" width="220"> | **7. pulled down on Courses at half** (ok, 24 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":582}}<br>after: swipe {"from":null,"start":{"x":197,"y":474},"end":{"x":197,"y":774},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 893 MB (2, largest 680 MB)<br>focus section at y 402–660<br>panel "Plan A" |

<a id="scroll-list-back"></a>

## Scroll a long list down, then back up: the drawer stays

`scroll-list-back` · [recording](scroll-list-back/video.webm)

| Screen | Step |
|---|---|
| <img src="scroll-list-back/01-scrolled-down.jpg" width="220"> | **1. scrolled down** (warn, 9 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>after: swipe {"from":null,"start":{"x":197,"y":558},"end":{"x":197,"y":208},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 922 MB (2, largest 669 MB)<br>panel "Search"<br>events: installed<br>**warn drawer-moves-one-way**: 2 reversal(s) over 18 frames (48–535) |
| <img src="scroll-list-back/02-scrolled-back-up.jpg" width="220"> | **2. scrolled back up** (ok, 10 s)<br>after: swipe {"from":null,"start":{"x":197,"y":373},"end":{"x":197,"y":623},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 920 MB (2, largest 667 MB)<br>panel "Search" |

<a id="calendar-pull"></a>

## Scroll the calendar, then pull down at its top

`calendar-pull` · [recording](calendar-pull/video.webm)

| Screen | Step |
|---|---|
| <img src="calendar-pull/01-scrolled-the-calendar-down.jpg" width="220"> | **1. scrolled the calendar down** (ok, 6 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>after: swipe {"from":null,"start":{"x":197,"y":359},"end":{"x":197,"y":109},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 880 MB (2, largest 629 MB)<br>focus button#base-ui-_r_1f_[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A"<br>events: installed |
| <img src="calendar-pull/02-pulled-down-at-the-top.jpg" width="220"> | **2. pulled down at the top** (ok, 9 s)<br>after: swipe {"from":null,"start":{"x":197,"y":162},"end":{"x":197,"y":512},"ms":500,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":162},"end":{"x":197,"y":512},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 878 MB (2, largest 628 MB)<br>focus button#base-ui-_r_1f_[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A" |

<a id="rotate"></a>

## Rotate to landscape and back

`rotate` · [recording](rotate/video.webm)

| Screen | Step |
|---|---|
| <img src="rotate/01-portrait.jpg" width="220"> | **1. portrait** (ok, 3 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 868 MB (2, largest 612 MB)<br>panel "Plan A"<br>events: installed |
| <img src="rotate/02-landscape.jpg" width="220"> | **2. landscape** (ok, 6 s)<br>after: rotate {"orientation":"landscape"}<br>viewport 659×393, visual 393 tall at 0, scrollY 0<br>drawer half, top 48, inside 345px<br>page processes 963 MB (2, largest 707 MB)<br>panel "Plan A"<br>events: orientationchange, resize, vv-resize |
| <img src="rotate/03-landscape-half.jpg" width="220"> | **3. landscape, half** (ok, 6 s)<br>viewport 659×393, visual 393 tall at 0, scrollY 0<br>drawer half, top 48, inside 345px<br>page processes 962 MB (2, largest 707 MB)<br>panel "Plan A" |
| <img src="rotate/04-portrait-again.jpg" width="220"> | **4. portrait again** (ok, 8 s)<br>after: rotate {"orientation":"portrait"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 994 MB (2, largest 738 MB)<br>panel "Plan A"<br>events: orientationchange, resize, vv-resize |

<a id="url-bar"></a>

## Scroll to collapse and expand the browser's toolbar

`url-bar` · [recording](url-bar/video.webm)

| Screen | Step |
|---|---|
| <img src="url-bar/01-start.jpg" width="220"> | **1. start** (ok, 5 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 889 MB (2, largest 635 MB)<br>focus button#base-ui-_r_17_[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A"<br>events: installed |
| <img src="url-bar/02-scrolled-the-calendar-up-toolbar-may-hide.jpg" width="220"> | **2. scrolled the calendar up (toolbar may hide)** (ok, 6 s)<br>after: swipe {"from":null,"start":{"x":197,"y":403},"end":{"x":197,"y":103},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 888 MB (2, largest 635 MB)<br>focus button#base-ui-_r_17_[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A" |
| <img src="url-bar/03-scrolled-it-back-toolbar-may-show.jpg" width="220"> | **3. scrolled it back (toolbar may show)** (ok, 8 s)<br>after: swipe {"from":null,"start":{"x":197,"y":403},"end":{"x":197,"y":703},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 889 MB (2, largest 635 MB)<br>focus button#base-ui-_r_17_[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A" |
| <img src="url-bar/04-scrolled-the-results.jpg" width="220"> | **4. scrolled the results** (ok, 13 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":582}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":178},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 899 MB (2, largest 674 MB)<br>panel "Search" |
| <img src="url-bar/05-scrolled-them-back.jpg" width="220"> | **5. scrolled them back** (ok, 15 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":978},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 901 MB (2, largest 676 MB)<br>panel "Search" |

<a id="long-course"></a>

## A long course (ENGL101, 90+ sections) scrolled to the bottom

`long-course` · [recording](long-course/video.webm)

| Screen | Step |
|---|---|
| <img src="long-course/01-engl101.jpg" width="220"> | **1. ENGL101** (ok, 10 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"engl101"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"ENGL101\"]","at":{"x":197,"y":286}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 994 MB (2, largest 740 MB)<br>focus section[aria-label="ENGL101"] at y 402–660<br>panel "Academic Writing"<br>events: installed |
| <img src="long-course/02-engl101-at-full.jpg" width="220"> | **2. ENGL101 at full** (ok, 11 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 971 MB (2, largest 746 MB)<br>focus button#base-ui-_r_10_[aria-label="Lower the panel"] at y 49–73<br>panel "Academic Writing" |
| <img src="long-course/03-scrolled-to-the-bottom.jpg" width="220"> | **3. scrolled to the bottom** (ok, 18 s)<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 981 MB (2, largest 757 MB)<br>focus button#base-ui-_r_10_[aria-label="Lower the panel"] at y 49–73<br>panel "Academic Writing" |

<a id="open-results-webkit-crash-1"></a>

## Search, scroll, put the keyboard away and open a result, six times

`open-results-webkit-crash-1` · [recording](open-results-webkit-crash-1/video.webm)

**Note:** WebKit's page process crashed in WPE's compositor thread (2026-09-29T01:36:39,699288+00:00 eadedCompositor[8788]: segfault at 0 ip 00007f5319ca0f8a sp 00007f5289ff7c10 error 4 in libWPEWebKit-2.0.so.1.12.0[60a0f8a,7f5314408000+5edd000] likely on CPU 3 (core 1, socket 0) 2026-09-29T01:36:39,699306+00:00 Code: 08 41 8b 46 30 eb d9 31 db 89 d8 5b 41 5e 41 5f c3 66 2e 0f 1f 84 00 00 00 00 00 0f 1f 44 00 00 41 56 53 50 48 89 f3 49 89 fe <48> 8b 07 ff 50 40 84 c0 74 49 41 83 7e 30 00 7e 56 49 8b 46 10 48): a Linux WebKit bug, not the page (docs/MOBILE-TESTING.md, "Known issue"). The scenario ran again as open-results.

| Screen | Step |
|---|---|
| <img src="open-results-webkit-crash-1/01-opened-a-result-1.jpg" width="220"> | **1. opened a result (1)** (ok, 10 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 935 MB (2, largest 710 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I"<br>events: installed |
| <img src="open-results-webkit-crash-1/02-opened-a-result-2.jpg" width="220"> | **2. opened a result (2)** (ok, 17 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 954 MB (2, largest 729 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
|  | **3. opened a result (3)** (warn, 23 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>**warn webkit-compositor-crash**: page.screenshot: Target crashed  Call log:   - taking page screenshot   - waiting for fonts to load...   - fonts loaded  |
|  | **4. error** (warn, 39 s)<br>**warn webkit-compositor-crash**: the page's process crashed after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}; hide keyboard {}; tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}; kernel: 2026-09-29T01:36:39,699288+00:00 eadedCompositor[8788]: segfault at 0 ip 00007f5319ca0f8a sp 00007f5289ff7c10 error 4 in libWPEWebKit-2.0.so.1.12.0[60a0f8a,7f5314408000+5edd000] likely on CPU 3 (core 1, socket 0) 2026-09-29T01:36:39,699306+00:00 Code: 08 41 8b 46 30 eb d9 31 db 89 d8 5b 41 5e 41 5f c3 66 2e 0f 1f 84 00 00 00 00 00 0f 1f 44 00 00 41 56 53 50 48 89 f3 49 89 fe <48> 8b 07 ff 50 40 84 c0 74 49 41 83 7e 30 00 7e 56 49 8b 46 10 48<br>**warn webkit-compositor-crash**: page.evaluate: Target crashed  |

<a id="open-results-webkit-crash-2"></a>

## Search, scroll, put the keyboard away and open a result, six times

`open-results-webkit-crash-2` · [recording](open-results-webkit-crash-2/video.webm)

**Note:** WebKit's page process crashed in WPE's compositor thread (2026-09-29T01:37:36,154585+00:00 eadedCompositor[9020]: segfault at 0 ip 00007f4224aa0f8a sp 00007f4192ff8c10 error 4 in libWPEWebKit-2.0.so.1.12.0[60a0f8a,7f421f208000+5edd000] likely on CPU 0 (core 0, socket 0) 2026-09-29T01:37:36,154606+00:00 Code: 08 41 8b 46 30 eb d9 31 db 89 d8 5b 41 5e 41 5f c3 66 2e 0f 1f 84 00 00 00 00 00 0f 1f 44 00 00 41 56 53 50 48 89 f3 49 89 fe <48> 8b 07 ff 50 40 84 c0 74 49 41 83 7e 30 00 7e 56 49 8b 46 10 48): a Linux WebKit bug, not the page (docs/MOBILE-TESTING.md, "Known issue"). The scenario ran again as open-results.

| Screen | Step |
|---|---|
| <img src="open-results-webkit-crash-2/01-opened-a-result-1.jpg" width="220"> | **1. opened a result (1)** (warn, 10 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 933 MB (2, largest 708 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I"<br>events: installed<br>**warn drawer-moves-one-way**: 3 reversal(s) over 18 frames (48–535) |
| <img src="open-results-webkit-crash-2/02-opened-a-result-2.jpg" width="220"> | **2. opened a result (2)** (ok, 17 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 947 MB (2, largest 722 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results-webkit-crash-2/03-opened-a-result-3.jpg" width="220"> | **3. opened a result (3)** (ok, 23 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 953 MB (2, largest 728 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results-webkit-crash-2/04-opened-a-result-4.jpg" width="220"> | **4. opened a result (4)** (ok, 30 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 978 MB (2, largest 753 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
|  | **5. opened a result (5)** (warn, 36 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>**warn webkit-compositor-crash**: page.screenshot: Target crashed  Call log:   - taking page screenshot   - waiting for fonts to load...   - fonts loaded  |
|  | **6. error** (warn, 52 s)<br>**warn webkit-compositor-crash**: the page's process crashed after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}; hide keyboard {}; tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}; kernel: 2026-09-29T01:37:36,154585+00:00 eadedCompositor[9020]: segfault at 0 ip 00007f4224aa0f8a sp 00007f4192ff8c10 error 4 in libWPEWebKit-2.0.so.1.12.0[60a0f8a,7f421f208000+5edd000] likely on CPU 0 (core 0, socket 0) 2026-09-29T01:37:36,154606+00:00 Code: 08 41 8b 46 30 eb d9 31 db 89 d8 5b 41 5e 41 5f c3 66 2e 0f 1f 84 00 00 00 00 00 0f 1f 44 00 00 41 56 53 50 48 89 f3 49 89 fe <48> 8b 07 ff 50 40 84 c0 74 49 41 83 7e 30 00 7e 56 49 8b 46 10 48<br>**warn webkit-compositor-crash**: page.evaluate: Target crashed  |

<a id="open-results"></a>

## Search, scroll, put the keyboard away and open a result, six times

`open-results` · [recording](open-results/video.webm)

| Screen | Step |
|---|---|
| <img src="open-results/01-opened-a-result-1.jpg" width="220"> | **1. opened a result (1)** (ok, 11 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 913 MB (2, largest 688 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I"<br>events: installed |
| <img src="open-results/02-opened-a-result-2.jpg" width="220"> | **2. opened a result (2)** (ok, 17 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 944 MB (2, largest 719 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results/03-opened-a-result-3.jpg" width="220"> | **3. opened a result (3)** (ok, 24 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 948 MB (2, largest 723 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results/04-opened-a-result-4.jpg" width="220"> | **4. opened a result (4)** (ok, 30 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 957 MB (2, largest 732 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results/05-opened-a-result-5.jpg" width="220"> | **5. opened a result (5)** (ok, 36 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 965 MB (2, largest 741 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results/06-opened-a-result-6.jpg" width="220"> | **6. opened a result (6)** (ok, 43 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 960 MB (2, largest 736 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |

<a id="add-sections"></a>

## Add a section from course details, then switch it three times

`add-sections` · [recording](add-sections/video.webm)

| Screen | Step |
|---|---|
| <img src="add-sections/01-tapped-add-0101.jpg" width="220"> | **1. tapped Add 0101** (warn, 12 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc131"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"CMSC131\"]","at":{"x":197,"y":286}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Add 0101\"","at":{"x":355,"y":551}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 935 MB (2, largest 723 MB)<br>focus button#base-ui-_r_an_[aria-label="Remove 0101 from Plan A"] at y 529–573<br>panel "Object-Oriented Programming I"<br>events: installed<br>**warn drawer-moves-one-way**: 2 reversal(s) over 37 frames (48–535) |
| <img src="add-sections/02-tapped-switch-to-0102.jpg" width="220"> | **2. tapped Switch to 0102** (ok, 15 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0102\"","at":{"x":355,"y":450}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 943 MB (2, largest 730 MB)<br>focus button#base-ui-_r_b0_[aria-label="Remove 0102 from Plan A"] at y 428–472<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/03-tapped-switch-to-0101.jpg" width="220"> | **3. tapped Switch to 0101** (ok, 17 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0101\"","at":{"x":355,"y":377}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 949 MB (2, largest 736 MB)<br>focus button#base-ui-_r_an_[aria-label="Remove 0101 from Plan A"] at y 355–399<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/04-tapped-switch-to-0102.jpg" width="220"> | **4. tapped Switch to 0102** (ok, 19 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0102\"","at":{"x":355,"y":450}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 949 MB (2, largest 737 MB)<br>focus button#base-ui-_r_b0_[aria-label="Remove 0102 from Plan A"] at y 428–472<br>panel "Object-Oriented Programming I" |
