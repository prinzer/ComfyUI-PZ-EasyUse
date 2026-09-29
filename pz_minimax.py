import csv
import json
import os
from datetime import datetime

import folder_paths
from aiohttp import web
from server import PromptServer


MINIMAX_PROMPTS_FILE = os.path.join(folder_paths.get_input_directory(), "pz_minimax_prompts.json")
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
TAG_LIBRARY_FILE = os.path.join(DATA_DIR, "tag_library.json")
TAG_LIBRARY_USER_FILE = os.path.join(DATA_DIR, "tag_library.user.json")
TAG_LIBRARY_CSV_FILE = os.path.join(DATA_DIR, "tags_enhanced.csv")


def _read_minimax_prompts():
    try:
        with open(MINIMAX_PROMPTS_FILE, "r", encoding="utf-8") as prompt_file:
            data = json.load(prompt_file)
        return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def _write_minimax_prompts(prompts):
    input_directory = folder_paths.get_input_directory()
    os.makedirs(input_directory, exist_ok=True)
    temporary_file = f"{MINIMAX_PROMPTS_FILE}.tmp"
    with open(temporary_file, "w", encoding="utf-8") as prompt_file:
        json.dump(prompts, prompt_file, ensure_ascii=False, indent=2)
    os.replace(temporary_file, MINIMAX_PROMPTS_FILE)


def _deep_merge_tags(base, override):
    """Deep merge two tag library structures. Override wins on conflicts."""
    if not isinstance(base, dict) or not isinstance(override, dict):
        return override if isinstance(override, dict) else base
    result = dict(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge_tags(result[key], value)
        elif key == "categories" and isinstance(result[key], list) and isinstance(value, list):
            merged_cats = list(result[key])
            base_ids = {c.get("id"): i for i, c in enumerate(merged_cats) if isinstance(c, dict)}
            for cat in value:
                if isinstance(cat, dict):
                    cid = cat.get("id")
                    if cid and cid in base_ids:
                        idx = base_ids[cid]
                        merged_cats[idx] = _deep_merge_tags(merged_cats[idx], cat)
                    else:
                        merged_cats.append(cat)
                        if cid:
                            base_ids[cid] = len(merged_cats) - 1
            result[key] = merged_cats
        else:
            result[key] = value
    return result


_tag_library_cache = None
_tag_library_mtime = 0


def _load_tag_library():
    global _tag_library_cache, _tag_library_mtime
    try:
        mtime = max(
            os.path.getmtime(TAG_LIBRARY_FILE) if os.path.exists(TAG_LIBRARY_FILE) else 0,
            os.path.getmtime(TAG_LIBRARY_USER_FILE) if os.path.exists(TAG_LIBRARY_USER_FILE) else 0,
        )
        if _tag_library_cache is not None and mtime <= _tag_library_mtime:
            return _tag_library_cache
    except OSError:
        if _tag_library_cache is not None:
            return _tag_library_cache

    base = {}
    try:
        with open(TAG_LIBRARY_FILE, "r", encoding="utf-8") as f:
            base = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass

    user = {}
    try:
        with open(TAG_LIBRARY_USER_FILE, "r", encoding="utf-8") as f:
            user = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass

    merged = _deep_merge_tags(base, user) if user else base
    _tag_library_cache = merged
    _tag_library_mtime = mtime
    return merged


def _list_tag_libraries():
    libraries = []
    if os.path.exists(TAG_LIBRARY_FILE) or os.path.exists(TAG_LIBRARY_USER_FILE):
        libraries.append({"id": "json", "name": "标签库 (JSON)", "type": "json"})
    if os.path.exists(TAG_LIBRARY_CSV_FILE):
        libraries.append({"id": "csv", "name": "标签选择器 (CSV)", "type": "csv"})
    return libraries


def _read_csv_library():
    rows = None
    for encoding in ("utf-8", "gbk", "gb2312", "utf-8-sig"):
        try:
            with open(TAG_LIBRARY_CSV_FILE, "r", encoding=encoding) as f:
                reader = csv.DictReader(f)
                rows = list(reader)
            break
        except (UnicodeDecodeError):
            continue
        except (FileNotFoundError, OSError):
            return {"categories": []}

    if rows is None:
        return {"categories": []}

    category_names = {
        "0": "通用",
        "1": "版权/角色",
        "2": "角色特征",
        "3": "元数据",
    }

    grouped = {}
    for row in rows:
        cat_id = row.get("category", "0") or "0"
        if cat_id not in grouped:
            grouped[cat_id] = {
                "id": f"csv_cat_{cat_id}",
                "name": category_names.get(cat_id, f"分类 {cat_id}"),
                "icon": "📁",
                "subcategories": [{
                    "id": f"csv_cat_{cat_id}_sub",
                    "name": "全部",
                    "tags": [],
                }],
            }
        cn_parts = row.get("cn_name", "") or ""
        aliases = [p.strip() for p in cn_parts.split(",") if p.strip()]
        zh = aliases[0] if aliases else ""
        tag = {
            "en": row.get("name", ""),
            "zh": zh,
            "aliases": aliases,
            "weight": 1.0,
            "enabled": True,
        }
        grouped[cat_id]["subcategories"][0]["tags"].append(tag)

    return {"categories": list(grouped.values())}


@PromptServer.instance.routes.get("/pz_easyuse/tag-library")
async def get_tag_library(request):
    source = request.query.get("source", "json")
    try:
        if source == "csv":
            library = _read_csv_library()
        else:
            library = _load_tag_library()
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
    return web.json_response(library)


@PromptServer.instance.routes.get("/pz_easyuse/tag-libraries")
async def get_tag_libraries(request):
    return web.json_response({"libraries": _list_tag_libraries()})


@PromptServer.instance.routes.post("/pz_easyuse/tag-library/upload")
async def upload_tag_library(request):
    try:
        reader = await request.multipart()
        field = await reader.next()
        if field is None or field.name != "file":
            return web.json_response({"error": "No file field"}, status=400)
        filename = field.filename or "custom_tags.csv"
        if not filename.lower().endswith(".csv"):
            return web.json_response({"error": "Only CSV files are supported"}, status=400)
        safe_name = "".join(c for c in filename if c.isalnum() or c in "._- ").strip()
        if not safe_name:
            safe_name = "custom_tags.csv"
        target = os.path.join(DATA_DIR, safe_name)
        temp_path = target + ".tmp"
        with open(temp_path, "wb") as f:
            while True:
                chunk = await field.read_chunk()
                if not chunk:
                    break
                f.write(chunk)
        os.replace(temp_path, target)
        return web.json_response({"ok": True, "filename": safe_name})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.get("/pz_easyuse/minimax-prompts")
async def get_minimax_prompts(request):
    return web.json_response({"prompts": _read_minimax_prompts()})


@PromptServer.instance.routes.post("/pz_easyuse/minimax-prompts")
async def save_minimax_prompt(request):
    try:
        payload = await request.json()
    except (json.JSONDecodeError, ValueError):
        return web.json_response({"error": "Invalid JSON"}, status=400)

    prompt = payload.get("prompt") if isinstance(payload, dict) else None
    if not isinstance(prompt, dict):
        return web.json_response({"error": "Prompt must be an object"}, status=400)

    prompts = _read_minimax_prompts()
    prompt["saved_at"] = datetime.now().isoformat(timespec="seconds")
    prompts.append(prompt)
    try:
        _write_minimax_prompts(prompts)
    except OSError as error:
        return web.json_response({"error": str(error)}, status=500)
    return web.json_response({"prompts": prompts, "index": len(prompts) - 1})


@PromptServer.instance.routes.put("/pz_easyuse/minimax-prompts/{index}")
async def update_minimax_prompt(request):
    try:
        index = int(request.match_info["index"])
        payload = await request.json()
    except (ValueError, json.JSONDecodeError):
        return web.json_response({"error": "Invalid index or JSON"}, status=400)

    prompt = payload.get("prompt") if isinstance(payload, dict) else None
    prompts = _read_minimax_prompts()
    if not isinstance(prompt, dict) or index < 0 or index >= len(prompts):
        return web.json_response({"error": "Invalid prompt or index"}, status=400)

    prompt["saved_at"] = datetime.now().isoformat(timespec="seconds")
    prompts[index] = prompt
    try:
        _write_minimax_prompts(prompts)
    except OSError as error:
        return web.json_response({"error": str(error)}, status=500)
    return web.json_response({"prompts": prompts, "index": index})


def _is_local_request(request):
    return request.remote in ("127.0.0.1", "::1")


@PromptServer.instance.routes.delete("/pz_easyuse/minimax-prompts/{index}")
async def delete_minimax_prompt(request):
    if not _is_local_request(request):
        return web.json_response({"error": "Forbidden"}, status=403)

    try:
        index = int(request.match_info["index"])
    except ValueError:
        return web.json_response({"error": "Invalid index"}, status=400)

    prompts = _read_minimax_prompts()
    if index < 0 or index >= len(prompts):
        return web.json_response({"error": "Invalid prompt index"}, status=400)

    prompts.pop(index)
    try:
        _write_minimax_prompts(prompts)
    except OSError as error:
        return web.json_response({"error": str(error)}, status=500)
    return web.json_response({"prompts": prompts})


@PromptServer.instance.routes.post("/pz_easyuse/minimax-prompts/import")
async def import_minimax_prompts(request):
    try:
        payload = await request.json()
    except (json.JSONDecodeError, ValueError):
        return web.json_response({"error": "Invalid JSON"}, status=400)

    imported = payload.get("prompts") if isinstance(payload, dict) else None
    if isinstance(imported, dict):
        imported = [imported]
    if not isinstance(imported, list) or not all(isinstance(item, dict) for item in imported):
        return web.json_response({"error": "prompts must be an object or array"}, status=400)

    prompts = _read_minimax_prompts()
    prompts.extend(imported)
    try:
        _write_minimax_prompts(prompts)
    except OSError as error:
        return web.json_response({"error": str(error)}, status=500)
    return web.json_response({"prompts": prompts})


class PZ_Minimax_Prompt:
    """Build a MiniMax prompt from the six sections in the recommended order."""

    SECTIONS = (
        "subject_definitions",
        "summary",
        "retention_analysis",
        "detailed_description",
        "overall_soundscape",
        "non_diegetic_music",
    )
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {}
        placeholders = {
            "subject_definitions": "填写主体、声音、物体或角色定义（Define the subjects, voices, objects, or characters）...",
            "summary": "概括场景或声音事件（Summarize the scene or audio event）...",
            "retention_analysis": "描述需要保持一致的元素（Describe the elements that should remain consistent）...",
            "detailed_description": "描述时间、动作、细节和转场（Describe timing, actions, details, and transitions）...",
            "overall_soundscape": "描述环境氛围、场景声音和拟音（Describe the ambience, environment, and diegetic sounds）...",
            "non_diegetic_music": "描述背景音乐及其情绪方向（Describe the background music and its emotional direction）...",
        }

        for section in cls.SECTIONS:
            inputs[section] = (
                "STRING",
                {
                    "multiline": True,
                    "default": "",
                    "placeholder": placeholders[section],
                    "dynamicPrompts": False,
                },
            )

        inputs["prompt_preview"] = (
            "STRING",
            {
                "multiline": True,
                "default": "",
                "dynamicPrompts": False,
            },
        )

        return {"required": inputs}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "build_prompt"
    CATEGORY = "PZ EasyUse"

    def build_prompt(self, **kwargs):
        sections = []
        for section in self.SECTIONS:
            content = kwargs.get(section, "").strip()
            sections.append(f"{section}:" + (f"\n{content}" if content else ""))

        return ("\n\n".join(sections),)