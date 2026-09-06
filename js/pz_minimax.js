import { app } from "../../scripts/app.js";

const NODE_TYPE = "PZ_Minimax_Prompt";
const SECTIONS = [
    "subject_definitions",
    "summary",
    "retention_analysis",
    "detailed_description",
    "overall_soundscape",
    "non_diegetic_music",
];

const SECTION_LABELS = {
    subject_definitions: "主体定义 (subject_definitions):",
    summary: "内容概述 (summary):",
    retention_analysis: "保留分析 (retention_analysis):",
    detailed_description: "详细描述 (detailed_description):",
    overall_soundscape: "整体声场 (overall_soundscape):",
    non_diegetic_music: "非叙事音乐 (non_diegetic_music):",
};

const SECTION_PLACEHOLDERS = {
    subject_definitions: "填写主体、声音、物体或角色定义（Define the subjects, voices, objects, or characters）...",
    summary: "概括场景或声音事件（Summarize the scene or audio event）...",
    retention_analysis: "描述需要保持一致的元素（Describe the elements that should remain consistent）...",
    detailed_description: "描述时间、动作、细节和转场（Describe timing, actions, details, and transitions）...",
    overall_soundscape: "描述环境氛围、场景声音和拟音（Describe the ambience, environment, and diegetic sounds）...",
    non_diegetic_music: "描述背景音乐及其情绪方向（Describe the background music and its emotional direction）...",
};

const DEFAULT_TAGS = [
    "<Subject 1>",
    "<Subject 2>",
    "<Picture 1>",
    "<Picture 2>",
    "N/A",
    "<Audio 1>",
    "<Shot 1>",
    "[Chinese]",
];

function findWidget(node, name) {
    return node.widgets?.find((item) => item.name === name);
}

function hideNative(widget) {
    if (!widget) return;
    widget.type = "HIDDEN";
    widget.hidden = true;
    widget.computeSize = () => [0, 0];
    if (widget.element) {
        widget.element.style.display = "none";
        widget.element.hidden = true;
    }
}

function makeEditor(textWidget, placeholder) {
    const editor = document.createElement("textarea");
    editor.value = textWidget.value || "";
    editor.placeholder = placeholder;
    editor.style.cssText = "display:block;width:100%;height:100%;min-height:72px;box-sizing:border-box;resize:vertical;padding:7px 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;line-height:1.35;";
    editor.addEventListener("input", () => {
        textWidget.value = editor.value;
        textWidget.callback?.call(textWidget, editor.value);
        textWidget.node?.setDirtyCanvas?.(true, true);
    });
    return editor;
}

function insertTag(editor, tag) {
    if (!editor) return;
    const start = editor.selectionStart ?? editor.value.length;
    const end = editor.selectionEnd ?? start;
    const needsSpace = start > 0 && !/\s$/.test(editor.value.slice(0, start));
    const inserted = `${needsSpace ? " " : ""}${tag}`;
    editor.value = `${editor.value.slice(0, start)}${inserted}${editor.value.slice(end)}`;
    const cursor = start + inserted.length;
    editor.selectionStart = cursor;
    editor.selectionEnd = cursor;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.focus();
}

function makeTagButton(tag, editorRef, onDelete = null) {
    if (onDelete) {
        const group = document.createElement("span");
        group.style.cssText = "display:inline-flex;align-items:stretch;gap:2px;";
        const insertButton = makeTagButton(tag, editorRef);
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "×";
        deleteButton.title = `删除 ${tag}`;
        deleteButton.setAttribute("aria-label", `删除 ${tag}`);
        deleteButton.className = "pz-minimax-button pz-minimax-tag-delete";
        deleteButton.addEventListener("click", () => onDelete(group));
        group.append(insertButton, deleteButton);
        return group;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = tag;
    button.title = `插入 ${tag}`;
    button.className = "pz-minimax-button pz-minimax-tag-button";
    button.addEventListener("click", () => insertTag(editorRef.current, tag));
    return button;
}

function makeActionButton(text) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.className = "pz-minimax-button pz-minimax-action-button";
    return button;
}

app.registerExtension({
    name: "PZ.MinimaxPrompt",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            const node = this;
            const editors = {};
            let activeEditor = null;
            const renderedCustomTags = new Set();
            let savedPrompts = [];
            let savedPromptIndex = -1;
            node.setSize?.([680, 680]);

            const container = document.createElement("div");
            container.style.cssText = "display:flex;flex-direction:column;gap:8px;width:100%;height:100%;padding:8px 0;box-sizing:border-box;overflow:auto;";
            const style = document.createElement("style");
            style.textContent = `
                .pz-minimax-button {
                    border: 1px solid color-mix(in srgb, var(--border-color) 75%, #6ea8fe);
                    border-radius: 6px;
                    background: linear-gradient(180deg, color-mix(in srgb, var(--comfy-input-bg) 92%, #6ea8fe), var(--comfy-input-bg));
                    color: var(--input-text);
                    cursor: pointer;
                    font: inherit;
                    font-size: 11px;
                    line-height: 1.2;
                    transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
                }
                .pz-minimax-button:hover:not(:disabled) {
                    border-color: #7db3ff;
                    background: color-mix(in srgb, var(--comfy-input-bg) 82%, #6ea8fe);
                    transform: translateY(-1px);
                }
                .pz-minimax-button:active:not(:disabled) { transform: translateY(0); }
                .pz-minimax-button:disabled { cursor: default; opacity: 0.45; }
                .pz-minimax-tag-button { padding: 5px 8px; white-space: nowrap; }
                .pz-minimax-tag-delete { padding: 2px 6px; color: var(--error-text, #ff8080); line-height: 1; }
                .pz-minimax-action-button { flex: 1 1 105px; min-height: 29px; padding: 6px 8px; white-space: nowrap; }
            `;
            container.appendChild(style);
            const layout = node.addDOMWidget("pz_minimax_prompt_layout", "minimax_prompt", container);
            layout.computeSize = () => [node.size[0], Math.max(520, node.size[1] - 80)];

            const tagTitle = document.createElement("div");
            tagTitle.textContent = "常用提示词标签 / Common Prompt Tags";
            tagTitle.style.cssText = "font-size:12px;font-weight:600;color:var(--fg-color);margin:2px 0 0;";
            const tagBar = document.createElement("div");
            tagBar.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;width:100%;padding:7px;border:1px solid var(--border-color);border-radius:6px;background:color-mix(in srgb, var(--comfy-input-bg) 65%, transparent);box-sizing:border-box;";
            const activeEditorRef = { get current() { return activeEditor || editors[SECTIONS[0]]; } };
            for (const tag of DEFAULT_TAGS) tagBar.appendChild(makeTagButton(tag, activeEditorRef));

            const customRow = document.createElement("div");
            customRow.style.cssText = "display:flex;gap:5px;width:100%;";
            const customInput = document.createElement("input");
            customInput.type = "text";
            customInput.placeholder = "输入自定义标签（Custom tag）";
            customInput.style.cssText = "flex:1;min-width:0;padding:5px 7px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box;";
            const addCustomButton = document.createElement("button");
            addCustomButton.type = "button";
            addCustomButton.textContent = "添加标签 / Add";
            addCustomButton.className = "pz-minimax-button pz-minimax-action-button";

            const renderCustomTag = (tag) => {
                if (renderedCustomTags.has(tag)) return;
                renderedCustomTags.add(tag);
                tagBar.appendChild(makeTagButton(tag, activeEditorRef, (group) => {
                    renderedCustomTags.delete(tag);
                    node.properties = node.properties || {};
                    node.properties.pzMinimaxCustomTags = (node.properties.pzMinimaxCustomTags || []).filter((item) => item !== tag);
                    group.remove();
                    node.setDirtyCanvas?.(true, true);
                }));
            };

            const addCustomTag = () => {
                const tag = customInput.value.trim();
                if (!tag) return;
                renderCustomTag(tag);
                node.properties = node.properties || {};
                const customTags = node.properties.pzMinimaxCustomTags || [];
                if (!customTags.includes(tag)) node.properties.pzMinimaxCustomTags = [...customTags, tag];
                customInput.value = "";
                node.setDirtyCanvas?.(true, true);
            };
            addCustomButton.addEventListener("click", addCustomTag);
            customInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomTag();
                }
            });
            customRow.append(customInput, addCustomButton);
            container.append(tagTitle, tagBar, customRow);

            const previewWidget = findWidget(node, "prompt_preview");
            hideNative(previewWidget);
            const previewDetails = document.createElement("details");
            previewDetails.style.cssText = "width:100%;border:1px solid var(--border-color);border-radius:6px;background:color-mix(in srgb, var(--comfy-input-bg) 65%, transparent);box-sizing:border-box;";
            const previewSummary = document.createElement("summary");
            previewSummary.textContent = "完整提示词预览 / Full Prompt Preview";
            previewSummary.style.cssText = "padding:7px 9px;color:var(--fg-color);font-size:12px;font-weight:600;cursor:pointer;user-select:none;";
            const previewEditor = document.createElement("textarea");
            previewEditor.readOnly = true;
            previewEditor.placeholder = "完整提示词将在这里显示...";
            previewEditor.style.cssText = "display:block;width:calc(100% - 14px);height:150px;margin:0 7px 7px;box-sizing:border-box;resize:vertical;padding:8px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;line-height:1.4;";
            previewDetails.append(previewSummary, previewEditor);
            container.appendChild(previewDetails);

            const updatePromptPreview = () => {
                const content = SECTIONS.map((section) => {
                    const value = editors[section]?.value?.trim() || "";
                    return `${section}:${value ? `\n${value}` : ""}`;
                }).join("\n\n");
                previewEditor.value = content;
                if (previewWidget) {
                    previewWidget.value = content;
                    previewWidget.callback?.call(previewWidget, content);
                }
            };

            const savedTitle = document.createElement("div");
            savedTitle.textContent = "提示词保存 / Saved Prompts";
            savedTitle.style.cssText = "font-size:12px;font-weight:600;color:var(--fg-color);margin-top:4px;";
            const savedStatus = document.createElement("span");
            savedStatus.style.cssText = "margin-left:6px;font-size:10px;color:var(--desc-text);font-weight:normal;";
            savedTitle.appendChild(savedStatus);
            const savedRow = document.createElement("div");
            savedRow.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;width:100%;";
            const titleInput = document.createElement("input");
            titleInput.type = "text";
            titleInput.placeholder = "提示词标题（默认 promp + 序号）";
            titleInput.style.cssText = "flex:1 1 100%;min-width:120px;padding:7px 9px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box;";
            const previousButton = makeActionButton("上一个 / Previous");
            const nextButton = makeActionButton("下一个 / Next");
            const addSaveButton = makeActionButton("新增保存 / Save New");
            const updateSaveButton = makeActionButton("修改保存 / Update");
            const importButton = makeActionButton("导入 / Import");
            const exportButton = makeActionButton("导出 TXT / Export TXT");
            const deleteButton = makeActionButton("删除当前 / Delete Current");
            const importInput = document.createElement("input");
            importInput.type = "file";
            importInput.accept = ".json,application/json";
            importInput.style.display = "none";
            savedRow.append(titleInput, previousButton, nextButton, addSaveButton, updateSaveButton, importButton, exportButton, deleteButton, importInput);
            container.append(savedTitle, savedRow);

            const updateSavedStatus = () => {
                savedStatus.textContent = savedPrompts.length
                    ? `${savedPromptIndex + 1}/${savedPrompts.length}`
                    : "暂无保存记录 / Empty";
                previousButton.disabled = savedPromptIndex <= 0;
                nextButton.disabled = savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length - 1;
                updateSaveButton.disabled = savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length;
                exportButton.disabled = savedPrompts.length === 0;
                deleteButton.disabled = savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length;
            };

            const readCurrentPrompt = () => Object.fromEntries(
                SECTIONS.map((section) => [section, editors[section]?.value || ""]),
            );

            const applyPrompt = (prompt) => {
                for (const section of SECTIONS) {
                    const editor = editors[section];
                    const textWidget = findWidget(node, section);
                    if (!editor || !textWidget) continue;
                    editor.value = prompt[section] || "";
                    textWidget.value = editor.value;
                    textWidget.callback?.call(textWidget, editor.value);
                }
                updatePromptPreview();
                node.setDirtyCanvas?.(true, true);
            };

            const refreshSavedPrompts = async () => {
                try {
                    const response = await fetch("/pz_easyuse/minimax-prompts");
                    const data = await response.json();
                    savedPrompts = Array.isArray(data.prompts) ? data.prompts : [];
                    savedPromptIndex = savedPrompts.length ? savedPrompts.length - 1 : -1;
                    titleInput.value = savedPromptIndex >= 0
                        ? (savedPrompts[savedPromptIndex]?.title || `promp${savedPromptIndex + 1}`)
                        : "";
                } catch (error) {
                    console.warn("[PZ MiniMax] Cannot load saved prompts", error);
                }
                updateSavedStatus();
            };

            const saveNewPrompt = async () => {
                try {
                    const title = titleInput.value.trim() || `promp${savedPrompts.length + 1}`;
                    const response = await fetch("/pz_easyuse/minimax-prompts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ prompt: { title, ...readCurrentPrompt() } }),
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Save failed");
                    savedPrompts = data.prompts || [];
                    savedPromptIndex = data.index ?? savedPrompts.length - 1;
                    titleInput.value = savedPrompts[savedPromptIndex]?.title || title;
                    updateSavedStatus();
                } catch (error) {
                    console.error("[PZ MiniMax] Cannot save prompt", error);
                }
            };

            const updateCurrentPrompt = async () => {
                if (savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length) return;
                try {
                    const title = titleInput.value.trim() || `promp${savedPromptIndex + 1}`;
                    const response = await fetch(`/pz_easyuse/minimax-prompts/${savedPromptIndex}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ prompt: { title, ...readCurrentPrompt() } }),
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Update failed");
                    savedPrompts = data.prompts || savedPrompts;
                    titleInput.value = savedPrompts[savedPromptIndex]?.title || title;
                    updateSavedStatus();
                } catch (error) {
                    console.error("[PZ MiniMax] Cannot update prompt", error);
                }
            };

            const moveSavedPrompt = (step) => {
                if (!savedPrompts.length) return;
                savedPromptIndex = Math.max(0, Math.min(savedPrompts.length - 1, savedPromptIndex + step));
                applyPrompt(savedPrompts[savedPromptIndex]);
                titleInput.value = savedPrompts[savedPromptIndex]?.title || `promp${savedPromptIndex + 1}`;
                updateSavedStatus();
            };

            const exportSavedPrompts = async () => {
                if (!savedPrompts.length) return;
                const content = JSON.stringify(savedPrompts, null, 2);
                try {
                    if (typeof window.showDirectoryPicker === "function") {
                        const directory = await window.showDirectoryPicker({ mode: "readwrite" });
                        const file = await directory.getFileHandle("pz_minimax_prompts.txt", { create: true });
                        const writable = await file.createWritable();
                        await writable.write(content);
                        await writable.close();
                        return;
                    }
                } catch (error) {
                    if (error.name === "AbortError") return;
                    console.warn("[PZ MiniMax] Cannot write to selected folder, using download", error);
                }

                const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                const downloadUrl = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = downloadUrl;
                link.download = "pz_minimax_prompts.txt";
                link.click();
                URL.revokeObjectURL(downloadUrl);
            };

            const deleteCurrentPrompt = async () => {
                if (savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length) return;
                if (!window.confirm("确定删除当前提示词吗？ / Delete current prompt?")) return;
                try {
                    const response = await fetch(`/pz_easyuse/minimax-prompts/${savedPromptIndex}`, { method: "DELETE" });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Delete failed");
                    savedPrompts = Array.isArray(data.prompts) ? data.prompts : [];
                    savedPromptIndex = savedPrompts.length
                        ? Math.min(savedPromptIndex, savedPrompts.length - 1)
                        : -1;
                    if (savedPromptIndex >= 0) {
                        applyPrompt(savedPrompts[savedPromptIndex]);
                        titleInput.value = savedPrompts[savedPromptIndex]?.title || `promp${savedPromptIndex + 1}`;
                    } else {
                        applyPrompt({});
                        titleInput.value = "";
                    }
                    updateSavedStatus();
                } catch (error) {
                    console.error("[PZ MiniMax] Cannot delete prompt", error);
                }
            };

            previousButton.addEventListener("click", () => moveSavedPrompt(-1));
            nextButton.addEventListener("click", () => moveSavedPrompt(1));
            addSaveButton.addEventListener("click", saveNewPrompt);
            updateSaveButton.addEventListener("click", updateCurrentPrompt);
            exportButton.addEventListener("click", exportSavedPrompts);
            deleteButton.addEventListener("click", deleteCurrentPrompt);
            importButton.addEventListener("click", () => importInput.click());
            importInput.addEventListener("change", async () => {
                const file = importInput.files?.[0];
                if (!file) return;
                try {
                    const imported = JSON.parse(await file.text());
                    const prompts = Array.isArray(imported) ? imported : (imported.prompts || imported);
                    const response = await fetch("/pz_easyuse/minimax-prompts/import", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ prompts }),
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Import failed");
                    savedPrompts = data.prompts || [];
                    savedPromptIndex = savedPrompts.length - 1;
                    if (savedPromptIndex >= 0) {
                        applyPrompt(savedPrompts[savedPromptIndex]);
                        titleInput.value = savedPrompts[savedPromptIndex]?.title || `promp${savedPromptIndex + 1}`;
                    }
                    updateSavedStatus();
                } catch (error) {
                    console.error("[PZ MiniMax] Cannot import prompts", error);
                } finally {
                    importInput.value = "";
                }
            });

            for (const section of SECTIONS) {
                const textWidget = findWidget(node, section);
                if (!textWidget) continue;
                hideNative(textWidget);

                const field = document.createElement("div");
                field.style.cssText = "display:flex;flex-direction:column;gap:4px;flex:1;min-height:104px;width:100%;";
                const label = document.createElement("div");
                label.textContent = SECTION_LABELS[section];
                label.style.cssText = "font-size:12px;font-weight:600;color:var(--fg-color);";
                const editor = makeEditor(textWidget, SECTION_PLACEHOLDERS[section]);
                editor.addEventListener("focus", () => { activeEditor = editor; });
                editors[section] = editor;
                editor.addEventListener("input", updatePromptPreview);
                field.append(label, editor);
                container.appendChild(field);
            }

            const originalResize = node.onResize;
            node.onResize = function (size) {
                originalResize?.apply(this, arguments);
                container.style.height = `${Math.max(520, size[1] - 80)}px`;
            };

            const originalConfigure = node.configure;
            node.configure = function (info) {
                const configured = originalConfigure?.apply(this, arguments);
                const customTags = node.properties?.pzMinimaxCustomTags || [];
                for (const tag of customTags) renderCustomTag(tag);
                for (const section of SECTIONS) {
                    const textWidget = findWidget(node, section);
                    if (editors[section] && textWidget) editors[section].value = textWidget.value || "";
                }
                updatePromptPreview();
                return configured;
            };

            container.style.height = "630px";
            updatePromptPreview();
            updateSavedStatus();
            refreshSavedPrompts();
            node.setDirtyCanvas?.(true, true);
            return result;
        };
    },
});
