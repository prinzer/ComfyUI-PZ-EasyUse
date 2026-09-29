import torch
import nodes
import os
import numpy as np
from PIL import Image, ImageOps
import re

# ==============================================================================
# 1. PZ_Commander (Text & Image Mix Version - Core Node)
# ==============================================================================
class PZ_Commander:
    @classmethod
    def INPUT_TYPES(s):
        res_list = [512, 768, 832, 1024, 1080, 1088, 1152, 1216, 1280, 1344, 1536, 1920, 2048]
        return {
            "required": {
                "image_source": (["Upload Images", "Directory Path"], ),
                
                "start_index": ("INT", {"default": 0, "min": 0, "step": 1, "display": "number"}),
                # Renamed: force_count, used to manually specify loop count (when image mode doesn't work or needs override)
                "force_count": ("INT", {"default": 1, "min": 1, "step": 1, "display": "number"}),
                
                "directory_path": ("STRING", {"default": "", "multiline": False, "placeholder": "Directory path..."}),
                "image_list_data": ("STRING", {"default": "", "multiline": True, "hidden": False}), 
                
                "split_mode": (["Newline", "Custom Delimiter"], ),
                "delimiter": ("STRING", {"default": ";", "multiline": False}),
                
                "width": (res_list, {"default": 1024}),
                "height": (res_list, {"default": 1024}),
                "batch_size": ("INT", {"default": 1, "min": 1}),

                "prompt_text": ("STRING", {"multiline": True, "default": "", "placeholder": "Prompt list (main content)...", "dynamicPrompts": False}),
                # UI slimming: changed to single line
                "prompt_prefix": ("STRING", {"multiline": False, "default": "", "placeholder": "Prefix (single line)..."}),
                "prompt_suffix": ("STRING", {"multiline": False, "default": "", "placeholder": "Suffix (single line)..."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"}
        }

    RETURN_TYPES = ("LATENT", "IMAGE", "MASK", "STRING", "INT", "INT", "INT")
    RETURN_NAMES = ("LATENT", "IMAGE", "MASK", "final_prompt", "width", "height", "current_index")
    OUTPUT_IS_LIST = (False, False, False, True, False, False, False)
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"

    def process(self, image_source, start_index, force_count, directory_path, image_list_data, split_mode, delimiter, width, height, batch_size, prompt_text, prompt_prefix, prompt_suffix, unique_id=None):
        # 1. Parse text
        lines = self.parse_text(prompt_text, split_mode, delimiter)
        total_prompts = len(lines)

        # 2. Parse images
        image_files = self.get_image_files(image_source, directory_path, image_list_data)
        total_images = len(image_files)
        has_images = total_images > 0
        
        # 3. Index calculation
        # Text index
        safe_text_idx = start_index % total_prompts if total_prompts > 0 else 0
        # Image index
        safe_img_idx = start_index % total_images if total_images > 0 else 0
        
        # 4. Combine text
        parts = []
        if prompt_prefix: parts.append(prompt_prefix.strip())
        parts.append(lines[safe_text_idx])
        if prompt_suffix: parts.append(prompt_suffix.strip())
        final_str = ", ".join(parts)
        
        # 5. Load image
        current_image = (self.make_empty_image(), self.make_empty_mask())
        if has_images:
            current_image = self.load_image(image_files[safe_img_idx])

        return (self.make_latent(width, height, batch_size), *current_image, [final_str], width, height, start_index)

    # --- Helper methods ---
    def parse_text(self, text, split_mode, delimiter):
        raw = text.strip()
        if not raw: return [""]
        if "Custom" in split_mode and delimiter:
            return [p.strip() for p in raw.split(delimiter) if p.strip()] or [""]
        return [l.strip() for l in raw.splitlines() if l.strip()] or [""]

    def get_image_files(self, source, path, list_data):
        if "Directory" in source:
            clean_dir = path.strip().strip('"').strip("'")
            if os.path.isdir(clean_dir):
                valid = ['.jpg', '.jpeg', '.png', '.bmp', '.webp']
                try:
                    f = [os.path.join(clean_dir, x) for x in os.listdir(clean_dir) if os.path.splitext(x)[1].lower() in valid]
                    f.sort()
                    return f
                except: return []
        elif "Upload" in source and list_data:
            names = [n.strip() for n in list_data.split("\n") if n.strip()]
            inp_dir = nodes.folder_paths.get_input_directory()
            return [os.path.join(inp_dir, n) for n in names]
        return []

    def make_latent(self, width, height, batch_size):
        w, h = (width // 8) * 8, (height // 8) * 8
        return {"samples": torch.zeros([batch_size, 4, h // 8, w // 8], device="cpu")}
    def make_empty_image(self): return torch.zeros((1, 512, 512, 3), dtype=torch.float32, device="cpu")
    def make_empty_mask(self): return torch.zeros((64,64), dtype=torch.float32, device="cpu")
    def load_image(self, path):
        try:
            i = Image.open(path); i = ImageOps.exif_transpose(i); image = i.convert("RGB")
            image = np.array(image).astype(np.float32) / 255.0
            image = torch.from_numpy(image)[None,]
            mask = 1.0 - torch.from_numpy(np.array(i.getchannel('A')).astype(np.float32) / 255.0) if 'A' in i.getbands() else torch.zeros((64,64), dtype=torch.float32, device="cpu")
            return image, mask
        except: return (self.make_empty_image(), self.make_empty_mask())


# ==============================================================================
# 2. PZ_Commander_Image (Image Only Version)
# ==============================================================================
class PZ_Commander_Image:
    @classmethod
    def INPUT_TYPES(s):
        res_list = [512, 768, 832, 1024, 1080, 1088, 1152, 1216, 1280, 1344, 1536, 1920, 2048]
        return {
            "required": {
                "image_source": (["Upload Images", "Directory Path"], ),
                "start_index": ("INT", {"default": 0, "min": 0, "step": 1, "display": "number"}),
                # Also renamed to force_count for consistency
                "force_count": ("INT", {"default": 1, "min": 1, "step": 1, "display": "number"}),
                
                "directory_path": ("STRING", {"default": "", "multiline": False, "placeholder": "Directory path..."}),
                "image_list_data": ("STRING", {"default": "", "multiline": True, "hidden": False}),
                
                "width": (res_list, {"default": 1024}),
                "height": (res_list, {"default": 1024}),
                "batch_size": ("INT", {"default": 1, "min": 1}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"}
        }

    RETURN_TYPES = ("LATENT", "IMAGE", "MASK", "INT", "INT", "INT")
    RETURN_NAMES = ("LATENT", "IMAGE", "MASK", "width", "height", "current_index")
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"

    def process(self, image_source, start_index, force_count, directory_path, image_list_data, width, height, batch_size, unique_id=None):
        helper = PZ_Commander()
        image_files = helper.get_image_files(image_source, directory_path, image_list_data)
        total_images = len(image_files)
        
        current_image = (helper.make_empty_image(), helper.make_empty_mask())
        if total_images > 0:
            idx = start_index % total_images
            current_image = helper.load_image(image_files[idx])
            
        return (helper.make_latent(width, height, batch_size), *current_image, width, height, start_index)



# ==============================================================================
# 3. PZ_Commander_Text (Text Only Version - Auto Clean Line Numbers + Anti-Misoperation Placeholder)
# ==============================================================================
class PZ_Commander_Text:
    @classmethod
    def INPUT_TYPES(s):
        res_list = [512, 768, 832, 1024, 1080, 1088, 1152, 1216, 1280, 1344, 1536, 1920, 2048]
        return {
            "required": {
                "start_index": ("INT", {"default": 0, "min": 0, "step": 1, "display": "number"}),
                "count": ("INT", {"default": 1, "min": 1, "step": 1, "display": "number"}),
                "prompt_mode": (["Iterate (JS Loop)", "Generator List (Batch List)"], ),
                "split_mode": (["Newline", "Custom Delimiter"], ),
                "delimiter": ("STRING", {"default": ";", "multiline": False}),
                "width": (res_list, {"default": 1024}),
                "height": (res_list, {"default": 1024}),
                "batch_size": ("INT", {"default": 1, "min": 1}),
                "prompt_text": ("STRING", {
                    "multiline": True, 
                    "default": "", 
                    # Added clear warning and instructions
                    "placeholder": "⚠️ Do not convert to external connections in JS Loop mode!\n\nYou can add line numbers for easy viewing, they will be automatically removed during runtime, e.g.\n0: study room, half body...\n1: bathroom, full body...", 
                    "dynamicPrompts": False
                }),
                "prompt_prefix": ("STRING", {"multiline": False, "default": "", "placeholder": "Prefix..."}),
                "prompt_suffix": ("STRING", {"multiline": False, "default": "", "placeholder": "Suffix..."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"}
        }
        
    RETURN_TYPES = ("LATENT", "STRING", "INT", "INT", "INT")
    RETURN_NAMES = ("LATENT", "final_prompt", "width", "height", "current_index")
    OUTPUT_IS_LIST = (False, True, False, False, False)
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    
    def process(self, start_index, count, prompt_mode, split_mode, delimiter, width, height, batch_size, prompt_text, prompt_prefix, prompt_suffix, unique_id=None):
        helper = PZ_Commander()
        raw_lines = helper.parse_text(prompt_text, split_mode, delimiter)
        
        # ✨ New: Auto clean line numbers at the beginning of text (e.g. "0:", "1.", "01：")
        # This way you can write line numbers in the box, but the final clean prompt sent to the model won't include them
        lines = [re.sub(r'^\d+[:：\.]\s*', '', line).strip() for line in raw_lines]
        
        total_items = len(lines)
        
        if "Generator List" in prompt_mode:
            remaining = max(0, total_items - start_index)
            actual = min(count, remaining)
            out = []
            for i in range(actual if actual > 0 else 0):
                idx = (start_index + i) % total_items if total_items else 0
                parts = []
                if prompt_prefix: parts.append(prompt_prefix)
                if lines[idx]: parts.append(lines[idx])
                if prompt_suffix: parts.append(prompt_suffix)
                out.append(", ".join(parts))
            return (helper.make_latent(width, height, batch_size), out or [""], width, height, start_index)
        else:
            idx = start_index % total_items if total_items else 0
            parts = []
            if prompt_prefix: parts.append(prompt_prefix)
            if lines[idx]: parts.append(lines[idx])
            if prompt_suffix: parts.append(prompt_suffix)
            return (helper.make_latent(width, height, batch_size), [", ".join(parts)], width, height, start_index)


# ==============================================================================
# 4. PZ_Commander_Text_Batch (Whole Textbox Loop - Batch Version)
# ==============================================================================
class PZ_Commander_Text_Batch:
    @classmethod
    def INPUT_TYPES(s):
        res_list = [512, 768, 832, 1024, 1080, 1088, 1152, 1216, 1280, 1344, 1536, 1920, 2048]
        return {
            "required": {
                "count": ("INT", {"default": 1, "min": 1, "step": 1, "display": "number"}),
                "width": (res_list, {"default": 1024}),
                "height": (res_list, {"default": 1024}),
                "batch_size": ("INT", {"default": 1, "min": 1}),
                "prompt_text": ("STRING", {
                    "multiline": True, 
                    "default": "", 
                    "placeholder": "Enter full prompt text (treated as a single unit, not split by lines)", 
                    "dynamicPrompts": False
                }),
                "prompt_prefix": ("STRING", {"multiline": False, "default": "", "placeholder": "Prefix..."}),
                "prompt_suffix": ("STRING", {"multiline": False, "default": "", "placeholder": "Suffix..."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"}
        }
        
    RETURN_TYPES = ("LATENT", "STRING", "INT", "INT", "INT")
    RETURN_NAMES = ("LATENT", "final_prompt", "width", "height", "batch_count")
    OUTPUT_IS_LIST = (False, True, False, False, False)
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    
    def process(self, count, width, height, batch_size, prompt_text, prompt_prefix, prompt_suffix, unique_id=None):
        helper = PZ_Commander()
        
        # Clean line numbers if present (e.g. "0:", "1.", "01：")
        cleaned_text = re.sub(r'^\d+[:：\.]\s*', '', prompt_text.strip()).strip()
        
        if not cleaned_text:
            cleaned_text = ""
        
        # Generate list with same prompt repeated 'count' times
        out = []
        for i in range(count):
            parts = []
            if prompt_prefix: parts.append(prompt_prefix.strip())
            if cleaned_text: parts.append(cleaned_text)
            if prompt_suffix: parts.append(prompt_suffix.strip())
            out.append(", ".join(parts))
        
        return (helper.make_latent(width, height, batch_size), out or [""], width, height, count)


# ==============================================================================
# 5. PZ_Commander_Text_MultiBox (Multiple Textboxes - Each Box = One Task)
# ==============================================================================
class PZ_Commander_Text_MultiBox:
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(cls):
        base_inputs = {
            "required": {
                "prompt_prefix": ("STRING", {"multiline": False, "default": "", "placeholder": "Prefix..."}),
                "prompt_suffix": ("STRING", {"multiline": False, "default": "", "placeholder": "Suffix..."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"}
        }
        
        # Add 5 text boxes by default
        for i in range(5):
            box_name = f"prompt_box_{i}"
            base_inputs["required"][box_name] = ("STRING", {
                "multiline": True, 
                "default": "", 
                "placeholder": f"Text Box {i+1}...", 
                "dynamicPrompts": False
            })
        
        return base_inputs
        
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("final_prompts",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    
    def process(self, prompt_prefix, prompt_suffix, unique_id=None, **kwargs):
        out = []
        # Extract text boxes in order (prompt_box_0, prompt_box_1, etc.)
        for i in range(5):
            box_name = f"prompt_box_{i}"
            if box_name in kwargs:
                text = kwargs[box_name]
                if text and text.strip():
                    # Clean line numbers if present
                    cleaned_text = re.sub(r'^\d+[:：\.]\s*', '', text.strip()).strip()
                    
                    parts = []
                    if prompt_prefix: parts.append(prompt_prefix.strip())
                    if cleaned_text: parts.append(cleaned_text)
                    if prompt_suffix: parts.append(prompt_suffix.strip())
                    
                    final_text = ", ".join(parts)
                    out.append(final_text)
        
        # If no boxes have content, return empty list
        if not out:
            out = [""]
        
        return (out,)


