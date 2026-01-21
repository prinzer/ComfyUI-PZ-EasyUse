class PZ_Prompt_Fixed:
    def __init__(self): pass
    @classmethod
    def INPUT_TYPES(s):
        required_inputs = {}
        for i in range(1, 11):
            default_state = True if i == 1 else False
            required_inputs[f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": default_state, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            required_inputs[f"[{i:02d}] 提示词"] = ("STRING", {"default": "", "multiline": False})
        return {"required": required_inputs, "optional": {"前缀": ("STRING", {"forceInput": True})}}
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    def process(self, 前缀=None, **kwargs):
        valid_prompts = []
        for i in range(1, 11):
            is_active = kwargs.get(f"[{i:02d}] 生效", False)
            text = kwargs.get(f"[{i:02d}] 提示词", "").strip()
            if is_active and text: valid_prompts.append(text)
        result = ", ".join(valid_prompts)
        if 前缀: result = f"{前缀}, {result}" if result else 前缀
        return (result,)

class PZ_Prompt_Dynamic:
    def __init__(self): pass
    @classmethod
    def INPUT_TYPES(s):
        required_inputs = {}
        for i in range(1, 51):
            default_state = True if i == 1 else False
            required_inputs[f"[{i:02d}] 生效"] = ("BOOLEAN", {"default": default_state, "label_on": "🟢 开启", "label_off": "⚪ 关闭"})
            required_inputs[f"[{i:02d}] 提示词"] = ("STRING", {"default": "", "multiline": False})
        return {"required": required_inputs, "optional": {"前缀": ("STRING", {"forceInput": True})}}
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process"
    CATEGORY = "PZ EasyUse"
    def process(self, 前缀=None, **kwargs):
        valid_prompts = []
        for i in range(1, 51):
            is_active = kwargs.get(f"[{i:02d}] 生效", False)
            text = kwargs.get(f"[{i:02d}] 提示词", "").strip()
            if is_active and text: valid_prompts.append(text)
        result = ", ".join(valid_prompts)
        if 前缀: result = f"{前缀}, {result}" if result else 前缀
        return (result,)

class PZ_String_Join:
    def __init__(self): pass
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {"分隔符": ("STRING", {"default": ", ", "multiline": False})},
            "optional": {
                "文本1": ("STRING", {"forceInput": True}), "文本2": ("STRING", {"forceInput": True}),
                "文本3": ("STRING", {"forceInput": True}), "文本4": ("STRING", {"forceInput": True}),
                "文本5": ("STRING", {"forceInput": True}), "文本6": ("STRING", {"forceInput": True}),
            }
        }
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "join_strings"
    CATEGORY = "PZ EasyUse"
    def join_strings(self, 分隔符=", ", **kwargs):
        valid_texts = []
        for i in range(1, 7):
            key = f"文本{i}"
            text = kwargs.get(key, None)
            if text and isinstance(text, str) and text.strip(): valid_texts.append(text.strip())
        result = 分隔符.join(valid_texts)
        return (result,)