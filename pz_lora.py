import folder_paths
import comfy.sd
import comfy.utils

class PZ_LoRA_Base:
    def process_loras_base(self, 模型, CLIP=None, 模式="多选叠加 (Multi)", **kwargs):
        model_out = 模型
        clip_out = CLIP
        active_lora_names = []
        is_radio = "Radio" in 模式

        # 动态计算最大索引（保持原有逻辑）
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
            
            if is_active and lora_name != "None":
                active_lora_names.append(lora_name)
                lora_path = folder_paths.get_full_path("loras", lora_name)
                lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                
                if clip_out is not None:
                    model_out, clip_out = comfy.sd.load_lora_for_models(model_out, clip_out, lora, strength, strength)
                else:
                    model_out, _ = comfy.sd.load_lora_for_models(model_out, None, lora, strength, 0)
                
                # 如果是单选模式，加载完第一个就退出
                if is_radio:
                    break 
        
        names_string = ", ".join(active_lora_names)
        return (model_out, clip_out, names_string)

# 更新子类：加上 "模式" 输入
class PZ_LoRA_Dynamic_Model(PZ_LoRA_Base):
    @classmethod
    def INPUT_TYPES(s):
        lora_list = ["None"] + folder_paths.get_filename_list("loras")
        inputs = {"required": {
            "模型": ("MODEL",),
            "模式": (["多选叠加 (Multi)", "单选互斥 (Radio)"], {"default": "多选叠加 (Multi)"}) # 新增
        }}
        for i in range(1, 21): 
            inputs["required"][f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": False, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            inputs["required"][f"[{i:02d}] LoRA名"] = (lora_list, )
            inputs["required"][f"[{i:02d}] 权重"] = ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05})
        return inputs
    RETURN_TYPES = ("MODEL", "STRING")
    RETURN_NAMES = ("MODEL", "names")
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    def process(self, 模型, 模式, **kwargs):
        m, _, names = self.process_loras_base(模型, None, 模式, **kwargs)
        return (m, names)

class PZ_LoRA_Dynamic_Full(PZ_LoRA_Base):
    @classmethod
    def INPUT_TYPES(s):
        lora_list = ["None"] + folder_paths.get_filename_list("loras")
        inputs = {"required": {
            "模型": ("MODEL",), "CLIP": ("CLIP",),
            "模式": (["多选叠加 (Multi)", "单选互斥 (Radio)"], {"default": "多选叠加 (Multi)"}) # 新增
        }}
        for i in range(1, 21): 
            inputs["required"][f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": False, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            inputs["required"][f"[{i:02d}] LoRA名"] = (lora_list, )
            inputs["required"][f"[{i:02d}] 权重"] = ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.05})
        return inputs
    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "names")
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    def process(self, 模型, CLIP, 模式, **kwargs):
        m, c, names = self.process_loras_base(模型, CLIP, 模式, **kwargs)
        return (m, c, names)

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
    RETURN_TYPES = ("MODEL", "STRING")
    RETURN_NAMES = ("MODEL", "names")
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    def process(self, 模型, **kwargs):
        m, _, names = self.process_loras_base(模型, None, **kwargs)
        return (m, names)

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
    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "names")
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    def process(self, 模型, CLIP, **kwargs):
        m, c, names = self.process_loras_base(模型, CLIP, **kwargs)
        return (m, c, names)
