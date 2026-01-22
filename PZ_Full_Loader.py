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
                "image_source": (["None (纯文本/文生图)", "Directory Path (批量目录)"], ),
                "directory_path": ("STRING", {"default": "", "multiline": False, "placeholder": "输入图片文件夹路径..."}),
                "width": (res_list, {"default": 1024}),
                "height": (res_list, {"default": 1024}),
                "batch_size": ("INT", {"default": 1, "min": 1}),
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
        
        # 🔥🔥🔥 核心修复：确保每次进入函数时，所有变量都是全新的 🔥🔥🔥
        parts = [] 
        final_prompt = ""
        current_middle = ""

        # 1. 解析 Prompt 列表
        # 使用 splitlines() 更加安全
        lines = [line.strip() for line in prompt_text.strip().splitlines() if line.strip()]
        
        # 2. 获取当前这一条 Prompt
        if lines:
            # 使用取余数逻辑，防止 index 越界
            safe_index = start_index % len(lines)
            current_middle = lines[safe_index]
            #print(f"✅ [PZ Commander] Index {start_index} -> Line {safe_index}: {current_middle[:20]}...")
        else:
            print(f"⚠️ [PZ Commander] Prompt List is Empty!")

        # 3. 严格拼接逻辑 (全新列表)
        # 前缀
        if prompt_prefix and prompt_prefix.strip(): 
            parts.append(prompt_prefix.strip())
        
        # 中间 (当前这一条)
        if current_middle and current_middle.strip(): 
            parts.append(current_middle.strip())
            
        # 后缀
        if prompt_suffix and prompt_suffix.strip(): 
            parts.append(prompt_suffix.strip())
        
        # 合并
        final_prompt = ", ".join(parts)
        
        # 4. Latent 生成
        w_8 = (width // 8) * 8
        h_8 = (height // 8) * 8
        latent_tensor = torch.zeros([batch_size, 4, h_8 // 8, w_8 // 8], device="cpu")
        latent_dict = {"samples": latent_tensor}

        # 5. 图片加载逻辑 (默认黑图)
        output_image = torch.zeros((1, 512, 512, 3), dtype=torch.float32, device="cpu")
        output_mask = torch.zeros((64,64), dtype=torch.float32, device="cpu")
        
        mode = str(image_source)
        target_path = None

        if "Directory" in mode:
            clean_dir = directory_path.strip().strip('"').strip("'")
            if os.path.isdir(clean_dir):
                valid_exts = ['.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff']
                try:
                    # 每次都重新读列表，虽然慢一点点，但绝不会错
                    files = [f for f in os.listdir(clean_dir) if os.path.splitext(f)[1].lower() in valid_exts]
                    files.sort()
                    if files:
                        file_index = start_index % len(files)
                        target_path = os.path.join(clean_dir, files[file_index])
                except Exception:
                    pass

        if target_path and os.path.isfile(target_path):
            output_image, output_mask = self.load_image(target_path)

        # 再次确保返回的是独立的字符串
        return (latent_dict, output_image, output_mask, str(final_prompt), width, height, start_index)

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
