import json
import os
from datetime import datetime

import folder_paths
from aiohttp import web
from server import PromptServer


MINIMAX_PROMPTS_FILE = os.path.join(folder_paths.get_input_directory(), "pz_minimax_prompts.json")


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


@PromptServer.instance.routes.delete("/pz_easyuse/minimax-prompts/{index}")
async def delete_minimax_prompt(request):
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