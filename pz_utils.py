import folder_paths
import datetime
import os
from nodes import SaveImage

class PZ_Save_Image:
    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()
        self.type = "output"
        self.prefix_append = ""
        self.compress_level = 4

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "图像": ("IMAGE", ),
                "文件前缀": ("STRING", {"default": "PZ"}),
                "日期子文件夹": ("BOOLEAN", {"default": True, "label_on": "🟢 开启", "label_off": "⚪ 关闭"}),
                "包含模型名": ("BOOLEAN", {"default": False, "label_on": "🟢 开启", "label_off": "⚪ 关闭"}),
            },
            "optional": {
                "模型名输入": ("STRING", {"forceInput": True}),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ()
    FUNCTION = "save_images"
    OUTPUT_NODE = True
    CATEGORY = "PZ EasyUse"

    def save_images(self, 图像, 文件前缀, 日期子文件夹, 包含模型名, 模型名输入=None, prompt=None, extra_pnginfo=None):
        full_prefix = 文件前缀
        if 日期子文件夹:
            now = datetime.datetime.now()
            date_folder = now.strftime("%Y-%m-%d")
            time_prefix = now.strftime("%H-%M-%S")
            full_prefix = f"{date_folder}/{time_prefix}_{full_prefix}"
            
        if 包含模型名 and 模型名输入:
            safe_name = os.path.splitext(os.path.basename(模型名输入))[0]
            full_prefix = f"{full_prefix}_{safe_name}"

        saver = SaveImage()
        return saver.save_images(图像, full_prefix, prompt, extra_pnginfo)

class PZ_Resolution_Selector:
    @classmethod
    def INPUT_TYPES(s):
        res_list = [512, 576, 640, 704, 720, 768, 832, 896, 960, 1024, 1080, 1088, 1152, 1216, 1280, 1344, 1408, 1472, 1536, 1600, 1920, 2048, 4096]
        return {
            "required": {
                "宽 (Width)": (res_list, {"default": 1024}),
                "高 (Height)": (res_list, {"default": 1024}),
                "交换宽高": ("BOOLEAN", {"default": False, "label_on": "🔁 已交换", "label_off": "➡️ 正常"}),
            }
        }
    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    FUNCTION = "select_res"
    CATEGORY = "PZ EasyUse"
    def select_res(self, **kwargs):
        w = int(kwargs.get("宽 (Width)"))
        h = int(kwargs.get("高 (Height)"))
        return (h, w) if kwargs.get("交换宽高") else (w, h)