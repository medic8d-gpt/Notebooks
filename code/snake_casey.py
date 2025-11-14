import os
import re
import sys

def to_snake_case(name: str) -> str:
    """Converts a string to snake_case."""

    # 1. Handle CamelCase (e.g., MyFile -> My_File)
    name = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', name)

    # 2. Replace spaces, dots, and hyphens with underscores
    name = re.sub(r'[- .]', '_', name)

    # 3. Convert to lowercase
    name = name.lower()

    # 4. Squeeze multiple underscores into one
    name = re.sub(r'__+', '_', name)

    # 5. Clean up leading/trailing underscores
    name = name.strip('_')

    return name

def normalize_filename(old_name: str) -> str:
    """Applies snake_case and intelligently restores the file extension."""

    # Split the original name into root and extension
    # 'My File.txt' -> ('My File', '.txt')
    # 'MyFile' -> ('MyFile', '')
    old_root, old_ext = os.path.splitext(old_name)

    # Convert the *entire* old name to snake_case first
    # 'My File.txt' -> 'my_file_txt'
    full_snake_name = to_snake_case(old_name)

    if not old_ext:
        # No extension, so the full snake_case name is correct
        # 'MyFile' -> 'myfile'
        return full_snake_name

    # Convert the *root* part to snake_case
    # 'My File' -> 'my_file'
    root_snake_name = to_snake_case(old_root)

    # Convert the *extension* part (without the dot)
    # '.txt' -> 'txt'
    ext_snake_name = old_ext.lstrip('.').lower()

    # Create the correct new name
    # 'my_file.txt'
    new_name = f"{root_snake_name}.{ext_snake_name}"

    # Handle cases like '.bashrc' -> 'bashrc'
    if old_name.startswith('.') and not new_name.startswith('.'):
        new_name = f".{new_name}"

    return new_name

def main():
    """Main execution function."""

    # Get the name of this script
    script_name = os.path.basename(sys.argv[0])

    print(f"This will rename all FILES (not directories) in this folder to snake_case.")
    print(f"Example: 'My File-Test.txt' -> 'my_file_test.txt'")

    try:
        confirm = input("ARE YOU SURE? This cannot be undone. (y/n): ")
    except EOFError:
        print("\nAction cancelled.")
        return

    if confirm.lower() != 'y':
        print("Action cancelled.")
        return

    print("--- Starting rename operation (files only) ---")

    # Get all items in the current directory
    try:
        all_items = os.listdir('.')
    except OSError as e:
        print(f"Error reading directory: {e}")
        return

    for old_name in all_items:
        # Check if it's a file
        if not os.path.isfile(old_name):
            continue

        # Skip this script
        if old_name == script_name:
            print(f"Skipping '{old_name}' (this script)...")
            continue

        # Get the new normalized name
        new_name = normalize_filename(old_name)

        # If the name is unchanged (already snake_case), skip it
        if old_name == new_name:
            print(f"Skipping '{old_name}' (already normalized).")
            continue

        # Check if a file with the new name already exists
        if os.path.exists(new_name):
            print(f"WARNING: '{new_name}' already exists. Skipping rename of '{old_name}'.")
            continue

        # Perform the rename
        try:
            os.rename(old_name, new_name)
            print(f"Renamed: '{old_name}' -> '{new_name}'")
        except OSError as e:
            print(f"Error renaming '{old_name}': {e}")

    print("--- Rename operation complete ---")

if __name__ == "__main__":
    main()
