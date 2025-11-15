**Doc To DB**
- **Path**: `books/doc_to_db.ipynb`
- **Purpose**: Convert heterogeneous document files to plain text, deduplicate them, and build a persistent Chroma vector database ready for semantic search and queries.
- **Overview**: This notebook is split into three main scripts:
  - **Script A**: Upgraded File-to-Text converter. Scans `SOURCE_DIR` for `.pdf`, `.doc`, `.docx`, `.md`, and `.txt` files and converts them to `.txt` in `Text_Files` using `PyMuPDF`, `python-docx`, `antiword`, or direct reads for `.md/.txt`. It runs conversions in parallel with `ProcessPoolExecutor` and logs unsupported/errored files.
  - **Script B**: Fuzzy Hash Deduplicator. Uses `ssdeep` to create fuzzy hashes for each `.txt` and compares them pairwise; files over a similarity threshold (default 98%) are moved to a `Duplicates_Removed` folder and logged.
  - **Script C**: Text-to-Database builder. Loads cleaned `.txt` files, generates embeddings with `sentence-transformers` (default `all-MiniLM-L6-v2`), and populates a local ChromaDB (`PersistentClient`) then optionally moves the final DB to Google Drive.
- **Key Configuration Variables**:
  - `SOURCE_DIR` — input folder to scan (example in notebook: `/content/drive/MyDrive/main_shit`).
  - `MAIN_OUTPUT_DIRECTORY` — root for outputs (e.g., `/content/drive/MyDrive/Main_Shit_Output`).
  - `TEXT_OUTPUT_DIR` — `os.path.join(MAIN_OUTPUT_DIRECTORY, 'Text_Files')`.
  - `LOCAL_DB_PATH` and `FINAL_DB_PATH_ON_DRIVE` — local build path and final Drive path for the Chroma DB.
- **Notable Implementation Details**:
  - Script A treats `.md` like `.txt` (reads them directly) and includes resumability by skipping files that already exist in the text output location.
  - Script B performs an O(n^2) comparison of fuzzy hashes; this is accurate but can be slow for many files — consider blocking strategies (by size or sketch) for scale.
  - Script C batches documents (default `BATCH_SIZE = 50`) and writes processed file paths to a phase log so runs are resumable.
- **Dependencies**: `PyMuPDF` (`fitz`), `python-docx`, `tqdm`, `ssdeep`, `chromadb`, `sentence-transformers`, plus system packages like `antiword` and `libfuzzy-dev` for `ssdeep` support.
- **Run Notes**:
  - Mount Google Drive before running (notebook uses `drive.mount('/content/drive')`).
  - Verify `SOURCE_DIR` and `MAIN_OUTPUT_DIRECTORY` values match across scripts A→C.
  - Run scripts in order: A → B → C.
  - Keep an eye on Phase logs (`Script_State`) when resuming runs.
- **Pitfalls & Recommendations**:
  - For very large corpora, the fuzzy-comparison step will be slow; consider locality-sensitive hashing or chunking by file size to pre-filter candidates.
  - Ensure the embedding model and Chroma persistence path match when reloading (`SentenceTransformer('all-MiniLM-L6-v2')` used in the notebook).
  - Consider storing smaller text chunks per document (e.g., paragraph-level) before embedding to improve retrieval granularity.
- **Suggested Next Steps**:
  - Add a lightweight prefilter for Script B (e.g., compare only files within ±10% size or the same directory) to reduce comparisons.
  - Add a quick-check cell that reports counts of `.txt` files, duplicates moved, and DB document counts before/after running.

- **Last updated**: 2025-11-14

# `doc_to_db.ipynb` — Prepare documents for DB / vector index (expanded)

Overview
- Converts cleaned text files into a structured format suitable for database ingestion or vector indexing. Typical steps include text normalization, chunking, metadata extraction, and writing output files into a configured `MAIN_OUTPUT_DIRECTORY`.

Key sections
- Configuration: `SOURCE_DIR`, `MAIN_OUTPUT_DIRECTORY`, chunk size and other transform settings. These are the first cells — update them before running.
- Text normalization: lowercasing, whitespace normalization, optional regex cleanup, and sentence/paragraph splitting.
- Chunking and metadata: split long documents into chunks suitable for your vector model, attach metadata (source path, original offset).
- Output: save chunked JSON/NDJSON or CSV files to `MAIN_OUTPUT_DIRECTORY` for downstream ingestion.

Dependencies
- Standard libs: `os`, `json`, `re`.
- Optional libs: `tqdm` for progress bars; vector libraries if embedding in this notebook.

Run notes
- Validate `SOURCE_DIR` and `MAIN_OUTPUT_DIRECTORY` at the top of the notebook.
- If running in Colab, ensure Drive is mounted and paths point to Drive locations.

Quick example
```python
# Update paths
SOURCE_DIR = '/content/drive/MyDrive/main_shit'
MAIN_OUTPUT_DIRECTORY = '/content/drive/MyDrive/Main_Shit_Output'
# Run conversion cells
```

Recommendation
- After running, inspect a few output chunks to verify that chunk boundaries and metadata look correct before bulk ingestion.
