import folder_paths
import comfy.sd
import comfy.utils

# ==========================================
# PART 1: 提示词与文本合并
# ==========================================

class PZ_Prompt_Fixed:
    """
    固定版：10行，纯原生
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        required_inputs = {}
        for i in range(1, 11):
            default_state = True if i == 1 else False
            required_inputs[f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": default_state, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            required_inputs[f"[{i:02d}] 提示词"] = ("STRING", {"default": "", "multiline": False})
            
        return {
            "required": required_inputs,
            "optional": {"前缀": ("STRING", {"forceInput": True})}
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"  # 更新

    def process(self, 前缀=None, **kwargs):
        valid_prompts = []
        for i in range(1, 11):
            is_active = kwargs.get(f"[{i:02d}] 生效", False)
            text = kwargs.get(f"[{i:02d}] 提示词", "").strip()
            if is_active and text:
                valid_prompts.append(text)
        result = ", ".join(valid_prompts)
        if 前缀:
            result = f"{前缀}, {result}" if result else 前缀
        return (result,)


class PZ_Prompt_Dynamic:
    """
    动态版：50行
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        required_inputs = {}
        for i in range(1, 51):
            default_state = True if i == 1 else False
            required_inputs[f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": default_state, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            required_inputs[f"[{i:02d}] 提示词"] = ("STRING", {"default": "", "multiline": False})
            
        return {
            "required": required_inputs,
            "optional": {"前缀": ("STRING", {"forceInput": True})}
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"  # 更新

    def process(self, 前缀=None, **kwargs):
        valid_prompts = []
        for i in range(1, 51):
            is_active = kwargs.get(f"[{i:02d}] 生效", False)
            text = kwargs.get(f"[{i:02d}] 提示词", "").strip()
            if is_active and text:
                valid_prompts.append(text)

        result = ", ".join(valid_prompts)
        if 前缀:
            result = f"{前缀}, {result}" if result else 前缀
        return (result,)


class PZ_String_Join:
    """
    文本合并节点
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "分隔符": ("STRING", {"default": ", ", "multiline": False}),
            },
            "optional": {
                "文本1": ("STRING", {"forceInput": True}),
                "文本2": ("STRING", {"forceInput": True}),
                "文本3": ("STRING", {"forceInput": True}),
                "文本4": ("STRING", {"forceInput": True}),
                "文本5": ("STRING", {"forceInput": True}),
                "文本6": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "join_strings"
    CATEGORY = "PZ EasyUse"  # 更新

    def join_strings(self, 分隔符=", ", **kwargs):
        valid_texts = []
        for i in range(1, 7):
            key = f"文本{i}"
            text = kwargs.get(key, None)
            if text and isinstance(text, str) and text.strip():
                valid_texts.append(text.strip())
        result = 分隔符.join(valid_texts)
        return (result,)


# ==========================================
# PART 2: LoRA 系统
# ==========================================

class PZ_LoRA_Base:
    """
    LoRA 处理基类
    """
    def process_loras_base(self, 模型, CLIP=None, **kwargs):
        model_out = 模型
        clip_out = CLIP
        
        max_index = 0
        for key in kwargs.keys():
            if key.startswith("[") and "]" in key:
                try:
                    idx = int(key[1:key.find("]")])
                    if idx > max_index:
                        max_index = idx
                except:
                    pass
        
        for i in range(1, max_index + 1):
            is_active = kwargs.get(f"[{i:02d}] 生效", False)
            lora_name = kwargs.get(f"[{i:02d}] LoRA名", "None")
            strength = kwargs.get(f"[{i:02d}] 权重", 1.0)
            
            if is_active and lora_name != "None":
                lora_path = folder_paths.get_full_path("loras", lora_name)
                lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                
                if clip_out is not None:
                    model_out, clip_out = comfy.sd.load_lora_for_models(
                        model_out, clip_out, lora, strength, strength
                    )
                else:
                    model_out, _ = comfy.sd.load_lora_for_models(
                        model_out, None, lora, strength, 0
                    )
                    
        return (model_out, clip_out)


# --- 1. 固定版 (5条) ---

class PZ_LoRA_Fixed_Model(PZ_LoRA_Base):
    @classmethod
    def INPUT_TYPES(s):
        lora_list = ["None"] + folder_paths.get_filename_list("loras")
        inputs = {"required": {"模型": ("MODEL",)}}
        for i in range(1, 6): 
            inputs["required"][f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": False, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            inputs["required"][f"[{i:02d}] LoRA名"] = (lora_list, )
            inputs["required"][f"[{i:02d}] 权重"] = ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05})
        return inputs

    RETURN_TYPES = ("MODEL",)
    RETURN_NAMES = ("MODEL",)
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"  # 更新

    def process(self, 模型, **kwargs):
        m, _ = self.process_loras_base(模型, None, **kwargs)
        return (m,)

class PZ_LoRA_Fixed_Full(PZ_LoRA_Base):
    @classmethod
    def INPUT_TYPES(s):
        lora_list = ["None"] + folder_paths.get_filename_list("loras")
        inputs = {"required": {"模型": ("MODEL",), "CLIP": ("CLIP",)}}
        for i in range(1, 6): 
            inputs["required"][f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": False, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            inputs["required"][f"[{i:02d}] LoRA名"] = (lora_list, )
            inputs["required"][f"[{i:02d}] 权重"] = ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05})
        return inputs

    RETURN_TYPES = ("MODEL", "CLIP")
    RETURN_NAMES = ("MODEL", "CLIP")
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"  # 更新

    def process(self, 模型, CLIP, **kwargs):
        return self.process_loras_base(模型, CLIP, **kwargs)


# --- 2. 动态版 (20条) ---

class PZ_LoRA_Dynamic_Model(PZ_LoRA_Base):
    @classmethod
    def INPUT_TYPES(s):
        lora_list = ["None"] + folder_paths.get_filename_list("loras")
        inputs = {"required": {"模型": ("MODEL",)}}
        for i in range(1, 21): 
            inputs["required"][f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": False, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            inputs["required"][f"[{i:02d}] LoRA名"] = (lora_list, )
            inputs["required"][f"[{i:02d}] 权重"] = ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05})
        return inputs

    RETURN_TYPES = ("MODEL",)
    RETURN_NAMES = ("MODEL",)
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"  # 更新

    def process(self, 模型, **kwargs):
        m, _ = self.process_loras_base(模型, None, **kwargs)
        return (m,)

class PZ_LoRA_Dynamic_Full(PZ_LoRA_Base):
    @classmethod
    def INPUT_TYPES(s):
        lora_list = ["None"] + folder_paths.get_filename_list("loras")
        inputs = {"required": {"模型": ("MODEL",), "CLIP": ("CLIP",)}}
        for i in range(1, 21): 
            inputs["required"][f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": False, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            inputs["required"][f"[{i:02d}] LoRA名"] = (lora_list, )
            inputs["required"][f"[{i:02d}] 权重"] = ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05})
        return inputs

    RETURN_TYPES = ("MODEL", "CLIP")
    RETURN_NAMES = ("MODEL", "CLIP")
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"  # 更新

    def process(self, 模型, CLIP, **kwargs):
        return self.process_loras_base(模型, CLIP, **kwargs)