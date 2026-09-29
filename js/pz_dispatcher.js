import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// =========================================================
// 1. 基础工具
// =========================================================

function safeSetHidden(widget, shouldHide) {
    if (!widget) return;
    if (shouldHide) {
        widget.origType = widget.type;
        widget.type = "HIDDEN";
    } else if (widget.origType) {
        widget.type = widget.origType;
    }
    if (widget.element) {
        widget.element.style.display = shouldHide ? "none" : "";
        widget.element.hidden = shouldHide;
        let parent = widget.element.parentElement;
        if(parent && parent.classList.contains("comfy-widget-content")) {
             parent.style.display = shouldHide ? "none" : "";
             parent.hidden = shouldHide;
        }
    }
}

function getViewUrl(filename) {
    return api.apiURL(`/view?filename=${encodeURIComponent(filename)}&type=input`);
}

function parseImageList(text) {
    return (text || "").split("\n").map((s) => s.trim()).filter((s) => !!s);
}

async function uploadOneImage(file) {
    const body = new FormData();
    body.append("image", file, file.name);
    body.append("type", "input");
    const resp = await api.fetchApi("/upload/image", { method: "POST", body });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json?.name;
}

// =========================================================
// 2. UI 组件
// =========================================================

function createGalleryUI(node) {
    const container = document.createElement("div");
    // Flex 布局，height: 100% 撑满父容器，overflow: hidden 防止溢出
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%; 
        min-height: 150px; 
        background: var(--comfy-input-bg);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        margin-top: 10px;
        box-sizing: border-box;
        overflow: hidden;
        flex: 1; /* 占据剩余空间 */
    `;

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:4px;padding:6px;background:var(--comfy-menu-bg);border-bottom:1px solid var(--border-color);flex-shrink:0;";
    
    const addBtn = document.createElement("button"); addBtn.textContent = "➕ Select Images";
    const clearBtn = document.createElement("button"); clearBtn.textContent = "🗑️ Clear";
    [addBtn, clearBtn].forEach(b => {
        b.style.cssText = "flex:1;cursor:pointer;background:var(--comfy-input-bg);color:var(--input-text);border:1px solid var(--border-color);padding:6px;border-radius:4px;font-size:12px;";
    });
    btnRow.append(addBtn, clearBtn);

    const grid = document.createElement("div");
    // 关键：flex: 1 自动填充，overflow-y: auto 允许内部滚动
    grid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
        gap: 4px;
        padding: 6px;
        overflow-y: auto;
        flex: 1; 
        align-content: start;
        min-height: 0; 
    `;
    
    grid.addEventListener("wheel", (e) => e.stopPropagation(), { passive: false });
    grid.addEventListener("mousedown", (e) => e.stopPropagation());

    const status = document.createElement("div");
    status.style.cssText = "font-size:10px;text-align:right;padding:4px;opacity:0.7;flex-shrink:0;background:var(--comfy-menu-bg);border-top:1px solid var(--border-color);";

    const getDataW = () => node.widgets.find(w => w.name === "image_list_data");
    const getCountW = () => node.widgets.find(w => w.name === "force_count");

    const redraw = () => {
        const w = getDataW();
        const names = parseImageList(w?.value);
        status.textContent = `${names.length} images loaded`;
        grid.innerHTML = "";
        
        if (names.length === 0) {
            grid.innerHTML = `
                <div style='grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--desc-text);opacity:0.6;min-height:80px;'>
                    <div style="font-size:20px;margin-bottom:4px;">📂</div>
                    <div style="font-size:11px;">Drag & Drop</div>
                </div>
            `;
        } else {
            const frag = document.createDocumentFragment();
            names.forEach((name, i) => {
                const d = document.createElement("div");
                d.style.cssText = "position:relative;aspect-ratio:1;border:1px solid #444;overflow:hidden;border-radius:4px;background:#000;";
                const img = document.createElement("img"); 
                img.src = getViewUrl(name); 
                img.style.cssText = "width:100%;height:100%;object-fit:cover;";
                const x = document.createElement("div"); 
                x.textContent = "×"; 
                x.style.cssText = "position:absolute;top:0;right:0;background:rgba(0,0,0,0.6);color:#fff;cursor:pointer;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:10px;";
                x.onclick = (e) => { e.stopPropagation(); const n=[...names]; n.splice(i,1); update(n); };
                d.append(img, x); frag.append(d);
            });
            grid.appendChild(frag);
        }
        
        // 当有图片时，自动更新 force_count
        const cW = getCountW();
        const srcW = node.widgets.find(w => w.name === "image_source");
        if (cW && srcW && srcW.value.includes("Upload") && names.length > 0) {
            cW.value = names.length;
        }

        // 重绘后触发尺寸检查
        if (node.onResize) node.onResize(node.size);
    };

    const update = (names) => {
        const w = getDataW();
        if(w) { w.value = names.join("\n"); redraw(); }
    };

    const handleFiles = async (files) => {
        const w = getDataW();
        const curr = parseImageList(w?.value);
        for (const f of files) {
            if(f.type.startsWith("image")) {
                const n = await uploadOneImage(f);
                if(n) curr.push(n);
            }
        }
        update(curr);
    };

    addBtn.onclick = () => {
        const inp = document.createElement("input"); inp.type="file"; inp.accept="image/*"; inp.multiple=true;
        inp.onchange = (e) => handleFiles(e.target.files);
        inp.click();
    };
    clearBtn.onclick = () => update([]);

    container.addEventListener("dragover", e => { e.preventDefault(); container.style.borderColor = "#4a6"; });
    container.addEventListener("dragleave", e => { e.preventDefault(); container.style.borderColor = "var(--border-color)"; });
    container.addEventListener("drop", e => { e.preventDefault(); container.style.borderColor = "var(--border-color)"; handleFiles(e.dataTransfer.files); });

    container.append(btnRow, grid, status);
    return { container, redraw };
}

// =========================================================
// 3. 节点扩展
// =========================================================

app.registerExtension({
    name: "PZ.Commander.Final.RefinedV3",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        
        // --- A. 纯文本节点 ---
        if (nodeData.name === "PZ_Commander_Text") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.setSize([400, 300]);
                const refresh = () => {
                    const s = this.widgets.find(w => w.name === "split_mode");
                    const d = this.widgets.find(w => w.name === "delimiter");
                    if (s && d) safeSetHidden(d, !s.value.includes("Custom"));
                };
                const s = this.widgets.find(w => w.name === "split_mode");
                if(s) { s.callback = () => refresh(); setTimeout(refresh, 50); }
                return r;
            };
        }

        // --- B. 混合 & 纯图节点 ---
        if (nodeData.name === "PZ_Commander" || nodeData.name === "PZ_Commander_Image") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                // 1. 初始化 DOM UI
                const gallery = createGalleryUI(this);
                this.addDOMWidget("gallery", "gallery", gallery.container);
                
                // 2. 隐藏数据接口
                const dataW = this.widgets.find(w => w.name === "image_list_data");
                if(dataW) { dataW.type = "hidden"; dataW.computeSize = () => [0, -4]; }

                // 3. 限制 Prompt Text 高度 (如果是混合节点)
                if (nodeData.name === "PZ_Commander") {
                    const pText = this.widgets.find(w => w.name === "prompt_text");
                    if (pText && pText.element) {
                        pText.element.style.maxHeight = "100px";
                        pText.element.style.overflowY = "auto";
                    }
                }

                // 4. 初始尺寸 (稍微高一点以容纳相册)
                this.setSize([420, 500]);

                const refresh = () => {
                    const srcW = this.widgets.find(w => w.name === "image_source");
                    const dirW = this.widgets.find(w => w.name === "directory_path");
                    const splitW = this.widgets.find(w => w.name === "split_mode");
                    const delimW = this.widgets.find(w => w.name === "delimiter");

                    if (srcW) {
                        const isUpload = srcW.value.includes("Upload");
                        if(dirW) safeSetHidden(dirW, isUpload);
                        // 上传模式显示相册，目录模式隐藏
                        gallery.container.style.display = isUpload ? "flex" : "none";
                        if(isUpload) gallery.redraw();
                    }
                    if (splitW && delimW) {
                        safeSetHidden(delimW, !splitW.value.includes("Custom"));
                    }
                    
                    // 触发尺寸检查
                    this.onResize(this.size);
                };

                // 绑定 Widget 回调
                const srcW = this.widgets.find(w => w.name === "image_source");
                if(srcW) { 
                    const prev = srcW.callback;
                    srcW.callback = function() { prev?.apply(this, arguments); refresh(); };
                }
                const splitW = this.widgets.find(w => w.name === "split_mode");
                if(splitW) {
                    const prev = splitW.callback;
                    splitW.callback = function() { prev?.apply(this, arguments); refresh(); };
                }

                // 5. 强力 Resize 保护
                const origOnResize = this.onResize;
                this.onResize = function(size) {
                    if (origOnResize) origOnResize.apply(this, arguments);
                    
                    // 计算最小高度：Widget 数量 * 单行高度 + 预留空间
                    // 简单粗暴法：如果显示相册，至少需要 450px；如果不显示，至少 200px
                    const srcVal = this.widgets.find(w => w.name === "image_source")?.value || "";
                    const isUpload = srcVal.includes("Upload");
                    const minH = isUpload ? 450 : 200;
                    
                    if (size[1] < minH) {
                        this.setSize([size[0], minH]);
                    }
                    if (gallery.container) {
                        gallery.container.style.height = "100%"; // 确保占满
                    }
                }

                setTimeout(() => { refresh(); }, 50);
                return r;
            };
        }
    },

    async setup() {
        const originalQueuePrompt = app.queuePrompt;

        app.queuePrompt = async function(index = 0, batchCount = 1) {
            if (!app.graph) return await originalQueuePrompt.apply(this, arguments);

            // =====================================================
            // 【新增：在加入队列前，自动为文本框清理并添加行号】
            // =====================================================
            const pzNodes = app.graph._nodes.filter(n => n.type === "PZ_Commander_Text");
            for (const node of pzNodes) {
                const textWidget = node.widgets?.find(w => w.name === "prompt_text" || w.type === "customtext");
                if (textWidget && typeof textWidget.value === "string") {
                    const lines = textWidget.value.split('\n');
                    let isChanged = false;
                    
                    const formattedLines = lines.map((line, i) => {
                        const cleanLine = line.replace(/^\d+[:：\.\s]+/, ''); // 清洗旧行号
                        if (cleanLine.trim() === "") return cleanLine; // 跳过空行
                        
                        const newLine = `${i + 1}. ${cleanLine}`;
                        if (newLine !== line) isChanged = true;
                        return newLine;
                    });

                    if (isChanged) {
                        textWidget.value = formattedLines.join('\n');
                        node.setDirtyCanvas(true, true);
                    }
                }
            }
            // =====================================================

            const nodes = app.graph._nodes || [];
            const activeLoopers = [];

            for (const n of nodes) {
                if (n.mode === 2 || n.mode === 4) continue; // Muted/Bypassed
                
                const isText = n.type === "PZ_Commander_Text";
                const isMix = n.type === "PZ_Commander";
                const isImg = n.type === "PZ_Commander_Image";
                
                if (!isText && !isMix && !isImg) continue;

                let isActive = false;
                
                if (isText) {
                    const out = n.outputs?.find(o => o.name === "final_prompt");
                    if (out && out.links?.length) isActive = true;
                    const promptMode = n.widgets?.find(w => w.name === "prompt_mode");
                    if (promptMode && promptMode.value.includes("Generator List")) isActive = false;
                }
                else if (isImg) {
                    const out = n.outputs?.find(o => o.name === "IMAGE");
                    if (out && out.links?.length) isActive = true;
                }
                else if (isMix) {
                    const outImg = n.outputs?.find(o => o.name === "IMAGE");
                    const outTxt = n.outputs?.find(o => o.name === "final_prompt");
                    const linkImg = outImg && outImg.links && outImg.links.length > 0;
                    const linkTxt = outTxt && outTxt.links && outTxt.links.length > 0;
                    if (linkImg || linkTxt) isActive = true;
                }

                if (isActive) activeLoopers.push(n);
            }

            if (activeLoopers.length > 1) {
                alert("❌ Conflict! Multiple PZ Loop nodes detected.");
                return;
            }

            let targetNode = activeLoopers[0];
            if (!targetNode) return await originalQueuePrompt.apply(this, arguments);

            let loopCount = 1;
            const getW = (name) => targetNode.widgets.find(w => w.name === name);
            const idxW = getW("start_index");
            
            if (!idxW) return await originalQueuePrompt.apply(this, arguments);

            // A. 纯文本
            if (targetNode.type === "PZ_Commander_Text") {
                const promptMode = getW("prompt_mode")?.value || "";
                const pTextW = getW("prompt_text");
                
                // 【核心防呆拦截：防止将 prompt_text 设为外部连线导致崩溃】
                if (promptMode.includes("Iterate") && !pTextW) {
                    alert("❌ PZ_Commander_Text 错误：\n在【Iterate (JS Loop)】模式下，不能将 prompt_text 设为外部连线输入！\n因为前端无法预知上游节点的文本行数。请右键节点将其转回文本框。");
                    return; // 直接中止，不让运行
                }

                const requestedCount = parseInt(getW("count")?.value || 1);
                const textVal = pTextW?.value || "";
                const splitMode = getW("split_mode")?.value || "Newline";
                const delim = getW("delimiter")?.value || ";";
                
                let lines = [];
                if (splitMode.includes("Custom") && delim) lines = textVal.split(delim).filter(x => x.trim());
                else lines = textVal.split("\n").filter(x => x.trim());
                
                if (lines.length === 0) loopCount = requestedCount;
                else {
                    const startIdx = parseInt(idxW.value || 0);
                    const remainingLines = Math.max(0, lines.length - startIdx);
                    loopCount = Math.min(requestedCount, remainingLines);
                    if (remainingLines === 0 && requestedCount > 0) loopCount = 0; 
                }
            } 
            // B. 混合/图片
            else {
                const src = getW("image_source")?.value || "";
                const forceCount = parseInt(getW("force_count")?.value || 1); // 读取新的 force_count

                if (src.includes("Upload")) {
                    const listStr = getW("image_list_data")?.value || "";
                    const list = listStr.split("\n").filter(x=>x.trim());
                    
                    // 逻辑修复：判断连接情况
                    const outImg = targetNode.outputs?.find(o => o.name === "IMAGE");
                    const linkImg = outImg && outImg.links && outImg.links.length > 0;
                    
                    if (list.length > 0) {
                        // 有图片，必须按图片数量走
                        loopCount = list.length;
                    } else {
                        // 没图片
                        if (linkImg) {
                            // 连了图片输出但没图片 -> 无法运行
                            loopCount = 0;
                            console.warn("PZ Loop: Upload mode selected, IMAGE output connected, but NO images uploaded.");
                        } else {
                            // 没连图片（只连了文本），且没图片 -> 使用 force_count 纯跑文本
                            loopCount = forceCount;
                            console.log("PZ Loop: Text-only loop mode (Upload empty). Using force_count:", loopCount);
                        }
                    }
                } else {
                    // Directory 模式：使用 force_count (用户手动指定)
                    // 原先逻辑是 directory 模式下 force_count 代表 image_count
                    loopCount = forceCount;
                }
            }

            if (loopCount <= 0) {
                console.log("[PZ Loop] Loop count is 0. Skipping.");
                return;
            }

            console.log(`[PZ Loop] Node: ${targetNode.type}, total tasks: ${loopCount}`);
            const originalStart = idxW.value;
            const startVal = parseInt(originalStart, 10);
            const prompts = [];

            try {
                // First freeze every iteration into its own prompt snapshot.
                for (let i = 0; i < loopCount; i++) {
                    idxW.value = startVal + i;
                    prompts.push(await app.graphToPrompt());
                }
            } finally {
                idxW.value = originalStart;
                targetNode.setDirtyCanvas(true, true);
            }

            console.log(`[PZ Loop] Submitting ${prompts.length} independent tasks`);

            // Send all requests immediately. The ComfyUI backend queue executes
            // these independent prompts one by one and emits each output separately.
            await Promise.all(prompts.map((prompt) => api.queuePrompt(0, prompt)));
            console.log(`[PZ Loop] All ${prompts.length} tasks submitted`);
        };
    }
});