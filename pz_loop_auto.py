import copy
import json
import uuid
import aiohttp
from aiohttp import web
import server

class PZ_Batch_Dispatcher:
    """
    PZ 批量提示词发射器 (自动连线版)
    """
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": "", "placeholder": "在此输入提示词列表，每行一条..."}),
                "prefix": ("STRING", {"multiline": False, "default": "", "placeholder": "前缀"}),
                "suffix": ("STRING", {"multiline": False, "default": "", "placeholder": "后缀"}),
                "delimiter": ("STRING", {"default": ", "}),
                "start_index": ("INT", {"default": 0, "min": 0, "step": 1, "display": "number"}), 
                "count": ("INT", {"default": 0, "min": 0, "max": 9999, "step": 1, "display": "number"}), 
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "prompt": "PROMPT",
            },
        }

    # 🔥 核心修改 1: 定义 STRING 输出端口
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("🔗 Link to Node",) # 端口名称提示用户去连线
    FUNCTION = "output_placeholder"
    CATEGORY = "🔎 PZ/Loop"
    
    # 🔥 核心修改 2: 输出固定的占位符
    def output_placeholder(self, text, prefix, suffix, delimiter, start_index, count, unique_id=None, extra_pnginfo=None, prompt=None):
        # 只要连了这根线，下游节点收到的就是这个魔法词
        # 这样后端替换逻辑依然可以工作
        return ("__PZ_PROMPT__",)

# ==========================================
# API 路由 (后端替换逻辑完全不变，因为原理还是替换字符串)
# ==========================================
@server.PromptServer.instance.routes.post("/pz/dispatch_batch")
async def pz_dispatch_batch(request):
    try:
        data = await request.json()
        prompt_workflow = data.get("prompt")
        extra_data = data.get("extra_data")
        origin_client_id = data.get("client_id")
        
        if not prompt_workflow: return web.json_response({"message": "Workflow Empty"}, status=400)

        text_raw = data.get("text", "")
        prefix = data.get("prefix", "")
        suffix = data.get("suffix", "")
        delimiter = data.get("delimiter", ", ")
        node_id = str(data.get("node_id", ""))
        
        try:
            start_index = int(data.get("start_index", 0))
            count = int(data.get("count", 0))
        except: start_index, count = 0, 0

        lines = [line.strip() for line in text_raw.split('\n') if line.strip()]
        if not lines: return web.json_response({"message": "列表为空"}, status=200)

        end_idx = min(start_index + count, len(lines)) if count > 0 else len(lines)
        target_lines = lines[start_index : end_idx]
        
        if not target_lines: return web.json_response({"message": "选区为空"}, status=200)

        port = server.PromptServer.instance.port
        server_url = f"http://127.0.0.1:{port}/prompt"
        success_count = 0
        
        async with aiohttp.ClientSession() as session:
            for i, main_text in enumerate(target_lines):
                parts = []
                if prefix: parts.append(prefix.strip())
                parts.append(main_text)
                if suffix: parts.append(suffix.strip())
                final_prompt_str = delimiter.join(parts)

                new_prompt = copy.deepcopy(prompt_workflow)
                
                # 移除自身，避免无限循环或干扰
                if node_id in new_prompt: del new_prompt[node_id]

                # ====================================================
                # 🔥 关键：虽然我们提供了连线，但 ComfyUI 的连线在 API 层面
                # 表现为 Inputs 里的引用。我们需要处理这种引用关系。
                # ====================================================
                
                # 1. 遍历所有节点
                for nid, node_data in new_prompt.items():
                    inputs = node_data.get("inputs", {})
                    
                    # 2. 检查输入的每一个参数
                    for k, v in list(inputs.items()):
                        # 情况 A: 用户手动填写的 __PZ_PROMPT__ (保留兼容性)
                        if isinstance(v, str) and "__PZ_PROMPT__" in v:
                            inputs[k] = v.replace("__PZ_PROMPT__", final_prompt_str)
                        
                        # 情况 B: 用户使用了连线 (输入是一个列表 [node_id, slot_index])
                        # 如果某个输入连接到了我们的 PZ 节点 (node_id)
                        elif isinstance(v, list) and len(v) == 2 and str(v[0]) == node_id:
                            # 直接把这个连线关系，替换成具体的文本字符串！
                            inputs[k] = final_prompt_str

                use_id = origin_client_id if origin_client_id else str(uuid.uuid4())
                payload = {"client_id": use_id, "prompt": new_prompt}
                if extra_data: payload["extra_data"] = extra_data

                try:
                    async with session.post(server_url, json=payload) as resp:
                        if resp.status == 200: success_count += 1
                except: pass

        return web.json_response({"message": f"Added {success_count} Tasks", "count": success_count})
        
    except Exception as e:
        return web.json_response({"message": str(e)}, status=500)

NODE_CLASS_MAPPINGS = {
    "PZ_Batch_Dispatcher": PZ_Batch_Dispatcher
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PZ_Batch_Dispatcher": "🚀 PZ 批量提示词 (连线版)"
}