import folder_paths
import datetime
import os
import subprocess
import platform
import server
from aiohttp import web
from nodes import SaveImage

# ==========================================
# 1. PZ 保存图片 (增强版 - 自动清洗路径)
# ==========================================
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
        
        # 1. 处理日期子文件夹
        if 日期子文件夹:
            now = datetime.datetime.now()
            date_folder = now.strftime("%Y-%m-%d")
            full_prefix = f"{date_folder}/{full_prefix}"
            
        # 2. 处理模型名 (核心修改：清洗路径斜杠)
        if 包含模型名 and 模型名输入:
            # 第一步：把反斜杠 \ 和正斜杠 / 全部替换成下划线 _
            # 这样 folder\lora_v1 就会变成 folder_lora_v1
            clean_name = 模型名输入.replace("\\", "_").replace("/", "_")
            
            # (可选) 如果你只想保留文件名，去掉所有路径前缀，可以用下面这行代替上面那行：
            # clean_name = os.path.basename(模型名输入) # 结果：lora_v1.safetensors
            
            # 第二步：去掉扩展名 (例如 .safetensors)
            clean_name = os.path.splitext(clean_name)[0]
            
            # 拼接到前缀
            full_prefix = f"{full_prefix}_{clean_name}"

        saver = SaveImage()
        return saver.save_images(图像, full_prefix, prompt, extra_pnginfo)

# ==========================================
# 2. PZ 分辨率选择器 (保持原样)
# ==========================================
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

# ==========================================
# API: 打开文件夹 (保持原样)
# ==========================================
@server.PromptServer.instance.routes.post("/pz/open_output_dir")
async def open_output_dir(request):
    try:
        base_dir = folder_paths.get_output_directory()
        today = datetime.datetime.now().strftime("%Y-%m-%d")
        today_dir = os.path.join(base_dir, today)
        
        target_dir = base_dir
        if os.path.exists(today_dir):
            target_dir = today_dir
            
        target_dir = os.path.abspath(target_dir)

        if platform.system() == "Windows":
            subprocess.run(["explorer", target_dir])
        elif platform.system() == "Darwin": # macOS
            subprocess.Popen(["open", target_dir])
        else: # Linux
            subprocess.Popen(["xdg-open", target_dir])
            
        return web.json_response({"message": "Opened", "path": target_dir})
    except Exception as e:
        return web.json_response({"message": str(e)}, status=500)