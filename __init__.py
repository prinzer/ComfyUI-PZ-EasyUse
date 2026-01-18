from .pz_prompt_palette import (
    PZ_Prompt_Fixed, 
    PZ_Prompt_Dynamic, 
    PZ_String_Join, 
    PZ_LoRA_Fixed_Model,
    PZ_LoRA_Fixed_Full,
    PZ_LoRA_Dynamic_Model,
    PZ_LoRA_Dynamic_Full
)

NODE_CLASS_MAPPINGS = {
    "PZ_Prompt_Fixed_10": PZ_Prompt_Fixed,
    "PZ_Prompt_Dynamic_20": PZ_Prompt_Dynamic,
    "PZ_String_Join": PZ_String_Join,
    "PZ_LoRA_Fixed_Model": PZ_LoRA_Fixed_Model,
    "PZ_LoRA_Fixed_Full": PZ_LoRA_Fixed_Full,
    "PZ_LoRA_Dynamic_Model": PZ_LoRA_Dynamic_Model,
    "PZ_LoRA_Dynamic_Full": PZ_LoRA_Dynamic_Full
}

# 显示名称依然保持 PZ 开头，方便搜索
NODE_DISPLAY_NAME_MAPPINGS = {
    "PZ_Prompt_Fixed_10": "PZ提示词(固定10条)",
    "PZ_Prompt_Dynamic_20": "PZ提示词(动态50条)",
    "PZ_String_Join": "PZ文本合并",
    "PZ_LoRA_Fixed_Model": "PZ LoRA组(固定5条-仅模型)",
    "PZ_LoRA_Fixed_Full": "PZ LoRA组(固定5条-全功能)",
    "PZ_LoRA_Dynamic_Model": "PZ LoRA组(动态20条-仅模型)",
    "PZ_LoRA_Dynamic_Full": "PZ LoRA组(动态20条-全功能)"
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]