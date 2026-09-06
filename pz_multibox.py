import re

# ==============================================================================
# PZ_Commander_Text_MultiBox_V2 (Dynamic Textboxes - Only 10 max, default 2 visible)
# ==============================================================================
class PZ_Commander_Text_MultiBox_V2:
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(cls):
        base_inputs = {
            "required": {
                "num_boxes": ("INT", {"default": 2, "min": 1, "max": 10, "step": 1}),
                "prompt_prefix": ("STRING", {"multiline": False, "default": "", "placeholder": "Prefix..."}),
                "prompt_suffix": ("STRING", {"multiline": False, "default": "", "placeholder": "Suffix..."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"}
        }
        
        # Add only 10 text boxes (not 20)
        for i in range(10):
            # Text box
            box_name = f"prompt_box_{i}"
            base_inputs["required"][box_name] = ("STRING", {
                "multiline": True, 
                "default": "", 
                "placeholder": f"Text Box {i+1}...", 
                "dynamicPrompts": False
            })
            
            # Toggle for each box (0 or 1)
            toggle_name = f"enable_box_{i}"
            base_inputs["required"][toggle_name] = ("INT", {
                "default": 1 if i < 2 else 0,  # First 2 enabled by default
                "min": 0, 
                "max": 1,
                "step": 1
            })
        
        return base_inputs
        
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("final_prompts",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    
    def process(self, num_boxes, prompt_prefix, prompt_suffix, unique_id=None, **kwargs):
        # Collect all enabled text boxes
        enabled_boxes = []
        for i in range(min(num_boxes, 10)):
            box_name = f"prompt_box_{i}"
            toggle_name = f"enable_box_{i}"
            
            # Check if box is enabled and has content
            is_enabled = kwargs.get(toggle_name, 0) if toggle_name in kwargs else (1 if i < 2 else 0)
            text = kwargs.get(box_name, "") if box_name in kwargs else ""
            
            if is_enabled and text and text.strip():
                # Clean line numbers if present
                cleaned_text = re.sub(r'^\d+[:：\.]\s*', '', text.strip()).strip()
                enabled_boxes.append(cleaned_text)
        
        # Generate list of prompts - each enabled box generates one prompt
        out = []
        for cleaned_text in enabled_boxes:
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
            base_inputs["required"][f"enable_box_{i}"] = ("INT", {
                "default": 1,
                "min": 0,
                "max": 1,
                "step": 1,
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
            if kwargs.get(f"enable_box_{i}", 1) and box_name in kwargs:
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


