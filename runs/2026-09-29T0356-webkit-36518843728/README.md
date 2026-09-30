# Mobile lab: webkit

**Passed**: 0 failed check(s), 2 warning(s), 0 error(s).

- URL: https://pr-213-terpsicle.zsrobinson.workers.dev/schedule
- Device: Playwright webkit 26.6, iPhone 15 viewport (emulated touch, no keyboard)
- Started: 2026-09-29T03:56:03.121Z, took 252 s
- Workflow run: https://github.com/zsrobinson/terpsicle/actions/runs/36518843728
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
| [Scroll a long list down, then back up: the drawer stays](#scroll-list-back) | ok | 2 | 12 s | [video](scroll-list-back/video.webm) |
| [Scroll the calendar, then pull down at its top](#calendar-pull) | ok | 2 | 10 s | [video](calendar-pull/video.webm) |
| [Rotate to landscape and back](#rotate) | ok | 4 | 10 s | [video](rotate/video.webm) |
| [Scroll to collapse and expand the browser's toolbar](#url-bar) | ok | 5 | 16 s | [video](url-bar/video.webm) |
| [A long course (ENGL101, 90+ sections) scrolled to the bottom](#long-course) | ok | 3 | 22 s | [video](long-course/video.webm) |
| [Search, scroll, put the keyboard away and open a result, six times](#open-results) | ok | 6 | 49 s | [video](open-results/video.webm) |
| [Add a section from course details, then switch it three times](#add-sections) | warn | 4 | 22 s | [video](add-sections/video.webm) |

<a id="keyboard-at-half"></a>

## Search with the on-screen keyboard from half: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-half` · [recording](keyboard-at-half/video.webm)

| Screen | Step |
|---|---|
| <img src="keyboard-at-half/01-loaded.jpg" width="220"> | **1. loaded** (ok, 9 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 850 MB (2, largest 612 MB)<br>panel "Plan A"<br>events: installed |
| <img src="keyboard-at-half/02-search-tab-at-half.jpg" width="220"> | **2. Search tab at half** (ok, 10 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 868 MB (2, largest 630 MB)<br>focus button#base-ui-_r_14_ at y 354–397<br>panel "Search" |
| <img src="keyboard-at-half/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 11 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 866 MB (2, largest 628 MB)<br>focus input#base-ui-_r_3a_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 12 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 867 MB (2, largest 629 MB)<br>focus input#base-ui-_r_3a_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 12 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 867 MB (2, largest 629 MB)<br>focus input#base-ui-_r_3a_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 14 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 867 MB (2, largest 629 MB)<br>focus input#base-ui-_r_3a_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 16 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 892 MB (2, largest 673 MB)<br>focus input#base-ui-_r_3a_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 17 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":378},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 903 MB (2, largest 684 MB)<br>focus input#base-ui-_r_3a_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 18 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 904 MB (2, largest 685 MB)<br>panel "Search" |
| <img src="keyboard-at-half/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 20 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":302}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 928 MB (2, largest 709 MB)<br>focus section[aria-label="CMSC132"] at y 402–660<br>panel "Object-Oriented Programming II" |

<a id="keyboard-at-full"></a>

## Search with the on-screen keyboard from full: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-full` · [recording](keyboard-at-full/video.webm)

| Screen | Step |
|---|---|
| <img src="keyboard-at-full/01-loaded.jpg" width="220"> | **1. loaded** (ok, 4 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 845 MB (2, largest 613 MB)<br>panel "Plan A"<br>events: installed |
| <img src="keyboard-at-full/02-search-tab-at-full.jpg" width="220"> | **2. Search tab at full** (ok, 6 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 860 MB (2, largest 629 MB)<br>focus button#base-ui-_r_1n_[aria-label="Lower the panel"] at y 49–73<br>panel "Search" |
| <img src="keyboard-at-full/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 6 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":155}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 860 MB (2, largest 628 MB)<br>focus input#base-ui-_r_3r_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 7 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 860 MB (2, largest 628 MB)<br>focus input#base-ui-_r_3r_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 8 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 860 MB (2, largest 629 MB)<br>focus input#base-ui-_r_3r_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 9 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 861 MB (2, largest 629 MB)<br>focus input#base-ui-_r_3r_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 11 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 883 MB (2, largest 668 MB)<br>focus input#base-ui-_r_3r_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 12 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":378},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 889 MB (2, largest 674 MB)<br>focus input#base-ui-_r_3r_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 13 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 888 MB (2, largest 673 MB)<br>panel "Search" |
| <img src="keyboard-at-full/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 16 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":302}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 924 MB (2, largest 709 MB)<br>focus section[aria-label="CMSC132"] at y 402–660<br>panel "Object-Oriented Programming II" |

<a id="keyboard-at-peek"></a>

## Search with the on-screen keyboard from peek: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-peek` · [recording](keyboard-at-peek/video.webm)

| Screen | Step |
|---|---|
| <img src="keyboard-at-peek/01-loaded.jpg" width="220"> | **1. loaded** (warn, 3 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 849 MB (2, largest 619 MB)<br>panel "Plan A"<br>events: installed<br>**warn drawer-moves-one-way**: 2 reversal(s) over 16 frames (329–535) |
| <img src="keyboard-at-peek/02-search-tab-at-peek.jpg" width="220"> | **2. Search tab at peek** (ok, 6 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 862 MB (2, largest 632 MB)<br>focus button#base-ui-_r_v_[aria-label="Raise the panel"] at y 536–560<br>panel "Search" |
| <img src="keyboard-at-peek/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 7 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":642}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 855 MB (2, largest 625 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 8 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 853 MB (2, largest 623 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 9 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 854 MB (2, largest 624 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 10 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 856 MB (2, largest 624 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 12 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 875 MB (2, largest 662 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 13 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":378},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 874 MB (2, largest 661 MB)<br>focus input#base-ui-_r_3b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 14 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 873 MB (2, largest 660 MB)<br>panel "Search" |
| <img src="keyboard-at-peek/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 17 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":302}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 900 MB (2, largest 687 MB)<br>focus section[aria-label="CMSC132"] at y 402–660<br>panel "Object-Oriented Programming II" |

<a id="first-load"></a>

## First load

`first-load` · [recording](first-load/video.webm)

| Screen | Step |
|---|---|
| <img src="first-load/01-shell-up.jpg" width="220"> | **1. shell up** (ok, 1 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 358.2, inside 330px<br>page processes 811 MB (2, largest 558 MB)<br>panel "Plan A"<br>events: installed |
| <img src="first-load/02-settled.jpg" width="220"> | **2. settled** (ok, 5 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 872 MB (2, largest 618 MB)<br>panel "Plan A" |

<a id="tabs"></a>

## Tap each drawer tab, then the open one again

`tabs` · [recording](tabs/video.webm)

| Screen | Step |
|---|---|
| <img src="tabs/01-search-tab.jpg" width="220"> | **1. Search tab** (ok, 4 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 878 MB (2, largest 624 MB)<br>focus button#base-ui-_r_14_ at y 354–397<br>panel "Search"<br>events: installed |
| <img src="tabs/02-problems-tab.jpg" width="220"> | **2. Problems tab** (ok, 5 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Problems\"","at":{"x":142,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 880 MB (2, largest 626 MB)<br>focus button#base-ui-_r_17_ at y 354–397<br>panel "Problems" |
| <img src="tabs/03-travel-tab.jpg" width="220"> | **3. Travel tab** (ok, 8 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Travel\"","at":{"x":197,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 885 MB (2, largest 631 MB)<br>focus button#base-ui-_r_1a_ at y 354–397<br>panel "Travel" |
| <img src="tabs/04-blocks-tab.jpg" width="220"> | **4. Blocks tab** (ok, 10 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Blocks\"","at":{"x":252,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 898 MB (2, largest 644 MB)<br>focus button#base-ui-_r_1d_ at y 354–397<br>panel "Blocks" |
| <img src="tabs/05-generate-tab.jpg" width="220"> | **5. Generate tab** (ok, 11 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Generate\"","at":{"x":307,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 878 MB (2, largest 652 MB)<br>focus button#base-ui-_r_1g_ at y 354–397<br>panel "Generate" |
| <img src="tabs/06-register-tab.jpg" width="220"> | **6. Register tab** (ok, 13 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Register\"","at":{"x":362,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 877 MB (2, largest 651 MB)<br>focus button#base-ui-_r_1j_ at y 354–397<br>panel "Register" |
| <img src="tabs/07-courses-tab.jpg" width="220"> | **7. Courses tab** (ok, 14 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 882 MB (2, largest 656 MB)<br>focus button#base-ui-_r_11_ at y 354–397<br>panel "Plan A" |
| <img src="tabs/08-tapped-the-open-tab.jpg" width="220"> | **8. tapped the open tab** (ok, 15 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 886 MB (2, largest 661 MB)<br>focus button#base-ui-_r_11_ at y 560–603<br>panel "Plan A" |

<a id="grabber-drag"></a>

## Drag the grabber peek → half → full → peek

`grabber-drag`

Skipped on this engine: Playwright can't send WebKit a touch drag, and Base UI's drawer takes no mouse drag that starts on a button (the grabber).

<a id="pull-lists"></a>

## Pull down on a list at its top, at each snap

`pull-lists` · [recording](pull-lists/video.webm)

| Screen | Step |
|---|---|
| <img src="pull-lists/01-results-at-full.jpg" width="220"> | **1. results at full** (ok, 7 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 875 MB (2, largest 644 MB)<br>panel "Search"<br>events: installed |
| <img src="pull-lists/02-pulled-down-at-full.jpg" width="220"> | **2. pulled down at full** (ok, 10 s)<br>after: swipe {"from":null,"start":{"x":197,"y":270},"end":{"x":197,"y":570},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 868 MB (2, largest 654 MB)<br>focus div#search-result-0 at y 250–322<br>panel "Search" |
| <img src="pull-lists/03-results-at-half.jpg" width="220"> | **3. results at half** (ok, 12 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":548}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 869 MB (2, largest 657 MB)<br>focus button#base-ui-_r_17_[aria-label="Raise the panel"] at y 330–354<br>panel "Search" |
| <img src="pull-lists/04-pulled-down-at-half.jpg" width="220"> | **4. pulled down at half** (ok, 15 s)<br>after: swipe {"from":null,"start":{"x":197,"y":551},"end":{"x":197,"y":851},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 875 MB (2, largest 663 MB)<br>focus div#search-result-0 at y 531–603<br>panel "Search" |
| <img src="pull-lists/05-results-at-peek.jpg" width="220"> | **5. results at peek** (ok, 17 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 878 MB (2, largest 666 MB)<br>focus button#base-ui-_r_17_[aria-label="Raise the panel"] at y 536–560<br>panel "Search" |
| <img src="pull-lists/06-pulled-down-at-peek.jpg" width="220"> | **6. pulled down at peek** (ok, 20 s)<br>after: swipe {"from":null,"start":{"x":197,"y":568},"end":{"x":197,"y":868},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 874 MB (2, largest 662 MB)<br>focus button#base-ui-_r_1j_ at y 560–603<br>panel "Search" |
| <img src="pull-lists/07-pulled-down-on-courses-at-half.jpg" width="220"> | **7. pulled down on Courses at half** (ok, 24 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":582}}<br>after: swipe {"from":null,"start":{"x":197,"y":474},"end":{"x":197,"y":774},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 875 MB (2, largest 663 MB)<br>focus section at y 402–660<br>panel "Plan A" |

<a id="scroll-list-back"></a>

## Scroll a long list down, then back up: the drawer stays

`scroll-list-back` · [recording](scroll-list-back/video.webm)

| Screen | Step |
|---|---|
| <img src="scroll-list-back/01-scrolled-down.jpg" width="220"> | **1. scrolled down** (ok, 9 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>after: swipe {"from":null,"start":{"x":197,"y":558},"end":{"x":197,"y":208},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 917 MB (2, largest 665 MB)<br>panel "Search"<br>events: installed |
| <img src="scroll-list-back/02-scrolled-back-up.jpg" width="220"> | **2. scrolled back up** (ok, 10 s)<br>after: swipe {"from":null,"start":{"x":197,"y":373},"end":{"x":197,"y":623},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 919 MB (2, largest 666 MB)<br>panel "Search" |

<a id="calendar-pull"></a>

## Scroll the calendar, then pull down at its top

`calendar-pull` · [recording](calendar-pull/video.webm)

| Screen | Step |
|---|---|
| <img src="calendar-pull/01-scrolled-the-calendar-down.jpg" width="220"> | **1. scrolled the calendar down** (ok, 6 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>after: swipe {"from":null,"start":{"x":197,"y":359},"end":{"x":197,"y":109},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 880 MB (2, largest 630 MB)<br>focus button#base-ui-_r_u_[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A"<br>events: installed |
| <img src="calendar-pull/02-pulled-down-at-the-top.jpg" width="220"> | **2. pulled down at the top** (ok, 9 s)<br>after: swipe {"from":null,"start":{"x":197,"y":162},"end":{"x":197,"y":512},"ms":500,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":162},"end":{"x":197,"y":512},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 879 MB (2, largest 629 MB)<br>focus button#base-ui-_r_u_[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A" |

<a id="rotate"></a>

## Rotate to landscape and back

`rotate` · [recording](rotate/video.webm)

| Screen | Step |
|---|---|
| <img src="rotate/01-portrait.jpg" width="220"> | **1. portrait** (ok, 3 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 870 MB (2, largest 616 MB)<br>panel "Plan A"<br>events: installed |
| <img src="rotate/02-landscape.jpg" width="220"> | **2. landscape** (ok, 5 s)<br>after: rotate {"orientation":"landscape"}<br>viewport 659×393, visual 393 tall at 0, scrollY 0<br>drawer half, top 48, inside 345px<br>page processes 962 MB (2, largest 708 MB)<br>panel "Plan A"<br>events: orientationchange, resize, vv-resize |
| <img src="rotate/03-landscape-half.jpg" width="220"> | **3. landscape, half** (ok, 6 s)<br>viewport 659×393, visual 393 tall at 0, scrollY 0<br>drawer half, top 48, inside 345px<br>page processes 962 MB (2, largest 708 MB)<br>panel "Plan A" |
| <img src="rotate/04-portrait-again.jpg" width="220"> | **4. portrait again** (ok, 8 s)<br>after: rotate {"orientation":"portrait"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 1003 MB (2, largest 749 MB)<br>panel "Plan A"<br>events: orientationchange, resize, vv-resize |

<a id="url-bar"></a>

## Scroll to collapse and expand the browser's toolbar

`url-bar` · [recording](url-bar/video.webm)

| Screen | Step |
|---|---|
| <img src="url-bar/01-start.jpg" width="220"> | **1. start** (ok, 5 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 874 MB (2, largest 623 MB)<br>focus button#base-ui-_r_17_[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A"<br>events: installed |
| <img src="url-bar/02-scrolled-the-calendar-up-toolbar-may-hide.jpg" width="220"> | **2. scrolled the calendar up (toolbar may hide)** (ok, 6 s)<br>after: swipe {"from":null,"start":{"x":197,"y":403},"end":{"x":197,"y":103},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 876 MB (2, largest 625 MB)<br>focus button#base-ui-_r_17_[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A" |
| <img src="url-bar/03-scrolled-it-back-toolbar-may-show.jpg" width="220"> | **3. scrolled it back (toolbar may show)** (ok, 8 s)<br>after: swipe {"from":null,"start":{"x":197,"y":403},"end":{"x":197,"y":703},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>page processes 876 MB (2, largest 625 MB)<br>focus button#base-ui-_r_17_[aria-label="Raise the panel"] at y 536–560<br>panel "Plan A" |
| <img src="url-bar/04-scrolled-the-results.jpg" width="220"> | **4. scrolled the results** (ok, 13 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":582}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":178},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 894 MB (2, largest 669 MB)<br>panel "Search" |
| <img src="url-bar/05-scrolled-them-back.jpg" width="220"> | **5. scrolled them back** (ok, 14 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":978},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 896 MB (2, largest 672 MB)<br>panel "Search" |

<a id="long-course"></a>

## A long course (ENGL101, 90+ sections) scrolled to the bottom

`long-course` · [recording](long-course/video.webm)

| Screen | Step |
|---|---|
| <img src="long-course/01-engl101.jpg" width="220"> | **1. ENGL101** (ok, 9 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"engl101"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"ENGL101\"]","at":{"x":197,"y":286}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 994 MB (2, largest 741 MB)<br>focus section[aria-label="ENGL101"] at y 402–660<br>panel "Academic Writing"<br>events: installed |
| <img src="long-course/02-engl101-at-full.jpg" width="220"> | **2. ENGL101 at full** (ok, 11 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 975 MB (2, largest 751 MB)<br>focus button#base-ui-_r_u_[aria-label="Lower the panel"] at y 49–73<br>panel "Academic Writing" |
| <img src="long-course/03-scrolled-to-the-bottom.jpg" width="220"> | **3. scrolled to the bottom** (ok, 18 s)<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 978 MB (2, largest 754 MB)<br>focus button#base-ui-_r_u_[aria-label="Lower the panel"] at y 49–73<br>panel "Academic Writing" |

<a id="open-results"></a>

## Search, scroll, put the keyboard away and open a result, six times

`open-results` · [recording](open-results/video.webm)

| Screen | Step |
|---|---|
| <img src="open-results/01-opened-a-result-1.jpg" width="220"> | **1. opened a result (1)** (ok, 11 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 925 MB (2, largest 699 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I"<br>events: installed |
| <img src="open-results/02-opened-a-result-2.jpg" width="220"> | **2. opened a result (2)** (ok, 17 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 938 MB (2, largest 713 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results/03-opened-a-result-3.jpg" width="220"> | **3. opened a result (3)** (ok, 23 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 951 MB (2, largest 726 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results/04-opened-a-result-4.jpg" width="220"> | **4. opened a result (4)** (ok, 30 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 960 MB (2, largest 735 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results/05-opened-a-result-5.jpg" width="220"> | **5. opened a result (5)** (ok, 36 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 972 MB (2, largest 746 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="open-results/06-opened-a-result-6.jpg" width="220"> | **6. opened a result (6)** (ok, 43 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>page processes 972 MB (2, largest 747 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |

<a id="add-sections"></a>

## Add a section from course details, then switch it three times

`add-sections` · [recording](add-sections/video.webm)

| Screen | Step |
|---|---|
| <img src="add-sections/01-tapped-add-0101.jpg" width="220"> | **1. tapped Add 0101** (warn, 12 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc131"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"CMSC131\"]","at":{"x":197,"y":286}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Add 0101\"","at":{"x":355,"y":551}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 938 MB (2, largest 713 MB)<br>focus button#base-ui-_r_9u_[aria-label="Remove 0101 from Plan A"] at y 529–573<br>panel "Object-Oriented Programming I"<br>events: installed<br>**warn drawer-moves-one-way**: 2 reversal(s) over 26 frames (48–535) |
| <img src="add-sections/02-tapped-switch-to-0102.jpg" width="220"> | **2. tapped Switch to 0102** (ok, 15 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0102\"","at":{"x":355,"y":450}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 935 MB (2, largest 709 MB)<br>focus button#base-ui-_r_a7_[aria-label="Remove 0102 from Plan A"] at y 428–472<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/03-tapped-switch-to-0101.jpg" width="220"> | **3. tapped Switch to 0101** (ok, 17 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0101\"","at":{"x":355,"y":377}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 943 MB (2, largest 717 MB)<br>focus button#base-ui-_r_9u_[aria-label="Remove 0101 from Plan A"] at y 355–399<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/04-tapped-switch-to-0102.jpg" width="220"> | **4. tapped Switch to 0102** (ok, 19 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0102\"","at":{"x":355,"y":450}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 936 MB (2, largest 711 MB)<br>focus button#base-ui-_r_a7_[aria-label="Remove 0102 from Plan A"] at y 428–472<br>panel "Object-Oriented Programming I" |
