import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "PZ_Dual_Image_Loader";
const SINGLE_NODE_TYPE = "PZ_Single_Image_Loader";
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
        if (nodeData.name !== NODE_TYPE && nodeData.name !== SINGLE_NODE_TYPE) return;

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
            const IS_SINGLE = nodeData.name === SINGLE_NODE_TYPE;
            const slotNumbers = IS_SINGLE ? [1] : [1, 2];
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
            style.textContent = `.pz-di-box { display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;gap:5px;padding:6px;border:1px solid var(--border-color);border-radius:6px;box-sizing:border-box; } .pz-di-box.pz-di-active { border-color:#e8a33d; } .pz-di-box.pz-di-editing { box-shadow:inset 0 0 0 1px #e8a33d; } .pz-di-box.pz-di-dragover { border-color:#6ea8fe;box-shadow:0 0 0 2px rgba(110,168,254,.45); } .pz-di-header { display:flex;align-items:center;justify-content:space-between;gap:4px;font-size:11px;font-weight:600;color:var(--fg-color); } .pz-di-badge { font-size:10px;font-weight:normal;color:var(--desc-text);padding:1px 6px;border:1px solid var(--border-color);border-radius:8px;white-space:nowrap; } .pz-di-badge.pz-di-linked { color:#35a66f;border-color:#35a66f; } .pz-di-wrap { position:relative;flex:1;min-height:0;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);overflow:hidden;cursor:pointer; } .pz-di-preview { width:100%;height:100%;object-fit:contain;display:block; } .pz-di-placeholder { position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--desc-text);pointer-events:none;text-align:center;padding:4px;box-sizing:border-box; } .pz-di-select { width:100%;padding:5px 6px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box;cursor:pointer; } .pz-di-text { width:100%;flex:0 0 64px;min-height:0;box-sizing:border-box;resize:none;padding:5px 6px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;line-height:1.35; } .pz-di-targetrow { display:flex;align-items:center;gap:5px;flex:0 0 auto; } .pz-di-targetrow > span { font-size:11px;font-weight:600;color:var(--fg-color);margin-right:2px;white-space:nowrap; } .pz-di-target { flex:0 0 auto;padding:4px 8px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;line-height:1.2;cursor:pointer;white-space:nowrap; } .pz-di-target.pz-di-target-on { border-color:#e8a33d;color:#e8a33d; } .pz-di-uploadrow { display:flex;align-items:center;gap:8px;flex:0 0 auto; } .pz-di-upload { flex:1;min-width:0;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;line-height:1.2;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; } .pz-di-upload:hover:not(:disabled) { border-color:#6ea8fe; } .pz-di-upload:disabled { opacity:.45;cursor:default; } .pz-di-boxesrow { display:flex;gap:8px;flex:1;min-height:0; } .pz-di-roundrow { display:flex;align-items:center;justify-content:space-between;gap:8px;flex:0 0 auto;padding-top:2px; } .pz-di-roundgroup { display:flex;align-items:center;gap:5px;flex:0 0 auto; } .pz-di-listenrow { display:flex;align-items:center;gap:4px;flex:1;min-width:0; } .pz-di-listenlabel { font-size:10px;color:var(--desc-text);white-space:nowrap; } .pz-di-listen { flex:1;min-width:0;padding:3px 4px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:10px;line-height:1.2;box-sizing:border-box;cursor:pointer; } .pz-di-listen:disabled { opacity:.6;cursor:default; } .pz-di-sub { flex:0 0 auto;font-size:10px;color:var(--desc-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%; } .pz-di-note { flex:0 0 auto;font-size:10px;line-height:1.35;color:var(--desc-text);padding-top:1px;overflow:hidden; } .pz-di-progressrow { display:flex;align-items:center;gap:6px;flex:0 0 auto;padding-top:2px; } .pz-di-progress { flex:1;min-width:0;height:7px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);overflow:hidden;box-sizing:border-box; } .pz-di-progressfill { width:0%;height:100%;background:#6ea8fe;transition:width .12s linear; } .pz-di-progresstext { flex:0 1 auto;max-width:52%;min-width:32px;text-align:right;font-size:10px;color:var(--desc-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; } .pz-di-timer { flex:0 0 auto;font-size:10px;color:var(--desc-text);white-space:nowrap; } .pz-di-round { padding:4px 9px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;line-height:1.2;cursor:pointer;white-space:nowrap; } .pz-di-round:hover:not(:disabled) { border-color:#6ea8fe; } .pz-di-round:disabled { opacity:.45;cursor:default; } .pz-di-roundlabel { font-size:10px;color:var(--desc-text);white-space:nowrap; } .pz-di-run { padding:4px 12px;border:1px solid #35a66f;border-radius:6px;background:#35a66f;color:#fff;font:inherit;font-size:11px;font-weight:600;line-height:1.2;cursor:pointer;white-space:nowrap; } .pz-di-run:hover { filter:brightness(1.08); } .pz-di-run:active { filter:brightness(.92); }`;
            container.appendChild(style);
            style.textContent += " .pz-di-compare-btn.pz-di-active{border-color:#e8a33d;color:#e8a33d;}";

            // 顶部：两个“选择上传图片”按钮
            const uploadRow = document.createElement("div");
            uploadRow.className = "pz-di-uploadrow";
            const uploadButtons = slotNumbers.map((slotNumber) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "pz-di-upload";
                button.textContent = `⬆ 选择上传图${slotNumber} / Upload ${slotNumber}`;
                button.title = `为图${slotNumber}选择并上传图片 / Choose & upload image ${slotNumber}`;
                return button;
            });
            uploadRow.append(...uploadButtons.filter(Boolean));

            // “编辑图*”按钮：放到各自的文本行（提示词输入框）下面
            const targetButtons = slotNumbers.map((slotNumber) => {
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
            roundRow.style.cssText = "display:flex;align-items:center;gap:6px;";

            const listenWrap = document.createElement("div");
            listenWrap.style.cssText = "display:flex;align-items:center;gap:6px;";
            const listenTitle = document.createElement("span");
            listenTitle.textContent = "结果图源：";
            listenTitle.style.cssText = "font-size:12px;color:#cfd6e4;white-space:nowrap;";
            const listenSelect = document.createElement("select");
            listenSelect.className = "pz-di-listen-select single";
            listenSelect.style.cssText = "flex:1;min-width:0;font-size:12px;background:#23262e;color:#e6e9ef;border:1px solid #39414f;border-radius:6px;padding:2px 4px;";
            listenSelect.title = "选择要监听的节点（所有保存图片 / 监听标记节点）/ Node to listen";
            listenWrap.append(listenTitle, listenSelect);

            const restWrap = document.createElement("div");
            restWrap.className = "pz-di-roundgroup";
            restWrap.style.cssText = "flex:1;display:flex;justify-content:center;align-items:center;gap:6px;";
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

            // 单图版：加载图监听下拉（选择工作流中的图片加载节点，自动同步其第一张图作为编辑源）
            const loadListenWrap = document.createElement("div");
            loadListenWrap.style.cssText = "display:flex;align-items:center;gap:6px;";
            const loadListenLabel = document.createElement("span");
            loadListenLabel.textContent = "加载图源：";
            loadListenLabel.style.cssText = "font-size:12px;color:#cfd6e4;white-space:nowrap;";
            const loadListenSelect = document.createElement("select");
            loadListenSelect.className = "pz-di-listen-select single";
            loadListenSelect.style.cssText = "flex:1;min-width:0;font-size:12px;background:#23262e;color:#e6e9ef;border:1px solid #39414f;border-radius:6px;padding:2px 4px;";
            loadListenWrap.append(loadListenLabel, loadListenSelect);

            // 单图版：提示词源监听下拉（选择工作流中的提示词文本节点，同步其文本作为编辑提示词）
            const promptListenWrap = document.createElement("div");
            promptListenWrap.style.cssText = "display:flex;align-items:center;gap:6px;";
            const promptListenLabel = document.createElement("span");
            promptListenLabel.textContent = "提示词源：";
            promptListenLabel.style.cssText = "font-size:12px;color:#cfd6e4;white-space:nowrap;";
            const promptListenSelect = document.createElement("select");
            promptListenSelect.className = "pz-di-listen-select single";
            promptListenSelect.style.cssText = "flex:1;min-width:0;font-size:12px;background:#23262e;color:#e6e9ef;border:1px solid #39414f;border-radius:6px;padding:2px 4px;";
            promptListenWrap.append(promptListenLabel, promptListenSelect);

            roundRow.append(...(IS_SINGLE ? [restWrap] : [listenWrap, restWrap]));

            // —— 单图版“劫持”加载图片节点：监听即夺取其图作为编辑源，随加载节点 image 变化实时跟随 ——
            let hijackedWidget = null;
            let hijackSync = null;
            const detachHijack = () => {
                if (hijackedWidget && hijackSync && hijackedWidget.__pzHijackers) {
                    hijackedWidget.__pzHijackers.delete(hijackSync);
                }
                hijackedWidget = null;
                hijackSync = null;
            };
            const attachHijack = (loadId) => {
                if (!IS_SINGLE || !loadId) return;
                detachHijack();
                const loader = (app.graph?._nodes || []).find((n) => String(n.id) === loadId);
                const w = loader?.widgets?.find((x) => x.name === "image");
                if (!w) return;
                const syncFn = () => {
                    const img = w.value;
                    if (img) {
                        widget1.value = img;
                        widget1.callback?.call(widget1, img);
                        refreshFilePreview(slots[0]);
                    }
                };
                w.__pzHijackers = w.__pzHijackers || new Set();
                w.__pzHijackers.add(syncFn);
                if (!w.__pzHijackWrapped) {
                    w.__pzHijackOrig = w.callback;
                    w.callback = function (...args) {
                        const r = w.__pzHijackOrig?.apply(this, args);
                        (w.__pzHijackers || []).forEach((fn) => fn());
                        return r;
                    };
                    w.__pzHijackWrapped = true;
                }
                hijackedWidget = w;
                hijackSync = syncFn;
                syncFn(); // 立即同步一次（不连线、不执行即可用）
            };

            // —— 单图版“劫持”提示词文本节点：监听即夺取其文本作为编辑提示词，实时跟随 ——
            let hijackedPromptWidget = null;
            let hijackPromptSync = null;
            const detachPromptHijack = () => {
                if (hijackedPromptWidget && hijackPromptSync && hijackedPromptWidget.__pzPromptHijackers) {
                    hijackedPromptWidget.__pzPromptHijackers.delete(hijackPromptSync);
                }
                hijackedPromptWidget = null;
                hijackPromptSync = null;
            };
            const attachPromptHijack = (promptId) => {
                if (!IS_SINGLE || !promptId) return;
                detachPromptHijack();
                const src = (app.graph?._nodes || []).find((n) => String(n.id) === promptId);
                const w = findPromptTextWidget(src);
                if (!w) return;
                const pw = prompt1Widget;
                const syncFn = () => {
                    const txt = w.value;
                    if (typeof txt !== "string") return;
                    if (pw && pw.value !== txt) {
                        pw.value = txt;
                        pw.callback?.call(pw, txt);
                    }
                    // 同步到单图版可见的自定义提示词输入框
                    const ta = slots[0]?.textarea;
                    if (ta && ta.value !== txt) ta.value = txt;
                };
                w.__pzPromptHijackers = w.__pzPromptHijackers || new Set();
                w.__pzPromptHijackers.add(syncFn);
                if (!w.__pzPromptHijackWrapped) {
                    w.__pzPromptHijackOrig = w.callback;
                    w.callback = function (...args) {
                        const r = w.__pzPromptHijackOrig?.apply(this, args);
                        (w.__pzPromptHijackers || []).forEach((fn) => fn());
                        return r;
                    };
                    w.__pzPromptHijackWrapped = true;
                }
                hijackedPromptWidget = w;
                hijackPromptSync = syncFn;
                syncFn(); // 立即同步一次
            };

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
            noteRow.textContent = IS_SINGLE ? " PS:单图模式：运行后结果图会自动回显到上方预览区，可继续下一轮编辑。" : " PS:结果图在生成完成后自动回流到图2区域，可直接继续编辑。";

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

            const slots = slotNumbers.map((slotNumber) => {
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
                placeholder.textContent = "点击或拖拽图片 / Click or drop";
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
                const children = IS_SINGLE ? [header, subtitle, wrap, fileSelect] : [header, subtitle, wrap, fileSelect, textarea];
                if (!IS_SINGLE) children.push(targetButtons[slotNumber - 1]);
                children.push(fileInput);
                box.append(...children);
                boxesRow.appendChild(box);
                return { slotNumber, box, badge, wrap, preview, placeholder, fileSelect, fileInput, textarea, subtitle };
            });
            // 单图版：左侧“上一轮图”下方放三个加载源选择行；右侧“当前图”下方放提示词区，二者等高对齐
            if (IS_SINGLE) {
                const listenPanel = document.createElement("div");
                listenPanel.style.cssText = "display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;";
                listenPanel.append(loadListenWrap, promptListenWrap, listenWrap);
                const promptPanel = document.createElement("div");
                promptPanel.style.cssText = "flex:1;min-width:0;display:flex;";
                const ta = slots[0].textarea;
                ta.style.flex = "1";
                ta.style.minHeight = "0";
                ta.style.height = "100%";
                promptPanel.append(ta);
                const sourceRow = document.createElement("div");
                sourceRow.className = "pz-di-sourcerow";
                sourceRow.style.cssText = "display:flex;gap:8px;align-items:stretch;flex:0 0 auto;margin-top:4px;";
                sourceRow.append(listenPanel, promptPanel);
                container.insertBefore(sourceRow, roundRow);
            }

            // ===== 单图版对照模式：左侧并排显示“上一轮”，翻轮次时两图同步 =====
            // 初始默认对照模式：未在工作流里显式保存过 pz_compare 时（新建节点）默认开启对照；
            // 若用户曾手动“退出对照”并把 pz_compare 存为 false，则尊重该选择
            let compareMode = node.properties.pz_compare === undefined ? true : !!node.properties.pz_compare;
            let compareSlot = null;
            if (IS_SINGLE) {
                const cbox = document.createElement("div");
                cbox.className = "pz-di-box pz-di-compare";
                const cheader = document.createElement("div");
                cheader.className = "pz-di-header";
                const clabel = document.createElement("span");
                clabel.textContent = "上一轮 / Prev";
                const csub = document.createElement("div");
                csub.className = "pz-di-sub";
                csub.textContent = "上一轮：—";
                const cwrap = document.createElement("div");
                cwrap.className = "pz-di-wrap";
                cwrap.style.cursor = "default";
                const cpreview = document.createElement("img");
                cpreview.className = "pz-di-preview";
                cpreview.alt = "";
                const cph = document.createElement("div");
                cph.className = "pz-di-placeholder";
                cph.textContent = "已是首轮 / First round";
                cwrap.append(cpreview, cph);
                cheader.append(clabel);
                cbox.append(cheader, csub, cwrap);
                compareSlot = { box: cbox, header: cheader, label: clabel, subtitle: csub, wrap: cwrap, preview: cpreview, placeholder: cph };
            }
            const refreshCompare = () => {
                if (!IS_SINGLE || !compareMode || !compareSlot) return;
                const list = roundsList();
                const idx = roundIndex();
                const prev = idx - 1;
                const name = prev >= 0 ? list[prev] : null;
                if (name) {
                    compareSlot.preview.src = viewUrl(name);
                    compareSlot.preview.style.display = "";
                    compareSlot.placeholder.style.display = "none";
                    compareSlot.subtitle.textContent = `上一轮：${name}`;
                } else {
                    compareSlot.preview.removeAttribute("src");
                    compareSlot.preview.style.display = "none";
                    compareSlot.placeholder.style.display = "";
                    compareSlot.placeholder.textContent = prev >= 0 ? "上一轮：无图" : "已是首轮 / First round";
                    compareSlot.subtitle.textContent = "上一轮：—";
                }
            };
            let savedNormalWidth = node.size[0] || 520;
            const COMPARE_WIDTH = 820;
            const setCompareMode = (on) => {
                if (!IS_SINGLE || !compareSlot) return;
                compareMode = !!on;
                node.properties.pz_compare = compareMode ? true : undefined;
                if (compareMode) {
                    savedNormalWidth = node.size[0]; // 记住进入对照前的宽度
                    if (compareSlot.box.parentNode !== boxesRow) boxesRow.insertBefore(compareSlot.box, slots[0].box);
                    node.setSize([Math.max(node.size[0], COMPARE_WIDTH), node.size[1]]);
                } else {
                    if (compareSlot.box.parentNode === boxesRow) boxesRow.removeChild(compareSlot.box);
                    node.setSize([savedNormalWidth || 520, node.size[1]]);
                }
                compareButton.textContent = compareMode ? "退出对照" : "对照上轮";
                compareButton.classList.toggle("pz-di-active", compareMode);
                refreshCompare();
                autoFitHeight();
            };
            const compareButton = document.createElement("button");
            compareButton.type = "button";
            compareButton.className = "pz-di-compare-btn";
            compareButton.textContent = compareMode ? "退出对照" : "对照";
            compareButton.title = "并排显示上一轮，便于对照 / Toggle compare view";
            compareButton.style.cssText = "font-size:12px;padding:2px 8px;border:1px solid #39414f;border-radius:6px;background:#23262e;color:#e6e9ef;cursor:pointer;";
            compareButton.classList.toggle("pz-di-active", compareMode);
            compareButton.addEventListener("click", () => setCompareMode(!compareMode));
            restWrap.append(compareButton);

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
                    setPlaceholder(slot, true, "点击或拖拽图片 / Click or drop");
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
                refreshCompare(); // 回流/上传新增一轮后，同步刷新对照图（上一轮）
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
                refreshCompare();
                // 翻轮次时同步：被监听的加载图片节点也更新为当前轮图
                if (IS_SINGLE) {
                    const loaderId = currentLoadListenId();
                    if (loaderId) writeBackToLoader(loaderId);
                }
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
            // 图片加载节点：类型含 LoadImage（如 LoadImage / PZ_Load_Image 等），且有名为 image 的文件控件
            const isImageLoadNode = (item) => {
                if (!item || item.type === NODE_TYPE || item.type === SINGLE_NODE_TYPE || item.type === MARKER_NODE_TYPE) return false;
                if (!/load\s*image/i.test(item.type || "")) return false;
                return (item.widgets || []).some((w) => w.name === "image" && typeof w.value === "string" && w.value);
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
            // —— 加载图监听：选择工作流中的图片加载节点，同步其第一张图作为编辑源 ——
            const loadListenOptions = () => {
                return (app.graph?._nodes || [])
                    .filter((item) => item && isActiveNode(item) && isImageLoadNode(item))
                    .map((item) => ({ id: String(item.id), type: item.type, label: `图片加载 #${item.id}${item.title ? ` · ${item.title}` : ""}` }));
            };
            const currentLoadListenId = () => {
                const options = loadListenOptions();
                const saved = node.properties?.pz_load_listen;
                if (saved && options.some((item) => item.id === String(saved))) return String(saved);
                return "";
            };
            const refreshLoadListenSelect = () => {
                if (!loadListenSelect) return;
                const current = currentLoadListenId();
                loadListenSelect.innerHTML = "";
                const placeholder = document.createElement("option");
                placeholder.value = "";
                placeholder.textContent = "— 不监听 —";
                loadListenSelect.appendChild(placeholder);
                loadListenOptions().forEach((opt) => {
                    const o = document.createElement("option");
                    o.value = opt.id;
                    o.textContent = opt.label;
                    loadListenSelect.appendChild(o);
                });
                loadListenSelect.value = current;
            };
            // —— 提示词源监听：选择工作流中的提示词/字符串（多行）文本节点，同步其文本作为单图版提示词 ——
            // 文本控件识别：ComfyUI 的 STRING 类型 widget.type 为 "STRING"（大写），字符串(多行)节点(如 PrimitiveNode)控件名常为 "value"
            const isTextWidget = (w) => typeof w.value === "string" && (/string/i.test(w.type || "") || /text|prompt|positive|negative|caption|value|描述|提示/i.test(w.name || ""));
            const isPromptTextNode = (item) => {
                if (!item) return false;
                const t = item.type;
                if ([NODE_TYPE, SINGLE_NODE_TYPE, MARKER_NODE_TYPE].includes(t)) return false;
                if (isImageLoadNode(item) || isSaveLikeNode(item)) return false;
                return (item.widgets || []).some(isTextWidget);
            };
            const findPromptTextWidget = (item) => {
                return (item.widgets || []).find(isTextWidget);
            };
            const promptListenOptions = () => {
                return (app.graph?._nodes || [])
                    .filter((item) => item && isActiveNode(item) && isPromptTextNode(item))
                    .map((item) => ({ id: String(item.id), type: item.type, label: `提示词 ${item.type} #${item.id}${item.title ? ` · ${item.title}` : ""}` }));
            };
            const currentPromptListenId = () => {
                const options = promptListenOptions();
                const saved = node.properties?.pz_prompt_listen;
                if (saved && options.some((item) => item.id === String(saved))) return String(saved);
                return "";
            };
            const refreshPromptListenSelect = () => {
                if (!promptListenSelect) return;
                const current = currentPromptListenId();
                promptListenSelect.innerHTML = "";
                const placeholder = document.createElement("option");
                placeholder.value = "";
                placeholder.textContent = "— 不监听 —";
                promptListenSelect.appendChild(placeholder);
                promptListenOptions().forEach((opt) => {
                    const o = document.createElement("option");
                    o.value = opt.id;
                    o.textContent = opt.label;
                    promptListenSelect.appendChild(o);
                });
                promptListenSelect.value = current;
            };
            // 单图版：未选图时，自动同步“加载图监听”所指节点的第一张图；若未设监听则默认取第一个图片加载节点
            const applyDefaultImageFromFirstLoader = () => {
                if (!IS_SINGLE) return;
                if (widget1?.value) return;
                let loadId = currentLoadListenId();
                if (!loadId) {
                    const first = (app.graph?._nodes || []).find(isImageLoadNode);
                    loadId = first ? String(first.id) : "";
                    if (loadId) node.properties.pz_load_listen = loadId;
                }
                if (!loadId) return;
                const loader = (app.graph?._nodes || []).find((n) => String(n.id) === loadId);
                const img = loader?.widgets?.find((w) => w.name === "image")?.value;
                if (img && (!fileListCache || fileListCache.includes(img))) {
                    widget1.value = img;
                    widget1.callback?.call(widget1, img);
                    refreshFilePreview(slots[0]);
                    refreshLoadListenSelect();
                }
            };
            // 初次加载：未保存过监听选择时，默认选中工作流里第一个图片加载节点 / 第一个提示词文本节点
            const applyDefaultListenSelection = () => {
                if (!IS_SINGLE) return;
                if (!Object.prototype.hasOwnProperty.call(node.properties || {}, "pz_load_listen")) {
                    const first = loadListenOptions()[0];
                    if (first) node.properties.pz_load_listen = first.id;
                }
                if (!Object.prototype.hasOwnProperty.call(node.properties || {}, "pz_prompt_listen")) {
                    const first = promptListenOptions()[0];
                    if (first) node.properties.pz_prompt_listen = first.id;
                }
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
            loadListenSelect.addEventListener("mousedown", refreshLoadListenSelect);
            loadListenSelect.addEventListener("focus", refreshLoadListenSelect);
            loadListenSelect.addEventListener("change", () => {
                node.properties.pz_load_listen = loadListenSelect.value;
                if (IS_SINGLE) {
                    detachHijack();
                    if (loadListenSelect.value) attachHijack(loadListenSelect.value);
                    else applyDefaultImageFromFirstLoader();
                }
            });
            promptListenSelect.addEventListener("mousedown", refreshPromptListenSelect);
            promptListenSelect.addEventListener("focus", refreshPromptListenSelect);
            promptListenSelect.addEventListener("change", () => {
                node.properties.pz_prompt_listen = promptListenSelect.value;
                if (IS_SINGLE) {
                    detachPromptHijack();
                    if (promptListenSelect.value) attachPromptHijack(promptListenSelect.value);
                }
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
                // 反向劫持：单图版手动换图 → 写回被监听的加载图源节点
                if (IS_SINGLE && slot.slotNumber === 1) {
                    const lid = currentLoadListenId();
                    if (lid) writeBackToLoader(lid);
                }
            };

            slots.forEach((slot) => {
                slot.wrap.addEventListener("click", () => {
                    if (!isLinked(slot.slotNumber)) slot.fileInput.click();
                });
                // 支持把图片文件直接拖拽到预览区加载
                const onDragEnter = (e) => {
                    if (isLinked(slot.slotNumber)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    slot.box.classList.add("pz-di-dragover");
                };
                const onDragOver = (e) => {
                    if (isLinked(slot.slotNumber)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
                };
                const onDragLeave = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // 移到子元素时 relatedTarget 仍在 wrap 内，不取消高亮，避免闪烁
                    if (!slot.wrap.contains(e.relatedTarget)) slot.box.classList.remove("pz-di-dragover");
                };
                const onDrop = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    slot.box.classList.remove("pz-di-dragover");
                    if (isLinked(slot.slotNumber)) return;
                    const files = e.dataTransfer ? Array.from(e.dataTransfer.files || []) : [];
                    const file = files.find((item) => item.type && item.type.startsWith("image/"));
                    if (file) uploadFile(slot, file).catch((error) => console.warn("[PZ Dual Image] Drop upload failed", error));
                };
                slot.wrap.addEventListener("dragenter", onDragEnter);
                slot.wrap.addEventListener("dragover", onDragOver);
                slot.wrap.addEventListener("dragleave", onDragLeave);
                slot.wrap.addEventListener("drop", onDrop);
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
                    // 反向劫持：单图版选图 → 写回被监听的加载图源节点
                    if (IS_SINGLE && slot.slotNumber === 1) {
                        const lid = currentLoadListenId();
                        if (lid) writeBackToLoader(lid);
                    }
                });
                slot.textarea.addEventListener("input", () => {
                    const widget = slot.slotNumber === 1 ? prompt1Widget : prompt2Widget;
                    if (widget) {
                        widget.value = slot.textarea.value;
                        widget.callback?.call(widget, slot.textarea.value);
                    }
                    // 反向劫持：单图版改提示词 → 写回被监听的提示词源节点
                    if (IS_SINGLE && slot.slotNumber === 1) {
                        const pid = currentPromptListenId();
                        if (pid) writeBackToPromptSource(pid, slot.textarea.value);
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
            let loadResultImages = [];
            // 把监听节点产出的图片下载并导入到指定图槽（加载图监听 / 回流监听共用）
            const importResultImage = (ref, slot) => {
                if (!ref) return Promise.resolve();
                const url = `/view?filename=${encodeURIComponent(ref.filename)}&subfolder=${encodeURIComponent(ref.subfolder || "")}&type=${encodeURIComponent(ref.type || "output")}&rand=${Math.random()}`;
                return fetch(url)
                    .then((response) => (response.ok ? response.blob() : null))
                    .then((blob) => {
                        if (!blob) return;
                        return uploadFile(slot, new File([blob], ref.filename, { type: blob.type || "image/png" }));
                    })
                    .catch((error) => console.warn("[PZ Dual Image] Cannot import result image", error));
            };
            // 劫持模式：把当前轮结果图写回被监听的加载图源节点，让整张工作流的源图随编辑迭代
            const writeBackToLoader = (loaderId) => {
                const img = widget1.value;
                if (!img) return;
                const loader = (app.graph?._nodes || []).find((n) => String(n.id) === loaderId);
                const w = loader?.widgets?.find((x) => x.name === "image");
                if (!w || w.value === img) return;
                w.value = img;
                w.callback?.call(w, img); // 触发其回调（含劫持同步），刷新加载节点与单图版
            };
            // 劫持模式：把单图版当前提示词写回被监听的提示词源节点（反向更新）
            const writeBackToPromptSource = (srcId, text) => {
                if (!srcId || typeof text !== "string") return;
                const src = (app.graph?._nodes || []).find((n) => String(n.id) === srcId);
                const w = findPromptTextWidget(src);
                if (!w || w.value === text) return;
                w.value = text;
                w.callback?.call(w, text); // 触发其回调，刷新源节点显示
            };
            const onExecutionStart = () => {
                pendingResultImages = [];
                loadResultImages = [];
                refreshListenSelect();
                if (idleTimer) clearTimeout(idleTimer);
                currentNodeId = "";
                setProgress(0);
                startTimer();
            };
            const onExecuted = (event) => {
                const images = event.detail?.output?.images;
                if (Array.isArray(images)) {
                    if (IS_SINGLE) {
                        // 单图版：加载图监听与回流监听独立收集
                        const loadId = currentLoadListenId();
                        if (loadId && String(event.detail?.node) === loadId) loadResultImages = images.slice();
                        const resultId = currentListenId();
                        if (resultId && String(event.detail?.node) === resultId) pendingResultImages = images.slice();
                    } else {
                        const listenId = currentListenId();
                        if (listenId) {
                            // 只导入“监听”下拉选中那个节点输出的图片
                            if (String(event.detail?.node) === listenId) pendingResultImages = images.slice();
                        } else {
                            pendingResultImages.push(...images);
                        }
                    }
                }
                if (String(event.detail?.node) !== String(node.id)) return;
                slots.forEach((slot) => {
                    if (!isLinked(slot.slotNumber)) return;
                    slot.preview.src = `/pz_easyuse/dual-image-preview?node=${node.id}&slot=${slot.slotNumber}&rand=${Math.random()}`;
                    setPlaceholder(slot, false);
                });
            };
            const onExecutionSuccess = async () => {
                setProgress(1, "完成");
                stopTimer();
                if (idleTimer) clearTimeout(idleTimer);
                idleTimer = setTimeout(setIdle, 1500);
                if (IS_SINGLE) {
                    // 加载图监听：同步编辑源到图槽
                    const loadRef = loadResultImages[loadResultImages.length - 1];
                    loadResultImages = [];
                    // 回流监听：结果图回显到图槽
                    const resultRef = pendingResultImages[pendingResultImages.length - 1];
                    pendingResultImages = [];
                    if (loadRef) await importResultImage(loadRef, slots[0]);
                    if (resultRef) await importResultImage(resultRef, slots[0]);
                    // 劫持：当前轮结果图代替加载图源节点，作为下一轮源图
                    const loaderId = currentLoadListenId();
                    if (loaderId && (resultRef || loadRef)) writeBackToLoader(loaderId);
                    return;
                }
                const resultSlot = slots[1];
                const resultLinked = isLinked(2);
                const ref = pendingResultImages[pendingResultImages.length - 1];
                pendingResultImages = [];
                if (!ref || resultLinked) return;
                await importResultImage(ref, resultSlot);
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
                detachHijack();
                detachPromptHijack();
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
                // 对照模式下确保节点宽度足够容纳两张并排的图（初始/加载时 setSize 可能未及时生效）
                if (IS_SINGLE && compareMode && node.size[0] < COMPARE_WIDTH) {
                    node.setSize([COMPARE_WIDTH, node.size[1]]);
                }
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
                applyDefaultListenSelection();
                refreshLoadListenSelect();
                refreshPromptListenSelect();
                if (IS_SINGLE) {
                    const lid = currentLoadListenId();
                    if (lid) attachHijack(lid);
                    else applyDefaultImageFromFirstLoader();
                    const pid = currentPromptListenId();
                    if (pid) attachPromptHijack(pid);
                }
                if (IS_SINGLE && compareMode) setCompareMode(true);
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
                applyDefaultListenSelection();
                refreshLoadListenSelect();
                refreshPromptListenSelect();
                if (IS_SINGLE) {
                    const lid = currentLoadListenId();
                    if (lid) attachHijack(lid);
                    else applyDefaultImageFromFirstLoader();
                    const pid = currentPromptListenId();
                    if (pid) attachPromptHijack(pid);
                }
                if (IS_SINGLE) refreshCompare();
                if (!roundsList().length) pushRound(widget1?.value || widget2?.value);
            });

            setTimeout(() => {
                applyHiddenWidgets(); // 前端 widget store 同步后再补一次，防止重新显示
                syncPromptTexts();
                refreshRoundButtons();
                refreshListenSelect();
                applyDefaultListenSelection();
                refreshLoadListenSelect();
                refreshPromptListenSelect();
                if (IS_SINGLE) {
                    const lid = currentLoadListenId();
                    if (lid) attachHijack(lid);
                    else applyDefaultImageFromFirstLoader();
                    const pid = currentPromptListenId();
                    if (pid) attachPromptHijack(pid);
                }
                if (IS_SINGLE && compareMode) setCompareMode(true); // 延迟兜底：节点挂载后确保对照布局与宽度已撑开
                if (IS_SINGLE) refreshCompare();
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
