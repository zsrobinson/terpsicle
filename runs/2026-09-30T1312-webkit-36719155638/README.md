# Mobile lab: webkit

**Passed**: 0 failed check(s), 1 warning(s), 0 error(s).

- URL: https://pr-219-terpsicle.zsrobinson.workers.dev/schedule
- Device: Playwright webkit 26.6, iPhone 15 viewport (emulated touch, no keyboard)
- Started: 2026-09-30T13:12:04.621Z, took 270 s
- Workflow run: https://github.com/zsrobinson/terpsicle/actions/runs/36719155638
- Every step's full probe (viewport, drawer, focus, events, per-frame trace) is in `summary.json`.

| Scenario | Result | Steps | Time | Recording |
|---|---|---|---|---|
| [Search with the on-screen keyboard from half: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-half) | ok | 10 | 25 s | [video](keyboard-at-half/video.webm) |
| [Search with the on-screen keyboard from full: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-full) | ok | 10 | 17 s | [video](keyboard-at-full/video.webm) |
| [Search with the on-screen keyboard from peek: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-peek) | ok | 10 | 18 s | [video](keyboard-at-peek/video.webm) |
| [First load](#first-load) | ok | 2 | 6 s | [video](first-load/video.webm) |
| [Tap each drawer tab, then the open one again](#tabs) | ok | 8 | 17 s | [video](tabs/video.webm) |
| [Drag the grabber peek → half → full → peek](#grabber-drag) | skipped | 0 | 0 s | none |
| [Pull down on a list at its top, at each snap](#pull-lists) | ok | 7 | 28 s | [video](pull-lists/video.webm) |
| [Scroll a long list down, then back up: the drawer stays](#scroll-list-back) | ok | 2 | 11 s | [video](scroll-list-back/video.webm) |
| [Scroll the calendar, then pull down at its top](#calendar-pull) | ok | 2 | 10 s | [video](calendar-pull/video.webm) |
| [Rotate to landscape and back](#rotate) | ok | 4 | 12 s | [video](rotate/video.webm) |
| [Scroll to collapse and expand the browser's toolbar](#url-bar) | ok | 5 | 16 s | [video](url-bar/video.webm) |
| [A long course (ENGL101, 90+ sections) scrolled to the bottom](#long-course) | ok | 3 | 22 s | [video](long-course/video.webm) |
| [Search, scroll, put the keyboard away and open a result, six times](#open-results) | ok | 6 | 49 s | [video](open-results/video.webm) |
| [Add a section from course details, then switch it three times](#add-sections) | warn | 4 | 22 s | [video](add-sections/video.webm) |
| [Open a course, then swipe back from the screen's left edge: the page moves once](#swipe-back) | ok | 4 | 16 s | [video](swipe-back/video.webm) |

<a id="keyboard-at-half"></a>

## Search with the on-screen keyboard from half: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-half` · [recording](keyboard-at-half/video.webm)

| Screen | Step |
|---|---|
| <img src="keyboard-at-half/01-loaded.jpg" width="220"> | **1. loaded** (ok, 9 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 852 MB (2, largest 616 MB)<br>panel "Plan A"<br>events: installed |
| <img src="keyboard-at-half/02-search-tab-at-half.jpg" width="220"> | **2. Search tab at half** (ok, 13 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":498}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 996 MB (2, largest 759 MB)<br>focus button#base-ui-_r_u_[aria-label="Raise the panel"] at y 330–354<br>panel "Search" |
| <img src="keyboard-at-half/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 13 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 991 MB (2, largest 755 MB)<br>focus input#base-ui-_r_2b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 14 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 991 MB (2, largest 755 MB)<br>focus input#base-ui-_r_2b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 15 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 991 MB (2, largest 754 MB)<br>focus input#base-ui-_r_2b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 16 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 968 MB (2, largest 751 MB)<br>focus input#base-ui-_r_2b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 18 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1014 MB (2, largest 798 MB)<br>focus input#base-ui-_r_2b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 19 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":378},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1019 MB (2, largest 802 MB)<br>focus input#base-ui-_r_2b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 21 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1018 MB (2, largest 802 MB)<br>panel "Search" |
| <img src="keyboard-at-half/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 23 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":302}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1103 MB (2, largest 887 MB)<br>focus section[aria-label="CMSC132"] at y 402–610<br>panel "Object-Oriented Programming II" |

<a id="keyboard-at-full"></a>

## Search with the on-screen keyboard from full: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-full` · [recording](keyboard-at-full/video.webm)

| Screen | Step |
|---|---|
| <img src="keyboard-at-full/01-loaded.jpg" width="220"> | **1. loaded** (ok, 3 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 879 MB (2, largest 623 MB)<br>panel "Plan A"<br>events: installed |
| <img src="keyboard-at-full/02-search-tab-at-full.jpg" width="220"> | **2. Search tab at full** (ok, 4 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1012 MB (2, largest 755 MB)<br>focus button#base-ui-_r_1h_ at y 73–116<br>panel "Search" |
| <img src="keyboard-at-full/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 5 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":155}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1012 MB (2, largest 755 MB)<br>focus input#base-ui-_r_2c_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 6 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1011 MB (2, largest 754 MB)<br>focus input#base-ui-_r_2c_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 7 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1011 MB (2, largest 755 MB)<br>focus input#base-ui-_r_2c_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 8 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1011 MB (2, largest 755 MB)<br>focus input#base-ui-_r_2c_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 10 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1058 MB (2, largest 801 MB)<br>focus input#base-ui-_r_2c_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 11 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":378},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1026 MB (2, largest 800 MB)<br>focus input#base-ui-_r_2c_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 12 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1026 MB (2, largest 800 MB)<br>panel "Search" |
| <img src="keyboard-at-full/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 14 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":302}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1111 MB (2, largest 885 MB)<br>focus section[aria-label="CMSC132"] at y 402–610<br>panel "Object-Oriented Programming II" |

<a id="keyboard-at-peek"></a>

## Search with the on-screen keyboard from peek: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-peek` · [recording](keyboard-at-peek/video.webm)

| Screen | Step |
|---|---|
| <img src="keyboard-at-peek/01-loaded.jpg" width="220"> | **1. loaded** (ok, 3 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 833 MB (2, largest 602 MB)<br>panel "Plan A"<br>events: installed |
| <img src="keyboard-at-peek/02-search-tab-at-peek.jpg" width="220"> | **2. Search tab at peek** (ok, 5 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>page processes 973 MB (2, largest 742 MB)<br>focus button#base-ui-_r_m_[aria-label="Raise the panel"] at y 486–510<br>panel "Search" |
| <img src="keyboard-at-peek/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 6 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":592}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 969 MB (2, largest 738 MB)<br>focus input#base-ui-_r_2b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 7 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 968 MB (2, largest 737 MB)<br>focus input#base-ui-_r_2b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 8 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 968 MB (2, largest 737 MB)<br>focus input#base-ui-_r_2b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 9 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 967 MB (2, largest 737 MB)<br>focus input#base-ui-_r_2b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 11 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 989 MB (2, largest 775 MB)<br>focus input#base-ui-_r_2b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 12 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":378},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 986 MB (2, largest 772 MB)<br>focus input#base-ui-_r_2b_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 13 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 986 MB (2, largest 772 MB)<br>panel "Search" |
| <img src="keyboard-at-peek/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 15 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":302}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1089 MB (2, largest 875 MB)<br>focus section[aria-label="CMSC132"] at y 402–610<br>panel "Object-Oriented Programming II" |

<a id="first-load"></a>

## First load

`first-load` · [recording](first-load/video.webm)

| Screen | Step |
|---|---|
| <img src="first-load/01-shell-up.jpg" width="220"> | **1. shell up** (ok, 1 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 348.1, inside 611px<br>page processes 815 MB (2, largest 564 MB)<br>panel "Plan A"<br>events: installed |
| <img src="first-load/02-settled.jpg" width="220"> | **2. settled** (ok, 5 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 866 MB (2, largest 614 MB)<br>panel "Plan A" |

<a id="tabs"></a>

## Tap each drawer tab, then the open one again

`tabs` · [recording](tabs/video.webm)

| Screen | Step |
|---|---|
| <img src="tabs/01-search-tab.jpg" width="220"> | **1. Search tab** (ok, 4 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1006 MB (2, largest 752 MB)<br>focus button#base-ui-_r_11_ at y 73–116<br>panel "Search"<br>events: installed |
| <img src="tabs/02-problems-tab.jpg" width="220"> | **2. Problems tab** (ok, 5 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Problems\"","at":{"x":142,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1042 MB (2, largest 788 MB)<br>focus button#base-ui-_r_14_ at y 73–116<br>panel "Problems" |
| <img src="tabs/03-travel-tab.jpg" width="220"> | **3. Travel tab** (ok, 8 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Travel\"","at":{"x":197,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1071 MB (2, largest 818 MB)<br>focus button#base-ui-_r_17_ at y 73–116<br>panel "Travel" |
| <img src="tabs/04-blocks-tab.jpg" width="220"> | **4. Blocks tab** (ok, 9 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Blocks\"","at":{"x":252,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1107 MB (2, largest 853 MB)<br>focus button#base-ui-_r_1a_ at y 73–116<br>panel "Blocks" |
| <img src="tabs/05-generate-tab.jpg" width="220"> | **5. Generate tab** (ok, 10 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Generate\"","at":{"x":307,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1117 MB (2, largest 892 MB)<br>focus button#base-ui-_r_1d_ at y 73–116<br>panel "Generate" |
| <img src="tabs/06-register-tab.jpg" width="220"> | **6. Register tab** (ok, 12 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Register\"","at":{"x":362,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1156 MB (2, largest 931 MB)<br>focus button#base-ui-_r_1g_ at y 73–116<br>panel "Register" |
| <img src="tabs/07-courses-tab.jpg" width="220"> | **7. Courses tab** (ok, 13 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1190 MB (2, largest 965 MB)<br>focus button#base-ui-_r_u_ at y 73–116<br>panel "Plan A" |
| <img src="tabs/08-tapped-the-open-tab.jpg" width="220"> | **8. tapped the open tab** (ok, 14 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":95}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>page processes 1194 MB (2, largest 968 MB)<br>focus button#base-ui-_r_u_ at y 510–553<br>panel "Plan A" |

<a id="grabber-drag"></a>

## Drag the grabber peek → half → full → peek

`grabber-drag`

Skipped on this engine: Playwright can't send WebKit a touch drag, and Base UI's drawer takes no mouse drag that starts on a button (the grabber).

<a id="pull-lists"></a>

## Pull down on a list at its top, at each snap

`pull-lists` · [recording](pull-lists/video.webm)

| Screen | Step |
|---|---|
| <img src="pull-lists/01-results-at-full.jpg" width="220"> | **1. results at full** (ok, 7 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":155}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1037 MB (2, largest 784 MB)<br>panel "Search"<br>events: installed |
| <img src="pull-lists/02-pulled-down-at-full.jpg" width="220"> | **2. pulled down at full** (ok, 10 s)<br>after: swipe {"from":null,"start":{"x":197,"y":270},"end":{"x":197,"y":570},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1024 MB (2, largest 798 MB)<br>focus div#search-result-0 at y 250–322<br>panel "Search" |
| <img src="pull-lists/03-results-at-half.jpg" width="220"> | **3. results at half** (ok, 12 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":498}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1024 MB (2, largest 800 MB)<br>focus button#base-ui-_r_i_[aria-label="Raise the panel"] at y 330–354<br>panel "Search" |
| <img src="pull-lists/04-pulled-down-at-half.jpg" width="220"> | **4. pulled down at half** (ok, 15 s)<br>after: swipe {"from":null,"start":{"x":197,"y":551},"end":{"x":197,"y":851},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1024 MB (2, largest 800 MB)<br>focus div#search-result-0 at y 531–603<br>panel "Search" |
| <img src="pull-lists/05-results-at-peek.jpg" width="220"> | **5. results at peek** (ok, 17 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>page processes 1030 MB (2, largest 806 MB)<br>focus button#base-ui-_r_i_[aria-label="Raise the panel"] at y 486–510<br>panel "Search" |
| <img src="pull-lists/06-pulled-down-at-peek.jpg" width="220"> | **6. pulled down at peek** (ok, 20 s)<br>after: swipe {"from":null,"start":{"x":197,"y":518},"end":{"x":197,"y":818},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>page processes 1028 MB (2, largest 804 MB)<br>focus button#base-ui-_r_u_ at y 510–553<br>panel "Search" |
| <img src="pull-lists/07-pulled-down-on-courses-at-half.jpg" width="220"> | **7. pulled down on Courses at half** (ok, 24 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":532}}<br>after: swipe {"from":null,"start":{"x":197,"y":469},"end":{"x":197,"y":769},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1066 MB (2, largest 842 MB)<br>focus section at y 402–610<br>panel "Plan A" |

<a id="scroll-list-back"></a>

## Scroll a long list down, then back up: the drawer stays

`scroll-list-back` · [recording](scroll-list-back/video.webm)

| Screen | Step |
|---|---|
| <img src="scroll-list-back/01-scrolled-down.jpg" width="220"> | **1. scrolled down** (ok, 8 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":155}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>after: swipe {"from":null,"start":{"x":197,"y":558},"end":{"x":197,"y":208},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1019 MB (2, largest 766 MB)<br>panel "Search"<br>events: installed |
| <img src="scroll-list-back/02-scrolled-back-up.jpg" width="220"> | **2. scrolled back up** (ok, 9 s)<br>after: swipe {"from":null,"start":{"x":197,"y":373},"end":{"x":197,"y":623},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1019 MB (2, largest 766 MB)<br>panel "Search" |

<a id="calendar-pull"></a>

## Scroll the calendar, then pull down at its top

`calendar-pull` · [recording](calendar-pull/video.webm)

| Screen | Step |
|---|---|
| <img src="calendar-pull/01-scrolled-the-calendar-down.jpg" width="220"> | **1. scrolled the calendar down** (ok, 5 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>after: swipe {"from":null,"start":{"x":197,"y":310},"end":{"x":197,"y":60},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>page processes 854 MB (2, largest 622 MB)<br>focus button#base-ui-_r_p_[aria-label="Raise the panel"] at y 486–510<br>panel "Plan A"<br>events: installed |
| <img src="calendar-pull/02-pulled-down-at-the-top.jpg" width="220"> | **2. pulled down at the top** (ok, 8 s)<br>after: swipe {"from":null,"start":{"x":197,"y":114},"end":{"x":197,"y":464},"ms":500,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":114},"end":{"x":197,"y":464},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>page processes 854 MB (2, largest 622 MB)<br>focus button#base-ui-_r_p_[aria-label="Raise the panel"] at y 486–510<br>panel "Plan A" |

<a id="rotate"></a>

## Rotate to landscape and back

`rotate` · [recording](rotate/video.webm)

| Screen | Step |
|---|---|
| <img src="rotate/01-portrait.jpg" width="220"> | **1. portrait** (ok, 3 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 844 MB (2, largest 590 MB)<br>panel "Plan A"<br>events: installed |
| <img src="rotate/02-landscape.jpg" width="220"> | **2. landscape** (ok, 6 s)<br>after: rotate {"orientation":"landscape"}<br>viewport 659×393, visual 393 tall at 0, scrollY 0<br>drawer full, top 48, inside 345px<br>page processes 916 MB (2, largest 662 MB)<br>panel "Plan A"<br>events: orientationchange, resize, vv-resize |
| <img src="rotate/03-landscape-half.jpg" width="220"> | **3. landscape, half** (ok, 8 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":330,"y":61}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":330,"y":232}}<br>viewport 659×393, visual 393 tall at 0, scrollY 0<br>drawer half, top 48, inside 295px<br>page processes 930 MB (2, largest 676 MB)<br>focus button#base-ui-_r_t_[aria-label="Raise the panel"] at y 49–73<br>panel "Plan A" |
| <img src="rotate/04-portrait-again.jpg" width="220"> | **4. portrait again** (ok, 10 s)<br>after: rotate {"orientation":"portrait"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 963 MB (2, largest 710 MB)<br>focus button#base-ui-_r_t_[aria-label="Raise the panel"] at y 330–354<br>panel "Plan A"<br>events: orientationchange, resize, vv-resize |

<a id="url-bar"></a>

## Scroll to collapse and expand the browser's toolbar

`url-bar` · [recording](url-bar/video.webm)

| Screen | Step |
|---|---|
| <img src="url-bar/01-start.jpg" width="220"> | **1. start** (ok, 4 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>page processes 837 MB (2, largest 606 MB)<br>focus button#base-ui-_r_r_[aria-label="Raise the panel"] at y 486–510<br>panel "Plan A"<br>events: installed |
| <img src="url-bar/02-scrolled-the-calendar-up-toolbar-may-hide.jpg" width="220"> | **2. scrolled the calendar up (toolbar may hide)** (ok, 5 s)<br>after: swipe {"from":null,"start":{"x":197,"y":354},"end":{"x":197,"y":54},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>page processes 835 MB (2, largest 604 MB)<br>focus button#base-ui-_r_r_[aria-label="Raise the panel"] at y 486–510<br>panel "Plan A" |
| <img src="url-bar/03-scrolled-it-back-toolbar-may-show.jpg" width="220"> | **3. scrolled it back (toolbar may show)** (ok, 7 s)<br>after: swipe {"from":null,"start":{"x":197,"y":354},"end":{"x":197,"y":654},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>page processes 835 MB (2, largest 604 MB)<br>focus button#base-ui-_r_r_[aria-label="Raise the panel"] at y 486–510<br>panel "Plan A" |
| <img src="url-bar/04-scrolled-the-results.jpg" width="220"> | **4. scrolled the results** (ok, 13 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":532}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":178},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 961 MB (2, largest 749 MB)<br>panel "Search" |
| <img src="url-bar/05-scrolled-them-back.jpg" width="220"> | **5. scrolled them back** (ok, 14 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":978},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 960 MB (2, largest 748 MB)<br>panel "Search" |

<a id="long-course"></a>

## A long course (ENGL101, 90+ sections) scrolled to the bottom

`long-course` · [recording](long-course/video.webm)

| Screen | Step |
|---|---|
| <img src="long-course/01-engl101.jpg" width="220"> | **1. ENGL101** (ok, 10 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":155}}<br>after: type {"text":"engl101"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"ENGL101\"]","at":{"x":197,"y":286}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1178 MB (2, largest 925 MB)<br>focus section[aria-label="ENGL101"] at y 402–610<br>panel "Academic Writing"<br>events: installed |
| <img src="long-course/02-engl101-at-full.jpg" width="220"> | **2. ENGL101 at full** (ok, 12 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1163 MB (2, largest 938 MB)<br>focus button#base-ui-_r_q_[aria-label="Lower the panel"] at y 49–73<br>panel "Academic Writing" |
| <img src="long-course/03-scrolled-to-the-bottom.jpg" width="220"> | **3. scrolled to the bottom** (ok, 19 s)<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1179 MB (2, largest 954 MB)<br>focus button#base-ui-_r_q_[aria-label="Lower the panel"] at y 49–73<br>panel "Academic Writing" |

<a id="open-results"></a>

## Search, scroll, put the keyboard away and open a result, six times

`open-results` · [recording](open-results/video.webm)

| Screen | Step |
|---|---|
| <img src="open-results/01-opened-a-result-1.jpg" width="220"> | **1. opened a result (1)** (ok, 10 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":155}}<br>after: type {"text":"cmsc"}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1100 MB (2, largest 876 MB)<br>focus section[aria-label="CMSC131"] at y 402–610<br>panel "Object-Oriented Programming I"<br>events: installed |
| <img src="open-results/02-opened-a-result-2.jpg" width="220"> | **2. opened a result (2)** (ok, 17 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1208 MB (2, largest 984 MB)<br>focus section[aria-label="CMSC131"] at y 402–610<br>panel "Object-Oriented Programming I" |
| <img src="open-results/03-opened-a-result-3.jpg" width="220"> | **3. opened a result (3)** (ok, 23 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1307 MB (2, largest 1082 MB)<br>focus section[aria-label="CMSC131"] at y 402–610<br>panel "Object-Oriented Programming I" |
| <img src="open-results/04-opened-a-result-4.jpg" width="220"> | **4. opened a result (4)** (ok, 29 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1402 MB (2, largest 1177 MB)<br>focus section[aria-label="CMSC131"] at y 402–610<br>panel "Object-Oriented Programming I" |
| <img src="open-results/05-opened-a-result-5.jpg" width="220"> | **5. opened a result (5)** (ok, 36 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1433 MB (2, largest 1208 MB)<br>focus section[aria-label="CMSC131"] at y 402–610<br>panel "Object-Oriented Programming I" |
| <img src="open-results/06-opened-a-result-6.jpg" width="220"> | **6. opened a result (6)** (ok, 42 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":38,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":418},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":270}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1508 MB (2, largest 1283 MB)<br>focus section[aria-label="CMSC131"] at y 402–610<br>panel "Object-Oriented Programming I" |

<a id="add-sections"></a>

## Add a section from course details, then switch it three times

`add-sections` · [recording](add-sections/video.webm)

| Screen | Step |
|---|---|
| <img src="add-sections/01-tapped-add-0101.jpg" width="220"> | **1. tapped Add 0101** (warn, 12 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":155}}<br>after: type {"text":"cmsc131"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"CMSC131\"]","at":{"x":197,"y":286}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Add 0101\"","at":{"x":355,"y":571}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1092 MB (2, largest 879 MB)<br>focus button#base-ui-_r_7h_[aria-label="Remove 0101 from Plan A"] at y 549–593<br>panel "Object-Oriented Programming I"<br>events: installed<br>**warn drawer-moves-one-way**: 2 reversal(s) over 26 frames (48–466) |
| <img src="add-sections/02-tapped-switch-to-0103.jpg" width="220"> | **2. tapped Switch to 0103** (ok, 15 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0103\"","at":{"x":355,"y":531}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1099 MB (2, largest 886 MB)<br>focus button#base-ui-_r_83_[aria-label="Remove 0103 from Plan A"] at y 509–553<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/03-tapped-switch-to-0101.jpg" width="220"> | **3. tapped Switch to 0101** (ok, 17 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0101\"","at":{"x":355,"y":385}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1095 MB (2, largest 882 MB)<br>focus button#base-ui-_r_7h_[aria-label="Remove 0101 from Plan A"] at y 363–407<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/04-tapped-switch-to-0103.jpg" width="220"> | **4. tapped Switch to 0103** (ok, 19 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0103\"","at":{"x":355,"y":531}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>page processes 1106 MB (2, largest 892 MB)<br>focus button#base-ui-_r_83_[aria-label="Remove 0103 from Plan A"] at y 509–553<br>panel "Object-Oriented Programming I" |

<a id="swipe-back"></a>

## Open a course, then swipe back from the screen's left edge: the page moves once

`swipe-back` · [recording](swipe-back/video.webm)

| Screen | Step |
|---|---|
| <img src="swipe-back/01-cmsc131-open.jpg" width="220"> | **1. CMSC131 open** (ok, 10 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":155}}<br>after: type {"text":"cmsc131"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"CMSC131\"]","at":{"x":197,"y":286}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1112 MB (2, largest 859 MB)<br>focus section[aria-label="CMSC131"] at y 402–610<br>panel "Object-Oriented Programming I"<br>events: installed |
| <img src="swipe-back/02-swiping-back-100-ms.jpg" width="220"> | **2. swiping back (+100 ms)** (ok, 10 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1175 MB (2, largest 951 MB)<br>focus div#search-result-0 at y 531–603<br>panel "Search" |
| <img src="swipe-back/03-swiping-back-250-ms.jpg" width="220"> | **3. swiping back (+250 ms)** (ok, 12 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1174 MB (2, largest 950 MB)<br>focus div#search-result-0 at y 531–603<br>panel "Search" |
| <img src="swipe-back/04-swiped-back.jpg" width="220"> | **4. swiped back** (ok, 14 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>page processes 1173 MB (2, largest 948 MB)<br>focus div#search-result-0 at y 531–603<br>panel "Search" |
