# Mobile lab: android

**Failed**: 0 failed check(s), 3 warning(s), 2 error(s).

- URL: https://terpsicle.com/schedule
- Device: sdk_gphone64_x86_64, Android 14 (API 34), Chrome 113.0.5672.136, screen 1080x2400 at 420 dpi
- Started: 2026-09-30T15:03:08.608Z, took 533 s
- Workflow run: https://github.com/zsrobinson/terpsicle/actions/runs/36733349372
- Every step's full probe (viewport, drawer, focus, events, per-frame trace) is in `summary.json`.

| Scenario | Result | Steps | Time | Recording |
|---|---|---|---|---|
| [Search with the on-screen keyboard from half: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-half) | ok | 10 | 59 s | [video](keyboard-at-half/video.mp4) |
| [Search with the on-screen keyboard from full: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-full) | ok | 10 | 55 s | [video](keyboard-at-full/video.mp4) |
| [Search with the on-screen keyboard from peek: tap the box, type, scroll, put the keyboard away, open a result](#keyboard-at-peek) | ok | 10 | 39 s | [video](keyboard-at-peek/video.mp4) |
| [First load](#first-load) | ok | 2 | 17 s | [video](first-load/video.mp4) |
| [Tap each drawer tab, then the open one again](#tabs) | ok | 8 | 29 s | [video](tabs/video.mp4) |
| [Drag the grabber peek → half → full → peek](#grabber-drag) | ok | 4 | 24 s | [video](grabber-drag/video.mp4) |
| [Pull down on a list at its top, at each snap](#pull-lists) | warn | 7 | 33 s | [video](pull-lists/video.mp4) |
| [Scroll a long list down, then back up: the drawer stays](#scroll-list-back) | ERROR | 1 | 28 s | [video](scroll-list-back/video.mp4) |
| [Scroll the calendar, then pull down at its top](#calendar-pull) | ok | 2 | 19 s | [video](calendar-pull/video.mp4) |
| [Rotate to landscape and back](#rotate) | ok | 3 | 21 s | [video](rotate/video.mp4) |
| [Scroll to collapse and expand the browser's toolbar](#url-bar) | ok | 5 | 31 s | [video](url-bar/video.mp4) |
| [A long course (ENGL101, 90+ sections) scrolled to the bottom](#long-course) | warn | 3 | 34 s | [video](long-course/video.mp4) |
| [Search, scroll, put the keyboard away and open a result, six times](#open-results) | ok | 6 | 71 s | [video](open-results/video.mp4) |
| [Add a section from course details, then switch it three times](#add-sections) | warn | 4 | 32 s | [video](add-sections/video.mp4) |
| [Open a course, then swipe back from the screen's left edge: the page moves once](#swipe-back) | ok | 4 | 25 s | [video](swipe-back/video.mp4) |

<a id="keyboard-at-half"></a>

## Search with the on-screen keyboard from half: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-half` · [recording](keyboard-at-half/video.mp4)

| Screen | Step |
|---|---|
| <img src="keyboard-at-half/01-loaded.jpg" width="220"> | **1. loaded** (ok, 19 s)<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>panel "Plan A"<br>events: installed |
| <img src="keyboard-at-half/02-search-tab-at-half.jpg" width="220"> | **2. Search tab at half** (ok, 24 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":91,"y":437}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus button#base-ui-_r_1d_ at y 415.8–458.8<br>panel "Search" |
| <img src="keyboard-at-half/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 27 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":206,"y":498}}<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_2k_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search"<br>events: vv-resize, resize |
| <img src="keyboard-at-half/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 34 s)<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_2k_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search" |
| <img src="keyboard-at-half/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 38 s)<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_2k_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search" |
| <img src="keyboard-at-half/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 42 s)<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_2k_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search" |
| <img src="keyboard-at-half/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 45 s)<br>after: type {"text":"cmsc"}<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_2k_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search" |
| <img src="keyboard-at-half/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 48 s)<br>after: swipe {"from":null,"start":{"x":206,"y":427},"end":{"x":206,"y":227},"ms":500,"intent":"scroll"}<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_2k_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search"<br>events: pointercancel |
| <img src="keyboard-at-half/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 51 s)<br>after: hide keyboard {}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus input#base-ui-_r_2k_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search"<br>events: vv-resize, resize |
| <img src="keyboard-at-half/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 53 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":206,"y":271}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus section[aria-label="CMSC132"] at y 463.5–733.8<br>panel "Object-Oriented Programming II" |

<a id="keyboard-at-full"></a>

## Search with the on-screen keyboard from full: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-full` · [recording](keyboard-at-full/video.mp4)

| Screen | Step |
|---|---|
| <img src="keyboard-at-full/01-loaded.jpg" width="220"> | **1. loaded** (ok, 19 s)<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>panel "Object-Oriented Programming II"<br>events: installed |
| <img src="keyboard-at-full/02-search-tab-at-full.jpg" width="220"> | **2. Search tab at full** (ok, 28 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":91,"y":437}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":404}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus button#base-ui-_r_1b_[aria-label="Lower the panel"] at y 48.8–72.8<br>panel "Search" |
| <img src="keyboard-at-full/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 31 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":206,"y":155}}<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_4c_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search"<br>events: vv-resize, resize |
| <img src="keyboard-at-full/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 34 s)<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_4c_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search" |
| <img src="keyboard-at-full/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 36 s)<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_4c_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search" |
| <img src="keyboard-at-full/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 39 s)<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_4c_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search" |
| <img src="keyboard-at-full/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 43 s)<br>after: type {"text":"cmsc"}<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_4c_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search" |
| <img src="keyboard-at-full/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 46 s)<br>after: swipe {"from":null,"start":{"x":206,"y":427},"end":{"x":206,"y":227},"ms":500,"intent":"scroll"}<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_4c_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search"<br>events: pointercancel |
| <img src="keyboard-at-full/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 48 s)<br>after: hide keyboard {}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus input#base-ui-_r_4c_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search"<br>events: vv-resize, resize |
| <img src="keyboard-at-full/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 51 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":206,"y":285}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus section[aria-label="CMSC132"] at y 463.5–733.8<br>panel "Object-Oriented Programming II" |

<a id="keyboard-at-peek"></a>

## Search with the on-screen keyboard from peek: tap the box, type, scroll, put the keyboard away, open a result

`keyboard-at-peek` · [recording](keyboard-at-peek/video.mp4)

| Screen | Step |
|---|---|
| <img src="keyboard-at-peek/01-loaded.jpg" width="220"> | **1. loaded** (ok, 8 s)<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>panel "Object-Oriented Programming II"<br>events: installed |
| <img src="keyboard-at-peek/02-search-tab-at-peek.jpg" width="220"> | **2. Search tab at peek** (ok, 16 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":91,"y":437}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":404}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":61}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer peek, top 609, inside 124px<br>keyboard down<br>focus button#base-ui-_r_18_[aria-label="Raise the panel"] at y 609.8–633.8<br>panel "Search" |
| <img src="keyboard-at-peek/03-tapped-the-search-box-150-ms.jpg" width="220"> | **3. tapped the search box (+150 ms)** (ok, 17 s)<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":206,"y":716}}<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_4b_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search"<br>events: vv-resize, resize |
| <img src="keyboard-at-peek/04-tapped-the-search-box-500-ms.jpg" width="220"> | **4. tapped the search box (+500 ms)** (ok, 20 s)<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_4b_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search" |
| <img src="keyboard-at-peek/05-tapped-the-search-box-1000-ms.jpg" width="220"> | **5. tapped the search box (+1000 ms)** (ok, 21 s)<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_4b_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search" |
| <img src="keyboard-at-peek/06-tapped-the-search-box-2000-ms.jpg" width="220"> | **6. tapped the search box (+2000 ms)** (ok, 24 s)<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_4b_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search" |
| <img src="keyboard-at-peek/07-typed-cmsc.jpg" width="220"> | **7. typed "cmsc"** (ok, 27 s)<br>after: type {"text":"cmsc"}<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_4b_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search" |
| <img src="keyboard-at-peek/08-scrolled-the-results.jpg" width="220"> | **8. scrolled the results** (ok, 30 s)<br>after: swipe {"from":null,"start":{"x":206,"y":427},"end":{"x":206,"y":227},"ms":500,"intent":"scroll"}<br>viewport 412×783, visual 471.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 423px<br>keyboard up<br>focus input#base-ui-_r_4b_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search"<br>events: pointercancel |
| <img src="keyboard-at-peek/09-put-the-keyboard-away.jpg" width="220"> | **9. put the keyboard away** (ok, 32 s)<br>after: hide keyboard {}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus input#base-ui-_r_4b_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search"<br>events: vv-resize, resize |
| <img src="keyboard-at-peek/10-opened-a-result.jpg" width="220"> | **10. opened a result** (ok, 35 s)<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":206,"y":310}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus section[aria-label="CMSC132"] at y 463.5–733.8<br>panel "Object-Oriented Programming II" |

<a id="first-load"></a>

## First load

`first-load` · [recording](first-load/video.mp4)

| Screen | Step |
|---|---|
| <img src="first-load/01-shell-up.jpg" width="220"> | **1. shell up** (ok, 11 s)<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>panel "Object-Oriented Programming II"<br>events: installed |
| <img src="first-load/02-settled.jpg" width="220"> | **2. settled** (ok, 14 s)<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>panel "Object-Oriented Programming II" |

<a id="tabs"></a>

## Tap each drawer tab, then the open one again

`tabs` · [recording](tabs/video.mp4)

| Screen | Step |
|---|---|
| <img src="tabs/01-search-tab.jpg" width="220"> | **1. Search tab** (ok, 12 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":91,"y":437}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus button#base-ui-_r_1a_ at y 415.8–458.8<br>panel "Search"<br>events: installed |
| <img src="tabs/02-problems-tab.jpg" width="220"> | **2. Problems tab** (ok, 14 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Problems\"","at":{"x":148,"y":437}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus button#base-ui-_r_1d_ at y 415.8–458.8<br>panel "Problems" |
| <img src="tabs/03-travel-tab.jpg" width="220"> | **3. Travel tab** (ok, 17 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Travel\"","at":{"x":206,"y":437}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus button#base-ui-_r_1g_ at y 415.8–458.8<br>panel "Travel" |
| <img src="tabs/04-blocks-tab.jpg" width="220"> | **4. Blocks tab** (ok, 19 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Blocks\"","at":{"x":264,"y":437}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus button#base-ui-_r_1j_ at y 415.8–458.8<br>panel "Blocks" |
| <img src="tabs/05-generate-tab.jpg" width="220"> | **5. Generate tab** (ok, 21 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Generate\"","at":{"x":322,"y":437}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus button#base-ui-_r_1m_ at y 415.8–458.8<br>panel "Generate" |
| <img src="tabs/06-register-tab.jpg" width="220"> | **6. Register tab** (ok, 23 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Register\"","at":{"x":379,"y":437}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus button#base-ui-_r_1p_ at y 415.8–458.8<br>panel "Register" |
| <img src="tabs/07-courses-tab.jpg" width="220"> | **7. Courses tab** (ok, 25 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":33,"y":437}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus button#base-ui-_r_17_ at y 415.8–458.8<br>panel "Plan A" |
| <img src="tabs/08-tapped-the-open-tab.jpg" width="220"> | **8. tapped the open tab** (ok, 27 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":33,"y":437}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer peek, top 609, inside 124px<br>keyboard down<br>focus button#base-ui-_r_17_ at y 633.8–676.8<br>panel "Plan A" |

<a id="grabber-drag"></a>

## Drag the grabber peek → half → full → peek

`grabber-drag` · [recording](grabber-drag/video.mp4)

| Screen | Step |
|---|---|
| <img src="grabber-drag/01-peek.jpg" width="220"> | **1. peek** (ok, 11 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":404}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":61}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer peek, top 609, inside 124px<br>keyboard down<br>focus button#base-ui-_r_10_[aria-label="Raise the panel"] at y 609.8–633.8<br>panel "Plan A"<br>events: installed |
| <img src="grabber-drag/02-dragged-to-half.jpg" width="220"> | **2. dragged to half** (ok, 14 s)<br>after: swipe {"from":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","start":{"x":206,"y":622},"end":{"x":206,"y":404},"ms":900,"intent":"drag"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus button#base-ui-_r_10_[aria-label="Raise the panel"] at y 391.8–415.8<br>panel "Plan A" |
| <img src="grabber-drag/03-dragged-to-full.jpg" width="220"> | **3. dragged to full** (ok, 17 s)<br>after: swipe {"from":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","start":{"x":206,"y":404},"end":{"x":206,"y":61},"ms":900,"intent":"drag"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus button#base-ui-_r_10_[aria-label="Lower the panel"] at y 48.8–72.8<br>panel "Plan A" |
| <img src="grabber-drag/04-dragged-to-peek.jpg" width="220"> | **4. dragged to peek** (ok, 20 s)<br>after: swipe {"from":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","start":{"x":206,"y":61},"end":{"x":206,"y":622},"ms":900,"intent":"drag"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer peek, top 609, inside 124px<br>keyboard down<br>focus button#base-ui-_r_10_[aria-label="Raise the panel"] at y 609.8–633.8<br>panel "Plan A" |

<a id="pull-lists"></a>

## Pull down on a list at its top, at each snap

`pull-lists` · [recording](pull-lists/video.mp4)

| Screen | Step |
|---|---|
| <img src="pull-lists/01-results-at-full.jpg" width="220"> | **1. results at full** (ok, 14 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":91,"y":437}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":206,"y":498}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus input#base-ui-_r_28_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search"<br>events: installed, vv-resize ×2, resize ×2 |
| <img src="pull-lists/02-pulled-down-at-full.jpg" width="220"> | **2. pulled down at full** (ok, 18 s)<br>after: swipe {"from":null,"start":{"x":206,"y":269},"end":{"x":206,"y":569},"ms":600,"intent":"drag"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus input#base-ui-_r_28_[aria-label="Search courses"] at y 476.3–518.8<br>panel "Search" |
| <img src="pull-lists/03-results-at-half.jpg" width="220"> | **3. results at half** (ok, 18 s)<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus input#base-ui-_r_28_[aria-label="Search courses"] at y 476.3–518.8<br>panel "Search" |
| <img src="pull-lists/04-pulled-down-at-half.jpg" width="220"> | **4. pulled down at half** (ok, 21 s)<br>after: swipe {"from":null,"start":{"x":206,"y":612},"end":{"x":206,"y":912},"ms":600,"intent":"drag"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer peek, top 609, inside 124px<br>keyboard down<br>focus input#base-ui-_r_28_[aria-label="Search courses"] at y 694.3–736.8<br>panel "Search" |
| <img src="pull-lists/05-results-at-peek.jpg" width="220"> | **5. results at peek** (ok, 22 s)<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer peek, top 609, inside 124px<br>keyboard down<br>focus input#base-ui-_r_28_[aria-label="Search courses"] at y 694.3–736.8<br>panel "Search" |
| <img src="pull-lists/06-pulled-down-at-peek.jpg" width="220"> | **6. pulled down at peek** (ok, 26 s)<br>after: swipe {"from":null,"start":{"x":206,"y":642},"end":{"x":206,"y":942},"ms":600,"intent":"drag"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer peek, top 609, inside 124px<br>keyboard down<br>focus input#base-ui-_r_28_[aria-label="Search courses"] at y 694.3–736.8<br>panel "Search" |
| <img src="pull-lists/07-pulled-down-on-courses-at-half.jpg" width="220"> | **7. pulled down on Courses at half** (warn, 30 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Courses\"","at":{"x":33,"y":655}}<br>after: swipe {"from":null,"start":{"x":206,"y":536},"end":{"x":206,"y":836},"ms":600,"intent":"drag"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer peek, top 609, inside 124px<br>keyboard down<br>focus button#base-ui-_r_s_ at y 633.8–676.8<br>panel "Plan A"<br>**warn drawer-moves-one-way**: 2 reversal(s) over 13 frames (391–690) |

<a id="scroll-list-back"></a>

## Scroll a long list down, then back up: the drawer stays

`scroll-list-back` · [recording](scroll-list-back/video.mp4)

**Error:** not on the page: input[aria-label="Search courses"]

| Screen | Step |
|---|---|
| <img src="scroll-list-back/01-error.jpg" width="220"> | **1. error** (ERROR, 26 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":91,"y":614}}<br>after: timeout {"waitingFor":"the search box","ms":15000}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus section at y 463.5–733.8<br>panel "Plan A"<br>events: installed<br>**Error:** not on the page: input[aria-label="Search courses"] |

<a id="calendar-pull"></a>

## Scroll the calendar, then pull down at its top

`calendar-pull` · [recording](calendar-pull/video.mp4)

| Screen | Step |
|---|---|
| <img src="calendar-pull/01-scrolled-the-calendar-down.jpg" width="220"> | **1. scrolled the calendar down** (ok, 12 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":404}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":61}}<br>after: swipe {"from":null,"start":{"x":206,"y":385},"end":{"x":206,"y":135},"ms":500,"intent":"scroll"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer peek, top 609, inside 124px<br>keyboard down<br>focus button#base-ui-_r_v_[aria-label="Raise the panel"] at y 609.8–633.8<br>panel "Plan A"<br>events: installed, pointercancel |
| <img src="calendar-pull/02-pulled-down-at-the-top.jpg" width="220"> | **2. pulled down at the top** (ok, 17 s)<br>after: swipe {"from":null,"start":{"x":206,"y":132},"end":{"x":206,"y":482},"ms":500,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":206,"y":132},"end":{"x":206,"y":482},"ms":500,"intent":"scroll"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer peek, top 609, inside 124px<br>keyboard down<br>focus button#base-ui-_r_v_[aria-label="Raise the panel"] at y 609.8–633.8<br>panel "Plan A"<br>events: pointercancel ×2 |

<a id="rotate"></a>

## Rotate to landscape and back

`rotate` · [recording](rotate/video.mp4)

| Screen | Step |
|---|---|
| <img src="rotate/01-portrait.jpg" width="220"> | **1. portrait** (ok, 11 s)<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>panel "Plan A"<br>events: installed |
| <img src="rotate/02-landscape.jpg" width="220"> | **2. landscape** (ok, 14 s)<br>after: rotate {"orientation":"landscape"}<br>viewport 863×304, visual 304 tall at 0, scrollY 0<br>keyboard down<br>panel "Plan A"<br>events: orientationchange, resize, vv-resize |
| <img src="rotate/03-portrait-again.jpg" width="220"> | **3. portrait again** (ok, 18 s)<br>after: rotate {"orientation":"portrait"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>panel "Plan A"<br>events: orientationchange, resize, vv-resize |

<a id="url-bar"></a>

## Scroll to collapse and expand the browser's toolbar

`url-bar` · [recording](url-bar/video.mp4)

| Screen | Step |
|---|---|
| <img src="url-bar/01-start.jpg" width="220"> | **1. start** (ok, 12 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":404}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":61}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer peek, top 609, inside 124px<br>keyboard down<br>focus button#base-ui-_r_p_[aria-label="Raise the panel"] at y 609.8–633.8<br>panel "Plan A"<br>events: installed |
| <img src="url-bar/02-scrolled-the-calendar-up-toolbar-may-hide.jpg" width="220"> | **2. scrolled the calendar up (toolbar may hide)** (ok, 15 s)<br>after: swipe {"from":null,"start":{"x":206,"y":441},"end":{"x":206,"y":141},"ms":400,"intent":"scroll"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer peek, top 609, inside 124px<br>keyboard down<br>focus button#base-ui-_r_p_[aria-label="Raise the panel"] at y 609.8–633.8<br>panel "Plan A"<br>events: pointercancel |
| <img src="url-bar/03-scrolled-it-back-toolbar-may-show.jpg" width="220"> | **3. scrolled it back (toolbar may show)** (ok, 17 s)<br>after: swipe {"from":null,"start":{"x":206,"y":441},"end":{"x":206,"y":741},"ms":400,"intent":"scroll"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer peek, top 609, inside 124px<br>keyboard down<br>focus button#base-ui-_r_p_[aria-label="Raise the panel"] at y 609.8–633.8<br>panel "Plan A"<br>events: pointercancel |
| <img src="url-bar/04-scrolled-the-results.jpg" width="220"> | **4. scrolled the results** (ok, 26 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":91,"y":655}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":206,"y":498}}<br>after: type {"text":"cmsc"}<br>after: hide keyboard {}<br>after: swipe {"from":null,"start":{"x":206,"y":676},"end":{"x":206,"y":276},"ms":400,"intent":"scroll"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus input#base-ui-_r_28_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search"<br>events: vv-resize ×2, resize ×2, pointercancel |
| <img src="url-bar/05-scrolled-them-back.jpg" width="220"> | **5. scrolled them back** (ok, 28 s)<br>after: swipe {"from":null,"start":{"x":206,"y":676},"end":{"x":206,"y":1076},"ms":400,"intent":"scroll"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus input#base-ui-_r_28_[aria-label="Search courses"] at y 133.3–175.8<br>panel "Search"<br>events: pointercancel |

<a id="long-course"></a>

## A long course (ENGL101, 90+ sections) scrolled to the bottom

`long-course` · [recording](long-course/video.mp4)

| Screen | Step |
|---|---|
| <img src="long-course/01-engl101.jpg" width="220"> | **1. ENGL101** (warn, 20 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":91,"y":437}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":206,"y":716}}<br>after: type {"text":"engl101"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"ENGL101\"]","at":{"x":206,"y":285}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus section[aria-label="ENGL101"] at y 463.5–733.8<br>panel "Academic Writing"<br>events: installed, vv-resize ×2, resize ×2<br>**warn drawer-moves-one-way**: 2 reversal(s) over 12 frames (48–609) |
| <img src="long-course/02-engl101-at-full.jpg" width="220"> | **2. ENGL101 at full** (ok, 21 s)<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":404}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus button#base-ui-_r_p_[aria-label="Lower the panel"] at y 48.8–72.8<br>panel "Academic Writing" |
| <img src="long-course/03-scrolled-to-the-bottom.jpg" width="220"> | **3. scrolled to the bottom** (ok, 31 s)<br>after: swipe {"from":null,"start":{"x":206,"y":660},"end":{"x":206,"y":210},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":206,"y":660},"end":{"x":206,"y":210},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":206,"y":660},"end":{"x":206,"y":210},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":206,"y":660},"end":{"x":206,"y":210},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":206,"y":660},"end":{"x":206,"y":210},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":206,"y":660},"end":{"x":206,"y":210},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":206,"y":660},"end":{"x":206,"y":210},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":206,"y":660},"end":{"x":206,"y":210},"ms":300,"intent":"scroll"}<br>after: swipe {"from":null,"start":{"x":206,"y":660},"end":{"x":206,"y":210},"ms":300,"intent":"scroll"}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus button#base-ui-_r_p_[aria-label="Lower the panel"] at y 48.8–72.8<br>panel "Academic Writing"<br>events: pointercancel ×7 |

<a id="open-results"></a>

## Search, scroll, put the keyboard away and open a result, six times

`open-results` · [recording](open-results/video.mp4)

| Screen | Step |
|---|---|
| <img src="open-results/01-opened-a-result-1.jpg" width="220"> | **1. opened a result (1)** (ok, 22 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":91,"y":437}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":206,"y":498}}<br>after: type {"text":"cmsc"}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":155}}<br>after: swipe {"from":null,"start":{"x":206,"y":427},"end":{"x":206,"y":267},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":206,"y":317}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus section[aria-label="CMSC132"] at y 463.5–733.8<br>panel "Object-Oriented Programming II"<br>events: installed, vv-resize ×2, resize ×2, pointercancel |
| <img src="open-results/02-opened-a-result-2.jpg" width="220"> | **2. opened a result (2)** (ok, 31 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":487}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":404}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":155}}<br>after: swipe {"from":null,"start":{"x":206,"y":427},"end":{"x":206,"y":267},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":206,"y":264}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus section[aria-label="CMSC131"] at y 463.5–733.8<br>panel "Object-Oriented Programming I"<br>events: vv-resize ×2, resize ×2, pointercancel |
| <img src="open-results/03-opened-a-result-3.jpg" width="220"> | **3. opened a result (3)** (ok, 40 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":487}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":404}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":155}}<br>after: swipe {"from":null,"start":{"x":206,"y":427},"end":{"x":206,"y":267},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":206,"y":312}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus section[aria-label="CMSC132"] at y 463.5–733.8<br>panel "Object-Oriented Programming II"<br>events: vv-resize ×2, resize ×2, pointercancel |
| <img src="open-results/04-opened-a-result-4.jpg" width="220"> | **4. opened a result (4)** (ok, 48 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":487}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":404}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":155}}<br>after: swipe {"from":null,"start":{"x":206,"y":427},"end":{"x":206,"y":267},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":206,"y":316}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus section[aria-label="CMSC132"] at y 463.5–733.8<br>panel "Object-Oriented Programming II"<br>events: vv-resize ×2, resize ×2, pointercancel |
| <img src="open-results/05-opened-a-result-5.jpg" width="220"> | **5. opened a result (5)** (ok, 57 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":487}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":404}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":155}}<br>after: swipe {"from":null,"start":{"x":206,"y":427},"end":{"x":206,"y":267},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":206,"y":311}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus section[aria-label="CMSC132"] at y 463.5–733.8<br>panel "Object-Oriented Programming II"<br>events: vv-resize ×2, resize ×2, pointercancel |
| <img src="open-results/06-opened-a-result-6.jpg" width="220"> | **6. opened a result (6)** (ok, 66 s)<br>after: tap {"target":"[data-workbench-drawer] [data-layer][data-active] button \"Back to Search\"","at":{"x":40,"y":487}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":404}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":196,"y":155}}<br>after: swipe {"from":null,"start":{"x":206,"y":427},"end":{"x":206,"y":267},"ms":400,"intent":"scroll"}<br>after: hide keyboard {}<br>after: tap {"target":"#search-results [data-course-result]","at":{"x":206,"y":316}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus section[aria-label="CMSC132"] at y 463.5–733.8<br>panel "Object-Oriented Programming II"<br>events: vv-resize ×2, resize ×2, pointercancel |

<a id="add-sections"></a>

## Add a section from course details, then switch it three times

`add-sections` · [recording](add-sections/video.mp4)

| Screen | Step |
|---|---|
| <img src="add-sections/01-tapped-add-0101.jpg" width="220"> | **1. tapped Add 0101** (warn, 22 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":91,"y":437}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":206,"y":716}}<br>after: type {"text":"cmsc131"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"CMSC131\"]","at":{"x":206,"y":285}}<br>after: tap {"target":"[data-workbench-drawer] button[aria-label$=\"the panel\"]","at":{"x":206,"y":404}}<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Add 0101\"","at":{"x":374,"y":571}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus button#base-ui-_r_7t_[aria-label="Remove 0101 from Plan A"] at y 548.5–592.5<br>panel "Object-Oriented Programming I"<br>events: installed, vv-resize ×2, resize ×2<br>**warn drawer-moves-one-way**: 3 reversal(s) over 18 frames (48–609) |
| <img src="add-sections/02-tapped-switch-to-0102.jpg" width="220"> | **2. tapped Switch to 0102** (ok, 25 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0102\"","at":{"x":374,"y":643}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus button#base-ui-_r_86_[aria-label="Remove 0102 from Plan A"] at y 621.3–665.3<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/03-tapped-switch-to-0101.jpg" width="220"> | **3. tapped Switch to 0101** (ok, 28 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0101\"","at":{"x":374,"y":520}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus button#base-ui-_r_7t_[aria-label="Remove 0101 from Plan A"] at y 497.9–541.9<br>panel "Object-Oriented Programming I" |
| <img src="add-sections/04-tapped-switch-to-0103.jpg" width="220"> | **4. tapped Switch to 0103** (ok, 30 s)<br>after: tap {"target":"[data-section] button[aria-label^=\"Add \"], [data-section] button[aria-label^=\"Switch to \"] \"Switch to 0103\"","at":{"x":374,"y":665}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer full, top 48, inside 734.5px<br>keyboard down<br>focus button#base-ui-_r_8f_[aria-label="Remove 0103 from Plan A"] at y 643.4–687.4<br>panel "Object-Oriented Programming I" |

<a id="swipe-back"></a>

## Open a course, then swipe back from the screen's left edge: the page moves once

`swipe-back` · [recording](swipe-back/video.mp4)

| Screen | Step |
|---|---|
| <img src="swipe-back/01-cmsc131-open.jpg" width="220"> | **1. CMSC131 open** (ok, 18 s)<br>after: tap {"target":"[data-workbench-drawer] nav[aria-label=\"Tabs\"] button \"Search\"","at":{"x":91,"y":437}}<br>after: tap {"target":"input[aria-label=\"Search courses\"]","at":{"x":206,"y":498}}<br>after: type {"text":"cmsc131"}<br>after: hide keyboard {}<br>after: tap {"target":"[data-course-result=\"CMSC131\"]","at":{"x":206,"y":285}}<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus section[aria-label="CMSC131"] at y 463.5–733.8<br>panel "Object-Oriented Programming I"<br>events: installed, vv-resize ×2, resize ×2 |
| <img src="swipe-back/02-swiping-back-100-ms.jpg" width="220"> | **2. swiping back (+100 ms)** (ok, 19 s)<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus div#search-result-0 at y 592.3–664.3<br>panel "Search" |
| <img src="swipe-back/03-swiping-back-250-ms.jpg" width="220"> | **3. swiping back (+250 ms)** (ok, 20 s)<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus div#search-result-0 at y 592.3–664.3<br>panel "Search" |
| <img src="swipe-back/04-swiped-back.jpg" width="220"> | **4. swiped back** (ok, 22 s)<br>viewport 412×783, visual 783.2 tall at 0, scrollY 0<br>drawer half, top 391, inside 342px<br>keyboard down<br>focus div#search-result-0 at y 592.3–664.3<br>panel "Search" |
