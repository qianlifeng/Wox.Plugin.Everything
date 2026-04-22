#!/usr/bin/env python3

from __future__ import annotations

import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: package_wox_plugin.py <source-dir> <output-file>", file=sys.stderr)
        return 1

    source_dir = Path(sys.argv[1]).resolve()
    output_file = Path(sys.argv[2]).resolve()

    if not source_dir.is_dir():
        print(f"Source directory does not exist: {source_dir}", file=sys.stderr)
        return 1

    output_file.parent.mkdir(parents=True, exist_ok=True)
    if output_file.exists():
        output_file.unlink()

    with ZipFile(output_file, "w", compression=ZIP_DEFLATED) as archive:
        for file_path in sorted(source_dir.rglob("*")):
            if not file_path.is_file():
                continue

            archive_name = file_path.relative_to(source_dir).as_posix()
            archive.write(file_path, archive_name)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
