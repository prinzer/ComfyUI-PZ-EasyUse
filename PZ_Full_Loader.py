import torch
import nodes
import os
import numpy as np
from PIL import Image, ImageOps

class PZ_Commander:
    @classmethod
    def INPUT_TYPES(s):
        res_list = [512, 768, 832, 1024, 1080, 1088, 1152, 1216, 1280, 1344, 1536, 1920, 2048]
        
        return {
            "required": {
                "start_index": ("INT", {"default": 0, "min": 0, "step": 1, "display": "number"}),
                "count": ("INT", {"default": 1, "min": 1, "step": 1, "display": "number"}),
                
                # 🔥 只保留您需要的两个核心模式
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
    
    # 🔥 开启 List 输出功能
    OUTPUT_IS_LIST = (False, False, False, True, False, False, False)

    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"

    def process(self, start_index, count, prompt_mode, image_source, directory_path, 
                width, height, batch_size,
                prompt_text, prompt_prefix, prompt_suffix, unique_id=None):
        
        lines = [line.strip() for line in prompt_text.strip().splitlines() if line.strip()]
        if not lines: lines = [""]

        # -----------------------------------------------------------
        # 🌟 模式 A: Generator List (您要求的：一次输出 N 个 Prompt 的 List)
        # -----------------------------------------------------------
        if "Generator List" in prompt_mode:
            print(f"✅ [PZ] Mode: Generator List (Count: {count})")
            
            prompt_list_out = []
            for i in range(count):
                # 循环取行
                current_idx = (start_index + i) % len(lines)
                line_content = lines[current_idx]
                
                # 拼接
                parts = []
                if prompt_prefix: parts.append(prompt_prefix.strip())
                if line_content: parts.append(line_content)
                if prompt_suffix: parts.append(prompt_suffix.strip())
                
                prompt_list_out.append(", ".join(parts))

            # 返回列表，ComfyUI 会自动处理这个 List 跑 N 次
            return (
                self.make_latent(width, height, batch_size), 
                self.make_empty_image(), 
                self.make_empty_mask(), 
                prompt_list_out, # List [str, str...]
                width, height, start_index
            )

        # -----------------------------------------------------------
        # 🌟 模式 B: Iterate (旧模式，JS 循环)
        # -----------------------------------------------------------
        else:
            safe_index = start_index % len(lines)
            print(f"✅ [PZ] Mode: Iterate -> Index {safe_index}")
            
            parts = []
            if prompt_prefix: parts.append(prompt_prefix.strip())
            parts.append(lines[safe_index])
            if prompt_suffix: parts.append(prompt_suffix.strip())
            
            final_str = ", ".join(parts)
            
            # 即使是单条，也要包在 List 里返回 (因为 OUTPUT_IS_LIST=True)
            return (
                self.make_latent(width, height, batch_size), 
                *self.load_image_logic(image_source, directory_path, start_index),
                [final_str], 
                width, height, start_index
            )

    # --- 辅助函数 ---
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
