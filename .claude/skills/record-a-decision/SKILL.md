---
name: record-a-decision
description: Add or change an entry in docs/decisions.md. Use when the owner decides something, when you make a choice that's hard to reverse and would surprise a reader, or when your PR changes an earlier decision.
---

# Record a decision

Adapted from Matt Pocock's ADR guidance in [domain-modeling](https://github.com/mattpocock/skills/tree/main/skills/engineering/domain-modeling), made lighter: one file, small entries, and a scope on each so a one-off choice never becomes a founding principle.

## Is it worth an entry?

Always, when the owner decides something. Otherwise, only when all three hold:

1. **Hard to reverse:** changing your mind later costs real work.
2. **Surprising:** someone reading the code would wonder why.
3. **A real trade-off:** there were genuine alternatives.

A naming choice, a refactor, a copy tweak, or anything the spec already says gets no entry. It goes in the PR body.

## Write it

Add it under the matching heading in `docs/decisions.md` (App-wide, a product, Feedback or Process):

```md
### A short title that states the choice
2026-10-01 · agent · one feature
The decision in one to three lines, with the owner's words in quotes when they're the reason.
Revisit if: the concrete thing that would make it wrong.
```

- **By:** `owner` when the owner said it; `agent` for anything you or another agent chose. Agent entries are defaults: anyone may change them in a PR that says why.
- **Scope:** `app-wide` only when it truly binds every product; otherwise `one feature`. When unsure, pick the narrower one.
- **Revisit if** is required. Name a real condition ("people hit conflicts often"), or "never on its own" for the owner's firm lines.
- Keep secrets, keys, account IDs and personal emails out. Write the contact address as "admin [at] terpsicle.com".

## Change one

Edit the entry in place and end it with "(changed <date>: why)". An owner entry changes only when the owner says so. Link the entry from the PR body.
