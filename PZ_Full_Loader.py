import torch
import nodes
import os
import numpy as np
from PIL import Image, ImageOps

class PZ_Commander:
    @classmethod
    def INPUT_TYPES(s):
        res_list = [512, 768, 832, 1024, 1080,1088,1152, 1216, 1280, 1344, 1536, 1920, 2048]
        
        return {
            "required": {
                # --- 1. 核心循环控制 ---
                "start_index": ("INT", {"default": 0, "min": 0, "step": 1, "display": "number"}),
                "count": ("INT", {"default": 1, "min": 1, "step": 1, "display": "number"}),
                
                # --- 2. 模式选择 (已移除单图模式) ---
                "image_source": (["None (纯文本/文生图)", "Directory Path (批量目录)"], ),
                
                # --- 3. 目录路径 ---
                "directory_path": ("STRING", {"default": "", "multiline": False, "placeholder": "输入图片文件夹路径..."}),

                # --- 4. 分辨率 ---
                "width": (res_list, {"default": 1024}),
                "height": (res_list, {"default": 1024}),
                "batch_size": ("INT", {"default": 1, "min": 1}),

                # --- 5. Prompt ---
                "prompt_text": ("STRING", {"multiline": True, "default": "", "placeholder": "每行一条 Prompt", "dynamicPrompts": False}),
                "prompt_prefix": ("STRING", {"multiline": True, "default": "", "placeholder": "前缀..."}),
                "prompt_suffix": ("STRING", {"multiline": True, "default": "", "placeholder": "后缀..."}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("LATENT", "IMAGE", "MASK", "STRING", "INT", "INT", "INT")
    RETURN_NAMES = ("LATENT", "IMAGE", "MASK", "final_prompt", "width", "height", "current_index")
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"

    def process(self, start_index, count, image_source, directory_path, 
                width, height, batch_size,
                prompt_text, prompt_prefix, prompt_suffix, unique_id=None):
        
        # 1. Prompt 循环逻辑
        lines = [line.strip() for line in prompt_text.strip().split('\n') if line.strip()]
        current_middle = ""
        if lines:
            safe_index = start_index % len(lines)
            current_middle = lines[safe_index]
        
        parts = []
        if prompt_prefix.strip(): parts.append(prompt_prefix.strip())
        if current_middle.strip(): parts.append(current_middle.strip())
        if prompt_suffix.strip(): parts.append(prompt_suffix.strip())
        final_prompt = ", ".join(parts)

        # 2. Latent 生成
        w_8 = (width // 8) * 8
        h_8 = (height // 8) * 8
        latent_tensor = torch.zeros([batch_size, 4, h_8 // 8, w_8 // 8], device="cpu")
        latent_dict = {"samples": latent_tensor}

        # 3. 图片加载逻辑
        # 默认黑图
        output_image = torch.zeros((1, 512, 512, 3), dtype=torch.float32, device="cpu")
        output_mask = torch.zeros((64,64), dtype=torch.float32, device="cpu")
        
        mode = str(image_source)
        target_path = None

        print(f"\n--- PZ Commander (Idx: {start_index}) ---")

        # 仅当选择了目录模式时才尝试加载图片
        if "Directory" in mode:
            clean_dir = directory_path.strip().strip('"').strip("'")
            if os.path.isdir(clean_dir):
                valid_exts = ['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff']
                try:
                    files = [f for f in os.listdir(clean_dir) if os.path.splitext(f)[1].lower() in valid_exts]
                    files.sort()
                    if files:
                        file_index = start_index % len(files)
                        target_path = os.path.join(clean_dir, files[file_index])
                        print(f"📂 Loading: {files[file_index]}")
                    else:
                        print("⚠️ Directory empty or no images found.")
                except Exception as e:
                    print(f"⚠️ Read Error: {e}")
            else:
                if clean_dir: print(f"⚠️ Invalid Path: {clean_dir}")

        if target_path and os.path.isfile(target_path):
            output_image, output_mask = self.load_image(target_path)

        return (latent_dict, output_image, output_mask, final_prompt, width, height, start_index)

    def load_image(self, path):
        try:
            i = Image.open(path)
            i = ImageOps.exif_transpose(i)
            image = i.convert("RGB")
            image = np.array(image).astype(np.float32) / 255.0
            image_tensor = torch.from_numpy(image)[None,]
            if 'A' in i.getbands():
                mask = np.array(i.getchannel('A')).astype(np.float32) / 255.0
                mask_tensor = 1.0 - torch.from_numpy(mask)
            else:
                mask_tensor = torch.zeros((64,64), dtype=torch.float32, device="cpu")
            return image_tensor, mask_tensor
        except:
            return (torch.zeros((1, 512, 512, 3), dtype=torch.float32, device="cpu"), 
                    torch.zeros((64,64), dtype=torch.float32, device="cpu"))