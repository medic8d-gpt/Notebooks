**Notebooks — Project Workspace**

```
  ____        _   _             _       _
 |  _ \ _   _| |_| |__   ___   / \   __| |_   _
 | |_) | | | | __| '_ \ / _ \ / _ \ / _` | | | |
 |  __/| |_| | |_| | | |  __// ___ \ (_| | |_| |
 |_|    \__, |\__|_| |_|\___/_/   \_\__,_|\__, |
        |___/                             |___/
```

This repository is a collection of Jupyter notebooks, web projects, documentation, and helper scripts used for data processing, web development, and automation workflows.

**What this repo contains:**
- **`books/`**: Jupyter notebooks for data-processing, downloader helpers, and duplicate management
- **`code/`**: Small utilities and helpers (filename normalizers, shell helpers)
- **`doc_shit/`**: Documentation, credentials, AI/GPT configs, and web code snippets
- **`docs/`**: Markdown documentation converted from notebooks
- **`gpt-site-builder/`**: Node.js web project for GPT-powered site building
- **`kowledge_joe/`**: HTML research pages
- **`ops-wall-mvp/`**: Operations dashboard MVP project
- **`scripts/`**: Shell scripts for backup and automation
- **`spotapp/`**: Spotify library editor applications

**Quick Links** (files discovered in this workspace)
- **Root Notebooks**: [doc_to_db.ipynb](doc_to_db.ipynb)
- **Notebooks (`books/`)**: [articles_to_cleandb.ipynb](books/articles_to_cleandb.ipynb), [clay_city_times_2.ipynb](books/clay_city_times_2.ipynb), [clay_city_times_vector_db.ipynb](books/clay_city_times_vector_db.ipynb), [colab_file_converter.ipynb](books/colab_file_converter.ipynb), [db_markdown.ipynb](books/db_markdown.ipynb), [doc_to_db.ipynb](books/doc_to_db.ipynb), [dupeshit.ipynb](books/dupeshit.ipynb), [find_dupes_hybrid.ipynb](books/find_dupes_hybrid.ipynb), [markdown_vector_embedder.ipynb](books/markdown_vector_embedder.ipynb), [thekygazzette.ipynb](books/thekygazzette.ipynb)
- **Scripts (`code/`)**: [ipynb_namer.py](code/ipynb_namer.py), [snake_casey.py](code/snake_casey.py), [usergroupmaker.sh](code/usergroupmaker.sh)
- **Web Projects**: [gpt-site-builder/](gpt-site-builder/), [ops-wall-mvp/](ops-wall-mvp/), [spotapp/](spotapp/)
- **Documentation**: [docs/](docs/), [doc_shit/](doc_shit/)

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

**GPT & Custom Agent Integration (Prototyping)**

- **Why add a GPT/Agent layer?**
  - Use a lightweight agent to automate repetitive notebook tasks: run pipeline phases, validate outputs, generate summaries, or guide chunking/embedding decisions.
  - Combine retrieval (ChromaDB), local helpers (scripts in `code/`), and an LLM to make interactive, repeatable workflows.

- **How to start (quick recipe)**
  1. Pick a small workflow step (e.g., text conversion → dedupe check → quick embedding summary).
  2. Wrap that step in a callable script (e.g., `code/convert_files.py`, `code/fuzzy_dedupe.py`).
  3. Create a prompt-template that instructs the agent when to call which script and what to return (status, errors, short summary).
  4. Use a minimal agent loop (below) that: receives task, runs script/tool, returns results, and optionally asks the user follow-up prompts.

- **Simple prompt template (example)**

```text
You are a helpful automation agent. The user gives you a high-level task and you may call local tools.
Tools available: convert_files, fuzzy_dedupe, build_db.
When you run a tool, return a one-line summary of the result and any important warnings.

Task: "Prepare the sample folder for embedding and report how many files will be embedded."

Steps:
1) Run: convert_files --source <path> --output <text_out>
2) Run: fuzzy_dedupe --text-dir <text_out> --threshold 98
3) Inspect <text_out> and report count of .txt files.

Return format (JSON): {"steps": [{"tool":"convert_files","status":"OK","note":"..."}, ...], "final_count": 123}
```

- **Minimal Python agent loop (pseudo-code)**

```python
import subprocess, json

def run_tool(cmd):
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return p.returncode, p.stdout.splitlines()[-5:]

def simple_agent(task):
    # parse task -> decide tool calls (very small planner)
    r1, out1 = run_tool('python code/convert_files.py --source ./sample --output ./out')
    r2, out2 = run_tool('python code/fuzzy_dedupe.py --text-dir ./out --out ./dupes')
    count = len(list(Path('./out').rglob('*.txt')))
    return {'steps':[('convert',r1),('dedupe',r2)], 'final_count': count}
```

- **Libraries & patterns**
  - Use `openai` or `langchain` for model calls; use `chromadb` for retrieval; local Python scripts for deterministic ops.
  - Keep prompts explicit about which local tools the agent may call and required output format (JSON preferred for parsing).
  - Add a safety/backup step before destructive actions (move/delete): agent should call `backup_and_delete.sh --dry-run` first.

- **Example use-cases**
  - Automated run: convert a new folder, dedupe, build embeddings, and create a small `report.json` summarizing progress.
  - Interactive assistant: ask the agent what chunk size to use (based on file sizes) and accept a suggested configuration.
  - Continuous monitor: an agent that watches a folder and triggers processing when new files appear.

**Developer notes**
- Start small: prototyping a simple agent that orchestrates local scripts is easier than building a full RL-agent. Store prompt templates in `docs/` or `code/prompt_templates/` so they are versioned.
- When the agent runs local tools, prefer deterministic outputs (JSON or well-structured logs) so the agent can reliably parse results.


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
