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
