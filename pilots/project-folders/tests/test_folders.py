import datetime
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import folders  # noqa: E402

TODAY = f"{datetime.date.today():%Y-%m-%d}"


def touch(path: Path, text: str = "x") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


@pytest.fixture
def project(tmp_path: Path) -> Path:
    return folders.cmd_new(str(tmp_path), "Acme promo", template="adobe")


def test_new_creates_dated_project_with_template_folders(project: Path) -> None:
    assert project.name == f"{TODAY}_Acme_promo"
    assert sorted(p.name for p in project.iterdir() if p.is_dir()) == ["AE_SAVE", "MAT", "PR_SAVE", "RENDER", "VID"]
    assert (project / folders.TEMPLATE_COPY).is_file()


def test_new_refuses_to_overwrite_existing_project(project: Path) -> None:
    with pytest.raises(SystemExit):
        folders.cmd_new(str(project.parent), "Acme promo", template="adobe")


def test_unknown_template_lists_known_ones() -> None:
    with pytest.raises(SystemExit, match="adobe, davinci"):
        folders.template_path("nope")


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        ("Camera A take 01.MOV", "Camera_A_take_01.mov"),
        ("Музыка (финал)!.wav", "Музыка_финал.wav"),
        ("no-extension", "no-extension"),
        ("   .mp4", "file.mp4"),
    ],
)
def test_clean_name(raw: str, clean: str) -> None:
    assert folders.clean_name(raw) == clean


def test_sort_plans_by_type_and_leaves_unknown(tmp_path: Path, project: Path) -> None:
    inbox = tmp_path / "Downloads"
    touch(inbox / "cam A.MOV")
    touch(inbox / "nested/logo.png")
    touch(inbox / "notes.docx")
    touch(inbox / ".DS_Store")

    moves, unknown = folders.plan_sort(inbox, project)

    assert [(s.name, d.relative_to(project).as_posix()) for s, d in moves] == [
        ("cam A.MOV", "VID/cam_A.mov"),
        ("logo.png", "MAT/logo.png"),
    ]
    assert [p.name for p in unknown] == ["notes.docx"]
    assert (inbox / "cam A.MOV").exists(), "planning must not move anything"


def test_sort_never_overwrites(tmp_path: Path, project: Path) -> None:
    touch(project / "VID/clip.mp4", "old")
    inbox = tmp_path / "in"
    touch(inbox / "a/clip.mp4")
    touch(inbox / "b/clip.mp4")

    moves, _ = folders.plan_sort(inbox, project)

    assert sorted(d.name for _, d in moves) == ["clip_2.mp4", "clip_3.mp4"]


def test_apply_then_undo_restores_files(tmp_path: Path, project: Path) -> None:
    inbox = tmp_path / "in"
    src = touch(inbox / "cam A.MOV", "footage")
    moves, _ = folders.plan_sort(inbox, project)

    folders.apply(moves, project)
    assert not src.exists()
    assert (project / "VID/cam_A.mov").read_text() == "footage"

    folders.apply(folders.plan_undo(project), project, log=False)
    assert src.read_text() == "footage"


def test_render_gets_next_version(tmp_path: Path, project: Path) -> None:
    touch(project / f"RENDER/{project.name}_v01.mp4")
    touch(project / f"RENDER/{project.name}_v03.mp4")
    render = touch(tmp_path / "Export final FINAL.MP4")

    [(src, dst)] = folders.plan_render(str(render), project)

    assert dst.name == f"{project.name}_v04.mp4"


def test_main_without_apply_changes_nothing(tmp_path: Path, project: Path, capsys: pytest.CaptureFixture[str]) -> None:
    inbox = tmp_path / "in"
    touch(inbox / "clip.mp4")

    folders.main(["folders.py", "sort", str(inbox), str(project)])

    assert (inbox / "clip.mp4").exists()
    assert "--apply" in capsys.readouterr().out


def test_main_apply_and_undo_cli(tmp_path: Path, project: Path) -> None:
    inbox = tmp_path / "in"
    touch(inbox / "clip.mp4")

    folders.main(["folders.py", "sort", str(inbox), str(project), "--apply"])
    assert (project / "VID/clip.mp4").exists()

    folders.main(["folders.py", "undo", str(project), "--apply"])
    assert (inbox / "clip.mp4").exists()
    assert not (project / folders.LOG).exists()
