# -*- mode: python ; coding: utf-8 -*-
# PyInstaller : pyinstaller hots-backend.spec --noconfirm  →  dist/hots-backend/hots-backend(.exe)
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

datas = [("app/data", "app/data")]
# Les protocoles heroprotocol sont chargés depuis leurs sources .py (voir app/replay/protocol.py).
datas += collect_data_files("heroprotocol", include_py_files=True)

hiddenimports = (
    collect_submodules("app")
    + collect_submodules("uvicorn")
    + ["heroprotocol.decoders", "six", "mpyq", "sqlalchemy.dialects.sqlite", "psycopg"]
)

a = Analysis(
    ["run.py"],
    pathex=["."],
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="hots-backend",
    console=False,
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="hots-backend", upx=False)
