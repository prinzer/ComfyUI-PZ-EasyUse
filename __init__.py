from .pz_prompt import PZ_Prompt_Fixed, PZ_Prompt_Dynamic, PZ_Prompt_Dynamic_ML, PZ_String_Join
from .pz_lora import PZ_LoRA_Fixed_Model, PZ_LoRA_Fixed_Full, PZ_LoRA_Dynamic_Model, PZ_LoRA_Dynamic_Full
from .pz_easyuse import PZ_Save_Image, PZ_Resolution_Selector,PZ_Read_Image_Metadata
from .PZ_Full_Loader import PZ_Commander, PZ_Commander_Text, PZ_Commander_Image
from .pz_multibox import PZ_Commander_Text_MultiBox_V2,PZ_Commander_Text_MultiBox
from .pz_minimax import PZ_Minimax_Prompt
from .pz_universal_prompt import PZ_Universal_Prompt
from .pz_dual_image import PZ_Dual_Image_Loader, PZ_Listen_Marker

# Internationalization support
# Note: Python side doesn't have direct access to frontend language setting
# We'll use English as default and rely on frontend JS to handle translations

NODE_CLASS_MAPPINGS = {

    "PZ_Commander": PZ_Commander,
    "PZ_Commander_Text": PZ_Commander_Text, # New
    "PZ_Commander_Image": PZ_Commander_Image,# New
    #"PZ_Commander_Text_Batch": PZ_Commander_Text_Batch, # Batch with same prompt repeated
    "PZ_Commander_Text_MultiBox": PZ_Commander_Text_MultiBox, # Multiple textboxes
    "PZ_Commander_Text_MultiBox_V2": PZ_Commander_Text_MultiBox_V2, # Dynamic textboxes V2 (10 max, 2 default)
    "PZ_Minimax_Prompt": PZ_Minimax_Prompt,
    "PZ_Universal_Prompt": PZ_Universal_Prompt,
    "PZ_Dual_Image_Loader": PZ_Dual_Image_Loader,
    "PZ_Listen_Marker": PZ_Listen_Marker,
    "PZ_Read_Image_Metadata": PZ_Read_Image_Metadata,
    # Loop Option B (Auto-Queue mode)
    #"PZ_Batch_Dispatcher": PZ_Batch_Dispatcher, # <--- Register
        # Prompt classes
##    "PZ_Prompt_Fixed": PZ_Prompt_Fixed,
    "PZ_Prompt_Dynamic": PZ_Prompt_Dynamic,
    "PZ_Prompt_Dynamic_ML": PZ_Prompt_Dynamic_ML,
##    "PZ_String_Join": PZ_String_Join,
    
    # LoRA classes
##    "PZ_LoRA_Fixed_Model": PZ_LoRA_Fixed_Model,
##    "PZ_LoRA_Fixed_Full": PZ_LoRA_Fixed_Full,
    "PZ_LoRA_Dynamic_Model": PZ_LoRA_Dynamic_Model,
    "PZ_LoRA_Dynamic_Full": PZ_LoRA_Dynamic_Full,
    
    # Tool classes
    "PZ_Save_Image": PZ_Save_Image,
    "PZ_Resolution_Selector": PZ_Resolution_Selector
    
}

NODE_DISPLAY_NAME_MAPPINGS = {
##    "PZ_Prompt_Fixed": "PZ Prompt Group (Fixed 10)",
##    "PZ_String_Join": "PZ String Join",
##    "PZ_LoRA_Fixed_Model": "PZ LoRA Group (Fixed/Model Only)",
##    "PZ_LoRA_Fixed_Full": "PZ LoRA Group (Fixed/Full)",
    "PZ_Commander": "🚀 PZ Text & Image Loop",
    "PZ_LoRA_Dynamic_Model": "PZ LoRA Group (Dynamic/Model Only)",
    "PZ_LoRA_Dynamic_Full": "PZ LoRA Group (Dynamic/Full)",
    "PZ_Save_Image": "PZ Image Save (Enhanced)",
    "PZ_Prompt_Dynamic": "PZ Prompt Group (Dynamic 50)",
    "PZ_Prompt_Dynamic_ML": "PZ Prompt Group (Dynamic 50 / Multiline)",
    "PZ_Resolution_Selector": "PZ Resolution Selector",
    "PZ_Commander_Text": "📝 PZ Text Loop" ,# New
    "PZ_Commander_Image": "🖼️ PZ Image Loop",# New
    #"PZ_Commander_Text_Batch": "📝 PZ Text Batch (Same)", # Batch with same prompt
    "PZ_Commander_Text_MultiBox": "📝 PZ Text MultiBox (5 Boxes)", # Multiple textboxes
    "PZ_Commander_Text_MultiBox_V2": "📝 PZ Text MultiBox (10 Max, 2 Default)", # V2 with better UI
    "PZ_Minimax_Prompt": "🎬 MiniMax Prompt (6 Sections)",
    "PZ_Universal_Prompt": "📝 PZ 通用提示词 (前缀/正文/后缀)",
    "PZ_Dual_Image_Loader": "🖼️ PZ 2图加载编辑 (2 In / Select Out)",
    "PZ_Listen_Marker": "🎯 结果图触发标记",
    "PZ_Read_Image_Metadata": "PZ Read Image Metadata"
    #"PZ_Batch_Dispatcher": "🚀 PZ Task Dispatcher (JS Version)",
    #"PZ_Commander": "🚀 PZ Text & Image Loop",
    #"PZ_Commander_Text": "📝 PZ Text Loop",
    #"PZ_Commander_Image": "🖼️ PZ Image Loop"
}


# Explicitly tell ComfyUI: Frontend files are in this folder!
WEB_DIRECTORY = "./js"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']

# ==========================================
# Remember to add this new node to the registry at the bottom of the file!
# ==========================================
# NODE_CLASS_MAPPINGS = {
#     "PZ_Save_Image": PZ_Save_Image,
#     "PZ_Resolution_Selector": PZ_Resolution_Selector,
#     "PZ_Read_Image_Metadata": PZ_Read_Image_Metadata  <-- Add this line
# }

# NODE_DISPLAY_NAME_MAPPINGS = {
#     "PZ_Save_Image": "PZ Advanced Save Image",
#     "PZ_Resolution_Selector": "PZ Resolution Selector",
#     "PZ_Read_Image_Metadata": "PZ Read Image Metadata"     <-- Add this line
# }
