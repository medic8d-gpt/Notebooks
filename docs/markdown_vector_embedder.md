**Markdown Vector Embedder**
- **Path**: `books/markdown_vector_embedder.ipynb`
- **Purpose**: Convert a folder of Markdown files into a persistent Chroma vector database (suitable for Google Drive persistence) using OpenAI embeddings and LangChain/Chroma tooling.
- **Overview & Flow**:
  - Cell #1 installs required packages (`openai`, `chromadb`, `faiss-cpu`, `tqdm`, `google-auth`, `google-colab`, and `langchain-community`).
  - Cell #2 loads an OpenAI API key from Colab secrets and sets `OPENAI_API_KEY` in the environment.
  - Main processing (Cell #3): mounts Google Drive, discovers `.md` files under a user-specified `input_dir`, starts a heartbeat thread, and initializes `OpenAIEmbeddings` and a Chroma collection persisted to a session folder on Drive.
  - Files are read whole and added to the Chroma DB with metadata (`file`, `path`, `timestamp`). A JSON report is written at the end and the DB is persisted to `output_dir`.
  - Optional cells allow loading an existing DB session (cell #4) and exporting the entire DB into chunked JSON files (cell #5) with a configurable max chunk size (~15.5 MB default).
- **Key Implementation Notes**:
  - Embedding function: `OpenAIEmbeddings(model="text-embedding-3-large")` (ensure API limits/costs are acceptable).
  - The notebook stores the session in `output_root` (example: `/content/drive/MyDrive/vector_dbs/`) and creates a timestamped `session_{timestamp}` folder.
  - Export cell chunks the full DB into JSON files with an `export_info` block (useful for safe offline transfer or backups).
- **Dependencies**: `openai`, `chromadb`, `faiss-cpu`, `langchain`, `langchain-community`, `tqdm`, `google-auth` (Colab environment assumed).
- **Run Notes & Tips**:
  - Set the input path interactively when prompted; ensure Drive is mounted and path is accessible.
  - Embed costs can add up — consider sampling or using `text-embedding-3-small` / cheaper models for large corpora.
  - For better retrieval, break large Markdown files into smaller chunks (paragraphs/sections) before embedding.
  - Use the export-to-JSON cell to produce portable exports for inspection or migration.
- **Suggested Improvements**:
  - Add chunking logic (text splitter) before embedding to improve recall and smaller document sizes in the DB.
  - Add rate-limit handling / batching with exponential backoff for robust OpenAI API usage.
  - Record model and API usage metrics (tokens/cost) to `report.json` for tracking.

- **Last updated**: 2025-11-14
# `markdown_vector_embedder.ipynb` — Prepare Markdown for vector embeddings

Overview
- Notebook focused on taking Markdown files (notes, articles) and preparing them for vector embeddings: cleaning, splitting into passages, extracting headings as metadata, and optionally running embeddings if keys/libraries are available.

Contents
- Headline extraction to preserve context (H1/H2/H3 parsed as metadata).
- Text cleaning and normalization suitable for embedding models.
- Chunking strategy tuned for embedding token budgets.

Dependencies
- Optional embedding libraries or APIs (OpenAI, HuggingFace, etc.). If you plan to embed, add credentials and install the corresponding client libraries.

Run notes
- Review chunk size and overlap parameters before embedding.
