**Notebooks — Project Workspace**

```
  ____        _   _             _       _
 |  _ \ _   _| |_| |__   ___   / \   __| |_   _
 | |_) | | | | __| '_ \ / _ \ / _ \ / _` | | | |
 |  __/| |_| | |_| | | |  __// ___ \ (_| | |_| |
 |_|    \__, |\__|_| |_|\___/_/   \_\__,_|\__, |
        |___/                             |___/
```

This repository is a lightweight collection of Jupyter notebooks and a few helper scripts used to discover, merge, and clean dataset notebooks and text files. The workspace lives in the `Notebooks/` folder and is organized minimally into `books/` (notebooks) and `code/` (utility scripts).

**What this repo contains:**
- **`books/`**: collection of user notebooks — data-processing, downloader helpers, and duplicate management notebooks.
- **`code/`**: small utilities and helpers (filename normalizers, shell helpers).

**Quick Links** (files discovered in this workspace)
- **Notebooks (`books/`)**: `rigt.ipynb`, `doc_to_db.ipynb`, `dupeshit.ipynb`, `find_dupes_hybrid.ipynb`, `colab_file_converter.ipynb`, `markdown_vector_embedder.ipynb`, `clay_city_times_2.ipynb`, `clay_city_times_vector_db.ipynb`, `articles_to_cleandb.ipynb`
- **Scripts (`code/`)**: `ipynb_namer.py`, `snake_casey.py`, `usergroupmaker.sh`

**Why this repo exists**
- Centralize working notebooks and small scripts for text processing, archive downloads, and deduplication workflows.
- Provide repeatable tools to merge duplicates, normalize notebook metadata, and prepare cleaned datasets for downstream vectorization or analysis.

**Usage — quick start**
- Open any notebook in `books/` with your preferred Jupyter/Colab environment.
- Scripts in `code/` are small utilities. Typical usage examples:

  - Rename notebooks quickly (run locally):

    ```bash
    python3 code/ipynb_namer.py path/to/notebooks
    ```

  - Run a helper shell script (make executable first):

    ```bash
    chmod +x code/usergroupmaker.sh
    ./code/usergroupmaker.sh
    ```

**Key Notebooks & Scripts (what they do)**
- **`books/rigt.ipynb`** — canonical merged notebook (renamed from a hybrid merge of a downloader workflow). Contains Google Colab oriented scripts for scanning a downloaded archive subset, counting word frequencies, and building an OCR correction map.
- **`books/doc_to_db.ipynb` & `books/colab_file_converter.ipynb`** — scripts that prepare textual files for insertion into a database or vector store. Expect Drive-mount steps and path configuration.
- **`books/dupeshit.ipynb`** — a reusable dedupe utility implemented in notebook form. It scans directories, groups files by size and hash, keeps the oldest (or alphabetically first) file, and moves duplicates to a `dupeshit/` folder. Useful when cleaning a large export of files.
- **`books/find_dupes_hybrid.ipynb`** — hybrid created from two versions of a `find_dupes` notebook: shows comparison logic and merged unique cells.
- **`code/ipynb_namer.py`** — (utility) helps normalizing notebook filenames and optionally canonicalizing names.
- **`code/snake_casey.py`** — small helper to convert names to snake_case; used for consistent file naming.
- **`code/usergroupmaker.sh`** — a shell helper script used interactively.

**Recommended workflow**
1. Inspect `books/` notebooks and run them in Colab or a local Jupyter server (they assume Drive mounts or local folders — review path variables first).
2. Use `dupeshit.ipynb` to find and relocate duplicate files in a project folder before heavy processing.
3. When merging duplicate notebooks, keep one canonical file without `merged`/`hybrid` suffixes (this repo has `rigt.ipynb` as an example).

**Developer notes**
- Files use simple Python stdlib — no special dependencies beyond common data libs (e.g., `nltk` may be used in notebooks that build language maps). Run `pip install` in the notebook environment as needed.
- Notebooks are Colab-friendly: expect explicit `drive.mount('/content/drive')` steps.

**Contributing**
- Add notebooks or scripts in the `books/` or `code/` folders. Open a PR with a summary of what the notebook does and which datasets it expects.

**License**
- This is a private personal workspace; add a license file if you plan to share publicly.

**ASCII sig**

```
  Stay tidy — keep one canonical copy.  ~ Notebooks Toolkit
```

----
