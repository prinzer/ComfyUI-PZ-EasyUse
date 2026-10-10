import base64
import io
import json
import os

import numpy as np
import torch
from PIL import Image
from aiohttp import web
from server import PromptServer

import folder_paths

from .pz_dual_image import PREVIEW_DIR, PZ_Dual_Image_Loader

# 人偶编辑器左侧「我的图库」：骨架图存在 input/fisher_openpose（与 Fisher-Pose 的
# /fisher_pose/openpose_library 同一目录），这里只补一个「删单张」的接口，
# 列表与清空仍用 Fisher-Pose 自带的路由。
FISHER_LIBRARY_SUBFOLDER = "fisher_openpose"
FISHER_IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")


def _fisher_library_path(name):
    """只在 input/fisher_openpose 里找图片，挡掉 ../ 与任意路径。"""
    if not name or os.path.basename(name) != name:
        return None
    if not name.lower().endswith(FISHER_IMAGE_EXTENSIONS):
        return None
    path = os.path.join(folder_paths.get_input_directory(), FISHER_LIBRARY_SUBFOLDER, name)
    return path if os.path.isfile(path) else None


@PromptServer.instance.routes.post("/pz_easyuse/dual-image-preview/save")
async def save_dual_image_preview(request):
    """前端把编辑器出图写进预览槽（slot 2 = 图2，slot 3 = 画布/SDPose 黑底骨架）。

    「应用到节点」时调用：节点上的「图2」「画布」要立刻显示这张编辑好的图，
    而不是等下次执行（后端也只在 SDPose 一键时才会写这两个槽）。
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    node = str(body.get("node", ""))
    slot = str(body.get("slot", ""))
    image = body.get("image", "")
    if not node.isdigit() or slot not in ("1", "2", "3"):
        return web.json_response({"error": "bad node/slot"}, status=400)
    if not isinstance(image, str) or not image.startswith("data:image/png;base64,"):
        return web.json_response({"error": "bad image"}, status=400)
    encoded = image[len("data:image/png;base64,"):]
    if len(encoded) > 32_000_000:
        return web.json_response({"error": "image too large"}, status=400)
    try:
        raw = base64.b64decode(encoded, validate=True)
        img = Image.open(io.BytesIO(raw))
        if not all(64 <= v <= 4096 for v in img.size):
            return web.json_response({"error": "bad size"}, status=400)
        os.makedirs(PREVIEW_DIR, exist_ok=True)
        img.convert("RGB").save(os.path.join(PREVIEW_DIR, f"{node}_{slot}.png"))
    except Exception as exc:  # noqa: BLE001
        return web.json_response({"error": str(exc)}, status=500)
    return web.json_response({"saved": f"{node}_{slot}.png"})


@PromptServer.instance.routes.post("/pz_easyuse/fisher-openpose-library/delete")
async def delete_fisher_library_image(request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    path = _fisher_library_path(str(body.get("name", "")))
    if not path:
        return web.json_response({"error": "图库里没有这张图"}, status=404)
    try:
        os.remove(path)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
    return web.json_response({"removed": os.path.basename(path)})


def mannequin_tensor_from_pose(pose_json, kind="mannequin"):
    """从姿势编辑器返回的 pose_json 解码图2 tensor；kind=mannequin 取人偶图，kind=skeleton 取骨架图。无效返回 None。"""
    if not pose_json:
        return None
    try:
        data = json.loads(pose_json)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    if kind == "skeleton":
        encoded = data.get("poseSkeleton") or data.get("pose_skeleton")
    else:
        encoded = data.get("poseReference") or data.get("pose_reference")
    if not isinstance(encoded, str) or not encoded.startswith("data:image/png;base64,"):
        return None
    if len(encoded) > 32_000_000:
        return None
    try:
        image = Image.open(io.BytesIO(base64.b64decode(encoded[len("data:image/png;base64,"):], validate=True)))
    except Exception:
        return None
    if not all(64 <= v <= 4096 for v in image.size):
        return None
    image = image.convert("RGB")
    arr = np.asarray(image).astype(np.float32) / 255.0
    return torch.from_numpy(arr).unsqueeze(0)


def save_pose_preview(tensor, unique_id, slot):
    """把 tensor 存成前端可读的预览图（/pz_easyuse/dual-image-preview?node=<id>&slot=<n>）。"""
    if unique_id is None or tensor is None:
        return
    try:
        os.makedirs(PREVIEW_DIR, exist_ok=True)
        frame = np.clip(tensor[0].detach().cpu().numpy() * 255.0, 0, 255).astype(np.uint8)
        Image.fromarray(frame).save(os.path.join(PREVIEW_DIR, f"{unique_id}_{slot}.png"))
    except Exception as exc:  # noqa: BLE001
        print(f"[PZ SDPose] 写入预览失败: {exc}")


# ===== SDPose 设置 =====
# 默认值与 ComfyUI 内置节点保持一致：
#   绘制参数 → SDPoseDrawKeypoints；提取前缩放 → ResizeImageMaskNode
SDPOSE_SETTINGS_DEFAULTS = {
    # 绘制（SDPoseDrawKeypoints）
    "draw_body": True,
    "draw_hands": True,
    "draw_face": True,
    "draw_feet": True,
    "draw_head": True,
    "stick_width": 4,
    "face_point_size": 2,
    "score_threshold": 0.5,
    # 提取前缩放图1（ResizeImageMaskNode）
    "resize_type": "scale longer dimension",
    "longer_size": 1024,
    "shorter_size": 1024,
    "width": 1024,
    "height": 1024,
    "multiplier": 1.0,
    "megapixels": 1.0,
    "multiple": 8,
    "crop": "disabled",
    "scale_method": "area",
}

_SDPOSE_INT_KEYS = ("stick_width", "face_point_size", "longer_size", "shorter_size", "width", "height", "multiple")
_SDPOSE_FLOAT_KEYS = ("score_threshold", "multiplier", "megapixels")
_SDPOSE_BOOL_KEYS = ("draw_body", "draw_hands", "draw_face", "draw_feet", "draw_head")


def parse_sdpose_settings(raw):
    """解析前端「设置」面板写入的 JSON；缺项或非法值回落到默认值。"""
    cfg = dict(SDPOSE_SETTINGS_DEFAULTS)
    if not raw:
        return cfg
    try:
        data = json.loads(raw)
    except Exception:
        return cfg
    if not isinstance(data, dict):
        return cfg
    for key, value in data.items():
        if key not in cfg or value is None:
            continue
        try:
            if key in _SDPOSE_INT_KEYS:
                cfg[key] = int(value)
            elif key in _SDPOSE_FLOAT_KEYS:
                cfg[key] = float(value)
            elif key in _SDPOSE_BOOL_KEYS:
                cfg[key] = bool(value)
            elif isinstance(value, str) and value:
                cfg[key] = value
        except (TypeError, ValueError):
            pass
    return cfg


def resize_for_sdpose(image_tensor, cfg):
    """按设置缩放图1（默认「长边 1024 / area」），复用内置 ResizeImageMaskNode 的实现以保持一致。"""
    try:
        from comfy_extras.nodes_post_processing import (
            ResizeType,
            scale_by,
            scale_dimensions,
            scale_longer_dimension,
            scale_shorter_dimension,
            scale_total_pixels,
            scale_to_multiple_cover,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[PZ SDPose] 无法导入缩放工具，按原图处理: {exc}")
        return image_tensor
    resize_type = cfg.get("resize_type") or ResizeType.SCALE_LONGER_DIMENSION
    method = cfg.get("scale_method") or "area"
    try:
        if resize_type == ResizeType.SCALE_BY:
            return scale_by(image_tensor, cfg["multiplier"], method)
        if resize_type == ResizeType.SCALE_DIMENSIONS:
            return scale_dimensions(image_tensor, cfg["width"], cfg["height"], method, cfg.get("crop", "disabled"))
        if resize_type == ResizeType.SCALE_SHORTER_DIMENSION:
            return scale_shorter_dimension(image_tensor, cfg["shorter_size"], method)
        if resize_type == ResizeType.SCALE_WIDTH:
            return scale_dimensions(image_tensor, cfg["width"], 0, method)
        if resize_type == ResizeType.SCALE_HEIGHT:
            return scale_dimensions(image_tensor, 0, cfg["height"], method)
        if resize_type == ResizeType.SCALE_TOTAL_PIXELS:
            return scale_total_pixels(image_tensor, cfg["megapixels"], method)
        if resize_type == ResizeType.SCALE_TO_MULTIPLE:
            return scale_to_multiple_cover(image_tensor, cfg["multiple"], method)
        return scale_longer_dimension(image_tensor, cfg["longer_size"], method)
    except Exception as exc:  # noqa: BLE001
        print(f"[PZ SDPose] 缩放失败，按原图处理: {exc}")
        return image_tensor


def sdpose_extract_keypoints(image_tensor, model, vae, batch_size=16):
    """调用 ComfyUI 内置 SDPoseKeypointExtractor 提取 OpenPose 关键点帧（list[frame]）。失败返回 None。"""
    try:
        from comfy_extras.nodes_sdpose import SDPoseKeypointExtractor
    except Exception as exc:  # noqa: BLE001
        print(f"[PZ SDPose] 无法导入 SDPose 节点（请升级 ComfyUI）: {exc}")
        return None
    try:
        out = SDPoseKeypointExtractor.execute(
            model=model, vae=vae, image=image_tensor, batch_size=int(batch_size)
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[PZ SDPose] 关键点提取失败（请确认加载的是 SDPose 模型）: {exc}")
        return None
    result = getattr(out, "result", None)
    frames = result[0] if result else None
    return frames if frames else None


def _draw_people_on(canvas, frame, cfg, draw_body, draw_head, draw_feet, draw_face, draw_hands):
    """在给定画布上按 cfg 绘制 OpenPose 骨架（多人逐个绘制）。"""
    threshold = float(cfg.get("score_threshold", 0.5))
    stick_width = int(cfg.get("stick_width", 4))
    face_point_size = int(cfg.get("face_point_size", 2))
    try:
        from comfy_extras.pose.keypoint_draw import KeypointDraw
    except Exception as exc:  # noqa: BLE001
        print(f"[PZ SDPose] 无法导入绘制工具: {exc}")
        return canvas

    def _parse(flat, n):
        arr = np.array(flat, dtype=np.float32).reshape(n, 3)
        return arr[:, :2], arr[:, 2]

    def _zeros(n):
        return np.zeros((n, 2), dtype=np.float32), np.zeros(n, dtype=np.float32)

    drawer = KeypointDraw()
    for person in (frame or {}).get("people", []):
        body_raw = person.get("pose_keypoints_2d") or []
        if len(body_raw) < 54:
            continue
        body_kp, body_sc = _parse(body_raw, 18)
        foot_raw = person.get("foot_keypoints_2d")
        foot_kp, foot_sc = _parse(foot_raw, 6) if foot_raw else _zeros(6)
        face_raw = person.get("face_keypoints_2d")
        face_kp, face_sc = _parse(face_raw, 70) if face_raw else _zeros(70)
        face_kp, face_sc = face_kp[:68], face_sc[:68]  # 去掉附加的双眼，身体点已画
        rhand_raw = person.get("hand_right_keypoints_2d")
        rhand_kp, rhand_sc = _parse(rhand_raw, 21) if rhand_raw else _zeros(21)
        lhand_raw = person.get("hand_left_keypoints_2d")
        lhand_kp, lhand_sc = _parse(lhand_raw, 21) if lhand_raw else _zeros(21)

        kp = np.concatenate([body_kp, foot_kp, face_kp, rhand_kp, lhand_kp], axis=0)
        sc = np.concatenate([body_sc, foot_sc, face_sc, rhand_sc, lhand_sc], axis=0)
        canvas = drawer.draw_wholebody_keypoints(
            canvas, kp, sc, threshold=threshold,
            draw_body=draw_body, draw_head=draw_head, draw_feet=draw_feet,
            draw_face=draw_face, draw_hands=draw_hands,
            stick_width=stick_width, face_point_size=face_point_size,
        )

    return canvas


def draw_openpose_over_image(image_tensor, frame, cfg=None):
    """在与图1 同尺寸的画布上（即以图1 为背景）绘制 OpenPose 骨架，返回 [1,H,W,3] 张量。

    与内置 SDPoseDrawKeypoints 的区别：不新建黑底画布，而是直接在图1 像素上绘制。
    绘制参数取自 cfg（见 SDPOSE_SETTINGS_DEFAULTS，可在节点「设置」面板调整）。
    """
    cfg = cfg or SDPOSE_SETTINGS_DEFAULTS
    # 一键 SDPose 固定以图1（缩放后）为画布 → 图2 带图1 背景。
    # 想要纯黑底骨架图：在骨架编辑器里点「应用到节点」（默认不带背景，见「设置」）
    canvas = np.clip(image_tensor[0].detach().cpu().numpy() * 255.0, 0, 255).astype(np.uint8)
    canvas = _draw_people_on(
        canvas, frame, cfg,
        draw_body=bool(cfg.get("draw_body", True)), draw_head=bool(cfg.get("draw_head", True)),
        draw_feet=bool(cfg.get("draw_feet", True)), draw_face=bool(cfg.get("draw_face", True)),
        draw_hands=bool(cfg.get("draw_hands", True)),
    )
    return torch.from_numpy(canvas.astype(np.float32) / 255.0).unsqueeze(0)


def draw_openpose_skeleton_only(image_tensor, frame, cfg=None):
    """黑底 + 只画身体（含鼻子）的骨架图，供 VNCCS 人偶编辑器的「OpenPose 一键摆姿」识别。

    人偶编辑器的 readSkeletonImage() 只认黑底标准彩色骨架图（彩色像素占比 >20% 直接判失败），
    而手/脸/脚的密集标记会被判为「彩色标记过密」。所以这里强制黑底 + 仅身体（保留鼻子，
    编辑器用它判断正/背面）。尺寸与图1 一致，宽高会一并传给编辑器。
    """
    cfg = cfg or SDPOSE_SETTINGS_DEFAULTS
    canvas = np.zeros_like(np.clip(image_tensor[0].detach().cpu().numpy() * 255.0, 0, 255).astype(np.uint8))
    canvas = _draw_people_on(
        canvas, frame, cfg,
        draw_body=True, draw_head=True, draw_feet=False, draw_face=False, draw_hands=False,
    )
    return torch.from_numpy(canvas.astype(np.float32) / 255.0).unsqueeze(0)


class PZ_Pose_Dual_Image_Loader(PZ_Dual_Image_Loader):
    """PZ 双图加载编辑的姿势版：图2 可由内置 VNCCS 3D 人偶编辑器生成
    （OpenPose 一键摆姿、内置 209 骨架、自由视角），也可用 SDPose 从图1 一键提取骨架
    （以图1 为背景），或退回普通图片加载节点。"""

    @classmethod
    def INPUT_TYPES(cls):
        it = super().INPUT_TYPES()
        required = {}
        for key, val in it["required"].items():
            required[key] = val
            if key == "image_2":
                required["pose_json"] = ("STRING", {"default": "{}", "multiline": True})
                required["image_2_kind"] = (["人偶图 / Mannequin", "骨骼图 / OpenPose Skeleton"], {"default": "人偶图 / Mannequin"})
        # SDPose 一键开关：由前端「SDPose 一键骨架」按钮置为 True 后触发一次局部执行，平时保持 False
        required["sdpose_extract"] = ("BOOLEAN", {"default": False, "label_on": "SDPose 提取中", "label_off": "手动 / Manual"})
        # SDPose 设置：前端「设置」面板写入的 JSON（绘制参数 + 提取前缩放），无需手填
        required["sdpose_settings"] = ("STRING", {"default": "{}", "multiline": True})
        it["required"] = required
        optional = dict(it.get("optional") or {})
        optional["sdpose_model"] = ("MODEL", {"tooltip": "SDPose 模型：接 Checkpoint 加载器的 MODEL 输出（如 sdpose_wholebody_fp16）"})
        optional["sdpose_vae"] = ("VAE", {"tooltip": "SDPose 模型对应的 VAE：接 Checkpoint 加载器的 VAE 输出"})
        it["optional"] = optional
        return it

    RETURN_TYPES = ("IMAGE", "IMAGE", "STRING")
    RETURN_NAMES = ("image_1", "image_2", "text")
    FUNCTION = "load"
    CATEGORY = "PZ EasyUse"
    # 作为输出节点，前端才能用 partial_execution_targets 只跑本节点所在的子图（一键 SDPose）
    OUTPUT_NODE = True
    DESCRIPTION = (
        "PZ 双图加载编辑的姿势版：图2 可由内置 VNCCS 3D 人偶编辑器生成，"
        "也可用 SDPose 从图1 一键提取骨架（以图1 为背景）后在前端继续微调。"
        "图1 编辑目标、图2 参考/姿势图。"
    )

    def load(self, image_1, image_2, pose_json, image_2_kind="人偶图 / Mannequin", prompt="",
             listen_source="保存图片节点 / Save Image", disable_image_2=False, unique_id=None,
             sdpose_extract=False, sdpose_settings="{}", sdpose_model=None, sdpose_vae=None):
        # 「导入图转人偶」：前端会把本次工作流里的图1 换成导入的图（见前端 runSdposeExtract），
        # 只借用它的骨架数据，因此图1/图2 的预览文件不能被这次运行覆盖（前端只认 slot 3 的骨架图）。
        import_only = False
        if sdpose_extract:
            try:
                import_only = bool(json.loads(sdpose_settings or "{}").get("_import_only", False))
            except Exception:
                import_only = False
        img1, _ = self.resolve(image_1, None, None if import_only else unique_id, 1)
        if disable_image_2:
            img2 = torch.zeros((1, 1, 1, 3), dtype=torch.float32)
            return (img1, img2, prompt)
        # SDPose 一键：按「设置」面板的缩放参数先处理图1，用 SDPose 提取 OpenPose 骨架，
        # 再叠加在处理后的图1 上作为图2；同时把关键点通过 ui 回传前端，便于在骨架编辑器里继续微调。
        if sdpose_extract and sdpose_model is not None and sdpose_vae is not None:
            cfg = parse_sdpose_settings(sdpose_settings)
            work = resize_for_sdpose(img1, cfg)
            frames = sdpose_extract_keypoints(work, sdpose_model, sdpose_vae)
            if frames:
                height, width = int(work.shape[1]), int(work.shape[2])
                # 另存一份黑底纯骨架图（slot 3）：人偶编辑器的 OpenPose 一键摆姿只认这种图
                save_pose_preview(draw_openpose_skeleton_only(work, frames[0], cfg), unique_id, 3)
                # 临时识别（导入图转人偶）到此为止：不写「导入图 + 骨架」的 slot 2，也就不会串到图2
                if import_only:
                    return {
                        "ui": {
                            "pz_sdpose_keypoints": [json.dumps(frames)],
                            "pz_sdpose_canvas": [json.dumps({"width": width, "height": height})],
                        },
                        "result": (img1, img1, prompt),
                    }
                composite = draw_openpose_over_image(work, frames[0], cfg)
                save_pose_preview(composite, unique_id, 2)
                return {
                    "ui": {
                        "pz_sdpose_keypoints": [json.dumps(frames)],
                        "pz_sdpose_canvas": [json.dumps({"width": width, "height": height})],
                    },
                    "result": (img1, composite, prompt),
                }
        # 姿势优先：若姿势编辑器已应用（pose_json 含有效图），图2 用它；
        # image_2_kind 决定取人偶图还是骨骼图。否则图2 像原 PZ_Dual_Image_Loader 一样解析链接的图片加载节点
        kind = "skeleton" if image_2_kind == "骨骼图 / OpenPose Skeleton" else "mannequin"
        mannequin = mannequin_tensor_from_pose(pose_json, kind=kind)
        if mannequin is not None:
            return (img1, mannequin, prompt)
        img2, _ = self.resolve(image_2, None, unique_id, 2)
        return (img1, img2, prompt)
