# ComfyUI PZ EasyUse Nodes

[English](#english) | [中文](#chinese)

A set of easy-to-use, efficient custom nodes for ComfyUI, focusing on Prompt management and LoRA stacking.

## ✨ Features

### 1. Prompt Management
- **PZ Prompt (Fixed 10)**: A simple, lightweight text concatenation node with 10 toggleable input slots. Great for keeping your workflow clean.
- **PZ Prompt (Dynamic 50)**: A powerful node that starts with 5 rows but can expand up to 50 rows dynamically. Unused rows are automatically hidden to save screen space.
- **PZ String Join**: Easily merge up to 6 text inputs with a custom separator (default is comma).

### 2. LoRA Stacker
Stop wrestling with messy LoRA connections!
- **Fixed & Dynamic Versions**: Choose between a compact fixed version (5 slots) or a dynamic version (starts at 5, expandable to 20).
- **Model Only / Full Mode**: Dedicated nodes for "Model Only" (simpler connections) or "Model + CLIP" (full functionality).
- **Smart UI**: Dynamic nodes allow you to add/remove LoRA slots on the fly. Turning off a row or removing it automatically resets its values to prevent accidents.

---

<a name="chinese"></a>
# ComfyUI PZ EasyUse 节点组

一套简单、高效的 ComfyUI 自定义节点，专注于提示词管理和 LoRA 堆叠，旨在简化你的工作流连线。

## ✨ 主要功能

### 1. 提示词管理 (Prompt Palette)
- **PZ提示词(固定10条)**：轻量级节点，提供 10 个带开关的文本输入框，自动拼接非空内容。
- **PZ提示词(动态50条)**：强大的动态节点。默认显示 5 行，支持点击按钮动态增加至 50 行。未使用的行会自动隐藏，节省屏幕空间。
- **PZ文本合并**：将最多 6 个文本输入合并为一个，支持自定义分隔符（默认为英文逗号）。

### 2. LoRA 管理组 (LoRA Stacker)
拒绝像蜘蛛网一样的 LoRA 连线！
- **固定版 & 动态版**：提供“固定5条”的小巧版本，以及“动态20条”的可扩展版本。
- **仅模型 / 全功能**：提供两种变体。如果你不需要调整 CLIP 权重，使用“仅模型”版本可以让连线更清爽。
- **智能交互**：动态节点支持点击 `➕` / `➖` 按钮实时增减插槽。减少行数时会自动重置该行的开关和权重，防止误操作。

## 📥 Installation / 安装

### Method 1: ComfyUI Manager (Recommended)
1. Install [ComfyUI Manager](https://github.com/ltdrdata/ComfyUI-Manager).
2. Search for `PZ EasyUse` in the manager and install.
3. Restart ComfyUI.

### Method 2: Manual Install
1. Navigate to your ComfyUI `custom_nodes` directory.
2. Clone this repository:
   ```bash  
   git clone https://github.com/YOUR_USERNAME/ComfyUI-PZ-EasyUse.git  