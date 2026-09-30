# Mobile lab: ios

**Passed**: 0 failed check(s), 3 warning(s), 0 error(s).

- URL: https://terpsicle.com/schedule
- Device: iPhone 16 Simulator, iOS 18.5, Safari (XCUITest touches, software keyboard)
- Started: 2026-09-29T14:55:11.021Z, took 1168 s
- Workflow run: https://github.com/zsrobinson/terpsicle/actions/runs/36586042700
- Every step's full probe (viewport, drawer, focus, events, per-frame trace) is in `summary.json`.

| Scenario | Result | Steps | Time | Recording |
|---|---|---|---|---|
| [Search with the on-screen keyboard from half: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-half) | ok | 10 | 146 s | [video](keyboard-at-half/video.mp4) |
| [Search with the on-screen keyboard from full: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-full) | ok | 10 | 47 s | [video](keyboard-at-full/video.mp4) |
| [Search with the on-screen keyboard from peek: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-peek) | ok | 10 | 54 s | [video](keyboard-at-peek/video.mp4) |
| [First load](#first-load) | ok | 2 | 11 s | [video](first-load/video.mp4) |
| [Tap each drawer tab, then the open one again](#tabs) | ok | 8 | 37 s | [video](tabs/video.mp4) |
| [Drag the grabber peek → half → full → peek](#grabber-drag) | ok | 4 | 28 s | [video](grabber-drag/video.mp4) |
| [Pull down on a list at its top, at each snap](#pull-lists) | warn | 7 | 67 s | [video](pull-lists/video.mp4) |
| [Scroll a long list down, then back up: the drawer stays](#scroll-list-back) | ok | 2 | 41 s | [video](scroll-list-back/video.mp4) |
| [Scroll the calendar, then pull down at its top](#calendar-pull) | ok | 2 | 34 s | [video](calendar-pull/video.mp4) |
| [Rotate to landscape and back](#rotate) | ok | 3 | 34 s | [video](rotate/video.mp4) |
| [Scroll to collapse and expand the browser's toolbar](#url-bar) | ok | 5 | 56 s | [video](url-bar/video.mp4) |
| [A long course (ENGL101, 90+ sections) scrolled to the bottom](#long-course) | warn | 3 | 81 s | [video](long-course/video.mp4) |
| [Search, scroll, put the keyboard away and open a result, six times](#open-results) | ok | 6 | 143 s | [video](open-results/video.mp4) |
| [Add a section from course details, then switch it three times](#add-sections) | warn | 4 | 75 s | [video](add-sections/video.mp4) |

<a id="keyboard-at-half"></a>

## Search with the on-screen keyboard from half: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-half` · [recording](keyboard-at-half/video.mp4)

| Screen | Step |
|---|---|
| <img src="keyboard-at-half/01-loaded.jpg" width="220"> | **1. loaded** (ok, 31 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 471 MB (3, largest 245 MB)<br>panel "Plan A"<br>events: installed |
| <img src="keyboard-at-half/02-search-tab-at-half.jpg" width="220"> | **2. Search tab at half** (ok, 54 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":498}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 440 MB (3, largest 274 MB)<br>focus div#_r_o_ at y 329–940<br>panel "Search" |
| <img src="keyboard-at-half/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 82 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 392 MB (3, largest 239 MB)<br>focus input#base-ui-_r_2g_[aria-label="Search courses"] at y 134–176<br>panel "Search"<br>events: vv-resize |
| <img src="keyboard-at-half/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 95 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 391 MB (3, largest 237 MB)<br>focus input#base-ui-_r_2g_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 101 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 388 MB (3, largest 235 MB)<br>focus input#base-ui-_r_2g_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 106 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 388 MB (3, largest 235 MB)<br>focus input#base-ui-_r_2g_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 119 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 463 MB (3, largest 315 MB)<br>focus input#base-ui-_r_2g_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 126 s)<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":199},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 495 MB (3, largest 347 MB)<br>focus input#base-ui-_r_2g_[aria-label="Search courses"] at y 134–176<br>panel "Search"<br>events: pointercancel |
| <img src="keyboard-at-half/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 132 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 459 MB (3, largest 314 MB)<br>panel "Search"<br>events: vv-resize |
| <img src="keyboard-at-half/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 137 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":320}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 506 MB (3, largest 355 MB)<br>focus section[aria-label="CMSC250"] at y 402–610<br>panel "Discrete Structures" |

<a id="keyboard-at-full"></a>

## Search with the on-screen keyboard from full: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-full` · [recording](keyboard-at-full/video.mp4)

| Screen | Step |
|---|---|
| <img src="keyboard-at-full/01-loaded.jpg" width="220"> | **1. loaded** (ok, 6 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 568 MB (3, largest 419 MB)<br>panel "Discrete Structures"<br>events: installed |
| <img src="keyboard-at-full/02-search-tab-at-full.jpg" width="220"> | **2. Search tab at full** (ok, 12 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 515 MB (3, largest 371 MB)<br>focus div#_r_h_ at y 48–659<br>panel "Search" |
| <img src="keyboard-at-full/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 15 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":155}}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 534 MB (3, largest 398 MB)<br>focus input#base-ui-_r_51_[aria-label="Search courses"] at y 134–176<br>panel "Search"<br>events: vv-resize |
| <img src="keyboard-at-full/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 17 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 549 MB (3, largest 413 MB)<br>focus input#base-ui-_r_51_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 19 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 549 MB (3, largest 413 MB)<br>focus input#base-ui-_r_51_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 21 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 536 MB (3, largest 402 MB)<br>focus input#base-ui-_r_51_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 27 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 611 MB (3, largest 478 MB)<br>focus input#base-ui-_r_51_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 31 s)<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":199},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 583 MB (3, largest 455 MB)<br>focus input#base-ui-_r_51_[aria-label="Search courses"] at y 134–176<br>panel "Search"<br>events: pointercancel |
| <img src="keyboard-at-full/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 35 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 493 MB (3, largest 377 MB)<br>panel "Search"<br>events: vv-resize |
| <img src="keyboard-at-full/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 39 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":312}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 545 MB (3, largest 429 MB)<br>focus section[aria-label="CMSC132"] at y 402–610<br>panel "Object-Oriented Programming II" |

<a id="keyboard-at-peek"></a>

## Search with the on-screen keyboard from peek: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-peek` · [recording](keyboard-at-peek/video.mp4)

| Screen | Step |
|---|---|
| <img src="keyboard-at-peek/01-loaded.jpg" width="220"> | **1. loaded** (ok, 6 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 615 MB (3, largest 503 MB)<br>panel "Object-Oriented Programming II"<br>events: installed |
| <img src="keyboard-at-peek/02-search-tab-at-peek.jpg" width="220"> | **2. Search tab at peek** (ok, 14 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>keyboard down<br>page processes 610 MB (3, largest 508 MB)<br>focus div#_r_k_ at y 485–1096<br>panel "Search" |
| <img src="keyboard-at-peek/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 18 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":592}}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 540 MB (3, largest 451 MB)<br>focus input#base-ui-_r_55_[aria-label="Search courses"] at y 134–176<br>panel "Search"<br>events: vv-resize |
| <img src="keyboard-at-peek/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 21 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 318 MB (3, largest 234 MB)<br>focus input#base-ui-_r_55_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 24 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 273 MB (3, largest 190 MB)<br>focus input#base-ui-_r_55_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 27 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 242 MB (3, largest 158 MB)<br>focus input#base-ui-_r_55_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 35 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 611 MB (3, largest 544 MB)<br>focus input#base-ui-_r_55_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 40 s)<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":199},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 625 MB (3, largest 553 MB)<br>focus input#base-ui-_r_55_[aria-label="Search courses"] at y 134–176<br>panel "Search"<br>events: pointercancel |
| <img src="keyboard-at-peek/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 43 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 528 MB (3, largest 456 MB)<br>panel "Search"<br>events: vv-resize |
| <img src="keyboard-at-peek/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 46 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":320}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 573 MB (3, largest 503 MB)<br>focus section[aria-label="CMSC250"] at y 402–610<br>panel "Discrete Structures" |

<a id="first-load"></a>

## First load

`first-load` · [recording](first-load/video.mp4)

| Screen | Step |
|---|---|
| <img src="first-load/01-shell-up.jpg" width="220"> | **1. shell up** (ok, 3 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 690 MB (3, largest 612 MB)<br>panel "Discrete Structures"<br>events: installed |
| <img src="first-load/02-settled.jpg" width="220"> | **2. settled** (ok, 8 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 691 MB (3, largest 613 MB)<br>panel "Discrete Structures" |

<a id="tabs"></a>

## Tap each drawer tab, then the open one again

`tabs` · [recording](tabs/video.mp4)

| Screen | Step |
|---|---|
| <img src="tabs/01-search-tab.jpg" width="220"> | **1. Search tab** (ok, 8 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 630 MB (3, largest 556 MB)<br>focus div#_r_k_ at y 329–940<br>panel "Search"<br>events: installed |
| <img src="tabs/02-problems-tab.jpg" width="220"> | **2. Problems tab** (ok, 11 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Problems\"","at":{"x":142,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 803 MB (3, largest 728 MB)<br>focus div#_r_k_ at y 329–940<br>panel "Problems" |
| <img src="tabs/03-travel-tab.jpg" width="220"> | **3. Travel tab** (ok, 15 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Travel\"","at":{"x":197,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 791 MB (3, largest 717 MB)<br>focus div#_r_k_ at y 329–940<br>panel "Travel" |
| <img src="tabs/04-blocks-tab.jpg" width="220"> | **4. Blocks tab** (ok, 19 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Blocks\"","at":{"x":252,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 612 MB (3, largest 537 MB)<br>focus div#_r_k_ at y 329–940<br>panel "Blocks" |
| <img src="tabs/05-generate-tab.jpg" width="220"> | **5. Generate tab** (ok, 21 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Generate\"","at":{"x":307,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 642 MB (3, largest 568 MB)<br>focus div#_r_k_ at y 329–940<br>panel "Generate" |
| <img src="tabs/06-register-tab.jpg" width="220"> | **6. Register tab** (ok, 24 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Register\"","at":{"x":362,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 660 MB (3, largest 586 MB)<br>focus div#_r_k_ at y 329–940<br>panel "Register" |
| <img src="tabs/07-courses-tab.jpg" width="220"> | **7. Courses tab** (ok, 28 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 671 MB (3, largest 596 MB)<br>focus div#_r_k_ at y 329–940<br>panel "Plan A" |
| <img src="tabs/08-tapped-the-open-tab.jpg" width="220"> | **8. tapped the open tab** (ok, 31 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>keyboard down<br>page processes 666 MB (3, largest 592 MB)<br>focus div#_r_k_ at y 485–1096<br>panel "Plan A" |

<a id="grabber-drag"></a>

## Drag the grabber peek → half → full → peek

`grabber-drag` · [recording](grabber-drag/video.mp4)

| Screen | Step |
|---|---|
| <img src="grabber-drag/01-peek.jpg" width="220"> | **1. peek** (ok, 8 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>keyboard down<br>page processes 566 MB (3, largest 485 MB)<br>focus div#_r_k_ at y 485–1096<br>panel "Plan A"<br>events: installed |
| <img src="grabber-drag/02-dragged-to-half.jpg" width="220"> | **2. dragged to half** (ok, 14 s)<br>after: swipe {"from":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","start":{"x":197,"y":498},"end":{"x":197,"y":342},"ms":900,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 663 MB (3, largest 580 MB)<br>focus div#_r_k_ at y 329–940<br>panel "Plan A" |
| <img src="grabber-drag/03-dragged-to-full.jpg" width="220"> | **3. dragged to full** (ok, 19 s)<br>after: swipe {"from":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","start":{"x":197,"y":342},"end":{"x":197,"y":61},"ms":900,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 521 MB (3, largest 437 MB)<br>focus div#_r_k_ at y 48–659<br>panel "Plan A" |
| <img src="grabber-drag/04-dragged-to-peek.jpg" width="220"> | **4. dragged to peek** (ok, 23 s)<br>after: swipe {"from":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","start":{"x":197,"y":61},"end":{"x":197,"y":498},"ms":900,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>keyboard down<br>page processes 435 MB (3, largest 349 MB)<br>focus div#_r_k_ at y 485–1096<br>panel "Plan A" |

<a id="pull-lists"></a>

## Pull down on a list at its top, at each snap

`pull-lists` · [recording](pull-lists/video.mp4)

| Screen | Step |
|---|---|
| <img src="pull-lists/01-results-at-full.jpg" width="220"> | **1. results at full** (ok, 22 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":155}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 370 MB (3, largest 285 MB)<br>panel "Search"<br>events: installed, vv-resize ×2 |
| <img src="pull-lists/02-pulled-down-at-full.jpg" width="220"> | **2. pulled down at full** (ok, 31 s)<br>after: swipe {"from":null,"start":{"x":197,"y":270},"end":{"x":197,"y":570},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 411 MB (3, largest 329 MB)<br>panel "Search" |
| <img src="pull-lists/03-results-at-half.jpg" width="220"> | **3. results at half** (ok, 34 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 407 MB (3, largest 329 MB)<br>panel "Search" |
| <img src="pull-lists/04-pulled-down-at-half.jpg" width="220"> | **4. pulled down at half** (ok, 39 s)<br>after: swipe {"from":null,"start":{"x":197,"y":551},"end":{"x":197,"y":851},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>keyboard down<br>page processes 407 MB (3, largest 333 MB)<br>panel "Search" |
| <img src="pull-lists/05-results-at-peek.jpg" width="220"> | **5. results at peek** (ok, 42 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>keyboard down<br>page processes 714 MB (3, largest 642 MB)<br>panel "Search" |
| <img src="pull-lists/06-pulled-down-at-peek.jpg" width="220"> | **6. pulled down at peek** (ok, 48 s)<br>after: swipe {"from":null,"start":{"x":197,"y":518},"end":{"x":197,"y":818},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>keyboard down<br>page processes 718 MB (3, largest 646 MB)<br>panel "Search" |
| <img src="pull-lists/07-pulled-down-on-courses-at-half.jpg" width="220"> | **7. pulled down on Courses at half** (warn, 57 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":532}}<br>after: swipe {"from":null,"start":{"x":197,"y":469},"end":{"x":197,"y":769},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>keyboard down<br>page processes 666 MB (3, largest 590 MB)<br>focus div#_r_k_ at y 485–1096<br>panel "Plan A"<br>**warn drawer-moves-one-way**: 2 reversal(s) over 69 frames (329–629) |

<a id="scroll-list-back"></a>

## Scroll a long list down, then back up: the drawer stays

`scroll-list-back` · [recording](scroll-list-back/video.mp4)

| Screen | Step |
|---|---|
| <img src="scroll-list-back/01-scrolled-down.jpg" width="220"> | **1. scrolled down** (ok, 25 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":95}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":155}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>after: swipe {"from":null,"start":{"x":197,"y":558},"end":{"x":197,"y":208},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 619 MB (3, largest 552 MB)<br>panel "Search"<br>events: installed, vv-resize ×2, pointercancel |
| <img src="scroll-list-back/02-scrolled-back-up.jpg" width="220"> | **2. scrolled back up** (ok, 33 s)<br>after: swipe {"from":null,"start":{"x":197,"y":373},"end":{"x":197,"y":623},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 447 MB (3, largest 381 MB)<br>panel "Search"<br>events: pointercancel |

<a id="calendar-pull"></a>

## Scroll the calendar, then pull down at its top

`calendar-pull` · [recording](calendar-pull/video.mp4)

| Screen | Step |
|---|---|
| <img src="calendar-pull/01-scrolled-the-calendar-down.jpg" width="220"> | **1. scrolled the calendar down** (ok, 17 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>after: swipe {"from":null,"start":{"x":197,"y":310},"end":{"x":197,"y":60},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>keyboard down<br>page processes 554 MB (3, largest 481 MB)<br>focus div#_r_k_ at y 485–1096<br>panel "Search"<br>events: installed |
| <img src="calendar-pull/02-pulled-down-at-the-top.jpg" width="220"> | **2. pulled down at the top** (ok, 25 s)<br>after: swipe {"from":null,"start":{"x":197,"y":114},"end":{"x":197,"y":464},"ms":500,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":114},"end":{"x":197,"y":464},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>keyboard down<br>page processes 292 MB (3, largest 226 MB)<br>focus div#_r_k_ at y 485–1096<br>panel "Search" |

<a id="rotate"></a>

## Rotate to landscape and back

`rotate` · [recording](rotate/video.mp4)

| Screen | Step |
|---|---|
| <img src="rotate/01-portrait.jpg" width="220"> | **1. portrait** (ok, 11 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 863 MB (3, largest 796 MB)<br>panel "Search"<br>events: installed |
| <img src="rotate/02-landscape.jpg" width="220"> | **2. landscape** (ok, 21 s)<br>after: rotate {"orientation":"landscape"}<br>viewport 852×343, visual 343 tall at 0, scrollY 0<br>keyboard down<br>page processes 542 MB (3, largest 484 MB)<br>panel "Search"<br>events: orientationchange, resize, vv-resize |
| <img src="rotate/03-portrait-again.jpg" width="220"> | **3. portrait again** (ok, 28 s)<br>after: rotate {"orientation":"portrait"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 398 MB (3, largest 339 MB)<br>panel "Search"<br>events: orientationchange, resize, vv-resize |

<a id="url-bar"></a>

## Scroll to collapse and expand the browser's toolbar

`url-bar` · [recording](url-bar/video.mp4)

| Screen | Step |
|---|---|
| <img src="url-bar/01-start.jpg" width="220"> | **1. start** (ok, 13 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>keyboard down<br>page processes 619 MB (3, largest 559 MB)<br>focus div#_r_k_ at y 485–1096<br>panel "Search"<br>events: installed |
| <img src="url-bar/02-scrolled-the-calendar-up-toolbar-may-hide.jpg" width="220"> | **2. scrolled the calendar up (toolbar may hide)** (ok, 18 s)<br>after: swipe {"from":null,"start":{"x":197,"y":354},"end":{"x":197,"y":54},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>keyboard down<br>page processes 392 MB (3, largest 330 MB)<br>focus div#_r_k_ at y 485–1096<br>panel "Search" |
| <img src="url-bar/03-scrolled-it-back-toolbar-may-show.jpg" width="220"> | **3. scrolled it back (toolbar may show)** (ok, 23 s)<br>after: swipe {"from":null,"start":{"x":197,"y":354},"end":{"x":197,"y":654},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 485, inside 124px<br>keyboard down<br>page processes 347 MB (3, largest 281 MB)<br>focus div#_r_k_ at y 485–1096<br>panel "Search" |
| <img src="url-bar/04-scrolled-the-results.jpg" width="220"> | **4. scrolled the results** (ok, 41 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":532}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":178},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 599 MB (3, largest 541 MB)<br>panel "Search"<br>events: vv-resize ×2, pointercancel |
| <img src="url-bar/05-scrolled-them-back.jpg" width="220"> | **5. scrolled them back** (ok, 47 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":978},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 616 MB (3, largest 563 MB)<br>panel "Search"<br>events: pointercancel |

<a id="long-course"></a>

## A long course (ENGL101, 90+ sections) scrolled to the bottom

`long-course` · [recording](long-course/video.mp4)

| Screen | Step |
|---|---|
| <img src="long-course/01-engl101.jpg" width="220"> | **1. ENGL101** (warn, 30 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":592}}<br>after: type {"text":"engl101"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"ENGL101\"]","at":{"x":197,"y":286}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 639 MB (3, largest 586 MB)<br>focus section[aria-label="ENGL101"] at y 402–610<br>panel "Academic Writing"<br>events: installed, vv-resize ×2<br>**warn drawer-moves-one-way**: 2 reversal(s) over 25 frames (48–485) |
| <img src="long-course/02-engl101-at-full.jpg" width="220"> | **2. ENGL101 at full** (ok, 36 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 680 MB (3, largest 627 MB)<br>focus div#_r_k_ at y 48–659<br>panel "Academic Writing" |
| <img src="long-course/03-scrolled-to-the-bottom.jpg" width="220"> | **3. scrolled to the bottom** (ok, 66 s)<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 319 MB (3, largest 270 MB)<br>focus div#_r_k_ at y 48–659<br>panel "Academic Writing"<br>events: pointercancel ×6 |

<a id="open-results"></a>

## Search, scroll, put the keyboard away and open a result, six times

`open-results` · [recording](open-results/video.mp4)

| Screen | Step |
|---|---|
| <img src="open-results/01-opened-a-result-1.jpg" width="220"> | **1. opened a result (1)** (ok, 31 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":239},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":273}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 621 MB (3, largest 575 MB)<br>focus section[aria-label="CMSC216"] at y 402–610<br>panel "Introduction to Computer Systems"<br>events: installed, vv-resize ×2, pointercancel |
| <img src="open-results/02-opened-a-result-2.jpg" width="220"> | **2. opened a result (2)** (ok, 49 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":239},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":273}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 652 MB (3, largest 608 MB)<br>focus section[aria-label="CMSC216"] at y 402–610<br>panel "Introduction to Computer Systems"<br>events: vv-resize ×2, pointercancel |
| <img src="open-results/03-opened-a-result-3.jpg" width="220"> | **3. opened a result (3)** (ok, 66 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":239},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":273}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 655 MB (3, largest 610 MB)<br>focus section[aria-label="CMSC216"] at y 402–610<br>panel "Introduction to Computer Systems"<br>events: vv-resize ×2, pointercancel |
| <img src="open-results/04-opened-a-result-4.jpg" width="220"> | **4. opened a result (4)** (ok, 84 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":239},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":262}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 814 MB (3, largest 770 MB)<br>focus section[aria-label="CMSC216"] at y 402–610<br>panel "Introduction to Computer Systems"<br>events: vv-resize ×2, pointercancel |
| <img src="open-results/05-opened-a-result-5.jpg" width="220"> | **5. opened a result (5)** (ok, 100 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":239},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":273}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 672 MB (3, largest 627 MB)<br>focus section[aria-label="CMSC216"] at y 402–610<br>panel "Introduction to Computer Systems"<br>events: vv-resize ×2, pointercancel |
| <img src="open-results/06-opened-a-result-6.jpg" width="220"> | **6. opened a result (6)** (ok, 118 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":239},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":273}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 280px<br>keyboard down<br>page processes 671 MB (3, largest 636 MB)<br>focus section[aria-label="CMSC216"] at y 402–610<br>panel "Introduction to Computer Systems"<br>events: vv-resize ×2, pointercancel |

<a id="add-sections"></a>

## Add a section from course details, then switch it three times

`add-sections` · [recording](add-sections/video.mp4)

| Screen | Step |
|---|---|
| <img src="add-sections/01-tapped-add-0101.jpg" width="220"> | **1. tapped Add 0101** (warn, 45 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":592}}<br>after: type {"text":"cmsc131"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"CMSC131\"]","at":{"x":197,"y":286}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Add 0101\"","at":{"x":355,"y":551}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 743 MB (3, largest 681 MB)<br>focus section[aria-label="CMSC131"] at y 121–660<br>panel "Object-Oriented Programming I"<br>events: installed, vv-resize ×2<br>**warn drawer-moves-one-way**: 3 reversal(s) over 43 frames (48–485) |
| <img src="add-sections/02-tapped-switch-to-0103.jpg" width="220"> | **2. tapped Switch to 0103** (ok, 54 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0103\"","at":{"x":355,"y":523}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 378 MB (3, largest 319 MB)<br>focus section[aria-label="CMSC131"] at y 121–660<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/03-tapped-switch-to-0101.jpg" width="220"> | **3. tapped Switch to 0101** (ok, 61 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0101\"","at":{"x":355,"y":377}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 723 MB (3, largest 659 MB)<br>focus section[aria-label="CMSC131"] at y 121–660<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/04-tapped-switch-to-0103.jpg" width="220"> | **4. tapped Switch to 0103** (ok, 66 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0103\"","at":{"x":355,"y":523}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 536 MB (3, largest 471 MB)<br>focus section[aria-label="CMSC131"] at y 121–660<br>panel "Object-Oriented Programming I" |
