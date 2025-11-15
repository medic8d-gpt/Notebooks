**Articles To CleanDB**
- **Path**: `books/articles_to_cleandb.ipynb`
- **Purpose**: (Notebook attachment present) Likely intended to prepare article files for ingestion into the main text→DB pipeline by cleaning, normalizing, and exporting them into text form for downstream processing.
- **Typical Responsibilities**:
  - Discover and normalize article files (markdown, HTML, or scraped text).
  - Clean HTML or noisy markup, remove boilerplate, and standardize encoding.
  - Optionally split long articles into smaller chunks, add metadata (source, date, URL), and save as `.txt` for the `doc_to_db` pipeline.
- **Suggested Run Pattern**:
  - Run after scraping/collecting articles and before running Script A from `doc_to_db.ipynb`.
  - Produce a cleaned `Text_Files` folder or a temporary staging area that `doc_to_db` can ingest.
- **Dependencies & Tools**:
  - HTML cleaning libraries (`BeautifulSoup`, `readability-lxml`) and text normalization (`ftfy`, `python-dateutil`).
  - Optionally use `newspaper3k` for article extraction if working with raw URLs/HTML.
- **Notes & Recommendations**:
  - Confirm the notebook's actual contents before running — this summary is inferred from filename and common patterns.
  - If the notebook contains scraper code, ensure you respect robots.txt and site terms of service.
  - Add metadata fields (original URL, scraped timestamp, source) to help downstream deduplication and provenance tracking.

- **Last updated**: 2025-11-14
# `articles_to_cleandb.ipynb` — Articles → Clean DB workflow

Overview
- Notebook for converting a collection of articles into a cleaned, DB-ready format. Likely includes steps to normalize article text, extract metadata (title, date, source), and write out structured files for ingestion.

Run notes
- Check configuration cells for source paths and output directories. Run on a small subset first.
