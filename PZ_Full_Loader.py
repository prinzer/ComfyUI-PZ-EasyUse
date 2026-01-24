import torch
import nodes
import os
import numpy as np
from PIL import Image, ImageOps

# ==========================================
# PART 4: PZ Commander (全功能版 - 含图片)
# ==========================================

class PZ_Commander:
    @classmethod
    def INPUT_TYPES(s):
        res_list = [512, 768, 832, 1024, 1080, 1088, 1152, 1216, 1280, 1344, 1536, 1920, 2048]
        
        return {
            "required": {
                "start_index": ("INT", {"default": 0, "min": 0, "step": 1, "display": "number"}),
                "count": ("INT", {"default": 1, "min": 1, "step": 1, "display": "number"}),
                
                # 模式选择
                "prompt_mode": (["Iterate (JS Loop)", "Generator List (Batch List)"], ),

                "image_source": (["None (纯文本/文生图)", "Directory Path (批量目录)"], ),
                "directory_path": ("STRING", {"default": "", "multiline": False, "placeholder": "输入图片文件夹路径..."}),

                "width": (res_list, {"default": 1024}),
                "height": (res_list, {"default": 1024}),
                "batch_size": ("INT", {"default": 1, "min": 1}),

                "prompt_text": ("STRING", {"multiline": True, "default": "", "placeholder": "Prompt 列表...", "dynamicPrompts": False}),
                "prompt_prefix": ("STRING", {"multiline": True, "default": "", "placeholder": "前缀..."}),
                "prompt_suffix": ("STRING", {"multiline": True, "default": "", "placeholder": "后缀..."}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("LATENT", "IMAGE", "MASK", "STRING", "INT", "INT", "INT")
    RETURN_NAMES = ("LATENT", "IMAGE", "MASK", "final_prompt", "width", "height", "current_index")
    
    # 开启 List 输出
    OUTPUT_IS_LIST = (False, False, False, True, False, False, False)

    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"

    def process(self, start_index, count, prompt_mode, image_source, directory_path, 
                width, height, batch_size,
                prompt_text, prompt_prefix, prompt_suffix, unique_id=None):
        
        # 1. 准备文本列表
        lines = [line.strip() for line in prompt_text.strip().splitlines() if line.strip()]
        if not lines: lines = [""]
        total_prompts = len(lines)

        # 2. 准备图片列表 (为了获取正确的总数)
        image_files = []
        if "Directory" in image_source:
            clean_dir = directory_path.strip().strip('"').strip("'")
            if os.path.isdir(clean_dir):
                valid_exts = ['.jpg', '.jpeg', '.png', '.bmp', '.webp']
                try:
                    image_files = [f for f in os.listdir(clean_dir) if os.path.splitext(f)[1].lower() in valid_exts]
                    image_files.sort()
                except: pass
        total_images = len(image_files)

        # 3. 确定有效总数量 (以文本和图片中较大的为准，用于计算边界)
        # 如果没有图片，就用文本数量；如果没有文本，就用图片数量
        max_items = max(total_prompts, total_images) if total_images > 0 else total_prompts
        if max_items == 0: max_items = 1

        # -----------------------------------------------------------
        # 🌟 模式 A: Generator List (批量列表模式)
        # -----------------------------------------------------------
        if "Generator List" in prompt_mode:
            # 🔥 核心修改：防循环逻辑
            # 计算剩余可用的条目数
            remaining_items = max(0, max_items - start_index)
            # 实际执行次数取 count 和 remaining 的较小值
            actual_count = min(count, remaining_items)
            
            # 如果 actual_count 为 0 (说明 start_index 已经超了)，防止报错，强制生成 1 个空或者最后一条
            # 但既然要求“不重复”，这里如果已经到底了，最好还是不做或者返回空串
            # 这里我们只处理 > 0 的情况
            
            print(f"✅ [PZ] Mode: List | Request: {count} | Actual: {actual_count} (No Repeat)")
            
            prompt_list_out = []
            
            # 如果 actual_count <= 0，列表为空，ComfyUI 可能会停止或报错，
            # 我们至少插入一个空字符串占位，或者保持空列表让其自然停止（视 ComfyUI 版本而定）
            # 为了安全，如果没得跑了，就跑一次空
            loop_range = range(actual_count) if actual_count > 0 else range(0)

            for i in loop_range:
                # 绝对索引，不再取模 (因为我们已经限制了 count 不超过 max)
                # 但为了防止 lines 和 images 数量不一致导致的越界，对内部还是单独取模
                current_abs_idx = start_index + i
                
                # 获取 Prompt
                p_idx = current_abs_idx % total_prompts if total_prompts > 0 else 0
                line_content = lines[p_idx]
                
                parts = []
                if prompt_prefix: parts.append(prompt_prefix.strip())
                if line_content: parts.append(line_content)
                if prompt_suffix: parts.append(prompt_suffix.strip())
                prompt_list_out.append(", ".join(parts))

            # 如果列表为空 (start_index 超出)，为了不崩，返回一个空字符串
            if not prompt_list_out:
                prompt_list_out = [""]

            # 对于图片，我们只加载第一张或者空的，因为这个节点主要目的是输出 Latent/Prompt List
            # 如果需要 Image List，逻辑会很复杂，这里保持原样返回单张
            return (
                self.make_latent(width, height, batch_size), 
                self.make_empty_image(), 
                self.make_empty_mask(), 
                prompt_list_out,
                width, height, start_index
            )

        # -----------------------------------------------------------
        # 🌟 模式 B: Iterate (JS Loop 单次运行)
        # -----------------------------------------------------------
        else:
            # 在 Iterate 模式下，Python 只接收单次指令。
            # "不重复" 的控制权在 JS 代码 (通过截断 count)。
            # 这里我们只需要确保 start_index 即使超出了也不报错即可。
            
            # 安全取模
            safe_index = start_index % total_prompts if total_prompts > 0 else 0
            
            # 如果 start_index 实际上已经超过了 total_prompts，
            # 说明 JS 那边可能没截断住，或者用户手动输了个大数字。
            # 在这种情况下，取模会导致“重复”。
            # 如果你希望 Python 端强制“不重复”，可以判断 start_index >= total_prompts 就返回空。
            # 但这会让单次测试变得困难。建议保持取模，依赖 JS 截断。
            
            print(f"✅ [PZ] Mode: Iterate -> Index {start_index} (Mapped to {safe_index})")
            
            parts = []
            if prompt_prefix: parts.append(prompt_prefix.strip())
            parts.append(lines[safe_index])
            if prompt_suffix: parts.append(prompt_suffix.strip())
            final_str = ", ".join(parts)
            
            return (
                self.make_latent(width, height, batch_size), 
                *self.load_image_logic(image_source, directory_path, start_index), # 这里内部也有取模逻辑
                [final_str], 
                width, height, start_index
            )

    # ... 辅助函数 ...
    def make_latent(self, width, height, batch_size):
        w_8 = (width // 8) * 8
        h_8 = (height // 8) * 8
        return {"samples": torch.zeros([batch_size, 4, h_8 // 8, w_8 // 8], device="cpu")}
    def make_empty_image(self):
        return torch.zeros((1, 512, 512, 3), dtype=torch.float32, device="cpu")
    def make_empty_mask(self):
        return torch.zeros((64,64), dtype=torch.float32, device="cpu")
    def load_image_logic(self, image_source, directory_path, index):
        if "None" in image_source: return (self.make_empty_image(), self.make_empty_mask())
        clean_dir = directory_path.strip().strip('"').strip("'")
        if not os.path.isdir(clean_dir): return (self.make_empty_image(), self.make_empty_mask())
        valid_exts = ['.jpg', '.jpeg', '.png', '.bmp', '.webp']
        try:
            files = [f for f in os.listdir(clean_dir) if os.path.splitext(f)[1].lower() in valid_exts]
            files.sort()
            if files:
                # 这里也是，如果 index 超出，取模会导致重复。
                # 但 Python 单次运行无法得知“我不需要重复”，除非返回空。
                file_index = index % len(files)
                return self.load_image(os.path.join(clean_dir, files[file_index]))
        except: pass
        return (self.make_empty_image(), self.make_empty_mask())
    def load_image(self, path):
        try:
            i = Image.open(path); i = ImageOps.exif_transpose(i); image = i.convert("RGB")
            image = np.array(image).astype(np.float32) / 255.0
            image_tensor = torch.from_numpy(image)[None,]
            mask_tensor = 1.0 - torch.from_numpy(np.array(i.getchannel('A')).astype(np.float32) / 255.0) if 'A' in i.getbands() else torch.zeros((64,64), dtype=torch.float32, device="cpu")
            return image_tensor, mask_tensor
        except: return (self.make_empty_image(), self.make_empty_mask())


# ==========================================
# PART 5: PZ Commander Text (文本专用版)
# ==========================================

class PZ_Commander_Text:
    @classmethod
    def INPUT_TYPES(s):
        res_list = [512, 768, 832, 1024, 1080, 1088, 1152, 1216, 1280, 1344, 1536, 1920, 2048]
        
        return {
            "required": {
                "start_index": ("INT", {"default": 0, "min": 0, "step": 1, "display": "number"}),
                "count": ("INT", {"default": 1, "min": 1, "step": 1, "display": "number"}),
                
                "prompt_mode": (["Iterate (JS Loop)", "Generator List (Batch List)"], ),
                "split_mode": (["Newline (换行符)", "Custom Delimiter (自定义)"], ),
                "delimiter": ("STRING", {"default": ";", "multiline": False}),

                "width": (res_list, {"default": 1024}),
                "height": (res_list, {"default": 1024}),
                "batch_size": ("INT", {"default": 1, "min": 1}),

                "prompt_text": ("STRING", {"multiline": True, "default": "", "placeholder": "Prompt 列表...", "dynamicPrompts": False}),
                "prompt_prefix": ("STRING", {"multiline": True, "default": "", "placeholder": "前缀..."}),
                "prompt_suffix": ("STRING", {"multiline": True, "default": "", "placeholder": "后缀..."}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("LATENT", "STRING", "INT", "INT", "INT")
    RETURN_NAMES = ("LATENT", "final_prompt", "width", "height", "current_index")
    OUTPUT_IS_LIST = (False, True, False, False, False)

    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"

    def process(self, start_index, count, prompt_mode, split_mode, delimiter,
                width, height, batch_size,
                prompt_text, prompt_prefix, prompt_suffix, unique_id=None):
        
        # 1. 分割文本
        raw_text = prompt_text.strip()
        lines = []
        
        if not raw_text:
            lines = [""]
        elif "Custom" in split_mode and delimiter:
            parts = raw_text.split(delimiter)
            lines = [p.strip() for p in parts if p.strip()]
            if not lines: lines = [""]
        else:
            lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
            if not lines: lines = [""]
            
        total_items = len(lines)

        # -----------------------------------------------------------
        # 🌟 模式 A: Generator List (批量列表模式)
        # -----------------------------------------------------------
        if "Generator List" in prompt_mode:
            # 🔥 核心修改：防循环逻辑
            remaining_items = max(0, total_items - start_index)
            actual_count = min(count, remaining_items)
            
            print(f"✅ [PZ Text] Mode: List | Request: {count} | Actual: {actual_count} (No Repeat)")

            prompt_list_out = []
            loop_range = range(actual_count) if actual_count > 0 else range(0)

            for i in loop_range:
                # 绝对索引，不回环
                current_abs_idx = start_index + i
                
                # 安全取模 (防止 total_items=0 或异常)
                p_idx = current_abs_idx % total_items if total_items > 0 else 0
                line_content = lines[p_idx]
                
                parts_str = []
                if prompt_prefix: parts_str.append(prompt_prefix.strip())
                if line_content: parts_str.append(line_content)
                if prompt_suffix: parts_str.append(prompt_suffix.strip())
                
                prompt_list_out.append(", ".join(parts_str))
            
            if not prompt_list_out:
                prompt_list_out = [""] # 防止空列表报错

            return (
                self.make_latent(width, height, batch_size), 
                prompt_list_out, 
                width, height, start_index
            )

        # -----------------------------------------------------------
        # 🌟 模式 B: Iterate (JS Loop 单次运行)
        # -----------------------------------------------------------
        else:
            # 安全取模
            safe_index = start_index % total_items if total_items > 0 else 0
            
            line_content = lines[safe_index]
            
            parts_str = []
            if prompt_prefix: parts_str.append(prompt_prefix.strip())
            if line_content: parts_str.append(line_content)
            if prompt_suffix: parts_str.append(prompt_suffix.strip())
            final_str = ", ".join(parts_str)
            
            return (
                self.make_latent(width, height, batch_size), 
                [final_str], # List 包装
                width, height, start_index
            )

    def make_latent(self, width, height, batch_size):
        w_8 = (width // 8) * 8
        h_8 = (height // 8) * 8
        return {"samples": torch.zeros([batch_size, 4, h_8 // 8, w_8 // 8], device="cpu")}
