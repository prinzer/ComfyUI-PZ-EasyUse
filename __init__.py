from .pz_prompt import PZ_Prompt_Fixed, PZ_Prompt_Dynamic, PZ_String_Join
from .pz_lora import PZ_LoRA_Fixed_Model, PZ_LoRA_Fixed_Full, PZ_LoRA_Dynamic_Model, PZ_LoRA_Dynamic_Full
from .pz_easyuse import PZ_Save_Image, PZ_Resolution_Selector
from .PZ_Full_Loader import PZ_Commander,PZ_Commander_Text
from .pz_minimax import PZ_Minimax_Prompt

NODE_CLASS_MAPPINGS = {
    # 提示词类
##    "PZ_Prompt_Fixed": PZ_Prompt_Fixed,
    "PZ_Prompt_Dynamic": PZ_Prompt_Dynamic,
    "PZ_Minimax_Prompt": PZ_Minimax_Prompt,
##    "PZ_String_Join": PZ_String_Join,
    
    # LoRA 类
##    "PZ_LoRA_Fixed_Model": PZ_LoRA_Fixed_Model,
##    "PZ_LoRA_Fixed_Full": PZ_LoRA_Fixed_Full,
    "PZ_LoRA_Dynamic_Model": PZ_LoRA_Dynamic_Model,
    "PZ_LoRA_Dynamic_Full": PZ_LoRA_Dynamic_Full,
    
    # 工具类
    "PZ_Save_Image": PZ_Save_Image,
    "PZ_Resolution_Selector": PZ_Resolution_Selector,
    
    "PZ_Commander": PZ_Commander,
    "PZ_Commander_Text": PZ_Commander_Text # 新增
    # 循环方案B (Auto-Queue模式)
    #"PZ_Batch_Dispatcher": PZ_Batch_Dispatcher, # <--- 注册
}

NODE_DISPLAY_NAME_MAPPINGS = {
##    "PZ_Prompt_Fixed": "PZ 提示词组 (固定10)",
    "PZ_Prompt_Dynamic": "PZ 提示词组 (动态50)",
##    "PZ_String_Join": "PZ 字符串合并",
##    "PZ_LoRA_Fixed_Model": "PZ LoRA组 (固定/仅模型)",
##    "PZ_LoRA_Fixed_Full": "PZ LoRA组 (固定/全模组)",
    "PZ_Commander": "🚀 PZ 提示词&图片循环器",
    "PZ_Minimax_Prompt": "🎬 PZ MiniMax Prompt (6 Sections)",
    "PZ_LoRA_Dynamic_Model": "PZ LoRA组 (动态/仅模型)",
    "PZ_LoRA_Dynamic_Full": "PZ LoRA组 (动态/全模组)",
    "PZ_Save_Image": "PZ 图片保存 (增强版)",
    "PZ_Resolution_Selector": "PZ 分辨率选择器",
    #"PZ_Batch_Dispatcher": "🚀 PZ 任务发射器 (JS版)",
    "PZ_Commander_Text": "PZ Commander (纯文本版)" # 新增
}

# 🔥🔥🔥 关键修改在这里 🔥🔥🔥
# 显式告诉 ComfyUI：前端文件在这个文件夹里！
WEB_DIRECTORY = "./js"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
