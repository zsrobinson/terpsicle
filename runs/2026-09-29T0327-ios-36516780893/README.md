# Mobile lab: ios

**Failed**: 2 failed check(s), 4 warning(s), 0 error(s).

- URL: https://pr-215-terpsicle.zsrobinson.workers.dev/schedule
- Device: iPhone 16 Simulator, iOS 18.5, Safari (XCUITest touches, software keyboard)
- Started: 2026-09-29T03:27:22.370Z, took 1756 s
- Workflow run: https://github.com/zsrobinson/terpsicle/actions/runs/36516780893
- Every step's full probe (viewport, drawer, focus, events, per-frame trace) is in `summary.json`.

| Scenario | Result | Steps | Time | Recording |
|---|---|---|---|---|
| [Search with the on-screen keyboard from half: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-half) | ok | 10 | 203 s | [video](keyboard-at-half/video.mp4) |
| [Search with the on-screen keyboard from full: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-full) | ok | 10 | 108 s | [video](keyboard-at-full/video.mp4) |
| [Search with the on-screen keyboard from peek: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-peek) | ok | 10 | 91 s | [video](keyboard-at-peek/video.mp4) |
| [First load](#first-load) | ok | 2 | 26 s | [video](first-load/video.mp4) |
| [Tap each drawer tab, then the open one again](#tabs) | ok | 8 | 97 s | [video](tabs/video.mp4) |
| [Drag the grabber peek → half → full → peek](#grabber-drag) | ok | 4 | 56 s | [video](grabber-drag/video.mp4) |
| [Pull down on a list at its top, at each snap](#pull-lists) | warn | 7 | 98 s | [video](pull-lists/video.mp4) |
| [Scroll a long list down, then back up: the drawer stays](#scroll-list-back) | ok | 2 | 41 s | [video](scroll-list-back/video.mp4) |
| [Scroll the calendar, then pull down at its top](#calendar-pull) | ok | 2 | 29 s | [video](calendar-pull/video.mp4) |
| [Rotate to landscape and back](#rotate) | ok | 3 | 29 s | [video](rotate/video.mp4) |
| [Scroll to collapse and expand the browser's toolbar](#url-bar) | ok | 5 | 80 s | [video](url-bar/video.mp4) |
| [A long course (ENGL101, 90+ sections) scrolled to the bottom](#long-course) | warn | 3 | 105 s | [video](long-course/video.mp4) |
| [Search, scroll, put the keyboard away and open a result, six times](#open-results) | FAIL | 6 | 234 s | [video](open-results/video.mp4) |
| [Add a section from course details, then switch it three times](#add-sections) | warn | 4 | 112 s | [video](add-sections/video.mp4) |
| [Open a course, then swipe back from the screen's left edge: the page moves once](#swipe-back) | FAIL | 4 | 81 s | [video](swipe-back/video.mp4) |

<a id="keyboard-at-half"></a>

## Search with the on-screen keyboard from half: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-half` · [recording](keyboard-at-half/video.mp4)

| Screen | Step |
|---|---|
| <img src="keyboard-at-half/01-loaded.jpg" width="220"> | **1. loaded** (ok, 54 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 389 MB (2, largest 265 MB)<br>panel "Plan A"<br>events: installed |
| <img src="keyboard-at-half/02-search-tab-at-half.jpg" width="220"> | **2. Search tab at half** (ok, 84 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 370 MB (2, largest 275 MB)<br>focus div#_r_p_ at y 329–940<br>panel "Search" |
| <img src="keyboard-at-half/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 104 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 322 MB (2, largest 251 MB)<br>focus input#base-ui-_r_32_[aria-label="Search courses"] at y 134–176<br>panel "Search"<br>events: vv-resize |
| <img src="keyboard-at-half/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 119 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 317 MB (2, largest 246 MB)<br>focus input#base-ui-_r_32_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 122 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 291 MB (2, largest 221 MB)<br>focus input#base-ui-_r_32_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 126 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 282 MB (2, largest 211 MB)<br>focus input#base-ui-_r_32_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 137 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 360 MB (2, largest 298 MB)<br>focus input#base-ui-_r_32_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-half/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 161 s)<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":199},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 369 MB (2, largest 308 MB)<br>focus input#base-ui-_r_32_[aria-label="Search courses"] at y 134–176<br>panel "Search"<br>events: pointercancel |
| <img src="keyboard-at-half/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 178 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 281 MB (2, largest 222 MB)<br>panel "Search"<br>events: vv-resize |
| <img src="keyboard-at-half/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 190 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":304}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 410 MB (2, largest 354 MB)<br>focus section[aria-label="CMSC250"] at y 402–660<br>panel "Discrete Structures" |

<a id="keyboard-at-full"></a>

## Search with the on-screen keyboard from full: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-full` · [recording](keyboard-at-full/video.mp4)

| Screen | Step |
|---|---|
| <img src="keyboard-at-full/01-loaded.jpg" width="220"> | **1. loaded** (ok, 6 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 511 MB (2, largest 455 MB)<br>panel "Discrete Structures"<br>events: installed |
| <img src="keyboard-at-full/02-search-tab-at-full.jpg" width="220"> | **2. Search tab at full** (ok, 16 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 468 MB (2, largest 417 MB)<br>focus div#_r_p_ at y 48–659<br>panel "Search" |
| <img src="keyboard-at-full/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 20 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":155}}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 472 MB (2, largest 422 MB)<br>focus input#base-ui-_r_35_[aria-label="Search courses"] at y 134–176<br>panel "Search"<br>events: vv-resize |
| <img src="keyboard-at-full/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 24 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 472 MB (2, largest 422 MB)<br>focus input#base-ui-_r_35_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 27 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 484 MB (2, largest 434 MB)<br>focus input#base-ui-_r_35_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 31 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 484 MB (2, largest 434 MB)<br>focus input#base-ui-_r_35_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 40 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 476 MB (2, largest 431 MB)<br>focus input#base-ui-_r_35_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-full/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 60 s)<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":199},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 412 MB (2, largest 368 MB)<br>focus input#base-ui-_r_35_[aria-label="Search courses"] at y 134–176<br>panel "Search"<br>events: pointercancel |
| <img src="keyboard-at-full/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 77 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 349 MB (2, largest 305 MB)<br>panel "Search"<br>events: vv-resize |
| <img src="keyboard-at-full/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 90 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":320}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 477 MB (2, largest 434 MB)<br>focus section[aria-label="CMSC250"] at y 402–660<br>panel "Discrete Structures" |

<a id="keyboard-at-peek"></a>

## Search with the on-screen keyboard from peek: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-peek` · [recording](keyboard-at-peek/video.mp4)

| Screen | Step |
|---|---|
| <img src="keyboard-at-peek/01-loaded.jpg" width="220"> | **1. loaded** (ok, 8 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 531 MB (2, largest 488 MB)<br>panel "Discrete Structures"<br>events: installed |
| <img src="keyboard-at-peek/02-search-tab-at-peek.jpg" width="220"> | **2. Search tab at peek** (ok, 22 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>keyboard down<br>page processes 540 MB (2, largest 497 MB)<br>focus div#_r_p_ at y 535–1146<br>panel "Search" |
| <img src="keyboard-at-peek/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 28 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":642}}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 504 MB (2, largest 461 MB)<br>focus input#base-ui-_r_35_[aria-label="Search courses"] at y 134–176<br>panel "Search"<br>events: vv-resize |
| <img src="keyboard-at-peek/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 33 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 504 MB (2, largest 461 MB)<br>focus input#base-ui-_r_35_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 35 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 468 MB (2, largest 425 MB)<br>focus input#base-ui-_r_35_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 39 s)<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 417 MB (2, largest 373 MB)<br>focus input#base-ui-_r_35_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 47 s)<br>after: type {"text":"cmsc"}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 579 MB (2, largest 535 MB)<br>focus input#base-ui-_r_35_[aria-label="Search courses"] at y 134–176<br>panel "Search" |
| <img src="keyboard-at-peek/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 56 s)<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":199},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 435.7 tall at 0, scrollY 0<br>drawer full, top 48, inside 387px<br>keyboard up<br>page processes 528 MB (2, largest 485 MB)<br>focus input#base-ui-_r_35_[aria-label="Search courses"] at y 134–176<br>panel "Search"<br>events: pointercancel |
| <img src="keyboard-at-peek/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 64 s)<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 346 MB (2, largest 304 MB)<br>panel "Search"<br>events: vv-resize |
| <img src="keyboard-at-peek/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 73 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":254}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 579 MB (2, largest 537 MB)<br>focus section[aria-label="CMSC216"] at y 402–660<br>panel "Introduction to Computer Systems" |

<a id="first-load"></a>

## First load

`first-load` · [recording](first-load/video.mp4)

| Screen | Step |
|---|---|
| <img src="first-load/01-shell-up.jpg" width="220"> | **1. shell up** (ok, 8 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 483 MB (2, largest 451 MB)<br>panel "Introduction to Computer Systems"<br>events: installed |
| <img src="first-load/02-settled.jpg" width="220"> | **2. settled** (ok, 17 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 291 MB (2, largest 258 MB)<br>panel "Introduction to Computer Systems" |

<a id="tabs"></a>

## Tap each drawer tab, then the open one again

`tabs` · [recording](tabs/video.mp4)

| Screen | Step |
|---|---|
| <img src="tabs/01-search-tab.jpg" width="220"> | **1. Search tab** (ok, 19 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 502 MB (2, largest 476 MB)<br>focus div#_r_p_ at y 329–940<br>panel "Search"<br>events: installed |
| <img src="tabs/02-problems-tab.jpg" width="220"> | **2. Problems tab** (ok, 31 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Problems\"","at":{"x":142,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 551 MB (2, largest 525 MB)<br>focus div#_r_p_ at y 329–940<br>panel "Problems" |
| <img src="tabs/03-travel-tab.jpg" width="220"> | **3. Travel tab** (ok, 40 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Travel\"","at":{"x":197,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 523 MB (2, largest 498 MB)<br>focus div#_r_p_ at y 329–940<br>panel "Travel" |
| <img src="tabs/04-blocks-tab.jpg" width="220"> | **4. Blocks tab** (ok, 46 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Blocks\"","at":{"x":252,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 540 MB (2, largest 515 MB)<br>focus div#_r_p_ at y 329–940<br>panel "Blocks" |
| <img src="tabs/05-generate-tab.jpg" width="220"> | **5. Generate tab** (ok, 53 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Generate\"","at":{"x":307,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 489 MB (2, largest 456 MB)<br>focus div#_r_p_ at y 329–940<br>panel "Generate" |
| <img src="tabs/06-register-tab.jpg" width="220"> | **6. Register tab** (ok, 60 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Register\"","at":{"x":362,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 499 MB (2, largest 468 MB)<br>focus div#_r_p_ at y 329–940<br>panel "Register" |
| <img src="tabs/07-courses-tab.jpg" width="220"> | **7. Courses tab** (ok, 69 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 566 MB (2, largest 535 MB)<br>focus div#_r_p_ at y 329–940<br>panel "Plan A" |
| <img src="tabs/08-tapped-the-open-tab.jpg" width="220"> | **8. tapped the open tab** (ok, 78 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":376}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>keyboard down<br>page processes 577 MB (2, largest 545 MB)<br>focus div#_r_p_ at y 535–1146<br>panel "Plan A" |

<a id="grabber-drag"></a>

## Drag the grabber peek → half → full → peek

`grabber-drag` · [recording](grabber-drag/video.mp4)

| Screen | Step |
|---|---|
| <img src="grabber-drag/01-peek.jpg" width="220"> | **1. peek** (ok, 17 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>keyboard down<br>page processes 596 MB (2, largest 564 MB)<br>focus div#_r_p_ at y 535–1146<br>panel "Plan A"<br>events: installed |
| <img src="grabber-drag/02-dragged-to-half.jpg" width="220"> | **2. dragged to half** (ok, 34 s)<br>after: swipe {"from":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","start":{"x":197,"y":548},"end":{"x":197,"y":342},"ms":900,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 361 MB (2, largest 330 MB)<br>focus div#_r_p_ at y 329–940<br>panel "Plan A" |
| <img src="grabber-drag/03-dragged-to-full.jpg" width="220"> | **3. dragged to full** (ok, 40 s)<br>after: swipe {"from":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","start":{"x":197,"y":342},"end":{"x":197,"y":61},"ms":900,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 276 MB (2, largest 245 MB)<br>focus div#_r_p_ at y 48–659<br>panel "Plan A" |
| <img src="grabber-drag/04-dragged-to-peek.jpg" width="220"> | **4. dragged to peek** (ok, 49 s)<br>after: swipe {"from":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","start":{"x":197,"y":61},"end":{"x":197,"y":548},"ms":900,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>keyboard down<br>page processes 570 MB (2, largest 539 MB)<br>focus div#_r_p_ at y 535–1146<br>panel "Plan A" |

<a id="pull-lists"></a>

## Pull down on a list at its top, at each snap

`pull-lists` · [recording](pull-lists/video.mp4)

| Screen | Step |
|---|---|
| <img src="pull-lists/01-results-at-full.jpg" width="220"> | **1. results at full** (ok, 26 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 411 MB (2, largest 384 MB)<br>panel "Search"<br>events: installed, vv-resize ×2 |
| <img src="pull-lists/02-pulled-down-at-full.jpg" width="220"> | **2. pulled down at full** (ok, 38 s)<br>after: swipe {"from":null,"start":{"x":197,"y":270},"end":{"x":197,"y":570},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 629 MB (2, largest 602 MB)<br>panel "Search" |
| <img src="pull-lists/03-results-at-half.jpg" width="220"> | **3. results at half** (ok, 44 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 592 MB (2, largest 566 MB)<br>panel "Search" |
| <img src="pull-lists/04-pulled-down-at-half.jpg" width="220"> | **4. pulled down at half** (ok, 51 s)<br>after: swipe {"from":null,"start":{"x":197,"y":551},"end":{"x":197,"y":851},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>keyboard down<br>page processes 392 MB (2, largest 366 MB)<br>panel "Search" |
| <img src="pull-lists/05-results-at-peek.jpg" width="220"> | **5. results at peek** (ok, 55 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>keyboard down<br>page processes 392 MB (2, largest 366 MB)<br>panel "Search" |
| <img src="pull-lists/06-pulled-down-at-peek.jpg" width="220"> | **6. pulled down at peek** (ok, 65 s)<br>after: swipe {"from":null,"start":{"x":197,"y":568},"end":{"x":197,"y":868},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>keyboard down<br>page processes 427 MB (2, largest 401 MB)<br>panel "Search" |
| <img src="pull-lists/07-pulled-down-on-courses-at-half.jpg" width="220"> | **7. pulled down on Courses at half** (warn, 80 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":32,"y":582}}<br>after: swipe {"from":null,"start":{"x":197,"y":474},"end":{"x":197,"y":774},"ms":600,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>keyboard down<br>page processes 514 MB (2, largest 489 MB)<br>focus div#_r_p_ at y 535–1146<br>panel "Plan A"<br>**warn drawer-moves-one-way**: 2 reversal(s) over 53 frames (329–629) |

<a id="scroll-list-back"></a>

## Scroll a long list down, then back up: the drawer stays

`scroll-list-back` · [recording](scroll-list-back/video.mp4)

| Screen | Step |
|---|---|
| <img src="scroll-list-back/01-scrolled-down.jpg" width="220"> | **1. scrolled down** (ok, 28 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>after: swipe {"from":null,"start":{"x":197,"y":558},"end":{"x":197,"y":208},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 398 MB (2, largest 376 MB)<br>panel "Search"<br>events: installed, vv-resize ×2, pointercancel |
| <img src="scroll-list-back/02-scrolled-back-up.jpg" width="220"> | **2. scrolled back up** (ok, 34 s)<br>after: swipe {"from":null,"start":{"x":197,"y":373},"end":{"x":197,"y":623},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 333 MB (2, largest 311 MB)<br>panel "Search"<br>events: pointercancel |

<a id="calendar-pull"></a>

## Scroll the calendar, then pull down at its top

`calendar-pull` · [recording](calendar-pull/video.mp4)

| Screen | Step |
|---|---|
| <img src="calendar-pull/01-scrolled-the-calendar-down.jpg" width="220"> | **1. scrolled the calendar down** (ok, 16 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>after: swipe {"from":null,"start":{"x":197,"y":359},"end":{"x":197,"y":109},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>keyboard down<br>page processes 534 MB (2, largest 514 MB)<br>focus div#_r_p_ at y 535–1146<br>panel "Search"<br>events: installed |
| <img src="calendar-pull/02-pulled-down-at-the-top.jpg" width="220"> | **2. pulled down at the top** (ok, 25 s)<br>after: swipe {"from":null,"start":{"x":197,"y":162},"end":{"x":197,"y":512},"ms":500,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":162},"end":{"x":197,"y":512},"ms":500,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>keyboard down<br>page processes 364 MB (2, largest 344 MB)<br>focus div#_r_p_ at y 535–1146<br>panel "Search" |

<a id="rotate"></a>

## Rotate to landscape and back

`rotate` · [recording](rotate/video.mp4)

| Screen | Step |
|---|---|
| <img src="rotate/01-portrait.jpg" width="220"> | **1. portrait** (ok, 9 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 582 MB (2, largest 562 MB)<br>panel "Search"<br>events: installed |
| <img src="rotate/02-landscape.jpg" width="220"> | **2. landscape** (ok, 16 s)<br>after: rotate {"orientation":"landscape"}<br>viewport 852×343, visual 343 tall at 0, scrollY 0<br>keyboard down<br>page processes 275 MB (2, largest 257 MB)<br>panel "Search"<br>events: orientationchange, resize, vv-resize |
| <img src="rotate/03-portrait-again.jpg" width="220"> | **3. portrait again** (ok, 22 s)<br>after: rotate {"orientation":"portrait"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 260 MB (2, largest 241 MB)<br>panel "Search"<br>events: orientationchange, resize, vv-resize |

<a id="url-bar"></a>

## Scroll to collapse and expand the browser's toolbar

`url-bar` · [recording](url-bar/video.mp4)

| Screen | Step |
|---|---|
| <img src="url-bar/01-start.jpg" width="220"> | **1. start** (ok, 17 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":61}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>keyboard down<br>page processes 376 MB (2, largest 357 MB)<br>focus div#_r_p_ at y 535–1146<br>panel "Search"<br>events: installed |
| <img src="url-bar/02-scrolled-the-calendar-up-toolbar-may-hide.jpg" width="220"> | **2. scrolled the calendar up (toolbar may hide)** (ok, 23 s)<br>after: swipe {"from":null,"start":{"x":197,"y":403},"end":{"x":197,"y":103},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>keyboard down<br>page processes 307 MB (2, largest 288 MB)<br>focus div#_r_p_ at y 535–1146<br>panel "Search" |
| <img src="url-bar/03-scrolled-it-back-toolbar-may-show.jpg" width="220"> | **3. scrolled it back (toolbar may show)** (ok, 27 s)<br>after: swipe {"from":null,"start":{"x":197,"y":403},"end":{"x":197,"y":703},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer peek, top 535, inside 124px<br>keyboard down<br>page processes 263 MB (2, largest 243 MB)<br>focus div#_r_p_ at y 535–1146<br>panel "Search" |
| <img src="url-bar/04-scrolled-the-results.jpg" width="220"> | **4. scrolled the results** (ok, 51 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":582}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":178},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 405 MB (2, largest 386 MB)<br>panel "Search"<br>events: vv-resize ×2, pointercancel |
| <img src="url-bar/05-scrolled-them-back.jpg" width="220"> | **5. scrolled them back** (ok, 64 s)<br>after: swipe {"from":null,"start":{"x":197,"y":578},"end":{"x":197,"y":978},"ms":400,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 748 MB (2, largest 730 MB)<br>panel "Search"<br>events: pointercancel |

<a id="long-course"></a>

## A long course (ENGL101, 90+ sections) scrolled to the bottom

`long-course` · [recording](long-course/video.mp4)

| Screen | Step |
|---|---|
| <img src="long-course/01-engl101.jpg" width="220"> | **1. ENGL101** (warn, 45 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":642}}<br>after: type {"text":"engl101"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"ENGL101\"]","at":{"x":197,"y":286}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 851 MB (2, largest 832 MB)<br>focus section[aria-label="ENGL101"] at y 402–660<br>panel "Academic Writing"<br>events: installed, vv-resize ×2<br>**warn drawer-moves-one-way**: 2 reversal(s) over 17 frames (48–535) |
| <img src="long-course/02-engl101-at-full.jpg" width="220"> | **2. ENGL101 at full** (ok, 54 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 616 MB (2, largest 597 MB)<br>focus div#_r_p_ at y 48–659<br>panel "Academic Writing" |
| <img src="long-course/03-scrolled-to-the-bottom.jpg" width="220"> | **3. scrolled to the bottom** (ok, 94 s)<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":197,"y":562},"end":{"x":197,"y":112},"ms":300,"intent":"scroll"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 430 MB (2, largest 411 MB)<br>focus div#_r_p_ at y 48–659<br>panel "Academic Writing"<br>events: pointercancel ×6 |

<a id="open-results"></a>

## Search, scroll, put the keyboard away and open a result, six times

`open-results` · [recording](open-results/video.mp4)

| Screen | Step |
|---|---|
| <img src="open-results/01-opened-a-result-1.jpg" width="220"> | **1. opened a result (1)** (FAIL, 48 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc"}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":239},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":281}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 607 MB (2, largest 589 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I"<br>events: installed, vv-resize ×2, pointercancel<br>**FAIL no-page-errors**: unhandled rejection: Old view transition aborted by new view transition. \| unhandled rejection: Old view transition aborted by new view transition. |
| <img src="open-results/02-opened-a-result-2.jpg" width="220"> | **2. opened a result (2)** (ok, 72 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":239},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":262}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 729 MB (2, largest 711 MB)<br>focus section[aria-label="CMSC216"] at y 402–660<br>panel "Introduction to Computer Systems"<br>events: vv-resize ×2, pointercancel |
| <img src="open-results/03-opened-a-result-3.jpg" width="220"> | **3. opened a result (3)** (ok, 103 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":239},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":271}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 711 MB (2, largest 693 MB)<br>focus section[aria-label="CMSC216"] at y 402–660<br>panel "Introduction to Computer Systems"<br>events: vv-resize ×2, pointercancel |
| <img src="open-results/04-opened-a-result-4.jpg" width="220"> | **4. opened a result (4)** (ok, 136 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":239},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":273}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 941 MB (2, largest 923 MB)<br>focus section[aria-label="CMSC216"] at y 402–660<br>panel "Introduction to Computer Systems"<br>events: vv-resize ×2, pointercancel |
| <img src="open-results/05-opened-a-result-5.jpg" width="220"> | **5. opened a result (5)** (ok, 164 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":239},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":272}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 931 MB (2, largest 912 MB)<br>focus section[aria-label="CMSC216"] at y 402–660<br>panel "Introduction to Computer Systems"<br>events: vv-resize ×2, pointercancel |
| <img src="open-results/06-opened-a-result-6.jpg" width="220"> | **6. opened a result (6)** (ok, 193 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":426}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":187,"y":155}}<br>after: swipe {"from":null,"start":{"x":197,"y":399},"end":{"x":197,"y":239},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":197,"y":256}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 833 MB (2, largest 815 MB)<br>focus section[aria-label="CMSC216"] at y 402–660<br>panel "Introduction to Computer Systems"<br>events: vv-resize ×2, pointercancel |

<a id="add-sections"></a>

## Add a section from course details, then switch it three times

`add-sections` · [recording](add-sections/video.mp4)

| Screen | Step |
|---|---|
| <img src="add-sections/01-tapped-add-0101.jpg" width="220"> | **1. tapped Add 0101** (warn, 53 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":642}}<br>after: type {"text":"cmsc131"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"CMSC131\"]","at":{"x":197,"y":286}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":197,"y":342}}<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Add 0101\"","at":{"x":355,"y":551}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 683 MB (2, largest 665 MB)<br>focus section[aria-label="CMSC131"] at y 121–660<br>panel "Object-Oriented Programming I"<br>events: installed, vv-resize ×2<br>**warn drawer-moves-one-way**: 3 reversal(s) over 20 frames (48–535) |
| <img src="add-sections/02-tapped-switch-to-0102.jpg" width="220"> | **2. tapped Switch to 0102** (ok, 69 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0102\"","at":{"x":355,"y":450}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 926 MB (2, largest 909 MB)<br>focus section[aria-label="CMSC131"] at y 121–660<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/03-tapped-switch-to-0101.jpg" width="220"> | **3. tapped Switch to 0101** (ok, 86 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0101\"","at":{"x":355,"y":377}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 552 MB (2, largest 533 MB)<br>focus section[aria-label="CMSC131"] at y 121–660<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/04-tapped-switch-to-0102.jpg" width="220"> | **4. tapped Switch to 0102** (ok, 97 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0102\"","at":{"x":355,"y":450}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer full, top 48, inside 611px<br>keyboard down<br>page processes 349 MB (2, largest 330 MB)<br>focus section[aria-label="CMSC131"] at y 121–660<br>panel "Object-Oriented Programming I" |

<a id="swipe-back"></a>

## Open a course, then swipe back from the screen's left edge: the page moves once

`swipe-back` · [recording](swipe-back/video.mp4)

| Screen | Step |
|---|---|
| <img src="swipe-back/01-cmsc131-open.jpg" width="220"> | **1. CMSC131 open** (ok, 56 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":87,"y":376}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":208,"y":436}}<br>after: type {"text":"cmsc131"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"CMSC131\"]","at":{"x":197,"y":286}}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 996 MB (2, largest 978 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I"<br>events: installed, vv-resize ×2 |
| <img src="swipe-back/02-swiping-back-100-ms.jpg" width="220"> | **2. swiping back (+100 ms)** (ok, 67 s)<br>after: swipe {"from":null,"start":{"x":1,"y":198},"end":{"x":281,"y":198},"ms":350,"intent":"drag"}<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 804 MB (2, largest 787 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="swipe-back/03-swiping-back-250-ms.jpg" width="220"> | **3. swiping back (+250 ms)** (ok, 70 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 716 MB (2, largest 697 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I" |
| <img src="swipe-back/04-swiped-back.jpg" width="220"> | **4. swiped back** (FAIL, 74 s)<br>viewport 393×659, visual 659 tall at 0, scrollY 0<br>drawer half, top 329, inside 330px<br>keyboard down<br>page processes 704 MB (2, largest 684 MB)<br>focus section[aria-label="CMSC131"] at y 402–660<br>panel "Object-Oriented Programming I"<br>**FAIL went-back**: panel heading "Object-Oriented Programming I"<br>**warn moved-once**: browser animated: false; our transitions: [] |
