# `find_dupes_hybrid.ipynb` — Merged duplicate-finding notebook

Overview
- A small hybrid notebook produced by merging two `find_dupes` variants. It documents comparison logic used to detect duplicate notebooks and demonstrates merging unique cells into a single working notebook.

Contents
- Short comparison routine that:
  - loads two notebooks as JSON,
  - normalizes cell `source` to strings,
  - compares cell sets by (cell_type, source) to find shared and unique cells,
  - prints counts and writes a merged notebook containing all unique cells.

When to use
- Useful as an example and template for programmatic notebook merging. Not intended as a production dedupe tool but a practical helper when you need to combine small variations of the same analysis.

Run notes
- The notebook expects relative paths to the two notebooks you want to compare and will write a combined `*_hybrid.ipynb` output.

- **Last updated**: 2025-11-14
