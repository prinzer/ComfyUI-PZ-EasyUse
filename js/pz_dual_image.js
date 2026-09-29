import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "PZ_Dual_Image_Loader";
const MARKER_NODE_TYPE = "PZ_Listen_Marker";

let fileListCache = null;
async function fetchFileList() {
    if (fileListCache) return fileListCache;
    try {
        const response = await fetch(`/object_info/${NODE_TYPE}`);
        const data = await response.json();
        fileListCache = data[NODE_TYPE]?.input?.required?.image_1?.[0] || [];
    } catch (error) {
        console.warn("[PZ Dual Image] Cannot load file list", error);
        fileListCache = [];
    }
    return fileListCache;
}

function viewUrl(filename) {
    return `/view?filename=${encodeURIComponent(filename)}&type=input&rand=${Math.random()}`;
}

// 新版前端（Vue 渲染）不再识别 type="HIDDEN"，必须同时设置 options.hidden
function hideWidget(widget) {
    if (!widget) return;
    widget.type = "hidden";
    widget.hidden = true;
    widget.options = widget.options || {};
    try {
        Object.defineProperty(widget.options, "hidden", {
            get: () => true,
            set: () => {},
            configurable: true,
        });
    } catch (error) {
        widget.options.hidden = true;
    }
    if (typeof widget.draw === "function") widget.draw = () => {};
    widget.computeSize = () => [0, -4];
    if (widget.element) {
        widget.element.style.display = "none";
        widget.element.hidden = true;
    }
}

app.registerExtension({
    name: "PZ.DualImage",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        // 新版前端内置扩展 Comfy.UploadImage 会为 image_upload 输入自动注入
        // 一个 name="upload" 的 IMAGEUPLOAD 控件（顶部“选择上传按钮 + 图片选择行”），
        // 这里直接移除，改用节点内部的自定义界面
        const required = nodeData.input?.required;
        if (required && required.upload) delete required.upload;
        const optional = nodeData.input?.optional;
        if (optional && optional.upload) delete optional.upload;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            const node = this;
            node.setSize?.([520, 560]);

            const widget1 = node.widgets?.find((w) => w.name === "image_1");
            const widget2 = node.widgets?.find((w) => w.name === "image_2");
            const selectWidget = node.widgets?.find((w) => w.name === "output_select");
            const prompt1Widget = node.widgets?.find((w) => w.name === "prompt_1");
            const prompt2Widget = node.widgets?.find((w) => w.name === "prompt_2");
            const editTargetWidget = node.widgets?.find((w) => w.name === "edit_target");
            const listenSourceWidget = node.widgets?.find((w) => w.name === "listen_source");

            const container = document.createElement("div");
            container.style.cssText = "display:flex;flex-direction:column;gap:6px;width:calc(100% - 12px);height:100%;margin:0 6px;padding:4px 0;box-sizing:border-box;overflow:hidden;";

            const style = document.createElement("style");
            style.textContent = `.pz-di-box { display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;gap:5px;padding:6px;border:1px solid var(--border-color);border-radius:6px;box-sizing:border-box; } .pz-di-box.pz-di-active { border-color:#e8a33d; } .pz-di-box.pz-di-editing { box-shadow:inset 0 0 0 1px #e8a33d; } .pz-di-header { display:flex;align-items:center;justify-content:space-between;gap:4px;font-size:11px;font-weight:600;color:var(--fg-color); } .pz-di-badge { font-size:10px;font-weight:normal;color:var(--desc-text);padding:1px 6px;border:1px solid var(--border-color);border-radius:8px;white-space:nowrap; } .pz-di-badge.pz-di-linked { color:#35a66f;border-color:#35a66f; } .pz-di-wrap { position:relative;flex:1;min-height:0;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);overflow:hidden;cursor:pointer; } .pz-di-preview { width:100%;height:100%;object-fit:contain;display:block; } .pz-di-placeholder { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--desc-text);pointer-events:none;text-align:center;padding:4px;box-sizing:border-box; } .pz-di-select { width:100%;padding:5px 6px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box;cursor:pointer; } .pz-di-text { width:100%;flex:0 0 64px;min-height:0;box-sizing:border-box;resize:none;padding:5px 6px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;line-height:1.35; } .pz-di-targetrow { display:flex;align-items:center;gap:5px;flex:0 0 auto; } .pz-di-targetrow > span { font-size:11px;font-weight:600;color:var(--fg-color);margin-right:2px;white-space:nowrap; } .pz-di-target { flex:0 0 auto;padding:4px 8px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;line-height:1.2;cursor:pointer;white-space:nowrap; } .pz-di-target.pz-di-target-on { border-color:#e8a33d;color:#e8a33d; } .pz-di-uploadrow { display:flex;align-items:center;gap:8px;flex:0 0 auto; } .pz-di-upload { flex:1;min-width:0;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;line-height:1.2;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; } .pz-di-upload:hover:not(:disabled) { border-color:#6ea8fe; } .pz-di-upload:disabled { opacity:.45;cursor:default; } .pz-di-boxesrow { display:flex;gap:8px;flex:1;min-height:0; } .pz-di-roundrow { display:flex;align-items:center;justify-content:space-between;gap:8px;flex:0 0 auto;padding-top:2px; } .pz-di-roundgroup { display:flex;align-items:center;gap:5px;flex:0 0 auto; } .pz-di-listenrow { display:flex;align-items:center;gap:4px;flex:1;min-width:0; } .pz-di-listenlabel { font-size:10px;color:var(--desc-text);white-space:nowrap; } .pz-di-listen { flex:1;min-width:0;padding:3px 4px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:10px;line-height:1.2;box-sizing:border-box;cursor:pointer; } .pz-di-listen:disabled { opacity:.6;cursor:default; } .pz-di-sub { flex:0 0 auto;font-size:10px;color:var(--desc-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%; } .pz-di-note { flex:0 0 auto;font-size:10px;line-height:1.35;color:var(--desc-text);padding-top:1px;overflow:hidden; } .pz-di-progressrow { display:flex;align-items:center;gap:6px;flex:0 0 auto;padding-top:2px; } .pz-di-progress { flex:1;min-width:0;height:7px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);overflow:hidden;box-sizing:border-box; } .pz-di-progressfill { width:0%;height:100%;background:#6ea8fe;transition:width .12s linear; } .pz-di-progresstext { flex:0 1 auto;max-width:52%;min-width:32px;text-align:right;font-size:10px;color:var(--desc-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; } .pz-di-timer { flex:0 0 auto;font-size:10px;color:var(--desc-text);white-space:nowrap; } .pz-di-round { padding:4px 9px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;line-height:1.2;cursor:pointer;white-space:nowrap; } .pz-di-round:hover:not(:disabled) { border-color:#6ea8fe; } .pz-di-round:disabled { opacity:.45;cursor:default; } .pz-di-roundlabel { font-size:10px;color:var(--desc-text);white-space:nowrap; } .pz-di-run { padding:4px 12px;border:1px solid #35a66f;border-radius:6px;background:#35a66f;color:#fff;font:inherit;font-size:11px;font-weight:600;line-height:1.2;cursor:pointer;white-space:nowrap; } .pz-di-run:hover { filter:brightness(1.08); } .pz-di-run:active { filter:brightness(.92); }`;
            container.appendChild(style);

            // 顶部：两个“选择上传图片”按钮
            const uploadRow = document.createElement("div");
            uploadRow.className = "pz-di-uploadrow";
            const uploadButtons = [1, 2].map((slotNumber) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "pz-di-upload";
                button.textContent = `⬆ 选择上传图${slotNumber} / Upload ${slotNumber}`;
                button.title = `为图${slotNumber}选择并上传图片 / Choose & upload image ${slotNumber}`;
                return button;
            });
            uploadRow.append(uploadButtons[0], uploadButtons[1]);

            // “编辑图*”按钮：放到各自的文本行（提示词输入框）下面
            const targetButtons = [1, 2].map((slotNumber) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "pz-di-target";
                button.textContent = `编辑图${slotNumber} / Edit Image ${slotNumber}`;
                button.title = `把图${slotNumber}设为编辑目标 / Set image ${slotNumber} as edit target`;
                return button;
            });
            const boxesRow = document.createElement("div");
            boxesRow.className = "pz-di-boxesrow";

            // 底部一行：左侧“监听节点”下拉，右侧“上一轮 / 下一轮 / 运行”
            const roundRow = document.createElement("div");
            roundRow.className = "pz-di-roundrow";

            const listenWrap = document.createElement("div");
            listenWrap.className = "pz-di-listenrow";
            const listenTitle = document.createElement("span");
            listenTitle.className = "pz-di-listenlabel";
            listenTitle.textContent = "监听";
            const listenSelect = document.createElement("select");
            listenSelect.className = "pz-di-listen";
            listenSelect.title = "选择要监听的节点（所有保存图片 / 监听标记节点）/ Node to listen";
            listenWrap.append(listenTitle, listenSelect);

            const restWrap = document.createElement("div");
            restWrap.className = "pz-di-roundgroup";
            const prevRoundButton = document.createElement("button");
            prevRoundButton.type = "button";
            prevRoundButton.className = "pz-di-round";
            prevRoundButton.textContent = "◀ 上一轮";
            prevRoundButton.title = "载入上一轮编辑的图片 / Previous round";
            const roundLabel = document.createElement("span");
            roundLabel.className = "pz-di-roundlabel";
            roundLabel.textContent = "无轮次";
            const nextRoundButton = document.createElement("button");
            nextRoundButton.type = "button";
            nextRoundButton.className = "pz-di-round";
            nextRoundButton.textContent = "下一轮 ▶";
            nextRoundButton.title = "载入下一轮编辑的图片 / Next round";
            const runButton = document.createElement("button");
            runButton.type = "button";
            runButton.className = "pz-di-run";
            runButton.textContent = "▶ 运行";
            runButton.title = "等同于工具栏的运行 / Run (Queue Prompt)";
            restWrap.append(prevRoundButton, roundLabel, nextRoundButton, runButton);
            roundRow.append(listenWrap, restWrap);

            // 进度条行（跟随 ComfyUI 本次任务的进度）
            const progressRow = document.createElement("div");
            progressRow.className = "pz-di-progressrow";
            const progressBar = document.createElement("div");
            progressBar.className = "pz-di-progress";
            const progressFill = document.createElement("div");
            progressFill.className = "pz-di-progressfill";
            progressBar.appendChild(progressFill);
            const progressText = document.createElement("span");
            progressText.className = "pz-di-progresstext";
            progressText.textContent = "空闲";
            const timerText = document.createElement("span");
            timerText.className = "pz-di-timer";
            timerText.textContent = "用时：00:00";
            progressRow.append(progressBar, progressText, timerText);

            const noteRow = document.createElement("div");
            noteRow.className = "pz-di-note";
            noteRow.textContent = " PS:结果图会在完成图片生成后自动显示在图2区域。";

            container.append(uploadRow, boxesRow, roundRow, progressRow, noteRow);

            const layout = node.addDOMWidget("pz_dual_image_layout", "dualimage", container);
            layout.computeSize = () => [Math.max(400, node.size[0] - 12), 1];

            // 顶部原生的“上传按钮 + 图片选择下拉”全部隐藏，只保留自定义界面
            const hiddenWidgets = [
                widget1,
                widget2,
                prompt1Widget,
                prompt2Widget,
                editTargetWidget,
                listenSourceWidget, // 改用节点内的“监听”下拉
                node.widgets?.find((w) => w.name === "upload"),
            ];
            const applyHiddenWidgets = () => hiddenWidgets.forEach(hideWidget);
            applyHiddenWidgets();
            setTimeout(applyHiddenWidgets, 0);

            const slots = [1, 2].map((slotNumber) => {
                const box = document.createElement("div");
                box.className = "pz-di-box";
                const header = document.createElement("div");
                header.className = "pz-di-header";
                const label = document.createElement("span");
                label.textContent = `图片 ${slotNumber} / Image ${slotNumber}`;
                const badge = document.createElement("span");
                badge.className = "pz-di-badge";
                badge.textContent = "文件 / File";
                header.append(label, badge);
                // 标题下方显示“当前编辑图：xxx.png”
                const subtitle = document.createElement("div");
                subtitle.className = "pz-di-sub";
                subtitle.textContent = "当前编辑图：未选择";
                const wrap = document.createElement("div");
                wrap.className = "pz-di-wrap";
                const preview = document.createElement("img");
                preview.className = "pz-di-preview";
                preview.alt = "";
                const placeholder = document.createElement("div");
                placeholder.className = "pz-di-placeholder";
                placeholder.textContent = "点击选择图片 / Click to select";
                wrap.append(preview, placeholder);
                const fileSelect = document.createElement("select");
                fileSelect.className = "pz-di-select";
                fileSelect.style.display = "none"; // 隐藏“图1 / 图2”的下拉选择行
                const fileInput = document.createElement("input");
                fileInput.type = "file";
                fileInput.accept = "image/*";
                fileInput.style.display = "none";
                const textarea = document.createElement("textarea");
                textarea.className = "pz-di-text";
                textarea.placeholder = `编辑指令 ${slotNumber} / Edit prompt ${slotNumber}`;
                textarea.value = (slotNumber === 1 ? prompt1Widget : prompt2Widget)?.value || "";
                const children = [header, subtitle, wrap, fileSelect, textarea, targetButtons[slotNumber - 1], fileInput];
                box.append(...children);
                boxesRow.appendChild(box);
                return { slotNumber, box, badge, wrap, preview, placeholder, fileSelect, fileInput, textarea, subtitle };
            });

            const widgetFor = (slotNumber) => (slotNumber === 1 ? widget1 : widget2);
            const isLinked = (slotNumber) => Boolean(node.inputs?.find((item) => item.name === `input_image_${slotNumber}`)?.link);

            // CSS 里 .pz-di-placeholder 是 display:flex，会覆盖 hidden 属性，必须用 style.display 控制
            const setPlaceholder = (slot, visible, text) => {
                if (text !== undefined) slot.placeholder.textContent = text;
                slot.placeholder.style.display = visible ? "flex" : "none";
            };
            slots.forEach((slot) => {
                slot.preview.addEventListener("load", () => setPlaceholder(slot, false));
                slot.preview.addEventListener("error", () => {
                    if (slot.preview.getAttribute("src")) setPlaceholder(slot, true);
                });
            });

            // 工作流加载后把控件值同步回自定义输入框（刷新后文本“丢失/不可见”的修复）
            const syncPromptTexts = () => {
                slots.forEach((slot) => {
                    const widget = slot.slotNumber === 1 ? prompt1Widget : prompt2Widget;
                    const value = widget?.value ?? "";
                    if (slot.textarea.value !== value) slot.textarea.value = value;
                });
            };

            const populateSelects = () => {
                slots.forEach((slot) => {
                    const current = widgetFor(slot.slotNumber)?.value;
                    slot.fileSelect.innerHTML = "";
                    (fileListCache || []).forEach((name) => {
                        const option = document.createElement("option");
                        option.value = name;
                        option.textContent = name;
                        slot.fileSelect.appendChild(option);
                    });
                    if (current && fileListCache?.includes(current)) slot.fileSelect.value = current;
                });
            };

            // 标题下方显示“当前编辑图：xxx.png”
            const refreshSubtitle = (slot) => {
                if (!slot.subtitle) return;
                const linked = isLinked(slot.slotNumber);
                const value = widgetFor(slot.slotNumber)?.value || "";
                slot.subtitle.textContent = linked ? "当前编辑图：接入上游 / Linked" : `当前编辑图：${value || "未选择"}`;
                slot.subtitle.title = slot.subtitle.textContent;
            };

            const refreshFilePreview = (slot) => {
                refreshSubtitle(slot);
                if (isLinked(slot.slotNumber)) return;
                const value = widgetFor(slot.slotNumber)?.value;
                if (value) {
                    slot.preview.src = viewUrl(value);
                    setPlaceholder(slot, false);
                } else {
                    slot.preview.removeAttribute("src");
                    setPlaceholder(slot, true);
                }
            };

            const refreshSlotState = (slot) => {
                const linked = isLinked(slot.slotNumber);
                refreshSubtitle(slot);
                slot.badge.textContent = linked ? "接入 / Linked" : "文件 / File";
                slot.badge.classList.toggle("pz-di-linked", linked);
                slot.fileSelect.disabled = linked;
                const uploadButton = uploadButtons[slot.slotNumber - 1];
                if (uploadButton) {
                    uploadButton.disabled = linked;
                    uploadButton.title = linked
                        ? `图${slot.slotNumber}已接入上游链接，无需上传 / Linked`
                        : `为图${slot.slotNumber}选择并上传图片 / Choose & upload image ${slot.slotNumber}`;
                }
                if (linked) {
                    slot.preview.removeAttribute("src");
                    setPlaceholder(slot, true, "等待执行显示 / Run to preview");
                } else {
                    setPlaceholder(slot, true, "点击选择图片 / Click to select");
                    refreshFilePreview(slot);
                }
            };

            const refreshHighlight = () => {
                const value = selectWidget?.value;
                slots.forEach((slot) => {
                    slot.box.classList.toggle("pz-di-active", value === "Both (batch)" || value === `Image ${slot.slotNumber}`);
                });
            };

            const refreshTarget = () => {
                const value = editTargetWidget?.value || "Image 1";
                targetButtons.forEach((button, index) => {
                    button.classList.toggle("pz-di-target-on", value === `Image ${index + 1}`);
                });
                slots.forEach((slot) => {
                    slot.box.classList.toggle("pz-di-editing", value === `Image ${slot.slotNumber}`);
                });
            };

            // ===== 轮次历史：每次上传/自动导入的图都记为一轮，可前后翻 =====
            node.properties = node.properties || {};
            const roundsList = () => {
                if (!Array.isArray(node.properties.pz_rounds)) node.properties.pz_rounds = [];
                return node.properties.pz_rounds;
            };
            const roundIndex = () => {
                const list = roundsList();
                if (!list.length) return -1;
                let index = Number(node.properties.pz_round_index);
                if (!Number.isFinite(index)) index = list.length - 1;
                return Math.min(Math.max(index, 0), list.length - 1);
            };
            const refreshRoundButtons = () => {
                const list = roundsList();
                const index = roundIndex();
                prevRoundButton.disabled = index <= 0;
                nextRoundButton.disabled = index < 0 || index >= list.length - 1;
                roundLabel.textContent = list.length ? `第 ${index + 1} / ${list.length} 轮` : "无轮次";
            };
            const pushRound = (name) => {
                if (!name) return;
                const list = roundsList();
                if (list[list.length - 1] !== name) {
                    list.push(name);
                    while (list.length > 60) list.shift();
                }
                node.properties.pz_round_index = list.length - 1;
                refreshRoundButtons();
            };
            const applyRound = (index) => {
                const list = roundsList();
                if (!list.length) return;
                const safe = Math.min(Math.max(index, 0), list.length - 1);
                node.properties.pz_round_index = safe;
                const target = editTargetWidget?.value === "Image 2" ? 2 : 1;
                const slot = slots[target - 1];
                if (!isLinked(slot.slotNumber)) {
                    const widget = widgetFor(slot.slotNumber);
                    if (widget) {
                        widget.value = list[safe];
                        widget.callback?.call(widget, list[safe]);
                    }
                    refreshFilePreview(slot);
                }
                refreshRoundButtons();
            };
            prevRoundButton.addEventListener("click", () => applyRound(roundIndex() - 1));
            nextRoundButton.addEventListener("click", () => applyRound(roundIndex() + 1));
            runButton.addEventListener("click", () => {
                const run = async () => {
                    try {
                        if (typeof app.queuePrompt === "function") return await app.queuePrompt(0, 1);
                        const command = app.extensionManager?.command;
                        if (typeof command?.execute === "function") return await command.execute("Comfy.QueuePrompt");
                    } catch (error) {
                        console.warn("[PZ Dual Image] Run failed", error);
                    }
                };
                run();
            });
            refreshRoundButtons();

            // ===== 监听节点下拉：列出工作流里所有“保存图片”和“监听标记”节点 =====
            // 保存类节点不只 SaveImage：还可能是 PZ_Save_Image / SaveImageWithMetadata 等，
            // 这里按“类型名含 save 且有 IMAGE 输入”来识别
            const isSaveLikeNode = (item) => {
                if (!item || item.type === MARKER_NODE_TYPE) return false;
                if (!/save/i.test(item.type || "")) return false;
                return (item.inputs || []).some((slot) => String(slot.type).toUpperCase() === "IMAGE");
            };
            // 被“忽略 / Bypass”(mode=2) 和“禁用 / Mute”(mode=4) 的节点不会执行，不列入下拉
            const isActiveNode = (item) => {
                const mode = Number(item?.mode);
                return !Number.isFinite(mode) || mode === 0;
            };
            const listenOptions = () => {
                let markerSeq = 0;
                return (app.graph?._nodes || [])
                    .filter((item) => item && isActiveNode(item) && (item.type === MARKER_NODE_TYPE || isSaveLikeNode(item)))
                    .map((item) => {
                        if (item.type === MARKER_NODE_TYPE) {
                            markerSeq += 1;
                            const stored = Number(item.properties?.pz_marker_index);
                            const seq = Number.isFinite(stored) && stored > 0 ? stored : markerSeq;
                            return { id: String(item.id), type: item.type, label: `结果图触发标记 ${seq} · #${item.id}` };
                        }
                        return { id: String(item.id), type: item.type, label: `保存图片 #${item.id}${item.title ? ` · ${item.title}` : ""}` };
                    });
            };
            const defaultListenId = () => {
                const options = listenOptions();
                const saves = options.filter((item) => item.type !== MARKER_NODE_TYPE);
                if (saves.length) return saves[saves.length - 1].id; // 默认：最后一个保存图片节点
                return options.length ? options[options.length - 1].id : "";
            };
            const currentListenId = () => {
                const options = listenOptions();
                const saved = node.properties?.pz_listen_node;
                if (saved && options.some((item) => item.id === String(saved))) return String(saved);
                const fallback = defaultListenId();
                if (fallback) node.properties.pz_listen_node = fallback;
                return fallback;
            };
            const refreshListenSelect = () => {
                const options = listenOptions();
                const current = currentListenId();
                listenSelect.innerHTML = "";
                if (!options.length) {
                    const empty = document.createElement("option");
                    empty.value = "";
                    empty.textContent = "无保存图片/标记节点";
                    listenSelect.appendChild(empty);
                    listenSelect.disabled = true;
                    return;
                }
                listenSelect.disabled = false;
                options.forEach((item) => {
                    const option = document.createElement("option");
                    option.value = item.id;
                    option.textContent = item.label;
                    listenSelect.appendChild(option);
                });
                listenSelect.value = current;
            };
            listenSelect.addEventListener("mousedown", refreshListenSelect);
            listenSelect.addEventListener("focus", refreshListenSelect);
            listenSelect.addEventListener("change", () => {
                node.properties.pz_listen_node = listenSelect.value;
            });

            const uploadFile = async (slot, file) => {
                const body = new FormData();
                body.append("image", file, file.name);
                body.append("overwrite", "true");
                const response = await fetch("/upload/image", { method: "POST", body });
                if (!response.ok) throw new Error(await response.text());
                const data = await response.json();
                const name = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
                if (!fileListCache.includes(name)) fileListCache.push(name);
                populateSelects();
                const widget = widgetFor(slot.slotNumber);
                if (widget) {
                    widget.value = name;
                    widget.callback?.call(widget, name);
                }
                pushRound(name);
                refreshFilePreview(slot);
            };

            slots.forEach((slot) => {
                slot.wrap.addEventListener("click", () => {
                    if (!isLinked(slot.slotNumber)) slot.fileInput.click();
                });
                slot.fileInput.addEventListener("change", () => {
                    const file = slot.fileInput.files?.[0];
                    slot.fileInput.value = "";
                    if (file) uploadFile(slot, file).catch((error) => console.warn("[PZ Dual Image] Upload failed", error));
                });
                slot.fileSelect.addEventListener("change", () => {
                    const widget = widgetFor(slot.slotNumber);
                    if (widget) {
                        widget.value = slot.fileSelect.value;
                        widget.callback?.call(widget, slot.fileSelect.value);
                    }
                    pushRound(slot.fileSelect.value);
                    refreshFilePreview(slot);
                });
                slot.textarea.addEventListener("input", () => {
                    const widget = slot.slotNumber === 1 ? prompt1Widget : prompt2Widget;
                    if (widget) {
                        widget.value = slot.textarea.value;
                        widget.callback?.call(widget, slot.textarea.value);
                    }
                });
            });

            uploadButtons.forEach((button, index) => {
                button.addEventListener("click", () => {
                    const slot = slots[index];
                    if (!slot || isLinked(slot.slotNumber)) return;
                    slot.fileInput.click();
                });
            });

            targetButtons.forEach((button, index) => {
                button.addEventListener("click", () => {
                    if (!editTargetWidget) return;
                    const value = `Image ${index + 1}`;
                    editTargetWidget.value = value;
                    editTargetWidget.callback?.call(editTargetWidget, value);
                    if (selectWidget && selectWidget.value !== value) {
                        selectWidget.value = value;
                        selectWidget.callback?.call(selectWidget, value);
                    }
                    refreshTarget();
                });
            });

            [widget1, widget2].forEach((widget, index) => {
                if (!widget) return;
                const originalCallback = widget.callback;
                widget.callback = function (value) {
                    originalCallback?.call(this, value);
                    refreshFilePreview(slots[index]);
                };
            });

            if (selectWidget) {
                const originalCallback = selectWidget.callback;
                selectWidget.callback = function (value) {
                    originalCallback?.call(this, value);
                    refreshHighlight();
                };
            }

            if (editTargetWidget) {
                const originalCallback = editTargetWidget.callback;
                editTargetWidget.callback = function (value) {
                    originalCallback?.call(this, value);
                    refreshTarget();
                };
            }

            const originalConnectionsChange = node.onConnectionsChange;
            node.onConnectionsChange = function (...args) {
                const changed = originalConnectionsChange?.apply(this, args);
                slots.forEach(refreshSlotState);
                return changed;
            };

            // ===== 进度条：跟随 ComfyUI 本次任务进度 =====
            let idleTimer = null;
            let currentNodeId = "";
            const setProgress = (ratio, label) => {
                const pct = Math.round(Math.min(Math.max(ratio || 0, 0), 1) * 100);
                progressFill.style.width = `${pct}%`;
                // 优先显示节点名字，取不到就退回节点号
                const running = currentNodeId ? app.graph?.getNodeById?.(currentNodeId) : null;
                const nodeName = running?.title || currentNodeId || "";
                progressText.textContent = label ?? (nodeName ? `节点 ${nodeName}：${pct}%` : `${pct}%`);
            };
            const setIdle = () => {
                currentNodeId = "";
                progressFill.style.width = "0%";
                progressText.textContent = "空闲";
            };
            // executing 事件带的是当前正在执行的节点 id
            const onExecuting = (event) => {
                currentNodeId = event.detail == null ? "" : String(event.detail);
            };
            api.addEventListener("executing", onExecuting);

            // 用时计时：从执行开始到本次任务结束
            let timerId = null;
            let startedAt = 0;
            const formatDuration = (ms) => {
                const total = Math.max(0, Math.round(ms / 1000));
                const hours = Math.floor(total / 3600);
                const minutes = Math.floor((total % 3600) / 60);
                const seconds = total % 60;
                const pad = (value) => String(value).padStart(2, "0");
                return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
            };
            const renderTimer = () => {
                timerText.textContent = `用时：${formatDuration(startedAt ? Date.now() - startedAt : 0)}`;
            };
            const stopTimer = () => {
                if (timerId) {
                    clearInterval(timerId);
                    timerId = null;
                }
                if (startedAt) renderTimer();
            };
            const startTimer = () => {
                stopTimer();
                startedAt = Date.now();
                renderTimer();
                timerId = setInterval(renderTimer, 500);
            };
            const onProgress = (event) => {
                const detail = event.detail || {};
                const max = Number(detail.max) || 0;
                if (!max) return;
                setProgress((Number(detail.value) || 0) / max);
            };
            // 新版前端主要发 progress_state（各节点进度），这里汇总成整体进度
            const onProgressState = (event) => {
                const nodes = event.detail?.nodes || {};
                let value = 0;
                let max = 0;
                Object.values(nodes).forEach((item) => {
                    value += Number(item?.value) || 0;
                    max += Number(item?.max) || 0;
                });
                if (max > 0) setProgress(value / max);
            };
            api.addEventListener("progress", onProgress);
            api.addEventListener("progress_state", onProgressState);

            let pendingResultImages = [];
            const onExecutionStart = () => {
                pendingResultImages = [];
                refreshListenSelect();
                if (idleTimer) clearTimeout(idleTimer);
                currentNodeId = "";
                setProgress(0);
                startTimer();
            };
            const onExecuted = (event) => {
                const images = event.detail?.output?.images;
                if (Array.isArray(images)) {
                    const listenId = currentListenId();
                    if (listenId) {
                        // 只导入“监听”下拉选中那个节点输出的图片
                        if (String(event.detail?.node) === listenId) pendingResultImages = images.slice();
                    } else {
                        pendingResultImages.push(...images);
                    }
                }
                if (String(event.detail?.node) !== String(node.id)) return;
                slots.forEach((slot) => {
                    if (!isLinked(slot.slotNumber)) return;
                    slot.preview.src = `/pz_easyuse/dual-image-preview?node=${node.id}&slot=${slot.slotNumber}&rand=${Math.random()}`;
                    setPlaceholder(slot, false);
                });
            };
            const onExecutionSuccess = () => {
                const ref = pendingResultImages[pendingResultImages.length - 1];
                pendingResultImages = [];
                setProgress(1, "完成");
                stopTimer();
                if (idleTimer) clearTimeout(idleTimer);
                idleTimer = setTimeout(setIdle, 1500);
                if (!ref || isLinked(2)) return;
                const url = `/view?filename=${encodeURIComponent(ref.filename)}&subfolder=${encodeURIComponent(ref.subfolder || "")}&type=${encodeURIComponent(ref.type || "output")}&rand=${Math.random()}`;
                fetch(url)
                    .then((response) => (response.ok ? response.blob() : null))
                    .then((blob) => {
                        if (!blob) return;
                        return uploadFile(slots[1], new File([blob], ref.filename, { type: blob.type || "image/png" }));
                    })
                    .catch((error) => console.warn("[PZ Dual Image] Cannot import result image", error));
            };
            api.addEventListener("execution_start", onExecutionStart);
            api.addEventListener("executed", onExecuted);
            api.addEventListener("execution_success", onExecutionSuccess);
            // 出错 / 被中断时也要停表
            const stopOnFailure = () => stopTimer();
            api.addEventListener("execution_error", stopOnFailure);
            api.addEventListener("execution_interrupted", stopOnFailure);
            const originalRemoved = node.onRemoved;
            node.onRemoved = function () {
                api.removeEventListener("execution_start", onExecutionStart);
                api.removeEventListener("executed", onExecuted);
                api.removeEventListener("execution_success", onExecutionSuccess);
                api.removeEventListener("progress", onProgress);
                api.removeEventListener("progress_state", onProgressState);
                api.removeEventListener("executing", onExecuting);
                api.removeEventListener("execution_error", stopOnFailure);
                api.removeEventListener("execution_interrupted", stopOnFailure);
                stopTimer();
                if (idleTimer) clearTimeout(idleTimer);
                return originalRemoved?.apply(this, arguments);
            };

            let autoFitDone = false;
            const autoFitDeadline = Date.now() + 8000;
            const syncHeight = () => {
                const top = Number(layout.last_y);
                container.style.height = Number.isFinite(top) && top > 0 ? `${Math.max(120, node.size[1] - top - 10)}px` : "280px";
            };
            // 新建节点时按内容把节点撑高，避免自定义界面被节点底部裁掉。
            // 内容可能还没布局完（首次测量偏小），所以 8 秒内会持续重试，直到“内容放得下”或超时
            const autoFitHeight = () => {
                if (autoFitDone) return syncHeight();
                const top = Number(layout.last_y);
                if (!Number.isFinite(top) || top <= 0) return;
                const previous = container.style.height;
                container.style.height = "auto";
                const needed = container.scrollHeight || 0;
                container.style.height = previous;
                if (!needed) return;
                const required = top + needed + 12;
                if (required > node.size[1]) {
                    node.setSize([node.size[0], Math.ceil(required)]);
                    autoFitDone = true;
                } else if (Date.now() > autoFitDeadline) {
                    autoFitDone = true; // 超时就不再折腾，交给手动缩放
                }
                syncHeight();
            };
            const originalResize = node.onResize;
            node.onResize = function (size) {
                originalResize?.apply(this, arguments);
                syncHeight();
            };
            // 尺寸或 DOM 控件位置一变就重算高度：新建 / 载入工作流 / 手动缩放都能对齐
            let lastSyncKey = "";
            const originalDrawForeground = node.onDrawForeground;
            node.onDrawForeground = function (...args) {
                const key = `${node.size[0]}x${node.size[1]}:${Number(layout.last_y) || 0}`;
                if (key !== lastSyncKey) {
                    lastSyncKey = key;
                    syncHeight();
                }
                // 首次拿到 last_y 之前自适应不会生效，这里补一次，避免界面被裁掉
                if (!autoFitDone) autoFitHeight();
                return originalDrawForeground?.apply(this, args);
            };

            // 加载工作流时，控件值是在 configure 阶段才写入的，这里再同步一次界面
            let wasConfigured = false;
            const originalConfigure = node.onConfigure;
            node.onConfigure = function (...args) {
                const configured = originalConfigure?.apply(this, args);
                wasConfigured = true;
                slots.forEach(refreshSlotState);
                syncPromptTexts();
                refreshHighlight();
                refreshTarget();
                refreshRoundButtons();
                refreshListenSelect();
                syncHeight();
                return configured;
            };

            fetchFileList().then(() => {
                populateSelects();
                slots.forEach(refreshSlotState);
                refreshHighlight();
                refreshTarget();
                syncPromptTexts();
                refreshListenSelect();
                if (!roundsList().length) pushRound(widget1?.value || widget2?.value);
            });

            setTimeout(() => {
                applyHiddenWidgets(); // 前端 widget store 同步后再补一次，防止重新显示
                syncPromptTexts();
                refreshRoundButtons();
                refreshListenSelect();
                autoFitHeight(); // 只在内容放不下时才把节点撑高，已够大就保持原尺寸
                node.setDirtyCanvas?.(true, true);
            }, 100);
            return result;
        };
    },
});

// 给“监听标记”节点本身编号：节点标题显示成 “🎯 监听标记 1 / 2 / 3 …”，便于在下拉里区分
app.registerExtension({
    name: "PZ.ListenMarker",

    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== MARKER_NODE_TYPE) return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            const node = this;

            const applyIndex = () => {
                node.properties = node.properties || {};
                let index = Number(node.properties.pz_marker_index);
                if (!Number.isFinite(index) || index <= 0) {
                    const used = (app.graph?._nodes || [])
                        .map((item) => Number(item.properties?.pz_marker_index))
                        .filter((item) => Number.isFinite(item) && item > 0);
                    index = used.length ? Math.max(...used) + 1 : 1;
                    node.properties.pz_marker_index = index;
                }
                // 还是默认标题（含“监听标记 / 触发标记”）就换成带序号的标题，用户自定义标题不覆盖
                if (!node.title || node.title.includes("监听标记") || node.title.includes("触发标记")) {
                    node.title = `🎯 结果图触发标记 ${index}`;
                }
                return index;
            };
            applyIndex();

            const originalConfigure = node.onConfigure;
            node.onConfigure = function (...args) {
                const configured = originalConfigure?.apply(this, args);
                applyIndex();
                return configured;
            };
            return result;
        };
    },
});
