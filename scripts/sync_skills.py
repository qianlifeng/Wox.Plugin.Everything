#!/usr/bin/env python3

import subprocess
from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory


def main() -> None:
    repo = Path(__file__).resolve().parents[1]
    skills = Path(".agents/skills")
    names = ("wox-plugin-creator", "wox-plugin-submit2store")
    destination = repo / skills
    if destination.resolve() != destination:
        raise SystemExit(f"Expected a local skills directory: {destination}")
    destination.mkdir(parents=True, exist_ok=True)

    lock = destination.parent / ".sync-skills.lock"
    lock.mkdir()
    try:
        with TemporaryDirectory(dir=lock) as temp:
            checkout = Path(temp) / "wox"
            subprocess.run(
                [
                    "git", "clone", "--depth=1", "--filter=blob:none", "--sparse",
                    "https://github.com/Wox-launcher/Wox.git", str(checkout),
                ],
                check=True,
            )
            paths = [(skills / name).as_posix() for name in names]
            subprocess.run(
                ["git", "-C", str(checkout), "sparse-checkout", "set", *paths], check=True
            )

            for path in paths:
                if not (checkout / path / "SKILL.md").is_file():
                    raise SystemExit(f"Missing upstream skill: {path}")

            with ExitStack() as rollback:
                for name in names:
                    source = checkout / skills / name
                    target = destination / name
                    backup = Path(temp) / name
                    if target.exists() or target.is_symlink():
                        target.rename(backup)
                        rollback.callback(backup.rename, target)
                    source.rename(target)
                    rollback.callback(target.rename, source)
                rollback.pop_all()
    finally:
        lock.rmdir()

    print(f"Synced {', '.join(names)} from Wox upstream.")


if __name__ == "__main__":
    main()
