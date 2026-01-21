import nodes
import comfy.samplers
import json
import random
import os
import numpy as np
from PIL import Image
import folder_paths

# 通用类型定义 (避免 import 循环)
class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False
ANY = AnyType("*")

class PZ_Loop_Start:
    def __init__(self): pass
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "起始索引": ("INT", {"default": 0, "min": 0, "step": 1, "display": "number"}),
                "循环次数": ("INT", {"default": 4, "min": 1, "step": 1}), 
                "步长": ("INT", {"default": 1, "min": 1, "step": 1}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
            }
        }
    RETURN_TYPES = ("INT", "STRING")
    RETURN_NAMES = ("当前索引", "调试信息")
    OUTPUT_IS_LIST = (True, True) 
    FUNCTION = "do_loop"
    CATEGORY = "PZ EasyUse/Loop"
    @classmethod
    def IS_CHANGED(s, **kwargs):
        return float("nan")
    def do_loop(self, 起始索引, 循环次数, 步长, seed):
        indices = []
        infos = []
        for i in range(循环次数):
            current_index = 起始索引 + (i * 步长)
            indices.append(current_index)
            infos.append(f"Loop Index: {current_index}")
        print(f"🔄 PZ Loop Plan: {indices}")
        return (indices, infos)

class PZ_List_Loop:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "当前索引": ("INT", {"default": 0, "min": 0, "forceInput": True}),
                "前缀": ("STRING", {"default": "", "multiline": True, "placeholder": "【前缀】"}),
                "列表文本": ("STRING", {"default": "A\nB\nC", "multiline": True}),
                "分隔符": ("STRING", {"default": "\\n", "multiline": False}),
                "后缀": ("STRING", {"default": "", "multiline": True, "placeholder": "【后缀】"}),
                "提示词01_开关": ("BOOLEAN", {"default": False, "label_on": "启用", "label_off": "关闭"}),
                "提示词01_内容": ("STRING", {"default": "", "multiline": False}),
                "提示词02_开关": ("BOOLEAN", {"default": False, "label_on": "启用", "label_off": "关闭"}),
                "提示词02_内容": ("STRING", {"default": "", "multiline": False}),
                "提示词03_开关": ("BOOLEAN", {"default": False, "label_on": "启用", "label_off": "关闭"}),
                "提示词03_内容": ("STRING", {"default": "", "multiline": False}),
                "提示词04_开关": ("BOOLEAN", {"default": False, "label_on": "启用", "label_off": "关闭"}),
                "提示词04_内容": ("STRING", {"default": "", "multiline": False}),
                "提示词05_开关": ("BOOLEAN", {"default": False, "label_on": "启用", "label_off": "关闭"}),
                "提示词05_内容": ("STRING", {"default": "", "multiline": False}),
            }
        }
    RETURN_TYPES = ("STRING", "INT", "INT")
    RETURN_NAMES = ("最终文本", "当前索引", "列表总数")
    FUNCTION = "get_item_with_dynamic"
    CATEGORY = "PZ EasyUse/Loop"
    def get_item_with_dynamic(self, 当前索引, 前缀, 列表文本, 分隔符, 后缀,
                              提示词01_开关, 提示词01_内容, 提示词02_开关, 提示词02_内容,
                              提示词03_开关, 提示词03_内容, 提示词04_开关, 提示词04_内容,
                              提示词05_开关, 提示词05_内容):
        if 分隔符 == "\\n": real_delimiter = "\n"
        elif 分隔符 == "\\t": real_delimiter = "\t"
        else: real_delimiter = 分隔符
        items = [item.strip() for item in 列表文本.split(real_delimiter) if item.strip()]
        total = len(items)
        if total > 0:
            actual_index = 当前索引 % total
            current_main_text = items[actual_index]
        else:
            actual_index = 0
            current_main_text = ""
        parts = []
        if 前缀.strip(): parts.append(前缀.strip())
        groups = [(提示词01_开关, 提示词01_内容), (提示词02_开关, 提示词02_内容),
                  (提示词03_开关, 提示词03_内容), (提示词04_开关, 提示词04_内容),
                  (提示词05_开关, 提示词05_内容)]
        for is_on, content in groups:
            if is_on and content.strip(): parts.append(content.strip())
        if current_main_text: parts.append(current_main_text)
        if 后缀.strip(): parts.append(后缀.strip())
        final_text = ", ".join([p.strip().strip(",") for p in parts])
        return (final_text, actual_index, total)

class PZ_Loop_End:
    def __init__(self):
        self.output_dir = folder_paths.get_temp_directory()
        self.type = "temp"
        self.prefix_append = "_temp_" + ''.join(random.choice("abcdefghijklmnopqrstupvxyz") for x in range(5))
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": { "任意数据": (ANY, {}), },
            "optional": { "展示图片": ("IMAGE",), }
        }
    RETURN_TYPES = ()
    FUNCTION = "end_loop"
    OUTPUT_NODE = True
    CATEGORY = "PZ EasyUse/Loop"
    def end_loop(self, 任意数据=None, 展示图片=None):
        text_lines = []
        if 任意数据 is not None:
            text_lines.append("📦 [数据内容]:")
            try:
                if isinstance(任意数据, (dict, list)): s_val = json.dumps(任意数据, indent=2, ensure_ascii=False)
                else: s_val = str(任意数据)
                text_lines.append(s_val)
            except: text_lines.append(str(任意数据))
        images_ui_list = []
        if 展示图片 is not None:
            text_lines.append(f"\n🖼️ [图片] 已加载 {len(展示图片)} 张")
            try:
                for (batch_number, image) in enumerate(展示图片):
                    i = 255. * image.cpu().numpy()
                    img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
                    filename = f"PZ_End_{self.prefix_append}_{batch_number:05}.png"
                    full_path = os.path.join(self.output_dir, filename)
                    img.save(full_path, compress_level=4)
                    images_ui_list.append({"filename": filename, "subfolder": "", "type": self.type})
            except Exception as e:
                text_lines.append(f"❌ 图片错误: {e}")
        return {"ui": {"text": ["\n".join(text_lines)], "images": images_ui_list}}

class PZ_Loop_KSampler:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "循环驱动(连Start索引)": ("INT", {"forceInput": True}),
                "model": ("MODEL",),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "step":0.1, "round": 0.01}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS, ),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS, ),
                "positive": ("CONDITIONING", ),
                "negative": ("CONDITIONING", ),
                "latent_image": ("LATENT", ),
                "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
            }
        }
    RETURN_TYPES = ("LATENT",)
    FUNCTION = "sample"
    CATEGORY = "PZ EasyUse/Loop"
    def sample(self, model, seed, steps, cfg, sampler_name, scheduler, positive, negative, latent_image, denoise=1.0, **kwargs):
        loop_id = kwargs.get("循环驱动(连Start索引)", 0)
        print(f"🔄 PZ Loop KSampler Running: Batch Index {loop_id}")
        return nodes.KSampler().sample(
            model, seed, steps, cfg, sampler_name, scheduler, 
            positive, negative, latent_image, denoise
        )