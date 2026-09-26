# UX principles for implementers

A short, practical brief. `DESIGN.md` §5 says what the owner likes. This says why those choices work and how to apply them to a screen you're building. Each principle ends with what it means for Terpsicle. The system that puts these into practice (type scale, spacing, panel anatomy) is in `UX-REVIEW.md` §2.

## 1. Visual hierarchy

- **Emphasize by de-emphasizing.** If something doesn't stand out, make everything around it quieter before making it louder: lighter color, lighter weight, smaller size [1]. Hierarchy comes from **weight and color more than size**. Use about three text colors (primary, secondary, tertiary) and two weights (regular, and medium or semibold) [1].
  - *Terpsicle:* `text-fg` / `text-muted` / `text-faint`, and weights 400/500/600 only. A course code is semibold mono. Everything else in the row is regular, and anything that isn't the answer to "can I take this?" is muted.
- **A limited type scale.** A handful of sizes chosen up front beats values picked per component [1][6]. The app uses 12 sizes today (9 to 15px, in half-pixel steps).
  - *Terpsicle:* five steps: 11/12/13/15/18 (`UX-REVIEW.md` §2.1).
- **Position.** People read the top-left of a region first and the start of each line most [4].
  - *Terpsicle:* identity (code) on the left, status (fit, seats) on the right, the action at the far right, in the same columns on every row.

## 2. Gestalt: grouping

- **Proximity:** things near each other read as a group [5]. **Similarity:** things that look alike read as the same kind of thing [5]. **Common region:** a boundary (border or fill) groups more strongly than spacing [5]. **Uniform connectedness:** a line or bar that joins items groups them [5].
- Use the **weakest grouping that works**: spacing, then a hairline, then a fill, then a border. Never use a border and a fill for the same group.
  - *Terpsicle:* lists are hairline-separated rows inside the panel, never cards (today Travel's connections, the Export checklist and the "fix this" lists are cards, while Courses and Search are rows). A group header is a tinted bar (`bg-panel`). A card (rounded border) is for one standalone object, like a first-visit path or an instructor's review summary.

## 3. Information architecture

- **Progressive disclosure:** show what people frequently need up front, and defer the rest to a secondary layer they visit rarely [3]. Primary content is what the screen exists for. Secondary content supports a decision about the primary.
  - *Terpsicle:* in course details, sections are primary. Prerequisites and instructor ratings are needed *while* choosing, so they're primary too. Full reviews and grade bars are secondary.
- **The cost of tabs:** tabs work for a few distinct groups that people don't need to see at the same time [2]. They fail when people must compare across them, because switching "taxes users' short-term memory" [2]. Tabs placed below or away from their content get overlooked [2].
  - *Terpsicle:* course details' Instructors/Grades/About tabs sit under 1 to 92 section rows, often below the fold, and hold the instructor data people need while picking a section. This is the owner's complaint, in NN/g's terms.
- **Accordions and long pages:** accordions suit content people need only a few pieces of. Hiding content costs clicks and discoverability, and prevents seeing two parts at once [7]. A long page with **in-page links** (a small table of contents near the top) helps people navigate long content, as long as the links are visible without scrolling [8].
- **Information scent:** labels predict what's behind them [9]. "Too close" doesn't say "not enough time to walk from CMSC330". "Reviews" does say what it opens.
- **F- and Z-patterns:** in text-heavy lists, eyes scan the left edge and the first words of each line, and miss the right side [4]. Front-load the distinguishing words.
  - *Terpsicle:* a section row starts with its code and then *what differs* (the discussion time), not the shared lecture time that every row repeats.

## 4. Density done well

Linear, Vercel, GitHub and Stripe fit a lot on screen and still feel calm:
- **Alignment:** Linear spent a redesign aligning labels, icons and buttons "vertically and horizontally" [10]. Invisible alignment is what makes density read as order.
- **Restrained color:** the navigation is dimmer than the content, and the brand color is barely used in chrome [10][11]. There's one accent.
- **A 4px spacing rhythm** (4, 8, 12, 16, 24, 32) [12], hairlines between rows rather than boxes, and tabular figures in columns.
- **Consistent headers and controls** across views [11].
  - *Terpsicle:* dense is the owner's taste ("lots of info here, dense is better"). Keep 13px, but earn it with the same row grid everywhere, one accent (black/white), status color only on status words, and sticky section headers so dense lists keep their context.

## 5. Interaction laws

- **Fitts's law:** time to hit a target depends on its distance and size [5]. Put the frequent action close to what it acts on, and make row targets generous. *Terpsicle:* the Switch button stays in the row, at a fixed column. Ghosts on the calendar are the big targets.
- **Hick's law:** decision time grows with the number of choices [5]. *Terpsicle:* 92 rows each with an "Add" button is 92 equal choices. Group them (by instructor, or by time) and filter them ("Only fits") so the eye picks a group first.
- **Jakob's law:** people expect your app to work like the others they use [5]. *Terpsicle:* sidebar-and-calendar like Google Calendar, filter chips like Linear, drill-in with one Back like a phone's navigation (it was a breadcrumb like Finder's until the owner asked for Back).
- **Miller's law and chunking:** working memory holds only a few items, so chunk information into meaningful groups [5]. *Terpsicle:* sections chunk by instructor, then by shared lecture.
- **Aesthetic-usability effect:** attractive interfaces are perceived as easier to use [5]. *Terpsicle:* polish (alignment, one type scale) isn't vanity. It buys trust in the numbers.

## 6. Nielsen's 10 heuristics, as a checklist [13]

1. **Visibility of system status:** seat freshness, "Checking…", undo toasts.
2. **Match with the real world:** Testudo's words (section, lecture, discussion), and "Accessible routes".
3. **User control and freedom:** undo everywhere, `Esc` goes back.
4. **Consistency and standards:** one row pattern, and one way to open a course.
5. **Error prevention:** "Only fits", and the fit label on every section.
6. **Recognition rather than recall:** show the instructor's rating where you pick the section, instead of on another tab.
7. **Flexibility and efficiency:** shortcuts in tooltips.
8. **Aesthetic and minimalist design:** no repeated lecture times, no redundant "In your plan" next to "Current".
9. **Help recognize, diagnose and recover from errors:** specific problem messages with one-click fixes.
10. **Help and documentation:** the first-visit guide and "How?" in Travel.

## 7. Narrow sidebars and detail panels

- **Sticky headers** keep context in long scrolls, but they take space, so use them responsibly [14]. They must stay in a fixed spot rather than slide in late [14].
  - *Terpsicle:* at most **two** sticky levels in a panel: the section header ("Sections · 3 of 14 fit") and the group header (the instructor). The Back bar is outside the scroll area already.
- **Section headers with counts** ("Sections · 3 of 14 fit") give scent and progress at once.
- **Collapsible groups** for long lists. Remember what people collapsed (the app already does).
- **Truncate the least distinguishing part.** Truncate rooms, not times. Never truncate the only thing that differs between two rows (today CMSC330's Friday discussion time is the part cut off). Every truncation gets a tooltip.
- **Scroll containment:** one scroll area per panel (`PanelBody`). Nested scroll regions are a trap on a 360px sidebar.

## 8. Tables and lists

- **Columns aligned across rows** make scanning a vertical task. Left-align text, right-align numbers so magnitudes line up, and use tabular figures [15][16].
- **Row hover** tracks the eye better than heavy grid lines [16].
- **When to use columns:** when rows are compared on the same attributes (sections: time, fit, seats). When rows are read one by one (problems), a sentence with a leading icon is better.
  - *Terpsicle:* section rows become a 4-column grid: `code | when and where (+ fit) | seats | action`.

## Sources

1. Wathan and Schoger, *Refactoring UI*, as summarized in [sglavoie.com's book summary](https://www.sglavoie.com/posts/2023/09/09/book-summary-refactoring-ui/) and [notes on GitHub](https://gist.github.com/selcukcihan/b9418596a98abfcd4bbc622550820cc5).
2. NN/g, [Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/).
3. NN/g, [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/).
4. NN/g, [F-Shaped Pattern of Reading on the Web](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/).
5. [Laws of UX](https://lawsofux.com/) (Fitts, Hick, Jakob, Miller, chunking, aesthetic-usability, proximity, similarity, common region, uniform connectedness).
6. Vercel, [Geist](https://vercel.com/geist/introduction) (a fixed set of label and copy sizes).
7. NN/g, [Accordions on Desktop](https://www.nngroup.com/articles/accordions-on-desktop/).
8. NN/g, [In-Page Links for Content Navigation](https://www.nngroup.com/articles/in-page-links-content-navigation/) and [Table of Contents](https://www.nngroup.com/articles/table-of-contents/).
9. NN/g, [Information Scent](https://www.nngroup.com/articles/information-scent/).
10. Linear, [How we redesigned the Linear UI (part II)](https://linear.app/now/how-we-redesigned-the-linear-ui).
11. Linear, [A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh).
12. GitHub Primer, [Spacing](https://primer.style/css/support/spacing/).
13. NN/g, [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).
14. NN/g, [Sticky Headers: 5 Ways to Make Them Better](https://www.nngroup.com/articles/sticky-headers/).
15. A List Apart, [Designing Tables to be Read, Not Looked At](https://alistapart.com/article/web-typography-tables/).
16. Pencil & Paper, [Data Table Design UX Patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables).
