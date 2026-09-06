import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "PZ_Commander_Text_MultiBox_V2";
const MAX_BOXES = 10;
const LAYOUT_BASE_HEIGHT = 120;
const LAYOUT_ROW_HEIGHT = 96;
const COMMON_TAGS = ["<Subject 1>", "<Subject 2>", "<Picture 1>", "<Picture 2>", "N/A", "<Audio 1>", "<Shot 1>", "[Chinese]"];

function findWidget(node, name) {
    return node.widgets?.find((widget) => widget.name === name);
}

function setWidgetVisible(widget, visible) {
    if (!widget) return;
    if (!widget._pzOriginalType) widget._pzOriginalType = widget.type;
    if (!widget._pzOriginalComputeSize) {
        widget._pzOriginalComputeSize = widget.computeSize;
    }
    widget.hidden = !visible;
    widget.computeSize = visible
        ? widget._pzOriginalComputeSize
        : () => [0, 0];
    widget.type = visible ? widget._pzOriginalType : "HIDDEN";
    if (!widget.element) return;
    widget.element.style.display = visible ? "" : "none";
    widget.element.hidden = !visible;
    // Hide the native wrapper too. Otherwise LiteGraph can leave a blank row.
    let parent = widget.element.parentElement;
    if (parent?.classList.contains("comfy-widget-content") || parent?.classList.contains("comfy-widget")) {
        parent.style.display = visible ? "" : "none";
        parent.hidden = !visible;
    }
}

function detachNativeWidget(widget) {
    if (!widget) return;
    if (!widget._pzOriginalType) widget._pzOriginalType = widget.type;
    if (!widget._pzOriginalComputeSize) widget._pzOriginalComputeSize = widget.computeSize;
    widget.type = "HIDDEN";
    widget.hidden = true;
    widget.computeSize = () => [0, 0];
    if (widget.element) {
        widget.element.style.display = "none";
        widget.element.hidden = true;
    }
}

function createTextEditor(widget, index) {
    const editor = document.createElement("textarea");
    editor.value = widget.value || "";
    editor.placeholder = `Promp ${index + 1}...`;
    editor.style.cssText = "display:block;width:100%;max-width:100%;height:76px;min-height:76px;box-sizing:border-box;resize:vertical;padding:6px 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;line-height:1.35;";
    editor.addEventListener("input", () => {
        widget.value = editor.value;
        widget.callback?.call(widget, editor.value);
    });
    return editor;
}

function createToggle(widget) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("aria-label", "Toggle text box");
    input.style.cssText = "width:16px;height:16px;margin:0;accent-color:#35a66f;cursor:pointer;";
    input.checked = Number(widget.value) === 1;
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", () => {
        widget.value = input.checked ? 1 : 0;
        widget.callback?.call(widget, widget.value);
    });
    return { button: input, render: () => { input.checked = Number(widget.value) === 1; } };
}

function createButton(text, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.className = `pz-v2-button ${className}`;
    return button;
}

function insertTag(editor, tag) {
    if (!editor) return;
    const start = editor.selectionStart ?? editor.value.length;
    const end = editor.selectionEnd ?? start;
    const space = start > 0 && !/\s$/.test(editor.value.slice(0, start)) ? " " : "";
    const inserted = `${space}${tag}`;
    editor.value = `${editor.value.slice(0, start)}${inserted}${editor.value.slice(end)}`;
    editor.selectionStart = editor.selectionEnd = start + inserted.length;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.focus();
}

function rebuildLayout(node, container, count) {
    const activeCount = Math.max(1, Math.min(MAX_BOXES, Number(count) || 1));
    const rowsContainer = node._pzMultiBoxRowsContainer || container;
    rowsContainer.replaceChildren();

    const header = document.createElement("div");
    header.textContent = `Text Boxes (${activeCount} active)`;
    header.style.cssText = "font-size:12px;font-weight:600;margin:4px 0 8px;color:var(--fg-color);";
    rowsContainer.appendChild(header);

    for (let index = 0; index < MAX_BOXES; index++) {
        const visible = index < activeCount;
        const enableWidget = findWidget(node, `enable_box_${index}`);
        const textWidget = findWidget(node, `prompt_box_${index}`);
        // Keep native values for serialization, but remove both native rows from layout.
        setWidgetVisible(enableWidget, false);
        detachNativeWidget(textWidget);

        if (!visible || !enableWidget || !textWidget) continue;

        const group = document.createElement("div");
        group.style.cssText = "display:flex;flex:0 0 auto;min-width:0;height:90px;gap:8px;align-items:stretch;width:100%;max-width:100%;box-sizing:border-box;padding:6px;margin-bottom:6px;border:1px solid var(--border-color);border-radius:6px;overflow:hidden;";
        const label = document.createElement("span");
        label.textContent = `Promp ${index + 1}`;
        label.style.cssText = "padding:0 0 4px;font-size:11px;color:var(--desc-text);font-weight:600;text-align:center;white-space:nowrap;";
        const toggle = createToggle(enableWidget);
        const textContainer = document.createElement("div");
        textContainer.style.cssText = "display:flex;flex:1 1 0;width:0;min-width:0;height:76px;overflow:hidden;";
        const editor = createTextEditor(textWidget, index);
        editor.addEventListener("focus", () => { node._pzMultiBoxActiveEditor = editor; });
        node._pzMultiBoxEditors[index] = editor;
        textContainer.appendChild(editor);
        const controls = document.createElement("div");
        controls.style.cssText = "display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:3px;flex:0 0 auto;min-width:62px;";
        const loadButton = createButton("加载 / Load", "pz-v2-action");
        loadButton.addEventListener("click", () => node._pzMultiBoxSavedApi?.loadBox(index));
        const boxHeader = document.createElement("div");
        boxHeader.style.cssText = "display:flex;align-items:center;justify-content:center;gap:4px;min-height:24px;";
        boxHeader.append(label, toggle.button);
        controls.append(boxHeader, loadButton);
        group.append(textContainer, controls);
        rowsContainer.appendChild(group);
    }

    const minimumLayoutHeight = LAYOUT_BASE_HEIGHT + activeCount * LAYOUT_ROW_HEIGHT;
    node._pzMultiBoxMinimumHeight = minimumLayoutHeight;
    syncLayoutHeight(node, container);
    node.setDirtyCanvas?.(true, true);
}

function syncLayoutHeight(node, container) {
    const layoutWidget = node._pzMultiBoxLayoutWidget;
    const minimumHeight = node._pzMultiBoxMinimumHeight || LAYOUT_BASE_HEIGHT;
    const layoutTop = Number(layoutWidget?.last_y);
    if (!Number.isFinite(layoutTop)) {
        container.style.height = `${minimumHeight}px`;
        return;
    }

    // last_y is the real top of this DOM widget. Use it instead of guessing
    // the height of the controls above it, so the widget ends at the node edge.
    const availableHeight = node.size[1] - layoutTop - 8;
    container.style.height = `${Math.max(minimumHeight, availableHeight)}px`;
}

app.registerExtension({
    name: "PZ.MultiBox.V2",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            const node = this;
            node.setSize?.([420, 600]);
            const container = document.createElement("div");
            container.style.cssText = "display:flex;flex-direction:column;width:calc(100% - 12px);max-width:calc(100% - 12px);height:100%;margin:0 6px;padding:4px 0;box-sizing:border-box;overflow:auto;";
            const style = document.createElement("style");
            style.textContent = `.pz-v2-button { border:1px solid color-mix(in srgb, var(--border-color) 75%, #6ea8fe); border-radius:6px; background:linear-gradient(180deg, color-mix(in srgb, var(--comfy-input-bg) 92%, #6ea8fe), var(--comfy-input-bg)); color:var(--input-text); cursor:pointer; font:inherit; font-size:11px; line-height:1.2; padding:6px 8px; white-space:nowrap; } .pz-v2-button:hover:not(:disabled) { border-color:#7db3ff; background:color-mix(in srgb, var(--comfy-input-bg) 82%, #6ea8fe); } .pz-v2-action { min-width:62px; }`;
            container.appendChild(style);
            const countWidget = findWidget(node, "num_boxes");
            const layoutWidget = node.addDOMWidget("pz_multibox_layout", "multibox", container);
            node._pzMultiBoxLayoutWidget = layoutWidget;
            const rowsContainer = document.createElement("div");
            rowsContainer.style.cssText = "display:flex;flex-direction:column;min-height:0;";
            node._pzMultiBoxRowsContainer = rowsContainer;
            node._pzMultiBoxEditors = [];
            container.appendChild(rowsContainer);
            layoutWidget.computeSize = () => {
                const activeCount = Math.max(1, Math.min(MAX_BOXES, Number(countWidget?.value) || 1));
                return [Math.max(300, node.size[0] - 12), LAYOUT_BASE_HEIGHT + activeCount * LAYOUT_ROW_HEIGHT];
            };

            let savedPrompts = [];
            let savedPromptIndex = -1;
            let previewText = "";
            const promptToFullText = (prompt) => {
                const boxText = Array.from({ length: MAX_BOXES }, (_, index) => prompt[`prompt_box_${index}`] || "").find(Boolean) || "";
                if (boxText) return boxText;
                const sections = ["subject_definitions", "summary", "retention_analysis", "detailed_description", "overall_soundscape", "non_diegetic_music"];
                return sections.filter((section) => prompt[section]).map((section) => `${section}:\n${prompt[section]}`).join("\n\n");
            };
            const updateSavedPreview = () => {
                previewText = savedPromptIndex >= 0 ? promptToFullText(savedPrompts[savedPromptIndex]) : "";
                previewEditor.value = previewText;
                savedName.textContent = savedPromptIndex >= 0 ? (savedPrompts[savedPromptIndex].title || `未命名提示词 ${savedPromptIndex + 1}`) : "暂无记录";
            };
            const savedPanel = document.createElement("div");
            savedPanel.style.cssText = "display:flex;flex-direction:column;gap:6px;margin-bottom:8px;";
            const tagBar = document.createElement("div");
            tagBar.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;padding:7px;border:1px solid var(--border-color);border-radius:6px;";
            const tagTitle = document.createElement("div");
            tagTitle.textContent = "常用提示词标签 / Common Prompt Tags";
            tagTitle.style.cssText = "font-size:12px;font-weight:600;color:var(--fg-color);";
            const editorRef = { get current() { return node._pzMultiBoxActiveEditor || node._pzMultiBoxEditors.find(Boolean); } };
            for (const tag of COMMON_TAGS) {
                const button = createButton(tag);
                button.addEventListener("click", () => insertTag(editorRef.current, tag));
                tagBar.appendChild(button);
            }
            const customTagRow = document.createElement("div");
            customTagRow.style.cssText = "display:flex;gap:5px;";
            const customTagInput = document.createElement("input");
            customTagInput.placeholder = "输入自定义标签 / Custom tag";
            customTagInput.style.cssText = "flex:1;min-width:0;padding:7px 9px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box;";
            const customTags = node.properties?.pzMultiBoxCustomTags || [];
            const addCustomTag = () => {
                const tag = customTagInput.value.trim();
                if (!tag || customTags.includes(tag)) return;
                customTags.push(tag);
                node.properties = node.properties || {};
                node.properties.pzMultiBoxCustomTags = customTags;
                const button = createButton(tag);
                button.addEventListener("click", () => insertTag(editorRef.current, tag));
                tagBar.appendChild(button);
                customTagInput.value = "";
            };
            for (const tag of customTags) {
                const button = createButton(tag);
                button.addEventListener("click", () => insertTag(editorRef.current, tag));
                tagBar.appendChild(button);
            }
            const addCustomTagButton = createButton("添加标签 / Add", "pz-v2-action");
            addCustomTagButton.addEventListener("click", addCustomTag);
            customTagInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); addCustomTag(); } });
            customTagRow.append(customTagInput, addCustomTagButton);
            const previewDetails = document.createElement("details");
            previewDetails.open = true;
            const previewSummary = document.createElement("summary");
            previewSummary.textContent = "提示词预览 / Prompt Preview";
            previewSummary.style.cssText = "display:block;padding:7px 9px;color:var(--fg-color);font-size:12px;font-weight:600;cursor:pointer;user-select:none;";
            const previewEditor = document.createElement("textarea");
            previewEditor.readOnly = true;
            previewEditor.style.cssText = "width:100%;height:100px;box-sizing:border-box;resize:vertical;margin-top:6px;padding:7px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;";
            previewDetails.append(previewSummary, previewEditor);
            const savedTitleDisplay = document.createElement("div");
            savedTitleDisplay.style.cssText = "flex:1 1 100%;min-width:120px;padding:7px 9px;border:1px solid var(--border-color);border-radius:6px;background:color-mix(in srgb, var(--comfy-input-bg) 70%, transparent);color:var(--input-text);font-size:11px;user-select:text;";
            const savedName = document.createElement("span");
            const savedStatus = document.createElement("span");
            savedStatus.style.cssText = "margin-left:6px;color:var(--desc-text);font-size:10px;font-weight:normal;";
            savedTitleDisplay.append(savedName, savedStatus);
            const previousButton = createButton("上一个 / Previous", "pz-v2-action");
            const nextButton = createButton("下一个 / Next", "pz-v2-action");
            const savedRow = document.createElement("div");
            savedRow.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;";
            savedRow.append(savedTitleDisplay, previousButton, nextButton);
            savedPanel.append(tagTitle, tagBar, customTagRow, previewDetails, savedRow);
            container.insertBefore(savedPanel, rowsContainer);
            const updateStatus = () => {
                savedStatus.textContent = savedPrompts.length ? `${savedPromptIndex + 1}/${savedPrompts.length}` : "暂无记录";
                previousButton.disabled = savedPromptIndex <= 0;
                nextButton.disabled = savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length - 1;
            };
            node._pzMultiBoxSavedApi = {
                loadBox(index) {
                    const editor = node._pzMultiBoxEditors[index];
                    const textWidget = findWidget(node, `prompt_box_${index}`);
                    if (!editor || !textWidget || !previewText) return;
                    editor.value = previewText;
                    textWidget.value = previewText;
                    textWidget.callback?.call(textWidget, previewText);
                },
            };
            const refreshSavedPrompts = async () => {
                try {
                    const response = await fetch("/pz_easyuse/minimax-prompts");
                    const data = await response.json();
                    savedPrompts = Array.isArray(data.prompts) ? data.prompts : [];
                    savedPromptIndex = savedPrompts.length ? savedPrompts.length - 1 : -1;
                    updateSavedPreview();
                } catch (error) { console.warn("[PZ MultiBox V2] Cannot load saved prompts", error); }
                updateStatus();
            };
            previousButton.addEventListener("click", () => { savedPromptIndex = Math.max(0, savedPromptIndex - 1); updateSavedPreview(); updateStatus(); });
            nextButton.addEventListener("click", () => { savedPromptIndex = Math.min(savedPrompts.length - 1, savedPromptIndex + 1); updateSavedPreview(); updateStatus(); });

            const refresh = (value = countWidget?.value) => rebuildLayout(node, container, value);
            if (countWidget) {
                const originalCallback = countWidget.callback;
                countWidget.callback = function (value) {
                    const clamped = Math.max(1, Math.min(MAX_BOXES, Number(value) || 1));
                    this.value = clamped;
                    originalCallback?.call(this, clamped);
                    refresh(clamped);
                };
            }

            node.addWidget("button", "Add Box", null, () => {
                if (countWidget && countWidget.value < MAX_BOXES) {
                    countWidget.value += 1;
                    countWidget.callback?.call(countWidget, countWidget.value);
                }
            });
            node.addWidget("button", "Remove Box", null, () => {
                if (countWidget && countWidget.value > 1) {
                    countWidget.value -= 1;
                    countWidget.callback?.call(countWidget, countWidget.value);
                }
            });

            // Keep all native controls above the custom text area.
            const currentLayoutIndex = node.widgets.indexOf(layoutWidget);
            if (currentLayoutIndex >= 0) {
                node.widgets.splice(currentLayoutIndex, 1);
                node.widgets.push(layoutWidget);
            }

            const originalResize = node.onResize;
            node.onResize = function (size) {
                originalResize?.apply(this, arguments);
                const activeCount = Math.max(1, Math.min(MAX_BOXES, Number(countWidget?.value) || 1));
                const minimumLayoutHeight = LAYOUT_BASE_HEIGHT + activeCount * LAYOUT_ROW_HEIGHT;
                node._pzMultiBoxMinimumHeight = minimumLayoutHeight;
                syncLayoutHeight(node, container);
            };

            setTimeout(() => {
                refresh();
                refreshSavedPrompts();
                requestAnimationFrame(() => {
                    const width = Math.max(420, Number(node.size[0]) || 420);
                    const height = Math.max(600, Number(node.size[1]) || 600);
                    node.setSize?.([width, height]);
                    syncLayoutHeight(node, container);
                    node.setDirtyCanvas?.(true, true);
                    requestAnimationFrame(() => {
                        syncLayoutHeight(node, container);
                        node.setDirtyCanvas?.(true, true);
                    });
                });
            }, 100);
            return result;
        };
    },

    async setup() {
        const originalQueuePrompt = app.queuePrompt;
        if (app._pzMultiBoxQueuePatched) return;
        app._pzMultiBoxQueuePatched = true;

        app.queuePrompt = async function (index = 0, batchCount = 1) {
            if (!app.graph) return originalQueuePrompt.apply(this, arguments);

            const activeNodes = (app.graph._nodes || []).filter((node) => {
                if (node.mode === 2 || node.mode === 4 || node.type !== NODE_TYPE) return false;
                const output = node.outputs?.find((item) => item.name === "final_prompts");
                return Boolean(output?.links?.length);
            });

            if (activeNodes.length === 0) return originalQueuePrompt.apply(this, arguments);
            if (activeNodes.length > 1) {
                alert("Multiple PZ MultiBox nodes are connected. Use only one per queue.");
                return;
            }

            const node = activeNodes[0];
            const count = Math.min(MAX_BOXES, Number(findWidget(node, "num_boxes")?.value) || 1);
            const selected = [];
            for (let index = 0; index < count; index++) {
                const enabled = findWidget(node, `enable_box_${index}`);
                const text = findWidget(node, `prompt_box_${index}`);
                if (enabled?.value === 1 && text?.value?.trim()) selected.push(index);
            }

            if (selected.length === 0) {
                console.warn("[PZ MultiBox] No enabled text boxes contain text.");
                return;
            }

            const enableWidgets = Array.from({ length: MAX_BOXES }, (_, index) => findWidget(node, `enable_box_${index}`));
            const originalValues = enableWidgets.map((widget) => widget?.value);
            const prompts = [];

            console.log(`[PZ MultiBox] Preparing ${selected.length} independent tasks`);
            try {
                for (const selectedIndex of selected) {
                    enableWidgets.forEach((widget, index) => {
                        if (widget) widget.value = index === selectedIndex ? 1 : 0;
                    });
                    prompts.push(await app.graphToPrompt());
                }
            } finally {
                enableWidgets.forEach((widget, index) => {
                    if (widget) widget.value = originalValues[index];
                });
                node.setDirtyCanvas?.(true, true);
            }

            await Promise.all(prompts.map((prompt) => api.queuePrompt(0, prompt)));
            console.log(`[PZ MultiBox] Submitted ${prompts.length} independent tasks`);
        };
    }
});
