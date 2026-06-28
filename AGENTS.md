# AGENTS.md — Standing instructions for any AI coding agent in this repo

Read this file FIRST, every session, before touching any code. Then read
`context.md` for full project background and decisions already made.

---

## File access rules

- **Do not open, read, or load raw data files** (`datasets/raw_data/**/*.grd`,
  `*.GRD`) unless the task explicitly requires debugging the binary parser
  itself. These are large binary files — opening them for unrelated tasks
  wastes time and context for no benefit.
- **Do not open `.npz` files in `datasets/clean_data/`** unless the task is
  specifically about the training script or data validation. Trust that
  `build_dataset.py` already produced them correctly unless told otherwise.
- If a task needs to know data shape/format, READ `context.md` section 4
  first — the exact grid sizes, missing-value flags, and verified facts
  are already documented there. Do not re-derive or re-guess them.
- Never commit, move, or modify anything inside `datasets/raw_data/` or
  `datasets/clean_data/` unless explicitly asked to. These are
  user-managed data folders, not code.

## Before writing any code

- Check `context.md` section 3 ("Hard constraints") before generating
  anything. These are non-negotiable: no ward-level claims, no flood-risk
  claims without caveat, no fabricated numbers, free tools only, no LLM/API
  keys in the core pipeline, no NWP-replacement framing.
- Check `context.md` section 6 for what's already built vs. what's next.
  Don't rebuild something that already exists and works — extend it.
- If a decision in `context.md` seems wrong or outdated, ASK before
  overriding it. Don't silently change a locked decision (e.g. grid size,
  year range, dataset choice).

## Coding style / output rules

- Keep scripts runnable standalone with `python script_name.py` — no
  hidden dependencies on notebook state or manual variable setup.
- Every new script should print clear, human-readable progress output
  (what's being processed, what succeeded/failed) — this project is run
  by a non-expert on data engineering, not just by other engineers.
- Validate inputs and fail with a clear message rather than crashing
  cryptically or silently producing wrong output (the existing scripts —
  `imd_parser.py`, `build_dataset.py` — follow this pattern; match it).
- Never silently invent placeholder numbers that look like real results
  (e.g. fake RMSE values). If a number isn't computed yet, leave it
  explicitly marked as TODO/placeholder.
- Prefer free, locally-runnable tools and small models. This project
  trains on a free-tier Colab/Kaggle GPU in under an hour — don't suggest
  paid APIs, paid compute, or heavyweight cloud infra for the core pipeline.

## When making changes

- After any change to `build_dataset.py`, `imd_parser.py`, or
  `maharashtra_fusion.py`, re-run the script against whatever sample data
  exists in `datasets/raw_data/` to confirm it still works before
  considering the task done.
- Update `context.md` section 5/6 ("what's built" / "what's next") when a
  new piece is completed, so the next session (or next Codex account
  switch) has an accurate picture without re-reading all the code.
- Keep `requirements.txt` up to date whenever a new pip package is used.

## Things to never do

- Never add INSAT/MOSDAC as a hard dependency for any script to run —
  it's optional, designed-for-later, not required for the current demo
  (see context.md section 4, "INSAT — NOT YET INTEGRATED").
- Never restructure the `datasets/` folder layout without explicit
  permission — multiple scripts and the user's own manual file management
  depend on the current paths staying stable.
- Never add an LLM call, API key requirement, or external paid service
  into the data pipeline or model training code.
