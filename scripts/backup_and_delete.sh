#!/usr/bin/env bash
set -euo pipefail

# backup_and_delete.sh
# Safely back up files before deleting them from the workspace.
# Usage: ./scripts/backup_and_delete.sh <path-to-file> [<path-to-file> ...]
# Example: ./scripts/backup_and_delete.sh books/old.ipynb books/old_copy.ipynb

BACKUP_DIR="backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "${BACKUP_DIR}"

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <file> [<file> ...]"
  exit 2
fi

for src in "$@"; do
  if [ ! -e "$src" ]; then
    echo "Skipping: $src (not found)"
    continue
  fi

  base=$(basename "$src")
  dest="${BACKUP_DIR}/${TIMESTAMP}_${base}"

  echo "Backing up: $src -> $dest"
  mv -- "$src" "$dest"

  echo "Backed up and removed: $src"
done

echo "All done. Backups are in: ${BACKUP_DIR}/"
