import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "PZ_Commander_Text_MultiBox";
const BOX_COUNT = 5;
const COMMON_TAGS = ["<Subject 1>", "<Subject 2>", "<Picture 1>", "<Picture 2>", "N/A", "<Audio 1>", "<Shot 1>", "[Chinese]"];

function widget(node, name) {
    return node.widgets?.find((item) => item.name === name);
}

function hideNative(widgetItem) {
    if (!widgetItem) return;
    if (!widgetItem._pzOriginalType) widgetItem._pzOriginalType = widgetItem.type;
    widgetItem.type = "HIDDEN";
    widgetItem.hidden = true;
    widgetItem.computeSize = () => [0, 0];
    if (widgetItem.element) {
        widgetItem.element.style.display = "none";
        widgetItem.element.hidden = true;
    }
}

function makeEditor(textWidget, index) {
    const editor = document.createElement("textarea");
    editor.value = textWidget.value || "";
    editor.placeholder = `Promp ${index + 1}...`;
    editor.style.cssText = "display:block;width:100%;height:100%;min-height:0;box-sizing:border-box;resize:none;padding:7px 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;line-height:1.35;";
    editor.addEventListener("input", () => {
        textWidget.value = editor.value;
        textWidget.callback?.call(textWidget, editor.value);
    });
    return editor;
}

function makeButton(text, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.className = `pz-multibox-button ${className}`;
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

app.registerExtension({
    name: "PZ.MultiBox.Fixed",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            const node = this;
            const editors = [];
            const enableInputs = [];
            node.setSize?.([680, 980]);

            const container = document.createElement("div");
            container.style.cssText = "display:flex;flex-direction:column;width:100%;height:100%;padding:8px 0;box-sizing:border-box;overflow:auto;";
            const style = document.createElement("style");
            style.textContent = `
                .pz-multibox-button { border:1px solid color-mix(in srgb, var(--border-color) 75%, #6ea8fe); border-radius:6px; background:linear-gradient(180deg, color-mix(in srgb, var(--comfy-input-bg) 92%, #6ea8fe), var(--comfy-input-bg)); color:var(--input-text); cursor:pointer; font:inherit; font-size:11px; line-height:1.2; transition:border-color 120ms ease, background 120ms ease, transform 120ms ease; }
                .pz-multibox-button:hover:not(:disabled) { border-color:#7db3ff; background:color-mix(in srgb, var(--comfy-input-bg) 82%, #6ea8fe); transform:translateY(-1px); }
                .pz-multibox-button:disabled { cursor:default; opacity:.45; }
                .pz-multibox-tag { padding:5px 8px; white-space:nowrap; }
                .pz-multibox-action { flex:1 1 105px; min-height:29px; padding:6px 8px; white-space:nowrap; }
            `;
            container.appendChild(style);
            const layout = node.addDOMWidget("pz_fixed_multibox_layout", "multibox", container);
            layout.computeSize = () => [node.size[0], Math.max(300, node.size[1] - 90)];
            const layoutIndex = node.widgets.indexOf(layout);
            if (layoutIndex > 0) {
                node.widgets.splice(layoutIndex, 1);
                node.widgets.unshift(layout);
            }

            const header = document.createElement("div");
            header.textContent = "Text Boxes (5 fixed) | 常用提示词标签 / Common Prompt Tags";
            header.style.cssText = "font-size:12px;font-weight:600;margin:4px 0 8px;color:var(--fg-color);";
            container.appendChild(header);

            let activeEditor = null;
            const renderedCustomTags = new Set();
            const tagBar = document.createElement("div");
            tagBar.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;width:100%;padding:7px;margin-bottom:7px;border:1px solid var(--border-color);border-radius:6px;background:color-mix(in srgb, var(--comfy-input-bg) 65%, transparent);box-sizing:border-box;";
            const editorRef = { get current() { return activeEditor || editors.find(Boolean); } };
            for (const tag of COMMON_TAGS) {
                const button = makeButton(tag, "pz-multibox-tag");
                button.title = `插入 ${tag}`;
                button.addEventListener("click", () => insertTag(editorRef.current, tag));
                tagBar.appendChild(button);
            }
            const customRow = document.createElement("div");
            customRow.style.cssText = "display:flex;gap:5px;width:100%;margin-bottom:7px;";
            const customInput = document.createElement("input");
            customInput.placeholder = "输入自定义标签 / Custom tag";
            customInput.style.cssText = "flex:1;min-width:0;padding:7px 9px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box;";
            const addTagButton = makeButton("添加标签 / Add", "pz-multibox-action");
            const addCustomTag = () => {
                const tag = customInput.value.trim();
                if (!tag || renderedCustomTags.has(tag)) return;
                renderCustomTag(tag);
                node.properties = node.properties || {};
                const customTags = node.properties.pzMultiBoxCustomTags || [];
                if (!customTags.includes(tag)) node.properties.pzMultiBoxCustomTags = [...customTags, tag];
                customInput.value = "";
            };
            const renderCustomTag = (tag) => {
                if (renderedCustomTags.has(tag)) return;
                renderedCustomTags.add(tag);
                const group = document.createElement("span");
                group.style.cssText = "display:inline-flex;align-items:stretch;gap:2px;";
                const button = makeButton(tag, "pz-multibox-tag");
                button.title = `插入 ${tag}`;
                button.addEventListener("click", () => insertTag(editorRef.current, tag));
                const removeButton = makeButton("×");
                removeButton.title = `删除 ${tag}`;
                removeButton.setAttribute("aria-label", `删除 ${tag}`);
                removeButton.style.color = "var(--error-text, #ff8080)";
                removeButton.addEventListener("click", () => {
                    renderedCustomTags.delete(tag);
                    group.remove();
                    node.properties = node.properties || {};
                    node.properties.pzMultiBoxCustomTags = (node.properties.pzMultiBoxCustomTags || []).filter((item) => item !== tag);
                    node.setDirtyCanvas?.(true, true);
                });
                group.append(button, removeButton);
                tagBar.appendChild(group);
            };
            addTagButton.addEventListener("click", addCustomTag);
            customInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") { event.preventDefault(); addCustomTag(); }
            });
            customRow.append(customInput, addTagButton);
            container.append(tagBar, customRow);
            for (const tag of node.properties?.pzMultiBoxCustomTags || []) renderCustomTag(tag);

            let savedPrompts = [];
            let savedPromptIndex = -1;
            let currentPreviewBoxes = [];
            const savedTitle = document.createElement("div");
            savedTitle.textContent = "提示词保存 / Saved Prompts (仅加载和修改)";
            savedTitle.style.cssText = "font-size:12px;font-weight:600;margin:4px 0 6px;color:var(--fg-color);";
            const savedStatus = document.createElement("span");
            savedStatus.style.cssText = "margin-left:6px;font-size:10px;color:var(--desc-text);font-weight:normal;";
            savedTitle.appendChild(savedStatus);
            const savedRow = document.createElement("div");
            savedRow.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;width:100%;margin-bottom:7px;";
            const savedTitleDisplay = document.createElement("div");
            savedTitleDisplay.style.cssText = "flex:1 1 100%;min-width:120px;padding:7px 9px;border:1px solid var(--border-color);border-radius:6px;background:color-mix(in srgb, var(--comfy-input-bg) 70%, transparent);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box;user-select:text;";
            const previousButton = makeButton("上一个 / Previous", "pz-multibox-action");
            const nextButton = makeButton("下一个 / Next", "pz-multibox-action");
            savedRow.append(savedTitleDisplay, previousButton, nextButton);
            container.append(savedTitle, savedRow);

            const previewDetails = document.createElement("details");
            previewDetails.open = true;
            previewDetails.style.cssText = "width:100%;margin-bottom:8px;border:1px solid var(--border-color);border-radius:6px;background:color-mix(in srgb, var(--comfy-input-bg) 65%, transparent);box-sizing:border-box;";
            const previewSummary = document.createElement("summary");
            previewSummary.textContent = "提示词预览 / Prompt Preview（每个 Box 可单独加载）";
            previewSummary.style.cssText = "padding:7px 9px;color:var(--fg-color);font-size:12px;font-weight:600;cursor:pointer;user-select:none;";
            const previewEditor = document.createElement("textarea");
            previewEditor.readOnly = true;
            previewEditor.placeholder = "请选择一条保存记录...";
            previewEditor.style.cssText = "display:block;width:calc(100% - 14px);height:120px;margin:0 7px 7px;box-sizing:border-box;resize:vertical;padding:8px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;line-height:1.4;";
            previewDetails.append(previewSummary, previewEditor);
            container.appendChild(previewDetails);

            const updateSavedStatus = () => {
                savedStatus.textContent = savedPrompts.length ? `${savedPromptIndex + 1}/${savedPrompts.length}` : "暂无记录 / Empty";
                previousButton.disabled = savedPromptIndex <= 0;
                nextButton.disabled = savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length - 1;
            };

            const promptToFullText = (prompt) => {
                const boxText = Array.from({ length: BOX_COUNT }, (_, index) => prompt[`prompt_box_${index}`] || "").find(Boolean) || "";
                if (boxText) return boxText;
                const sections = ["subject_definitions", "summary", "retention_analysis", "detailed_description", "overall_soundscape", "non_diegetic_music"];
                return sections.filter((section) => prompt[section]).map((section) => `${section}:\n${prompt[section]}`).join("\n\n");
            };

            const updatePromptPreview = (prompt) => {
                const fullText = prompt ? promptToFullText(prompt) : "";
                currentPreviewBoxes = fullText ? Array(BOX_COUNT).fill(fullText) : [];
                previewEditor.value = fullText;
            };

            const applySavedPrompt = (prompt) => {
                const value = promptToFullText(prompt);
                const values = Array(BOX_COUNT).fill(value);
                values.forEach((value, index) => {
                    const textWidget = widget(node, `prompt_box_${index}`);
                    if (textWidget && editors[index]) {
                        editors[index].value = value;
                        textWidget.value = value;
                        textWidget.callback?.call(textWidget, value);
                    }
                });
                savedTitleDisplay.textContent = prompt.title || `未命名提示词 ${savedPromptIndex + 1}`;
                node.setDirtyCanvas?.(true, true);
            };

            const applySavedPromptToBox = (prompt, index) => {
                const value = currentPreviewBoxes[0] || promptToFullText(prompt);
                const textWidget = widget(node, `prompt_box_${index}`);
                if (!textWidget || !editors[index]) return;
                editors[index].value = value;
                textWidget.value = value;
                textWidget.callback?.call(textWidget, value);
                node.setDirtyCanvas?.(true, true);
            };

            const refreshSavedPrompts = async () => {
                try {
                    const response = await fetch("/pz_easyuse/minimax-prompts");
                    const data = await response.json();
                    savedPrompts = Array.isArray(data.prompts) ? data.prompts : [];
                    savedPromptIndex = savedPrompts.length ? savedPrompts.length - 1 : -1;
                    if (savedPromptIndex >= 0) savedTitleDisplay.textContent = savedPrompts[savedPromptIndex].title || `未命名提示词 ${savedPromptIndex + 1}`;
                    else savedTitleDisplay.textContent = "暂无记录";
                    updatePromptPreview(savedPromptIndex >= 0 ? savedPrompts[savedPromptIndex] : null);
                } catch (error) { console.warn("[PZ MultiBox] Cannot load saved prompts", error); }
                updateSavedStatus();
            };

            const moveSavedPrompt = (step) => {
                if (!savedPrompts.length) return;
                savedPromptIndex = Math.max(0, Math.min(savedPrompts.length - 1, savedPromptIndex + step));
                updatePromptPreview(savedPrompts[savedPromptIndex]);
                savedTitleDisplay.textContent = savedPrompts[savedPromptIndex].title || `未命名提示词 ${savedPromptIndex + 1}`;
                updateSavedStatus();
            };

            previousButton.addEventListener("click", () => moveSavedPrompt(-1));
            nextButton.addEventListener("click", () => moveSavedPrompt(1));

            for (let index = 0; index < BOX_COUNT; index++) {
                const textWidget = widget(node, `prompt_box_${index}`);
                const enableWidget = widget(node, `enable_box_${index}`);
                hideNative(textWidget);
                hideNative(enableWidget);
                if (!textWidget) continue;

                const row = document.createElement("div");
                row.style.cssText = "display:flex;flex:1;min-height:0;gap:8px;align-items:stretch;width:100%;box-sizing:border-box;padding:8px;margin-bottom:6px;border:1px solid var(--border-color);border-radius:6px;";
                const label = document.createElement("span");
                label.textContent = `Promp ${index + 1}`;
                label.style.cssText = "padding:0 0 5px;font-size:11px;color:var(--desc-text);font-weight:600;text-align:center;white-space:nowrap;";
                const editorContainer = document.createElement("div");
                editorContainer.style.cssText = "display:flex;flex:1;min-width:0;min-height:0;";
                const editor = makeEditor(textWidget, index);
                editor.addEventListener("focus", () => { activeEditor = editor; });
                editors[index] = editor;
                editorContainer.appendChild(editor);
                const loadBoxButton = makeButton("加载 / Load", "pz-multibox-action");
                loadBoxButton.style.cssText += "flex:0 0 auto;min-width:58px;";
                loadBoxButton.addEventListener("click", () => {
                    if (savedPromptIndex >= 0) applySavedPromptToBox(savedPrompts[savedPromptIndex], index);
                });
                const boxControls = document.createElement("div");
                boxControls.style.cssText = "display:flex;flex-direction:column;align-items:stretch;flex:0 0 auto;min-width:58px;";
                const enableInput = document.createElement("input");
                enableInput.type = "checkbox";
                enableInput.style.cssText = "width:16px;height:16px;margin:0;accent-color:#35a66f;cursor:pointer;";
                enableInput.checked = Number(enableWidget?.value) !== 0;
                enableInputs[index] = enableInput;
                enableInput.addEventListener("change", () => {
                    if (enableWidget) {
                        enableWidget.value = enableInput.checked ? 1 : 0;
                        enableWidget.callback?.call(enableWidget, enableWidget.value);
                    }
                });
                const boxHeader = document.createElement("div");
                boxHeader.style.cssText = "display:flex;align-items:center;justify-content:center;gap:4px;min-height:20px;";
                boxHeader.append(label, enableInput);
                boxControls.append(boxHeader, loadBoxButton);
                row.append(editorContainer, boxControls);
                container.appendChild(row);
            }

            node.setSize?.([Math.max(420, node.size[0]), 520]);
            const originalResize = node.onResize;
            node.onResize = function (size) {
                originalResize?.apply(this, arguments);
                container.style.height = `${Math.max(300, size[1] - 90)}px`;
            };

            const originalConfigure = node.configure;
            node.configure = function (info) {
                const configured = originalConfigure?.apply(this, arguments);
                for (let index = 0; index < BOX_COUNT; index++) {
                    const textWidget = widget(node, `prompt_box_${index}`);
                    if (editors[index] && textWidget) editors[index].value = textWidget.value || "";
                    const enableWidget = widget(node, `enable_box_${index}`);
                    if (enableInputs[index] && enableWidget) enableInputs[index].checked = Number(enableWidget.value) !== 0;
                }
                refreshSavedPrompts();
                return configured;
            };
            container.style.height = "430px";
            refreshSavedPrompts();
            updateSavedStatus();
            node.setDirtyCanvas?.(true, true);
            return result;
        };
    },

    async setup() {
        const originalQueuePrompt = app.queuePrompt;
        if (app._pzFixedMultiBoxPatched) return;
        app._pzFixedMultiBoxPatched = true;

        app.queuePrompt = async function (index = 0, batchCount = 1) {
            if (!app.graph) return originalQueuePrompt.apply(this, arguments);
            const nodes = (app.graph._nodes || []).filter((node) => {
                if (node.mode === 2 || node.mode === 4 || node.type !== NODE_TYPE) return false;
                return Boolean(node.outputs?.find((output) => output.name === "final_prompts")?.links?.length);
            });
            if (nodes.length === 0) return originalQueuePrompt.apply(this, arguments);
            if (nodes.length > 1) {
                alert("Multiple PZ Text MultiBox nodes are connected. Use only one per queue.");
                return;
            }

            const node = nodes[0];
            const selected = [];
            for (let index = 0; index < BOX_COUNT; index++) {
                const text = widget(node, `prompt_box_${index}`)?.value?.trim() || "";
                const enableWidget = widget(node, `enable_box_${index}`);
                if (enableWidget && Number(enableWidget.value) === 0 || !text) continue;
                selected.push(index);
            }

            if (selected.length === 0) {
                console.warn("[PZ MultiBox Fixed] No non-empty text boxes.");
                return;
            }

            const allTextWidgets = Array.from({ length: BOX_COUNT }, (_, index) => widget(node, `prompt_box_${index}`));
            const enableWidgets = Array.from({ length: BOX_COUNT }, (_, index) => widget(node, `enable_box_${index}`));
            const originalValues = allTextWidgets.map((item) => item?.value);
            const originalEnabled = enableWidgets.map((item) => item?.value);
            const snapshots = [];
            try {
                for (const selectedIndex of selected) {
                    allTextWidgets.forEach((item, index) => {
                        if (item) item.value = index === selectedIndex ? originalValues[index] : "";
                    });
                    snapshots.push(await app.graphToPrompt());
                }
            } finally {
                allTextWidgets.forEach((item, index) => {
                    if (item) item.value = originalValues[index];
                });
                enableWidgets.forEach((item, index) => {
                    if (item) item.value = originalEnabled[index];
                });
                node.setDirtyCanvas?.(true, true);
            }
            console.log(`[PZ MultiBox Fixed] Submitting ${snapshots.length} independent tasks`);
            await Promise.all(snapshots.map((prompt) => api.queuePrompt(0, prompt)));
        };
    }
});
