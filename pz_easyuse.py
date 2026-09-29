
import folder_paths
import datetime
import os
import subprocess
import platform
import server
import json
import numpy as np
from PIL import Image, ImageOps
from PIL.PngImagePlugin import PngInfo
from aiohttp import web
import torch


# ==========================================
# 1. PZ Save Image (Metadata Embedding Version)
# ==========================================
class PZ_Save_Image:
    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()
        self.type = "output"
        self.compress_level = 4

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "file_prefix": ("STRING", {"default": "PZ"}),
                "date_subfolder": ("BOOLEAN", {"default": True, "label_on": "🟢 On", "label_off": "⚪ Off"}),
                "include_model_name": ("BOOLEAN", {"default": False, "label_on": "🟢 On", "label_off": "⚪ Off"}),
                "embed_workflow": ("BOOLEAN", {"default": True, "label_on": "🟢 Embed", "label_off": "⚪ Don't Embed"}),
                "embed_custom_text": ("BOOLEAN", {"default": False, "label_on": "🟢 Embed", "label_off": "⚪ Don't Embed"}),
                "custom_text": ("STRING", {"multiline": False, "default": "Enter notes or prompts you want to hide in the image..."}),
                "custom_output_path": ("STRING", {"default": folder_paths.get_output_directory(), "multiline": False}),
            },
            "optional": {
                "image": ("IMAGE", ),
                "model_name_input": ("STRING", {"forceInput": True}),
            },
            # Hidden parameters for getting current ComfyUI background running data and UI connection graph
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ()
    FUNCTION = "save_images"
    OUTPUT_NODE = True
    CATEGORY = "PZ EasyUse"

    def save_images(self, file_prefix, date_subfolder, include_model_name, embed_workflow, embed_custom_text, custom_text, custom_output_path, image=None, model_name_input=None, prompt=None, extra_pnginfo=None):
        # Empty protection
        if image is None:
            return {}

        full_prefix = file_prefix
        
        # 1. Process path and name
        if date_subfolder:
            now = datetime.datetime.now()
            date_folder = now.strftime("%Y-%m-%d")
            full_prefix = f"{date_folder}/{full_prefix}"
            
        if include_model_name and model_name_input:
            clean_name = model_name_input.replace("\\", "_").replace("/", "_")
            clean_name = os.path.splitext(clean_name)[0]
            full_prefix = f"{full_prefix}_{clean_name}"

        # Get number to avoid overwriting
        w, h = image[0].shape[1], image[0].shape[0]
        output_path = os.path.abspath(os.path.expanduser((custom_output_path or self.output_dir).strip()))
        full_output_folder, filename, counter, subfolder, filename_prefix = folder_paths.get_save_image_path(full_prefix, output_path, w, h)
        
        if not os.path.exists(full_output_folder):
            os.makedirs(full_output_folder, exist_ok=True)

        results = list()
        
        # Iterate through all images in the batch
        for i in range(image.shape[0]):
            image_np = image[i].cpu().numpy()
            # Convert tensor to PIL image
            img = Image.fromarray(np.clip(image_np * 255.0, 0, 255).astype(np.uint8))
            
            # --- Key: Build PNG metadata (steganographic information) ---
            metadata = PngInfo()
            
            # 1. Write Prompt (execution logic required for ComfyUI API recognition)
            if prompt is not None and embed_workflow:
                metadata.add_text("prompt", json.dumps(prompt))
                
            # 2. Write Workflow (node connection graph displayed in ComfyUI UI)
            if extra_pnginfo is not None:
                for x in extra_pnginfo:
                    # If user turned off embedding, skip writing workflow
                    if x == "workflow" and not embed_workflow:
                        continue
                    metadata.add_text(x, json.dumps(extra_pnginfo[x]))

            # 3. Write your custom text
            if embed_custom_text and custom_text.strip():
                # Create a label called "custom_notes" stored inside the image
                metadata.add_text("custom_notes", custom_text)

            # --- Save file ---
            file_base = f"{filename}_{counter:05}_.png"
            img_path = os.path.join(full_output_folder, file_base)
            
            # Use pnginfo parameter to pack metadata into the image
            img.save(img_path, pnginfo=metadata, compress_level=self.compress_level)
            
            results.append({
                "filename": file_base,
                "subfolder": subfolder,
                "type": self.type
            })
            counter += 1

        return { "ui": { "images": results } }

# ==========================================
# 2. PZ Resolution Selector (Keep as is)
# ==========================================
class PZ_Resolution_Selector:
    @classmethod
    def INPUT_TYPES(s):
        res_list = [512, 576, 640, 704, 720, 768, 832, 896, 960, 1024, 1080, 1088, 1152, 1216, 1280, 1344, 1408, 1472, 1536, 1600, 1920, 2048, 4096]
        return {
            "required": {
                "width": (res_list, {"default": 1024}),
                "height": (res_list, {"default": 1024}),
                "swap_width_height": ("BOOLEAN", {"default": False, "label_on": "🔁 Swapped", "label_off": "➡️ Normal"}),
            }
        }
    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    FUNCTION = "select_res"
    CATEGORY = "PZ EasyUse"
    def select_res(self, **kwargs):
        w = int(kwargs.get("width"))
        h = int(kwargs.get("height"))
        return (h, w) if kwargs.get("swap_width_height") else (w, h)

# ==========================================
# API: Open Folder (Keep as is)
# ==========================================
@server.PromptServer.instance.routes.post("/pz/open_output_dir")
async def open_output_dir(request):
    try:
        try:
            payload = await request.json()
        except (json.JSONDecodeError, ValueError):
            payload = {}

        target_dir = os.path.abspath(os.path.expanduser(
            (payload.get("path") or folder_paths.get_output_directory()).strip()
        ))
        os.makedirs(target_dir, exist_ok=True)

        if platform.system() == "Windows":
            subprocess.run(["explorer", target_dir])
        elif platform.system() == "Darwin": # macOS
            subprocess.Popen(["open", target_dir])
        else: # Linux
            subprocess.Popen(["xdg-open", target_dir])
            
        return web.json_response({"message": "Opened", "path": target_dir})
    except Exception as e:
        return web.json_response({"message": str(e)}, status=500)


@server.PromptServer.instance.routes.get("/pz/image_metadata")
async def get_image_metadata(request):
    """Return PNG text metadata for the image picker preview."""
    filename = request.query.get("filename", "")
    if not filename:
        return web.json_response({"error": "filename is required"}, status=400)

    try:
        image_path = folder_paths.get_annotated_filepath(filename)
        with Image.open(image_path) as image:
            return web.json_response({
                "custom_notes": image.info.get("custom_notes", ""),
            })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=404)

NODE_CLASS_MAPPINGS = {
    "PZ_Save_Image": PZ_Save_Image,
    "PZ_Resolution_Selector": PZ_Resolution_Selector
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PZ_Save_Image": "PZ Advanced Save Image",
    "PZ_Resolution_Selector": "PZ Resolution Selector"
}









# ==========================================
# 3. PZ Read Image Metadata (Ultimate Tree Trace + Perfect JS Loop Single Line Extraction)
# ==========================================
class PZ_Read_Image_Metadata:
    @classmethod
    def INPUT_TYPES(s):
        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        
        return {
            "required": {
                "image": (sorted(files), {"image_upload": True, "refresh_button": True})
            }
        }

    RETURN_TYPES = ("IMAGE", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("Image", "Custom Notes", "Positive Prompt", "Negative Prompt", "Workflow JSON")
    FUNCTION = "read_metadata"
    CATEGORY = "PZ EasyUse"

    def _decode_unicode(self, text):
        if not text: return text
        try:
            if text.startswith('"') and text.endswith('"'):
                return json.loads(text)
            else:
                return json.loads(f'"{text}"')
        except:
            return text

    def read_metadata(self, image):
        image_path = folder_paths.get_annotated_filepath(image)
        
        custom_notes = ""
        pos_prompt = ""
        neg_prompt = ""
        workflow_str = ""
        out_image = None
        
        try:
            with Image.open(image_path) as img:
                info = img.info
                
                # 1. Decode custom text
                raw_notes = info.get("custom_notes", "")
                custom_notes = self._decode_unicode(raw_notes) if raw_notes else "⚠️ This image does not contain 'custom_notes' text."
                
                # 2. Core: Tree trace algorithm
                raw_prompt = info.get("prompt", "")
                if raw_prompt:
                    try:
                        prompt_dict = json.loads(raw_prompt)
                        pos_cond_ids = set()
                        neg_cond_ids = set()
                        
                        # Locate sampler entry
                        for node_id, node in prompt_dict.items():
                            class_type = node.get("class_type", "")
                            if "Sampler" in class_type or "KCenter" in class_type or "FaceDetailer" in class_type:
                                inputs = node.get("inputs", {})
                                for k, v in inputs.items():
                                    if isinstance(v, list) and len(v) == 2:
                                        k_lower = k.lower()
                                        if "positive" in k_lower or "pos" in k_lower: pos_cond_ids.add(str(v[0]))
                                        elif "negative" in k_lower or "neg" in k_lower: neg_cond_ids.add(str(v[0]))

                        def resolve_text(val, visited):
                            if isinstance(val, str):
                                return self._decode_unicode(val)
                                
                            if isinstance(val, list) and len(val) == 2:
                                node_id = str(val[0])
                                if node_id in visited: return ""
                                
                                visited.add(node_id)
                                node = prompt_dict.get(node_id, {})
                                class_type = node.get("class_type", "")
                                inputs = node.get("inputs", {})
                                
                                # =======================================
                                # ✨ Special node logic interception area
                                # =======================================
                                
                                # [Intercept A]: PZ Loop Text Node (JS Loop)
                                if class_type in ["PZ_Commander_Text", "PZ_Commander"]:
                                    # Read original text and prefix/suffix
                                    p_text = inputs.get("prompt_text", "")
                                    if isinstance(p_text, list): p_text = resolve_text(p_text, visited.copy())
                                    elif isinstance(p_text, str): p_text = self._decode_unicode(p_text)
                                    
                                    prefix = inputs.get("prompt_prefix", "")
                                    if isinstance(prefix, list): prefix = resolve_text(prefix, visited.copy())
                                    elif isinstance(prefix, str): prefix = self._decode_unicode(prefix)
                                    
                                    suffix = inputs.get("prompt_suffix", "")
                                    if isinstance(suffix, list): suffix = resolve_text(suffix, visited.copy())
                                    elif isinstance(suffix, str): suffix = self._decode_unicode(suffix)

                                    # Read control parameters
                                    try: start_index = int(inputs.get("start_index", 0))
                                    except: start_index = 0
                                    
                                    try: count = int(inputs.get("count", 1))
                                    except: count = 1
                                    
                                    prompt_mode = inputs.get("prompt_mode", "Iterate")
                                    split_mode = inputs.get("split_mode", "Newline")
                                    delimiter = inputs.get("delimiter", ";")
                                    if isinstance(delimiter, str): delimiter = self._decode_unicode(delimiter)

                                    # Completely simulate your node splitting logic
                                    lines = []
                                    if p_text:
                                        if "Custom" in split_mode:
                                            lines = [x.strip() for x in p_text.split(delimiter) if x.strip()]
                                        else:
                                            lines = [x.strip() for x in p_text.split('\n') if x.strip()]
                                    
                                    valid_prompts = []
                                    if not lines:
                                        parts = [p for p in [prefix, suffix] if p]
                                        if parts: valid_prompts.append(", ".join(parts))
                                    else:
                                        total_items = len(lines)
                                        # If list generation mode
                                        if "Generator List" in prompt_mode:
                                            remaining = max(0, total_items - start_index)
                                            actual = min(count, remaining)
                                            for i in range(actual if actual > 0 else 0):
                                                idx = (start_index + i) % total_items if total_items else 0
                                                parts = [p for p in [prefix, lines[idx], suffix] if p]
                                                valid_prompts.append(", ".join(parts))
                                        # If JS Loop mode (precise single line positioning)
                                        else:
                                            idx = start_index % total_items if total_items else 0
                                            parts = [p for p in [prefix, lines[idx], suffix] if p]
                                            valid_prompts.append(", ".join(parts))
                                            
                                    return " | ".join(valid_prompts)
                                    
                                # [Intercept B]: PZ Fixed and Dynamic Prompt Panels
                                elif class_type in ["PZ_Prompt_Fixed", "PZ_Prompt_Dynamic", "PZ_Prompt_Dynamic_ML"]:
                                    valid_prompts = []
                                    prefix = inputs.get("prefix")
                                    if prefix:
                                        res = resolve_text(prefix, visited.copy())
                                        if res and res.strip(): valid_prompts.append(res.strip())
                                        
                                    is_radio = "Radio" in inputs.get("mode", "Multi") if class_type in ["PZ_Prompt_Dynamic", "PZ_Prompt_Dynamic_ML"] else False
                                    max_i = 50 if class_type in ["PZ_Prompt_Dynamic", "PZ_Prompt_Dynamic_ML"] else 10
                                    
                                    dynamic_prompts = []
                                    for i in range(1, max_i + 1):
                                        is_active = inputs.get(f"[{i:02d}] Enabled", False)
                                        if is_active:
                                            text_val = inputs.get(f"[{i:02d}] Prompt")
                                            if text_val:
                                                res = resolve_text(text_val, visited.copy())
                                                if res and res.strip():
                                                    dynamic_prompts.append(res.strip())
                                                    if is_radio: break 
                                                    
                                    if dynamic_prompts:
                                        valid_prompts.append(", ".join(dynamic_prompts))
                                    return ", ".join(valid_prompts)
                                    
                                # [Intercept C]: PZ String Join
                                elif class_type == "PZ_String_Join":
                                    valid_prompts = []
                                    separator = inputs.get("separator", ", ")
                                    if isinstance(separator, str): separator = self._decode_unicode(separator)
                                    
                                    for i in range(1, 7):
                                        text_val = inputs.get(f"text{i}")
                                        if text_val:
                                            res = resolve_text(text_val, visited.copy())
                                            if res and res.strip(): valid_prompts.append(res.strip())
                                            
                                    return separator.join(valid_prompts)

                                # =======================================
                                # Default trace logic (handle normal nodes)
                                # =======================================
                                pieces = []
                                keys = sorted(inputs.keys())
                                for k in keys:
                                    kl = k.lower()
                                    if kl in ["clip", "model", "vae", "latent", "image", "mask", "conditioning", "font_name", "delimiter", "separator"]:
                                        continue
                                        
                                    v = inputs[k]
                                    is_valid = False
                                    
                                    if isinstance(v, str):
                                        if not any(v.endswith(ext) for ext in [".safetensors", ".pt", ".ckpt", ".bin", ".pth", ".gguf"]):
                                            if k not in ["ckpt_name", "model_name", "lora_name", "clip_name", "control_net_name"]:
                                                is_valid = True
                                    elif isinstance(v, list) and len(v) == 2:
                                        is_valid = True
                                        
                                    if is_valid:
                                        res = resolve_text(v, visited.copy())
                                        if res and res.strip():
                                            pieces.append(res.strip())
                                            
                                return ", ".join(pieces)
                            return ""

                        # Step 3: Extract final text from CLIP nodes
                        def extract_from_conds(cond_ids):
                            results = []
                            for cid in cond_ids:
                                if cid in prompt_dict:
                                    node = prompt_dict[cid]
                                    class_type = node.get("class_type", "")
                                    inputs = node.get("inputs", {})
                                    
                                    if "CLIPTextEncode" in class_type:
                                        for k in ["text", "text_g", "text_l"]:
                                            if k in inputs:
                                                res = resolve_text(inputs[k], set())
                                                if res: results.append(res)
                                    else:
                                        for k, v in inputs.items():
                                            if isinstance(v, list) and len(v) == 2:
                                                res = resolve_text(v, set())
                                                if res: results.append(res)
                            return "\n".join(results)

                        pos_prompt = extract_from_conds(pos_cond_ids)
                        neg_prompt = extract_from_conds(neg_cond_ids)
                        
                        if not pos_prompt: pos_prompt = "No positive prompt extracted."
                        if not neg_prompt: neg_prompt = "No negative prompt extracted."
                        
                    except Exception as e:
                        pos_prompt = f"Failed to parse prompt: {e}"
                        neg_prompt = f"Failed to parse prompt: {e}"
                else:
                    pos_prompt = "⚠️ No 'prompt' data."
                    neg_prompt = "⚠️ No 'prompt' data."

                # 3. Extract workflow JSON
                raw_workflow = info.get("workflow", "")
                if raw_workflow:
                    try:
                        parsed_workflow = json.loads(raw_workflow)
                        workflow_str = json.dumps(parsed_workflow, indent=2, ensure_ascii=False)
                    except:
                        workflow_str = raw_workflow
                else:
                    workflow_str = "⚠️ This image does not contain 'workflow' information."
                    
                # 4. Image tensor output
                img_copy = img.copy()
                img_copy = ImageOps.exif_transpose(img_copy)
                if img_copy.mode == 'I':
                    img_copy = img_copy.point(lambda i: i * (1 / 255))
                img_copy = img_copy.convert("RGB")
                
                image_np = np.array(img_copy).astype(np.float32) / 255.0
                out_image = torch.from_numpy(image_np)[None,]

        except Exception as e:
            custom_notes = f"Read failed: {str(e)}"
            pos_prompt, neg_prompt = "Read failed", "Read failed"
            workflow_str = "Read failed"
            out_image = torch.zeros((1, 64, 64, 3), dtype=torch.float32)
            
        return (out_image, custom_notes, pos_prompt, neg_prompt, workflow_str)