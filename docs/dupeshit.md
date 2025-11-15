
# `dupeshit.ipynb` — Deduplication utility (expanded)

Overview
- Notebook-based utilities for finding and relocating duplicate files across a directory tree. Useful for cleaning large exported datasets (e.g., OCR results, scraped text) before indexing or processing.

High-level behavior
- Stage 1: Group files by size (fast filter) — reduces hash computations.
- Stage 2: Compute SHA-256 for candidate groups to confirm true content duplicates.
- Stage 3: For duplicate groups, choose one file to keep and move other copies into a `dupeshit/` folder (or a configurable `mddupes/` destination).

Detailed functions and cells
- `get_file_hash(filepath)` — returns SHA-256 hex digest or `None` on error; reads files in 4KB chunks.
- `find_and_move_duplicates()` — main routine that:
	- creates `dupeshit/` (if missing),
	- walks the start directory (skips the `dupeshit` folder),
	- groups by file size, computes hashes for candidate groups, and moves duplicates.
	- By default it keeps the oldest file in a group (based on `os.path.getmtime`).
- `verify_and_move_duplicates(file_list_path, dest_folder="mddupes")` — parses `ls -ls` output and applies the same hash-based verification/move logic. Helpful when you produce an `ls` listing first.
- `move_duplicates_by_filename(file_list_path, dest_folder="mddupes")` — simpler filename-pattern-based mover that looks for ` (n)` suffixes.

Configuration & safety
- The script uses `os.getcwd()` as the start directory — run the notebook from the folder you want to scan or modify the `start_dir` variable.
- Name collisions in `dupeshit/` are handled by appending `_1`, `_2`, etc.
- The code intentionally prints actions (keeps and moves). Review output before running destructive moves.

Run examples
- Run the main scanner cell to perform a live dedupe run:
```python
find_and_move_duplicates()
```
- To operate on an `ls -ls` list you pre-generated:
```python
verify_and_move_duplicates('sizeaftersnake.txt')
```

Recommendations
- Do a dry-run by printing moves or by copying `shutil.move` to a `shutil.copy2` call in a temporary run.
- Run the notebook in a small test folder first to verify behavior.

- **Last updated**: 2025-11-14
