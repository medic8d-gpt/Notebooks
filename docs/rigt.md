# `rigt.ipynb` — Canonical downloader / OCR helper (expanded)

Overview
- This is the canonical merged/hybrid downloader and OCR helper notebook. It was created by merging two variants of a Colab downloader and contains utility cells for:
	- mounting Google Drive,
	- scanning a directory of downloaded text files,
	- counting word frequencies to produce an OCR correction map,
	- resuming Archive.org downloads using either the `ia` CLI or `internetarchive` Python API.

Key features and structure
- Cell 1 — Drive mount and high-level description: mounts `'/content/drive'` for Colab runs and prints status.
- Cell 2 — Configuration: `SOURCE_DIRECTORY` and `OUTPUT_FILE` variables. CHECK THESE before running. Defaults point to `'/content/drive/MyDrive/KDN_Archive_Downloads/Lexington_Subset'` and `'/content/drive/MyDrive/KDN_Archive_Downloads/word_frequency.txt'`.
- Cell 3 — `count_words(source_dir)`: regex-based word extractor (lowercases alphabetic words), updates a `Counter` and returns frequency counts.
- Cell 4 — Main loop: runs `count_words`, writes `word_frequency.txt`, prints timing and counts.
- Additional cells — archive download/resume helpers: logic to list already-downloaded `*_djvu.txt` files, find the last downloaded item, and resume `ia download` in batches. There are also convenience cells that call `internetarchive.search_items` and `ia` CLI commands.

Important variables to review
- `SOURCE_DIRECTORY` — the directory to scan for `.txt` files.
- `OUTPUT_FILE` — path to write `word_frequency.txt`.
- `glob_pattern` used for `ia download` — usually `"*_djvu.txt"`.

Dependencies
- Standard library: `os`, `re`, `time`, `collections.Counter`, `subprocess`.
- Optional: `internetarchive` (Python package) or `ia` CLI installed in the environment. `requests` is used for metadata calls. The top-level `requirements.txt` includes `nltk`, `requests`, `internetarchive`, `tqdm`.

Run notes
- Best run interactively in Google Colab. If running locally, change or remove drive mount cells and set `SOURCE_DIRECTORY` to a local path.
- If using the resume logic, ensure `ia` CLI is installed and authenticated (or use `internetarchive` with credentials).

Quick example (in Colab cell):
```python
# update paths if needed
SOURCE_DIRECTORY = '/content/drive/MyDrive/KDN_Archive_Downloads/Lexington_Subset'
OUTPUT_FILE = '/content/drive/MyDrive/KDN_Archive_Downloads/word_frequency.txt'
word_counts = count_words(SOURCE_DIRECTORY)
with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
		for word, count in word_counts.most_common():
				f.write(f"{count}\t{word}\n")
```

Notes & recommendations
- The word regex (`\b[a-z]+\b`) ignores numbers and punctuation — if your dataset uses contractions or other characters, modify the regex accordingly.
- Consider running the word counting cell on a small sample first to validate paths and encoding.
