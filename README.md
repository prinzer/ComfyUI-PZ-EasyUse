PZ EasyUse 是一套专为 ComfyUI 设计的高效工具节点包，旨在简化繁琐的工作流操作。
其中最核心的组件 PZ Commander (提示词&图片循环器) 提供了强大的批量自动化功能，支持纯文本 Prompt 循环和“目录级”的批量图生图，是进行风格测试、模型对比和批量生产的利器。

✨ 核心亮点 (Key Features)
🚀 PZ Commander (全能循环器):
Prompt 批量循环: 在一个文本框内粘贴多行 Prompt，一键自动逐行执行，无需手动切换。
批量图生图: 指定本地文件夹路径，自动循环读取文件夹内的图片进行处理。
JS 自动调度: 独家内置 JS 队列劫持技术，一次点击 Queue 即可自动派发成百上千个任务。
极简模式: 支持纯文生图 (Text-Only) 和 批量目录 (Directory Batch) 模式切换。
🎨 LoRA & Prompt 动态组: 支持多达 50 组的动态 LoRA 和 Prompt 加载器，告别面条式连线。
💾 智能保存: 增强版图片保存节点，支持自定义前缀和更灵活的路径管理。
📦 安装方法 (Installation)
方法 1: 使用 ComfyUI Manager (推荐)
在 ComfyUI Manager 中搜索 PZ EasyUse。
点击 Install 安装。
重启 ComfyUI。
方法 2: 手动安装
打开终端 (CMD/Terminal)，进入 ComfyUI 的 custom_nodes 目录：
bash
cd ComfyUI/custom_nodes/
克隆本仓库：
bash
git clone https://github.com/你的用户名/ComfyUI-PZ-EasyUse.git
重启 ComfyUI。
🛠️ 节点说明 (Node Description)
🚀 1. PZ Commander (提示词&图片循环器)
这是本插件包的核心节点，位于 PZ EasyUse 菜单下。

这个节点可以让你告别手动一张张跑图。

Start Index (起始索引): 从第几行 Prompt (或第几张图) 开始跑。
Count (循环次数): 一次性想要跑多少张图。
例如：设置为 5，点击一次 Queue，系统会自动生成 5 个任务，分别对应第 0, 1, 2, 3, 4 行文本/图片。
Image Source (模式选择):
None (纯文本/文生图): 隐藏图片控件，专注于 Prompt 循环测试。
Directory Path (批量目录): 读取本地文件夹，配合图生图工作流使用。
Prompt Text: 输入多行 Prompt，每行代表一张图的提示词。
Directory Path: 输入本地图片文件夹路径（例如 D:\images），节点会自动循环读取其中的图片。
🧩 2. PZ Prompt Dynamic (动态提示词组)
提供 50 个 Prompt 输入槽位，支持动态开关，方便管理超长或复杂的提示词组合。
🔧 3. PZ LoRA Dynamic (动态 LoRA 组)
Model Only / Full: 提供单纯的模型 LoRA 加载或包含 CLIP 的全量加载。
支持批量管理 LoRA 权重，界面整洁。
🖼️ 4. PZ Save Image (增强保存)
比原生保存节点更灵活，支持时间戳、自定义子目录等功能。
📐 5. PZ Resolution Selector (分辨率选择器)
提供常用的 SD1.5 / SDXL 分辨率预设，一键选择宽高达标。
❓ 常见问题 (FAQ)
Q: PZ Commander 点击 Queue 后为什么只跑了一张？
A: 请检查 Count 参数是否大于 1。如果 Count 是 1，它就只跑当前 Index 的那一次任务。

Q: 批量图生图时，图片加载失败显示黑色？
A:

请确保 Directory Path 路径正确且文件夹内有图片（支持 jpg, png, webp 等）。
请确保路径中没有奇怪的引号或特殊字符。
检查控制台 (Console) 是否有报错信息。
Q: 为什么找不到“单图上传”功能了？
A: 为了保持节点轻量化和逻辑纯粹，V13 版本后移除了不稳定的单图上传功能。如果你只需要处理单张图，请配合 ComfyUI 原生的 Load Image 节点使用。

📄 License
MIT License
如果觉得好用，请给个 Star ⭐️ 支持一下！
git clone https://github.com/prinzer/ComfyUI-PZ-EasyUse.git  
