#!/usr/bin/env python3
"""Project folders for video editors: create from a template, sort downloads in, version renders, undo.

  folders.py new    <parent-dir> <name> [--template T]
  folders.py sort   <inbox-dir> <project-dir> [--apply]
  folders.py render <file> <project-dir> [--apply]
  folders.py undo   <project-dir> [--apply]

Without --apply every command only prints its plan. T is a template name from ../templates
(davinci, adobe) or a path to a template file. Python 3.9+, standard library only.
"""
import csv
import datetime
import re
import shutil
import sys
from pathlib import Path

Move = tuple[Path, Path]

TEMPLATES = Path(__file__).resolve().parent.parent / "templates"
TEMPLATE_COPY = "_template.txt"  # the template a project was made from, kept inside it
LOG = "_moves.csv"  # every move, so undo can put files back
SKIP = {".ds_store", "thumbs.db", "desktop.ini"}


def read_template(path: Path) -> list[tuple[str, set[str]]]:
    """Template lines are `FOLDER: ext ext ...`; a folder with `render` in its name receives renders."""
    folders = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        name, _, exts = line.partition(":")
        folders.append((name.strip(), {e.lower().lstrip(".") for e in exts.split()}))
    if not folders:
        raise SystemExit(f"empty template: {path}")
    return folders


def template_path(name: str) -> Path:
    path = Path(name)
    if path.is_file():
        return path
    path = TEMPLATES / f"{name}.txt"
    if path.is_file():
        return path
    known = ", ".join(sorted(p.stem for p in TEMPLATES.glob("*.txt")))
    raise SystemExit(f"no template {name!r}; known: {known}")


def clean_name(name: str) -> str:
    """Spaces and odd characters to `_`, keeping letters (any alphabet), digits, `-` and `.`."""
    stem, dot, ext = name.rpartition(".") if "." in name else (name, "", "")
    stem = re.sub(r"[^\w.-]+", "_", stem).strip("_") or "file"
    return f"{stem}{dot}{ext.lower()}"


def free_path(path: Path, taken: set[Path]) -> Path:
    """`clip.mp4`, then `clip_2.mp4`, ... so nothing is overwritten."""
    candidate, n = path, 2
    while candidate.exists() or candidate in taken:
        candidate = path.with_name(f"{path.stem}_{n}{path.suffix}")
        n += 1
    taken.add(candidate)
    return candidate


def project_template(project: Path) -> list[tuple[str, set[str]]]:
    path = project / TEMPLATE_COPY
    if not path.is_file():
        raise SystemExit(f"{project} has no {TEMPLATE_COPY}: create it with `new` first")
    return read_template(path)


def cmd_new(parent: str, name: str, template: str = "davinci") -> Path:
    src = template_path(template)
    folders = read_template(src)
    project = Path(parent) / clean_name(f"{datetime.date.today():%Y-%m-%d}_{name}")
    if project.exists():
        raise SystemExit(f"already exists: {project}")
    for folder, _ in folders:
        (project / folder).mkdir(parents=True)
    shutil.copyfile(src, project / TEMPLATE_COPY)
    print(f"created {project}")
    for folder, _ in folders:
        print(f"  {folder}/")
    return project


def plan_sort(inbox: Path, project: Path) -> tuple[list[Move], list[Path]]:
    folders = project_template(project)
    by_ext = {ext: folder for folder, exts in folders for ext in exts}
    moves, unknown, taken = [], [], set()
    for src in sorted(p for p in Path(inbox).rglob("*") if p.is_file()):
        if src.name.lower() in SKIP or src.name.startswith("."):
            continue
        folder = by_ext.get(src.suffix.lower().lstrip("."))
        if folder is None:
            unknown.append(src)
            continue
        moves.append((src, free_path(project / folder / clean_name(src.name), taken)))
    return moves, unknown


def plan_render(file: str, project: Path) -> list[Move]:
    folders = project_template(project)
    render = next((f for f, _ in folders if "render" in f.lower()), None)
    if render is None:
        raise SystemExit("the template has no folder with RENDER in its name")
    src = Path(file)
    pattern = re.compile(rf"^{re.escape(project.name)}_v(\d+)\.", re.I)
    versions = [int(m.group(1)) for p in (project / render).iterdir() if (m := pattern.match(p.name))]
    version = max(versions, default=0) + 1
    return [(src, project / render / f"{project.name}_v{version:02d}{src.suffix.lower()}")]


def plan_undo(project: Path) -> list[Move]:
    log = project / LOG
    if not log.is_file():
        raise SystemExit(f"nothing to undo: no {LOG} in {project}")
    with log.open(newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))
    return [(Path(new), Path(old)) for old, new in reversed(rows) if Path(new).exists()]


def short(path: Path, base: Path) -> str:
    return path.relative_to(base).as_posix() if path.is_relative_to(base) else str(path)


def show(moves: list[Move], project: Path, inbox: Path) -> None:
    for src, dst in moves:
        print(f"  {short(src, inbox)}  →  {short(dst, project)}")


def apply(moves: list[Move], project: Path, log: bool = True) -> None:
    rows = []
    for src, dst in moves:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
        rows.append([str(src), str(dst)])
    if log and rows:
        with (project / LOG).open("a", newline="", encoding="utf-8") as f:
            csv.writer(f).writerows(rows)


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd, args = argv[1], [a for a in argv[2:] if a != "--apply"]
    do_apply = "--apply" in argv
    if cmd == "new":
        template = "davinci"
        if "--template" in args:
            i = args.index("--template")
            template = args[i + 1]
            args = args[:i] + args[i + 2:]
        cmd_new(*args, template=template)
        return 0
    if cmd == "sort":
        inbox, project = Path(args[0]), Path(args[1])
        moves, unknown = plan_sort(inbox, project)
    elif cmd == "render":
        project = Path(args[1])
        moves, unknown = plan_render(args[0], project), []
    elif cmd == "undo":
        project = Path(args[0])
        moves, unknown = plan_undo(project), []
    else:
        raise SystemExit(f"unknown command {cmd!r}, see --help")
    inbox = Path(args[0]) if cmd == "sort" else project
    show(moves, project, inbox)
    for path in unknown:
        print(f"  ? {short(path, inbox)}  (no folder for this type, left in place)")
    if not moves:
        print("nothing to move")
    elif do_apply:
        apply(moves, project, log=cmd != "undo")
        if cmd == "undo":
            (project / LOG).unlink()
        print(f"moved {len(moves)} file(s)")
    else:
        print(f"plan only: {len(moves)} file(s). Run again with --apply to move them.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
