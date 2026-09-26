---
name: glossary
description: Use Terpsicle's words from CONTEXT.md, and add new ones. Use when writing UI copy, naming a component, type, route, table or analytics event, or when a PR introduces a concept the glossary doesn't have.
---

# Glossary

`CONTEXT.md` at the repo root is the ubiquitous language: the words for Terpsicle's products and what's in them, shared by copy, code, docs and PRs. Adapted from Matt Pocock's [domain-modeling](https://github.com/mattpocock/skills/tree/main/skills/engineering/domain-modeling) glossary format.

## Before you name or write

Look the concept up in `CONTEXT.md` and use its word. Words under `_Avoid_` stay out of the UI. Where code names differ on purpose (the four-year plan is `FourYear` in code), follow the entry.

UI copy also follows `docs/SPEC.md` §3.13: plain words, active voice, contractions, specific errors.

## Add a term

When your PR introduces a concept people will talk about, add it in the same PR, under the right heading:

```md
**Term**:
One or two sentences on what it is, not how it works.
_Avoid_: the synonyms you picked against
```

- Be opinionated: pick one word and list the rest under `_Avoid_`. Only list avoided words you've seen used or that collide with another term.
- Keep it a glossary. Code paths, schemas and behavior belong in `docs/`.
- Only Terpsicle's own concepts. General programming words don't go in.
- If a term's meaning changes, edit the entry and grep the UI for the old word.

If your word disagrees with an entry, the entry wins, or your PR changes the entry and says why.
