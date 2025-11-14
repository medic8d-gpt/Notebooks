import os

IGNORE_FILES = {"app.py"}

for filename in os.listdir("."):
    if os.path.isdir(filename):
        continue

    if filename in IGNORE_FILES:
        continue

    if filename.lower().endswith(".ipynb"):
        continue

    base, _ = os.path.splitext(filename)
    new_name = f"{base}.ipynb"

    os.rename(filename, new_name)

print("Done.")
