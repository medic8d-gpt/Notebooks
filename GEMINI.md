# GEMINI.md - Project Overview

This repository is a multi-faceted workspace containing a variety of projects, including Jupyter notebooks for data processing, web applications, and helper scripts.

## Project Overview

The repository is a collection of tools and projects for data processing, web development, and automation. It is not a single, monolithic application, but rather a workspace for various related tasks.

### Key Components:

*   **Jupyter Notebooks (`books/`):** A collection of notebooks for data processing, including cleaning, duplicate detection, and vector embedding. These notebooks are designed to be used with Google Colab and often involve mounting Google Drive.
*   **Web Applications:**
    *   `gpt-site-builder/`: A Node.js/Express application that interacts with the GitHub API, likely for building websites based on GPT-generated content.
    *   `ops-wall-mvp/`: A vanilla JavaScript warehouse fulfillment center simulation.
    *   `spotapp/`: A Python application that uses the Spotify API to merge a user's playlists.
    *   `kowledge_joe/`: A collection of static HTML research pages.
*   **Helper Scripts (`code/`, `scripts/`):** A set of Python and shell scripts for various utility tasks, such as renaming files, backing up data, and converting data formats.
*   **Documentation (`docs/`, `doc_shit/`):** A collection of markdown files that document the various projects and notebooks in the repository. This also includes detailed configurations for custom GPT agents.

## Building and Running

Due to the diverse nature of the projects, there is no single build or run command. Each project has its own setup and execution instructions.

### `gpt-site-builder` (Node.js)

*   **To install dependencies:** `npm install`
*   **To run:** `npm start`

### `ops-wall-mvp` (JavaScript)

*   This is a static web application with no build process. Open `index.html` in a web browser to run the simulation.

### `spotapp` (Python)

*   **To install dependencies:** `pip install -r requirements.txt` (A `requirements.txt` is present in the `1draft` sub-directory)
*   **To run:** `python app.py`
*   **Note:** This application requires Spotify API credentials to be set as environment variables.

### Jupyter Notebooks (`books/`)

*   Open the notebooks in a Jupyter or Google Colab environment.
*   Install dependencies as needed using `pip install -r requirements.txt`.

## Development Conventions

*   **Jupyter Notebooks:** Notebooks in the `books/` directory are designed to be used with Google Colab and often include code for mounting Google Drive.
*   **Python:** The Python scripts and notebooks use standard libraries, with dependencies listed in `requirements.txt`.
*   **JavaScript:** The `ops-wall-mvp` project is written in vanilla JavaScript with no external dependencies. The `gpt-site-builder` project uses Node.js and Express.
*   **Shell Scripts:** The shell scripts are written for a bash environment.
*   **GPT Integration:** The repository includes extensive documentation and configuration for creating and using custom GPT agents for automation. The `doc_shit/master_customgpt_config.md` file provides a detailed example of a custom GPT configuration.
