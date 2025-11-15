**Detailed Comparisons: cell-by-cell mapping and example commands**

This file provides a cell-by-cell map for two key notebooks (`doc_to_db.ipynb` and `markdown_vector_embedder.ipynb`) and includes example commands / snippets to run key parts outside Colab.

---

Section A — `doc_to_db.ipynb` (cells summarized, Cell numbers start at 1)

- Cell 1 (Markdown): Title and description for Script A: upgraded file→text converter. Explains supported formats and parallel processing.
- Cell 2 (Code): Script A implementation — installs packages, mounts Google Drive, defines `process_file(...)` and configuration. Key points:
  - Installs `PyMuPDF`, `python-docx`, `tqdm` and system `antiword`.
  - `process_file(source_path, target_path, file_ext_lower)` handles `.pdf`, `.docx`, `.doc`, `.md`, `.txt`.
  - Uses `ProcessPoolExecutor` to run conversions in parallel.
  - Example snippet to run outside Colab (bash + python):

```bash
# ensure dependencies installed
pip install PyMuPDF python-docx tqdm
sudo apt-get install -y antiword poppler-utils

# Run the converter script (assumes it's saved as convert_files.py)
python convert_files.py --source /path/to/source --output /path/to/output
```

- Cell 3 (Markdown): Header introducing Script B (fuzzy dedupe).
- Cell 4 (Code): Script B implementation — installs `ssdeep`, scans `Text_Files`, computes hashes, O(n^2) pairwise compare, moves duplicates to `Duplicates_Removed`.
  - Key variables: `TEXT_SOURCE_DIR`, `DUPLICATE_DIR`, `SIMILARITY_THRESHOLD = 98`.
  - Example command to run outside Colab (after installing ssdeep):

```bash
pip install ssdeep tqdm
# Run dedupe script
python fuzzy_dedupe.py --text-dir /path/to/Text_Files --out /path/to/Duplicates_Removed --threshold 98
```

- Cell 5 (Markdown): Header for Script C: Text→Database builder.
- Cell 6 (Code): Script C implementation — mounts Drive, sets `MAIN_OUTPUT_DIRECTORY`, initializes `SentenceTransformer('all-MiniLM-L6-v2')`, creates a local Chroma persistent DB (`LOCAL_DB_PATH`), batch-encodes files and adds to collection.
  - Batching: `BATCH_SIZE = 50` and writes processed file paths to `PHASE4_LOG` for resumability.
  - Example command to run embedding step outside Colab (needs chromadb + sentence-transformers):

```bash
pip install chromadb sentence-transformers
python build_db.py --text-dir /path/to/Text_Files --local-db /tmp/local_chroma_db --batch-size 50
```

- Cells following (Code & Markdown): testing queries (test query with `collection.query(...)`), moving the final DB to Google Drive (mv local→drive), and final status prints.

Notes / suggested cell-level improvements for `doc_to_db.ipynb`:
- Add a small pre-filter cell before Script B to bucket files by size and only compare within buckets to reduce O(n^2) comparisons.
- Add an optional chunking step before Script C to split long `.txt` files into paragraph-level docs for better retrieval.

---

Section B — `markdown_vector_embedder.ipynb` (Cells summarized)

- Cell 1 (Code): Installs packages: `openai`, `chromadb`, `faiss-cpu`, `tqdm`, `google-auth`, `google-colab`, and `langchain-community`.
- Cell 2 (Code): Loads OpenAI API key from Colab secrets (via `userdata.get('OPENAI_API_KEY')`) and sets `os.environ['OPENAI_API_KEY']`.
- Cell 3 (Code): Main embedding flow:
  - Mounts Drive, asks for `input_dir` (interactive), sets `output_root`, `output_dir = session_{timestamp}`.
  - Discovers `.md` files and adds them whole to a Chroma DB using `OpenAIEmbeddings(model='text-embedding-3-large')`.
  - Starts a heartbeat thread for feedback and writes `report.json` and `embedding_report.html` to `output_dir`.
  - Example command to run a similar process outside Colab (non-interactive):

```bash
pip install openai chromadb faiss-cpu langchain
python embed_markdown.py --input /path/to/md --output /path/to/output --model text-embedding-3-large
```

- Cell 4 (Code): Optional loader for existing DB sessions — sets `vector_db = Chroma(..., persist_directory=existing_db_path)` for export or queries.
- Cell 5 (Code): JSON export cell — retrieves `vector_db.get(...)`, chunks into JSON files ≤ ~15.5 MB with `export_info` metadata.

Notes / suggested cell-level improvements for `markdown_vector_embedder.ipynb`:
- Add a text-splitting step (e.g., sentence or paragraph splitter) before `vector_db.add_texts(...)` so each embedded item is smaller and more retrievable.
- Add batching and retry logic for OpenAI calls (exponential backoff) and tracking of token usage in `report.json`.

---

Example: minimal Python runner to chunk and embed (pseudo-code)

```python
from langchain.embeddings import OpenAIEmbeddings
from langchain.vectorstores import Chroma
import os

def chunk_text(text, max_chars=2000):
    parts = []
    while text:
        parts.append(text[:max_chars])
        text = text[max_chars:]
    return parts

emb = OpenAIEmbeddings(model='text-embedding-3-large')
db = Chroma(collection_name='md', persist_directory='/tmp/md_db', embedding_function=emb)

for md_file in md_files:
    text = open(md_file, 'r', encoding='utf-8').read()
    chunks = chunk_text(text)
    db.add_texts(chunks, metadatas=[{'file': md_file}] * len(chunks))
db.persist()
```

---

Formatting/consistency pass applied: I will add a `Last updated` footer to the main `docs/*.md` pages to help track changes.

- **Last updated**: 2025-11-14
