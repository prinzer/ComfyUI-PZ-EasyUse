import os
import folder_paths
import comfy.sd
import comfy.utils

class PZ_LoRA_Base:
    
    # 🌟 核心魔法：绕过 ComfyUI 的下拉列表强制验证机制
    # 只要加上这个，就算文件被删了，运行工作流时也不会报错阻断！
    @classmethod
    def VALIDATE_INPUTS(s, **kwargs):
        return True

    def process_loras_base(self, 模型, CLIP=None, 模式="多选叠加 (Multi)", **kwargs):
        model_out = 模型
        clip_out = CLIP
        active_lora_names = []
        active_trigger_words = [] 
        is_radio = "Radio" in 模式

        # 动态计算最大索引
        max_index = 0
        for key in kwargs.keys():
            if key.startswith("[") and "]" in key:
                try:
                    idx = int(key[1:key.find("]")])
                    if idx > max_index: max_index = idx
                except: pass
        
        for i in range(1, max_index + 1):
            is_active = kwargs.get(f"[{i:02d}] 生效", False)
            lora_name = kwargs.get(f"[{i:02d}] LoRA名", "None")
            strength = kwargs.get(f"[{i:02d}] 权重", 1.0)
            trigger = kwargs.get(f"[{i:02d}] 触发词", "").strip()
            
            # 只有开关打开，且名字不为空时才处理
            if is_active and lora_name != "None":
                
                # 🌟 第二层保险：真实文件存在性检查
                lora_path = folder_paths.get_full_path("loras", lora_name)
                if not lora_path or not os.path.exists(lora_path):
                    print(f"\n[PZ EasyUse] ⚠️ 警告: 已开启的 LoRA 文件未找到被忽略 -> {lora_name}")
                    continue # 找不到文件就直接跳过，防止运行中断！
                    
                active_lora_names.append(lora_name)
                if trigger:
                    active_trigger_words.append(trigger)
                
                lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                
                if clip_out is not None:
                    model_out, clip_out = comfy.sd.load_lora_for_models(model_out, clip_out, lora, strength, strength)
                else:
                    model_out, _ = comfy.sd.load_lora_for_models(model_out, None, lora, strength, 0)
                
                # 如果是单选模式，加载完第一个就退出
                if is_radio:
                    break 
        
        # 分别生成字符串
        lora_names_str = ", ".join(active_lora_names)
        trigger_words_str = ", ".join(active_trigger_words)
        
        return (model_out, clip_out, lora_names_str, trigger_words_str)

# ==========================================================
# 下方的类继承了 PZ_LoRA_Base，自动继承了防中断魔法
# ==========================================================

class PZ_LoRA_Dynamic_Model(PZ_LoRA_Base):
    @classmethod
    def INPUT_TYPES(s):
        lora_list = ["None"] + folder_paths.get_filename_list("loras")
        inputs = {"required": {
            "模型": ("MODEL",),
            "模式": (["多选叠加 (Multi)", "单选互斥 (Radio)"], {"default": "多选叠加 (Multi)"})
        }}
        for i in range(1, 21): 
            inputs["required"][f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": False, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            inputs["required"][f"[{i:02d}] LoRA名"] = (lora_list, )
            inputs["required"][f"[{i:02d}] 权重"] = ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05})
            inputs["required"][f"[{i:02d}] 触发词"] = ("STRING", {"default": "", "multiline": False, "placeholder": "触发词 (可选)"})
        return inputs
    
    RETURN_TYPES = ("MODEL", "STRING", "STRING")
    RETURN_NAMES = ("MODEL", "lora_names", "trigger_words")
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    
    def process(self, 模型, 模式, **kwargs):
        m, _, names, triggers = self.process_loras_base(模型, None, 模式, **kwargs)
        return (m, names, triggers)

class PZ_LoRA_Dynamic_Full(PZ_LoRA_Base):
    @classmethod
    def INPUT_TYPES(s):
        lora_list = ["None"] + folder_paths.get_filename_list("loras")
        inputs = {"required": {
            "模型": ("MODEL",), "CLIP": ("CLIP",),
            "模式": (["多选叠加 (Multi)", "单选互斥 (Radio)"], {"default": "多选叠加 (Multi)"})
        }}
        for i in range(1, 21): 
            inputs["required"][f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": False, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            inputs["required"][f"[{i:02d}] LoRA名"] = (lora_list, )
            inputs["required"][f"[{i:02d}] 权重"] = ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05})
            inputs["required"][f"[{i:02d}] 触发词"] = ("STRING", {"default": "", "multiline": False, "placeholder": "触发词 (可选)"})
        return inputs
    
    RETURN_TYPES = ("MODEL", "CLIP", "STRING", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "lora_names", "trigger_words")
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    
    def process(self, 模型, CLIP, 模式, **kwargs):
        m, c, names, triggers = self.process_loras_base(模型, CLIP, 模式, **kwargs)
        return (m, c, names, triggers)

class PZ_LoRA_Fixed_Model(PZ_LoRA_Base):
    @classmethod
    def INPUT_TYPES(s):
        lora_list = ["None"] + folder_paths.get_filename_list("loras")
        inputs = {"required": {"模型": ("MODEL",)}}
        for i in range(1, 6): 
            inputs["required"][f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": False, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            inputs["required"][f"[{i:02d}] LoRA名"] = (lora_list, )
            inputs["required"][f"[{i:02d}] 权重"] = ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05})
            inputs["required"][f"[{i:02d}] 触发词"] = ("STRING", {"default": "", "multiline": False, "placeholder": "触发词 (可选)"})
        return inputs
    
    RETURN_TYPES = ("MODEL", "STRING", "STRING")
    RETURN_NAMES = ("MODEL", "lora_names", "trigger_words")
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    
    def process(self, 模型, **kwargs):
        m, _, names, triggers = self.process_loras_base(模型, None, **kwargs)
        return (m, names, triggers)

class PZ_LoRA_Fixed_Full(PZ_LoRA_Base):
    @classmethod
    def INPUT_TYPES(s):
        lora_list = ["None"] + folder_paths.get_filename_list("loras")
        inputs = {"required": {"模型": ("MODEL",), "CLIP": ("CLIP",)}}
        for i in range(1, 6): 
            inputs["required"][f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": False, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            inputs["required"][f"[{i:02d}] LoRA名"] = (lora_list, )
            inputs["required"][f"[{i:02d}] 权重"] = ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05})
            inputs["required"][f"[{i:02d}] 触发词"] = ("STRING", {"default": "", "multiline": False, "placeholder": "触发词 (可选)"})
        return inputs
    
    RETURN_TYPES = ("MODEL", "CLIP", "STRING", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "lora_names", "trigger_words")
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    
    def process(self, 模型, CLIP, **kwargs):
        m, c, names, triggers = self.process_loras_base(模型, CLIP, **kwargs)
        return (m, c, names, triggers)