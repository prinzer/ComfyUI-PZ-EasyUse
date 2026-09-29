import json
import os

import folder_paths
from aiohttp import web
from server import PromptServer


UNIVERSAL_PROMPTS_FILE = os.path.join(folder_paths.get_input_directory(), "pz_universal_prompts.json")


def _read_universal_prompts():
    try:
        with open(UNIVERSAL_PROMPTS_FILE, "r", encoding="utf-8") as prompt_file:
            data = json.load(prompt_file)
        return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def _write_universal_prompts(prompts):
    input_directory = folder_paths.get_input_directory()
    os.makedirs(input_directory, exist_ok=True)
    temporary_file = f"{UNIVERSAL_PROMPTS_FILE}.tmp"
    with open(temporary_file, "w", encoding="utf-8") as prompt_file:
        json.dump(prompts, prompt_file, ensure_ascii=False, indent=2)
    os.replace(temporary_file, UNIVERSAL_PROMPTS_FILE)


class PZ_Universal_Prompt:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prefix": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "前缀提示词 (Prefix)",
                    "dynamicPrompts": False,
                }),
                "prompt": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "正文提示词 (Main Prompt)",
                    "dynamicPrompts": False,
                }),
                "suffix": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "后缀提示词 (Suffix)",
                    "dynamicPrompts": False,
                }),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "build_prompt"
    CATEGORY = "PZ EasyUse"

    def build_prompt(self, prefix="", prompt="", suffix=""):
        parts = []
        if prefix.strip():
            parts.append(prefix.strip())
        if prompt.strip():
            parts.append(prompt.strip())
        if suffix.strip():
            parts.append(suffix.strip())
        combined = "\n".join(parts)
        return (combined,)


@PromptServer.instance.routes.get("/pz_easyuse/universal-prompts")
async def get_universal_prompts(request):
    prompts = _read_universal_prompts()
    return web.json_response({"prompts": prompts})


@PromptServer.instance.routes.post("/pz_easyuse/universal-prompts")
async def save_universal_prompt(request):
    try:
        body = await request.json()
        new_prompt = body.get("prompt", {})
        if not isinstance(new_prompt, dict):
            return web.json_response({"error": "Invalid prompt data"}, status=400)
        prompts = _read_universal_prompts()
        prompts.append(new_prompt)
        _write_universal_prompts(prompts)
        return web.json_response({"prompts": prompts, "index": len(prompts) - 1})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.put("/pz_easyuse/universal-prompts/{index}")
async def update_universal_prompt(request):
    try:
        index = int(request.match_info["index"])
        body = await request.json()
        updated_prompt = body.get("prompt", {})
        if not isinstance(updated_prompt, dict):
            return web.json_response({"error": "Invalid prompt data"}, status=400)
        prompts = _read_universal_prompts()
        if index < 0 or index >= len(prompts):
            return web.json_response({"error": "Index out of range"}, status=404)
        prompts[index] = updated_prompt
        _write_universal_prompts(prompts)
        return web.json_response({"prompts": prompts})
    except (ValueError, KeyError):
        return web.json_response({"error": "Invalid index"}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.delete("/pz_easyuse/universal-prompts/{index}")
async def delete_universal_prompt(request):
    try:
        index = int(request.match_info["index"])
        prompts = _read_universal_prompts()
        if index < 0 or index >= len(prompts):
            return web.json_response({"error": "Index out of range"}, status=404)
        prompts.pop(index)
        _write_universal_prompts(prompts)
        return web.json_response({"prompts": prompts})
    except (ValueError, KeyError):
        return web.json_response({"error": "Invalid index"}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.post("/pz_easyuse/universal-prompts/import")
async def import_universal_prompts(request):
    try:
        body = await request.json()
        new_prompts = body.get("prompts", [])
        if not isinstance(new_prompts, list):
            return web.json_response({"error": "Invalid prompts data"}, status=400)
        prompts = _read_universal_prompts()
        prompts.extend(new_prompts)
        _write_universal_prompts(prompts)
        return web.json_response({"prompts": prompts})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
