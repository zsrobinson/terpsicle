---
name: grill-me
description: Interview the owner about a plan or design until nothing's left assumed, and write down the words and decisions it settles.
disable-model-invocation: true
---

# Grill me

Adapted from Matt Pocock's [grilling](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling) and [grill-with-docs](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs).

Interview the owner relentlessly until you share one understanding of the plan. Map it as a **design tree**: every decision branches into the decisions that hang off it.

Work in **rounds**. The **frontier** is every decision whose prerequisites are settled. Ask the whole frontier at once, numbered, each with your recommended answer:

```
**Q1: <title>**: <the question, with the options>

Recommended: <your answer, and why>
```

Wait for the answers, then recompute the frontier. A question that depends on another open question waits for a later round.

Facts are your job: look them up in the code, `docs/`, `CONTEXT.md` and `docs/decisions.md` (or send a subagent) instead of asking. Decisions are the owner's. Check each answer against `docs/SPEC.md` §1 and `docs/DESIGN.md` §5, and point out where it pulls against them.

As things settle:

- a word gets pinned down → call the Skill tool with "glossary" and update `CONTEXT.md`;
- a choice meets the bar → call the Skill tool with "record-a-decision". Mark its scope honestly: a choice about one screen is `one feature`, however firmly it was said.

You're done when the frontier is empty and the owner confirms the summary. Build nothing until then.
