"""人偶数据文件（pose_studio_makehuman.v2.bin，约 82MB）的自动准备。

编辑器（js/fisher_editor/editor/freepose.html）加载人偶前会先问服务端要这个文件。
没有的时候不再立刻报错，而是按顺序自救：

1. 在 assets 目录（以及 js/、插件根目录）里找 `pose_studio_makehuman*.zip/.rar/.7z/.gz/...`
   → 解压出 `pose_studio_makehuman.v2.bin`（zip/gz/tar 用标准库，rar/7z 用本机
   7-Zip / WinRAR / unrar，或 Python 的 rarfile）
2. 都没有 → 从 GitHub 直链下载（前端能看到进度）
3. 还是失败 → 才把原因交给前端，前端再显示原来的「文件缺失或不完整」提示

接口（aiohttp 路由，随插件一起注册）：
- GET  /pz_easyuse/pose-model/status  → 当前状态 / 进度
- POST /pz_easyuse/pose-model/ensure  → 触发准备（body: {"force": true} 可强制重来）
"""

import bz2
import gzip
import lzma
import os
import shutil
import subprocess
import tarfile
import tempfile
import threading
import urllib.request
import zipfile

from aiohttp import web
from server import PromptServer

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(PLUGIN_DIR, "js", "fisher_editor", "vnccs", "assets")
MODEL_NAME = "pose_studio_makehuman.v2.bin"
MODEL_PATH = os.path.join(ASSETS_DIR, MODEL_NAME)
# 官方这份是 86,187,496 字节；比这个小一个数量级，基本就是下载/解压断过
EXPECTED_SIZE = 86_187_496
MIN_OK_SIZE = 50 * 1024 * 1024
CHUNK = 1 << 20
ARCHIVE_SUFFIXES = (".zip", ".rar", ".7z", ".gz", ".tgz", ".bz2", ".xz", ".lzma", ".tar")
# 顺序：本仓库 with-model 分支（版本一致）→ 上游 ComfyUI-Fisher-Pose
DOWNLOAD_URLS = [
    "https://github.com/prinzer/ComfyUI-PZ-EasyUse/raw/with-model/js/fisher_editor/vnccs/assets/pose_studio_makehuman.v2.bin",
    "https://raw.githubusercontent.com/Work-Fisher/ComfyUI-Fisher-Pose/main/web/vnccs/assets/pose_studio_makehuman.v2.bin",
]

_lock = threading.Lock()
_worker = None
_state = {
    "state": "idle",       # idle / ready / missing / working / error
    "message": "",
    "source": "",          # extract / download
    "progress": 0.0,       # 0~1，解压用外部工具时为 -1（未知）
    "bytes": 0,
    "total": 0,
    "path": MODEL_PATH,
}


def _set(**fields):
    with _lock:
        _state.update(fields)
        return dict(_state)


def _snapshot():
    with _lock:
        return dict(_state)


def _model_ok():
    try:
        return os.path.isfile(MODEL_PATH) and os.path.getsize(MODEL_PATH) >= MIN_OK_SIZE
    except OSError:
        return False


def _mb(value):
    return f"{float(value or 0) / 1048576:.1f} MB"


# --------------------------------------------------------------------------
# 解压：先把压缩包解到临时目录，再把里面的 .bin 装到 assets
# --------------------------------------------------------------------------
def _locate_model(directory):
    """在解压结果里找人偶数据文件（可能在子目录里）。"""
    exact = None
    for root, _dirs, files in os.walk(directory):
        for name in files:
            if name == MODEL_NAME:
                exact = os.path.join(root, name)
                break
        if exact:
            break
    if exact:
        return exact
    for root, _dirs, files in os.walk(directory):
        for name in files:
            if name.lower().startswith("pose_studio_makehuman"):
                path = os.path.join(root, name)
                try:
                    if os.path.getsize(path) >= MIN_OK_SIZE:
                        return path
                except OSError:
                    continue
    return None


def _install(found):
    size = os.path.getsize(found)
    if size < MIN_OK_SIZE:
        raise RuntimeError(f"解出来的 {MODEL_NAME} 只有 {_mb(size)}，文件不完整")
    os.makedirs(ASSETS_DIR, exist_ok=True)
    if os.path.abspath(found) == os.path.abspath(MODEL_PATH):
        return
    temporary = MODEL_PATH + ".tmp"
    shutil.copyfile(found, temporary)
    os.replace(temporary, MODEL_PATH)


def _copy_stream(source, destination, total, label):
    done = 0
    with open(destination, "wb") as out:
        while True:
            chunk = source.read(CHUNK)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            _set(bytes=done, total=total, progress=min(0.99, done / total) if total else -1.0,
                 message=f"{label} {_mb(done)} / {_mb(total)}" if total else label)
    return done


def _extract_zip(archive, out_dir):
    with zipfile.ZipFile(archive) as archive_file:
        for member in archive_file.infolist():
            target = os.path.realpath(os.path.join(out_dir, member.filename))
            if not target.startswith(os.path.realpath(out_dir) + os.sep):
                continue  # 挡掉 ../ 之类的路径穿越
            archive_file.extract(member, out_dir)


def _tool_commands(archive, out_dir):
    """能解 rar / 7z 的外部命令（按可用性依次尝试）。"""
    destination = out_dir + os.sep
    commands = []
    for name in ("unrar",):
        path = shutil.which(name)
        if path:
            commands.append([path, "x", "-y", "-idq", archive, destination])
    for name in ("7z", "7za", "7zz"):
        path = shutil.which(name)
        if path:
            commands.append([path, "x", "-y", "-bso0", "-bsp0", f"-o{out_dir}", archive])
    for name in ("bsdtar", "tar"):
        path = shutil.which(name)
        if path:
            commands.append([path, "-xf", archive, "-C", out_dir])
    # Windows 上装了 WinRAR 的情况（不一定在 PATH 里）
    for base in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)"),
                 r"C:\Program Files", r"C:\Program Files (x86)"):
        if not base:
            continue
        for exe in ("UnRAR.exe", "WinRAR.exe"):
            path = os.path.join(base, "WinRAR", exe)
            if os.path.isfile(path):
                commands.append([path, "x", "-y", "-ibck", archive, destination])
    return commands


def _extract_with_tool(archive, out_dir):
    errors = []
    try:
        import rarfile  # pip install rarfile（内部仍要 unrar / 7z / bsdtar）
        with rarfile.RarFile(archive) as rar:
            rar.extractall(out_dir)
        if _locate_model(out_dir):
            return
        errors.append("rarfile 解完了但里面没有人偶数据文件")
    except Exception as error:
        errors.append(f"rarfile: {error}")
    for command in _tool_commands(archive, out_dir):
        try:
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3600)
            if result.returncode == 0 and _locate_model(out_dir):
                return
            detail = (result.stderr or result.stdout or b"").decode("utf-8", "replace").strip()[-200:]
            errors.append(f"{os.path.basename(command[0])}: rc={result.returncode} {detail}")
        except Exception as error:
            errors.append(f"{os.path.basename(command[0])}: {error}")
    raise RuntimeError("没有能解压它的工具（装 7-Zip / WinRAR，或改用 .zip 压缩包）"
                       + ("；" + " | ".join(errors[-2:]) if errors else ""))


def _extract_archive(archive):
    name = os.path.basename(archive)
    label = f"正在解压人偶模型（{name}）…"
    _set(state="working", source="extract", message=label, bytes=0,
         total=os.path.getsize(archive), progress=0.0)
    os.makedirs(ASSETS_DIR, exist_ok=True)
    tmp_dir = tempfile.mkdtemp(prefix="pz_pose_", dir=ASSETS_DIR)
    try:
        low = archive.lower()
        if low.endswith(".zip"):
            _extract_zip(archive, tmp_dir)
        elif low.endswith((".tar", ".tgz")) or ".tar." in low:
            with tarfile.open(archive) as tar:
                tar.extractall(tmp_dir)
        elif low.endswith(".gz"):
            out_path = os.path.join(tmp_dir, MODEL_NAME)
            with gzip.open(archive, "rb") as source:
                _copy_stream(source, out_path, os.path.getsize(archive), label)
        elif low.endswith(".bz2"):
            out_path = os.path.join(tmp_dir, MODEL_NAME)
            with bz2.open(archive, "rb") as source:
                _copy_stream(source, out_path, os.path.getsize(archive), label)
        elif low.endswith((".xz", ".lzma")):
            out_path = os.path.join(tmp_dir, MODEL_NAME)
            with lzma.open(archive, "rb") as source:
                _copy_stream(source, out_path, os.path.getsize(archive), label)
        else:
            _set(message=f"{label}（外部工具解压中，进度无法预估）", progress=-1.0)
            _extract_with_tool(archive, tmp_dir)
        found = _locate_model(tmp_dir)
        if not found:
            raise RuntimeError(f"{name} 里没有 {MODEL_NAME}")
        _install(found)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# --------------------------------------------------------------------------
# 下载
# --------------------------------------------------------------------------
def _download_urls():
    extra = os.environ.get("PZ_POSE_MODEL_URL", "").strip()
    urls = ([extra] if extra else []) + list(DOWNLOAD_URLS)
    return urls


def _download(url):
    _set(state="working", source="download", message="正在下载人偶模型…", bytes=0,
         total=EXPECTED_SIZE, progress=0.0)
    os.makedirs(ASSETS_DIR, exist_ok=True)
    part = MODEL_PATH + ".part"
    request = urllib.request.Request(url, headers={"User-Agent": "ComfyUI-PZ-EasyUse"})
    with urllib.request.urlopen(request, timeout=60) as response, open(part, "wb") as out:
        total = int(response.headers.get("Content-Length") or EXPECTED_SIZE)
        done = 0
        while True:
            chunk = response.read(CHUNK)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            _set(bytes=done, total=total, progress=min(0.99, done / total) if total else -1.0,
                 message=f"正在下载人偶模型… {_mb(done)} / {_mb(total)}")
    size = os.path.getsize(part)
    if size < MIN_OK_SIZE:
        raise RuntimeError(f"下载到的文件只有 {_mb(size)}，不完整")
    if url.lower().endswith(".gz"):
        with gzip.open(part, "rb") as source:
            _copy_stream(source, MODEL_PATH + ".tmp", size, "正在解压人偶模型…")
        os.replace(MODEL_PATH + ".tmp", MODEL_PATH)
        os.remove(part)
    else:
        os.replace(part, MODEL_PATH)


# --------------------------------------------------------------------------
# 总流程（后台线程）
# --------------------------------------------------------------------------
def _ensure_worker():
    try:
        if _model_ok():
            _set(state="ready", message="人偶模型已就位", progress=1.0, source="")
            return
        for archive in _find_archives():
            try:
                _extract_archive(archive)
                if _model_ok():
                    _set(state="ready", progress=1.0, source="extract",
                         message=f"已从 {os.path.basename(archive)} 解压出人偶模型")
                    return
            except Exception as error:
                print(f"[PZ-EasyUse] 人偶模型解压失败（{archive}）：{error}")
        errors = []
        for url in _download_urls():
            try:
                _download(url)
                if _model_ok():
                    _set(state="ready", progress=1.0, source="download",
                         message="人偶模型下载完成", bytes=EXPECTED_SIZE, total=EXPECTED_SIZE)
                    return
                errors.append(f"{url} 下载不完整")
            except Exception as error:
                errors.append(f"{url} → {error}")
        _set(state="error", progress=0.0, source="",
             message="人偶模型缺失：同目录没有可解压的压缩包，自动下载也失败（"
                     + "；".join(errors[:2]) + "）")
    except Exception as error:
        _set(state="error", message=str(error), progress=0.0)


def _find_archives():
    found = []
    for directory in (ASSETS_DIR, os.path.join(PLUGIN_DIR, "js"), PLUGIN_DIR):
        try:
            names = sorted(os.listdir(directory))
        except OSError:
            continue
        for name in names:
            low = name.lower()
            if not low.startswith("pose_studio_makehuman"):
                continue
            if any(low.endswith(suffix) for suffix in ARCHIVE_SUFFIXES):
                found.append(os.path.join(directory, name))
    return found


def start_ensure(force=False):
    """开一个后台线程准备模型；已经在跑就直接返回当前状态。"""
    global _worker
    with _lock:
        running = _worker is not None and _worker.is_alive()
        if running:
            return dict(_state)
        if _state.get("state") == "ready" and not force:
            return dict(_state)
        if force or _state.get("state") in ("idle", "missing", "error"):
            _state.update(state="working", message="正在准备人偶模型…", progress=0.0,
                          bytes=0, total=0, source="")
        _worker = threading.Thread(target=_ensure_worker, name="pz-pose-model", daemon=True)
        _worker.start()
        return dict(_state)


_set(state="ready" if _model_ok() else "missing",
     message="人偶模型已就位" if _model_ok() else "人偶模型缺失")


@PromptServer.instance.routes.get("/pz_easyuse/pose-model/status")
async def pose_model_status(request):
    return web.json_response(_snapshot())


@PromptServer.instance.routes.post("/pz_easyuse/pose-model/ensure")
async def pose_model_ensure(request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    force = bool((body or {}).get("force"))
    return web.json_response(start_ensure(force=force))
