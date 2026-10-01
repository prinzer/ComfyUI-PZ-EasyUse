import os
import random

import numpy as np
import torch
from PIL import Image, ImageOps
from aiohttp import web
from server import PromptServer

import folder_paths

PREVIEW_DIR = os.path.join(folder_paths.get_temp_directory(), "pz_dual_image")


def load_image_tensor(filename):
    image_path = folder_paths.get_annotated_filepath(filename)
    img = ImageOps.exif_transpose(Image.open(image_path))
    alpha = None
    if "A" in img.getbands():
        alpha = np.array(img.getchannel("A"), dtype=np.float32) / 255.0
    rgb = np.array(img.convert("RGB"), dtype=np.float32) / 255.0
    tensor = torch.from_numpy(rgb)[None,]
    if alpha is not None:
        mask = torch.from_numpy(alpha)[None,]
    else:
        mask = torch.ones((1, tensor.shape[1], tensor.shape[2]), dtype=torch.float32)
    return tensor, mask


class PZ_Dual_Image_Loader:
    @classmethod
    def INPUT_TYPES(cls):
        input_dir = folder_paths.get_input_directory()
        files = sorted(f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f)))
        if not files:
            files = [""]
        return {
            "required": {
                "image_1": (files, {"image_upload": True}),
                "image_2": (files, {"image_upload": True}),
                "prompt": ("STRING", {"multiline": True, "default": "", "placeholder": "Edit prompt..."}),
                # 监听来源：默认取“保存图片”节点的输出，切到“标记节点”后只认 PZ_Listen_Marker
                "listen_source": (["保存图片节点 / Save Image", "标记节点 / Marker"], {"default": "保存图片节点 / Save Image"}),
                # 开关：开启后忽略图2（预览框变灰、停止与绑定节点的双向同步），实际只输出 image_1 + 提示词
                "disable_image_2": ("BOOLEAN", {"default": False, "label_on": "忽略图2 / Ignore", "label_off": "启用图2 / Enable"}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "STRING")
    RETURN_NAMES = ("image_1", "image_2", "text")
    FUNCTION = "load"
    CATEGORY = "PZ EasyUse"

    def resolve(self, filename, connected, unique_id, slot):
        if connected is not None:
            tensor = connected
            mask = torch.ones((tensor.shape[0], tensor.shape[1], tensor.shape[2]), dtype=torch.float32)
        else:
            tensor, mask = load_image_tensor(filename)
        if unique_id is not None:
            os.makedirs(PREVIEW_DIR, exist_ok=True)
            frame = np.clip(tensor[0].cpu().numpy() * 255.0, 0, 255).astype(np.uint8)
            Image.fromarray(frame).save(os.path.join(PREVIEW_DIR, f"{unique_id}_{slot}.png"))
        return tensor, mask

    def load(self, image_1, image_2, prompt="", listen_source="保存图片节点 / Save Image", disable_image_2=False, unique_id=None):
        img1, mask1 = self.resolve(image_1, None, unique_id, 1)
        if disable_image_2:
            # 图2 被忽略：输出 1x1 占位（保持输出端口不变），实际工作流只用 image_1 + 提示词
            img2 = torch.zeros((1, 1, 1, 3), dtype=torch.float32)
        else:
            img2, mask2 = self.resolve(image_2, None, unique_id, 2)
        # 提示词由本节点直接编辑/绑定，不从其他节点接入
        text = prompt
        return (img1, img2, text)


class PZ_Single_Image_Loader:
    """单图版：加载一张图 + 编辑提示词，输出该图（含提示词文本）。
    比双图版少了图2 / output_select / edit_target / 结果图监听，只保留单图加载与编辑。"""

    @classmethod
    def INPUT_TYPES(cls):
        input_dir = folder_paths.get_input_directory()
        files = sorted(f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f)))
        if not files:
            files = [""]
        return {
            "required": {
                "image_1": (files, {"image_upload": True}),
                "prompt_1": ("STRING", {"multiline": True, "default": "", "placeholder": "Edit prompt..."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING")
    RETURN_NAMES = ("image", "mask", "text")
    FUNCTION = "load"
    CATEGORY = "PZ EasyUse"

    def load(self, image_1, prompt_1="", unique_id=None):
        tensor, mask = load_image_tensor(image_1)
        if unique_id is not None:
            os.makedirs(PREVIEW_DIR, exist_ok=True)
            frame = np.clip(tensor[0].cpu().numpy() * 255.0, 0, 255).astype(np.uint8)
            Image.fromarray(frame).save(os.path.join(PREVIEW_DIR, f"{unique_id}_1.png"))
        return (tensor, mask, prompt_1)


class PZ_Listen_Marker:
    """结果图触发标记：图片透传，同时输出当前图片并广播给前端。
    开关 save_as_output 打开时等同“保存图像”（写到 output 目录），关闭时等同“预览图像”（写到临时目录）。
    可以接在保存图片节点的前面或任意位置；PZ Dual Image Loader 的“监听”下拉选中它后，
    就会导入这里输出的图片。"""

    def __init__(self):
        self.output_dir = folder_paths.get_temp_directory()
        self.type = "temp"
        self.prefix_append = "_temp_" + "".join(random.choice("abcdefghijklmnopqrstupvxyz") for _ in range(5))
        self.compress_level = 1

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
            },
            "optional": {
                "filename_prefix": ("STRING", {"default": "PZ_Marker"}),
                # 开关：打开=保存图像(output)，关闭=预览图像(temp)
                "save_as_output": ("BOOLEAN", {"default": True, "label_on": "保存图像", "label_off": "预览图像"}),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "mark"
    OUTPUT_NODE = True
    CATEGORY = "PZ EasyUse"
    DESCRIPTION = "结果图触发标记：图片透传；开关打开等同保存图像，关闭等同预览图像"

    def mark(self, images, filename_prefix="PZ_Marker", save_as_output=True, prompt=None, extra_pnginfo=None):
        save_as_output = bool(save_as_output)
        output_dir = folder_paths.get_output_directory() if save_as_output else folder_paths.get_temp_directory()
        out_type = "output" if save_as_output else "temp"
        # 预览模式加随机后缀，避免和正式保存的文件混名；保存模式保持干净文件名
        filename_prefix += "" if save_as_output else self.prefix_append
        full_output_folder, filename, counter, subfolder, filename_prefix = folder_paths.get_save_image_path(
            filename_prefix, output_dir, images[0].shape[1], images[0].shape[0]
        )
        results = []
        for (batch_number, image) in enumerate(images):
            pixels = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(pixels, 0, 255).astype(np.uint8))
            filename_with_batch_num = filename.replace("%batch_num%", str(batch_number))
            file = f"{filename_with_batch_num}_{counter:05}_.png"
            img.save(os.path.join(full_output_folder, file), compress_level=self.compress_level)
            results.append({"filename": file, "subfolder": subfolder, "type": out_type})
            counter += 1
        return {"ui": {"images": results}, "result": (images,)}


@PromptServer.instance.routes.get("/pz_easyuse/dual-image-preview")
async def dual_image_preview(request):
    node = request.query.get("node", "")
    slot = request.query.get("slot", "")
    if not node.isdigit() or slot not in ("1", "2"):
        return web.Response(status=400)
    path = os.path.join(PREVIEW_DIR, f"{node}_{slot}.png")
    if not os.path.isfile(path):
        return web.Response(status=404)
    return web.FileResponse(path)
