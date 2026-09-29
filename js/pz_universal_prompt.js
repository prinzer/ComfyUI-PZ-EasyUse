import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "PZ_Universal_Prompt";
const FIELDS = ["prefix", "prompt", "suffix"];

const FIELD_LABELS = {
    prefix: "前缀 / Prefix",
    prompt: "正文 / Main Prompt",
    suffix: "后缀 / Suffix",
};

const FIELD_PLACEHOLDERS = {
    prefix: "输入前缀提示词（如风格、质量词等）...",
    prompt: "输入主要提示词内容...",
    suffix: "输入后缀提示词（如负面词、补充等）...",
};

const GLOBAL_CUSTOM_TAGS_KEY = "pz_universal_custom_tags";

function loadGlobalCustomTags() {
    try {
        const stored = localStorage.getItem(GLOBAL_CUSTOM_TAGS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveGlobalCustomTags(tags) {
    try {
        localStorage.setItem(GLOBAL_CUSTOM_TAGS_KEY, JSON.stringify(tags));
    } catch {}
}

function findWidget(node, name) {
    return node.widgets?.find((item) => item.name === name);
}

function hideNative(widget) {
    if (!widget) return;
    widget.type = "HIDDEN";
    widget.hidden = true;
    widget.computeSize = () => [0, 1];
    if (widget.element) {
        widget.element.style.display = "none";
        widget.element.hidden = true;
    }
}

function makeEditor(textWidget, placeholder) {
    const editor = document.createElement("textarea");
    editor.value = textWidget.value || "";
    editor.placeholder = placeholder;
    editor.style.cssText = "display:block;width:100%;height:100%;min-height:50px;box-sizing:border-box;resize:vertical;padding:6px 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;line-height:1.35;";
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

let _tagLibJsonCache = null;
let _tagLibCsvCache = null;

async function loadTagLibrary(source = "json") {
    if (source === "csv" && _tagLibCsvCache) return _tagLibCsvCache;
    if (source === "json" && _tagLibJsonCache) return _tagLibJsonCache;
    try {
        const resp = await api.fetchApi(`/pz_easyuse/tag-library?source=${encodeURIComponent(source)}`);
        if (!resp.ok) return null;
        const data = await resp.json();
        if (source === "csv") _tagLibCsvCache = data;
        else _tagLibJsonCache = data;
        return data;
    } catch {
        return null;
    }
}

function flattenTags(library) {
    const result = [];
    for (const cat of library.categories || []) {
        for (const sub of cat.subcategories || []) {
            for (const tag of sub.tags || []) {
                if (tag.enabled === false) continue;
                result.push({
                    en: tag.en || "",
                    zh: tag.zh || "",
                    aliases: tag.aliases || [],
                    weight: tag.weight || 1.0,
                    categoryId: cat.id,
                    subcategoryId: sub.id,
                });
            }
        }
    }
    return result;
}

function filterTags(tags, query) {
    const lower = query.toLowerCase();
    return tags.filter(t =>
        t.en.toLowerCase().includes(lower) ||
        (t.zh && t.zh.toLowerCase().includes(lower)) ||
        t.aliases.some(a => a.toLowerCase().includes(lower))
    );
}

function mountTagPickerDialog(activeEditorRef, customInput, source = "json") {
    const dialog = document.createElement("dialog");
    dialog.className = "pz-taglib-dialog";

    const style = document.createElement("style");
    style.textContent = `
        .pz-taglib-dialog { padding:0; border:none; border-radius:10px; background:var(--comfy-menu-bg); color:var(--input-text); max-width:90vw; width:860px; max-height:80vh; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,.45); }
        .pz-taglib-dialog::backdrop { background:rgba(0,0,0,.5); }
        .pz-taglib-header { display:flex; align-items:center; gap:8px; padding:10px 14px; border-bottom:1px solid var(--border-color); }
        .pz-taglib-header input[type="text"] { flex:1; padding:6px 10px; border:1px solid var(--border-color); border-radius:6px; background:var(--comfy-input-bg); color:var(--input-text); font:inherit; font-size:12px; }
        .pz-taglib-toggle { display:flex; align-items:center; gap:4px; font-size:11px; color:var(--desc-text); cursor:pointer; white-space:nowrap; }
        .pz-taglib-toggle input { cursor:pointer; }
        .pz-taglib-body { display:flex; height:60vh; }
        .pz-taglib-sidebar { width:160px; border-right:1px solid var(--border-color); overflow-y:auto; padding:6px 0; flex-shrink:0; }
        .pz-taglib-cat { padding:6px 12px; font-size:12px; cursor:pointer; border-radius:0; }
        .pz-taglib-cat:hover { background:var(--border-color); }
        .pz-taglib-cat.active { background:var(--comfy-input-bg); font-weight:600; }
        .pz-taglib-sub { padding:4px 12px 4px 24px; font-size:11px; cursor:pointer; color:var(--desc-text); }
        .pz-taglib-sub:hover { background:var(--border-color); }
        .pz-taglib-sub.active { color:var(--input-text); font-weight:600; }
        .pz-taglib-content { flex:1; display:flex; flex-direction:column; overflow:hidden; }
        .pz-taglib-count { padding:6px 12px; font-size:11px; color:var(--desc-text); border-bottom:1px solid var(--border-color); }
        .pz-taglib-tags { flex:1; overflow-y:auto; padding:8px; display:flex; flex-wrap:wrap; gap:6px; align-content:flex-start; }
        .pz-taglib-chip { display:inline-flex; flex-direction:column; padding:5px 10px; border:1px solid var(--border-color); border-radius:6px; font-size:11px; cursor:pointer; background:var(--comfy-input-bg); transition:background .15s; max-width:200px; }
        .pz-taglib-chip:hover { background:var(--border-color); }
        .pz-taglib-zh { font-size:10px; color:var(--desc-text); margin-top:2px; }
        .pz-taglib-w { font-size:9px; color:var(--error-text,#e74c3c); margin-left:4px; }
        .pz-taglib-empty { padding:24px; text-align:center; color:var(--desc-text); font-size:13px; }
        .pz-taglib-pagination { display:flex; align-items:center; justify-content:center; gap:8px; padding:8px; border-top:1px solid var(--border-color); font-size:11px; color:var(--desc-text); }
        .pz-taglib-pagination button { padding:3px 10px; border:1px solid var(--border-color); border-radius:4px; background:var(--comfy-input-bg); color:var(--input-text); cursor:pointer; font-size:11px; }
        .pz-taglib-pagination button:disabled { opacity:.4; cursor:default; }
        .pz-taglib-pagination select { padding:2px 6px; border:1px solid var(--border-color); border-radius:4px; background:var(--comfy-input-bg); color:var(--input-text); font-size:11px; }
        .pz-taglib-close { padding:4px 12px; border:1px solid var(--border-color); border-radius:6px; background:transparent; color:var(--input-text); cursor:pointer; font-size:12px; }
    `;
    dialog.appendChild(style);

    const header = document.createElement("div");
    header.className = "pz-taglib-header";
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "搜索标签 / Search tags...";
    const autoCloseLabel = document.createElement("label");
    autoCloseLabel.className = "pz-taglib-toggle";
    const autoCloseCheckbox = document.createElement("input");
    autoCloseCheckbox.type = "checkbox";
    autoCloseCheckbox.checked = localStorage.getItem("pz_taglib_auto_close") !== "false";
    autoCloseCheckbox.addEventListener("change", () => {
        localStorage.setItem("pz_taglib_auto_close", autoCloseCheckbox.checked ? "true" : "false");
    });
    autoCloseLabel.append(autoCloseCheckbox, document.createTextNode("自动关闭"));
    const underscoreLabel = document.createElement("label");
    underscoreLabel.className = "pz-taglib-toggle";
    const underscoreCheckbox = document.createElement("input");
    underscoreCheckbox.type = "checkbox";
    underscoreCheckbox.checked = true;
    underscoreLabel.append(underscoreCheckbox, document.createTextNode("_ → 空格"));
    const closeButton = document.createElement("button");
    closeButton.className = "pz-taglib-close";
    closeButton.textContent = "✕";
    header.append(searchInput, underscoreLabel, autoCloseLabel, closeButton);

    const body = document.createElement("div");
    body.className = "pz-taglib-body";
    const sidebar = document.createElement("div");
    sidebar.className = "pz-taglib-sidebar";
    const content = document.createElement("div");
    content.className = "pz-taglib-content";
    const countBar = document.createElement("div");
    countBar.className = "pz-taglib-count";
    const tagsContainer = document.createElement("div");
    tagsContainer.className = "pz-taglib-tags";
    const paginationBar = document.createElement("div");
    paginationBar.className = "pz-taglib-pagination";
    content.append(countBar, tagsContainer, paginationBar);
    body.append(sidebar, content);
    dialog.append(header, body);
    document.body.appendChild(dialog);

    let allTags = [];
    let activeCategoryId = null;
    let activeSubcategoryId = null;
    let currentQuery = "";
    let currentPage = 0;
    let pageSize = 200;
    let filteredTags = [];

    const updatePagination = () => {
        paginationBar.innerHTML = "";
        const totalPages = Math.ceil(filteredTags.length / pageSize);
        if (totalPages <= 1) return;
        const prevBtn = document.createElement("button");
        prevBtn.textContent = "上一页";
        prevBtn.disabled = currentPage === 0;
        prevBtn.addEventListener("click", () => { currentPage--; renderTags(); });
        const nextBtn = document.createElement("button");
        nextBtn.textContent = "下一页";
        nextBtn.disabled = currentPage >= totalPages - 1;
        nextBtn.addEventListener("click", () => { currentPage++; renderTags(); });
        const info = document.createElement("span");
        info.textContent = `${currentPage + 1} / ${totalPages}`;
        const sizeSelect = document.createElement("select");
        for (const size of [50, 100, 200, 500]) {
            const opt = document.createElement("option");
            opt.value = String(size);
            opt.textContent = `${size} / 页`;
            if (size === pageSize) opt.selected = true;
            sizeSelect.appendChild(opt);
        }
        sizeSelect.addEventListener("change", () => {
            pageSize = parseInt(sizeSelect.value, 10);
            currentPage = 0;
            renderTags();
        });
        paginationBar.append(prevBtn, info, nextBtn, sizeSelect);
    };

    const renderTags = () => {
        tagsContainer.innerHTML = "";
        filteredTags = allTags;
        if (currentQuery) {
            filteredTags = filterTags(allTags, currentQuery);
        } else if (activeCategoryId) {
            filteredTags = filteredTags.filter(t => t.categoryId === activeCategoryId);
            if (activeSubcategoryId) {
                filteredTags = filteredTags.filter(t => t.subcategoryId === activeSubcategoryId);
            }
        }
        countBar.textContent = `${filteredTags.length} 个标签`;
        if (!filteredTags.length) {
            paginationBar.innerHTML = "";
            const empty = document.createElement("div");
            empty.className = "pz-taglib-empty";
            empty.textContent = currentQuery ? "未找到匹配的标签" : "此分类下暂无标签";
            tagsContainer.appendChild(empty);
            return;
        }
        const start = currentPage * pageSize;
        const pageTags = filteredTags.slice(start, start + pageSize);
        const fragment = document.createDocumentFragment();
        for (const tag of pageTags) {
            const chip = document.createElement("span");
            chip.className = "pz-taglib-chip";
            const enSpan = document.createElement("span");
            enSpan.textContent = tag.en;
            chip.appendChild(enSpan);
            if (tag.zh) {
                const zhSpan = document.createElement("span");
                zhSpan.className = "pz-taglib-zh";
                zhSpan.textContent = tag.zh;
                chip.appendChild(zhSpan);
            }
            if (tag.weight && tag.weight !== 1.0) {
                const wSpan = document.createElement("span");
                wSpan.className = "pz-taglib-w";
                wSpan.textContent = `×${tag.weight}`;
                chip.appendChild(wSpan);
            }
            chip.title = tag.en + (tag.zh ? ` (${tag.zh})` : "");
            const displayEn = underscoreCheckbox.checked ? tag.en.replace(/_/g, " ") : tag.en;
            chip.addEventListener("click", () => {
                insertTag(activeEditorRef.current, displayEn);
                customInput.value = displayEn;
                if (autoCloseCheckbox.checked) {
                    dialog.close();
                } else {
                    customInput.focus();
                }
            });
            fragment.appendChild(chip);
        }
        tagsContainer.appendChild(fragment);
        updatePagination();
    };

    const buildSidebar = () => {
        sidebar.innerHTML = "";
        const library = source === "csv" ? _tagLibCsvCache : _tagLibJsonCache;
        if (!library) return;
        const categories = library.categories || [];
        const allItem = document.createElement("div");
        allItem.className = "pz-taglib-cat" + (!activeCategoryId ? " active" : "");
        allItem.textContent = "📋 全部标签";
        allItem.addEventListener("click", () => {
            activeCategoryId = null;
            activeSubcategoryId = null;
            currentPage = 0;
            buildSidebar();
            renderTags();
        });
        sidebar.appendChild(allItem);

        for (const cat of categories) {
            const catEl = document.createElement("div");
            catEl.className = "pz-taglib-cat" + (activeCategoryId === cat.id ? " active" : "");
            catEl.textContent = `${cat.icon || "📁"} ${cat.name}`;
            catEl.addEventListener("click", () => {
                activeCategoryId = cat.id;
                activeSubcategoryId = null;
                currentPage = 0;
                buildSidebar();
                renderTags();
            });
            sidebar.appendChild(catEl);

            if (activeCategoryId === cat.id) {
                for (const sub of cat.subcategories || []) {
                    const subEl = document.createElement("div");
                    subEl.className = "pz-taglib-sub" + (activeSubcategoryId === sub.id ? " active" : "");
                    subEl.textContent = sub.name;
                    subEl.addEventListener("click", () => {
                        activeSubcategoryId = activeSubcategoryId === sub.id ? null : sub.id;
                        currentPage = 0;
                        buildSidebar();
                        renderTags();
                    });
                    sidebar.appendChild(subEl);
                }
            }
        }
    };

    searchInput.addEventListener("input", () => {
        currentQuery = searchInput.value.trim();
        currentPage = 0;
        renderTags();
    });

    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (e) => {
        if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener("keydown", (e) => {
        if (e.key === "Escape") dialog.close();
    });

    return {
        dialog,
        async open() {
            const library = await loadTagLibrary(source);
            if (!library) {
                alert("无法加载标签库 / Cannot load tag library");
                return;
            }
            allTags = flattenTags(library);
            activeCategoryId = null;
            activeSubcategoryId = null;
            currentPage = 0;
            currentQuery = "";
            searchInput.value = "";
            buildSidebar();
            renderTags();
            searchInput.focus();
            dialog.showModal();
        }
    };
}

app.registerExtension({
    name: "PZ.UniversalPrompt",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            const node = this;
            node.setSize?.([600, 600]);

            const editors = {};
            let activeEditor = null;
            const renderedCustomTags = new Set();
            let savedPrompts = [];
            let savedPromptIndex = -1;

            for (const field of FIELDS) {
                const w = findWidget(node, field);
                hideNative(w);
            }

            const container = document.createElement("div");
            container.style.cssText = "display:flex;flex-direction:column;gap:8px;width:100%;height:100%;min-height:360px;box-sizing:border-box;";

            const activeEditorRef = { current: null };

            const makeActionButton = (label) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.textContent = label;
                btn.className = "pz-universal-button";
                return btn;
            };

            const buttonStyle = document.createElement("style");
            buttonStyle.textContent = `
                .pz-universal-button {
                    border: 1px solid color-mix(in srgb, var(--border-color) 75%, #6ea8fe);
                    border-radius: 6px;
                    background: linear-gradient(180deg, color-mix(in srgb, var(--comfy-input-bg) 92%, #6ea8fe), var(--comfy-input-bg));
                    color: var(--input-text);
                    cursor: pointer;
                    font: inherit;
                    font-size: 11px;
                    line-height: 1.2;
                    padding: 5px 8px;
                    white-space: nowrap;
                    transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
                }
                .pz-universal-button:hover:not(:disabled) {
                    border-color: #7db3ff;
                    background: color-mix(in srgb, var(--comfy-input-bg) 82%, #6ea8fe);
                    transform: translateY(-1px);
                }
                .pz-universal-button:active:not(:disabled) { transform: translateY(0); }
                .pz-universal-button:disabled { cursor: default; opacity: 0.45; }
            `;
            container.appendChild(buttonStyle);

            const layout = node.addDOMWidget("pz_universal_prompt_layout", "universal_prompt", container);
            layout.computeSize = () => [node.size[0], Math.max(340, node.size[1] - 60 - FIELDS.length)];

            // === TOP: Tag search + custom tags ===
            const topRow = document.createElement("div");
            topRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;flex-shrink:0;";

            const searchJsonButton = makeActionButton("🔍JSON");
            const searchCsvButton = makeActionButton("🔍CSV");
            const jsonDialog = mountTagPickerDialog(activeEditorRef, { value: "", focus: () => {} }, "json");
            const csvDialog = mountTagPickerDialog(activeEditorRef, { value: "", focus: () => {} }, "csv");
            searchJsonButton.addEventListener("click", () => jsonDialog.open());
            searchCsvButton.addEventListener("click", () => csvDialog.open());

            const customInput = document.createElement("input");
            customInput.type = "text";
            customInput.placeholder = "自定义标签...";
            customInput.style.cssText = "width:100px;padding:5px 8px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box;";
            const customAddBtn = makeActionButton("+");

            let globalCustomTags = loadGlobalCustomTags();
            let nodeCustomTags = node.properties?.pzUniversalCustomTags || [];
            const allCustomTags = [...new Set([...globalCustomTags, ...nodeCustomTags])];

            const addCustomTag = () => {
                const tag = customInput.value.trim();
                if (!tag) return;
                if (!allCustomTags.includes(tag)) {
                    allCustomTags.push(tag);
                    globalCustomTags = allCustomTags.filter(t => !nodeCustomTags.includes(t));
                    saveGlobalCustomTags(globalCustomTags);
                }
                customInput.value = "";
            };

            customAddBtn.addEventListener("click", addCustomTag);
            customInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") addCustomTag();
            });

            const customTagsRow = document.createElement("div");
            customTagsRow.style.cssText = "display:flex;flex-wrap:wrap;gap:3px;width:100%;";
            const renderCustomTags = () => {
                customTagsRow.innerHTML = "";
                renderedCustomTags.clear();
                for (const tag of allCustomTags) {
                    if (renderedCustomTags.has(tag)) continue;
                    renderedCustomTags.add(tag);
                    const chip = document.createElement("span");
                    chip.textContent = tag;
                    chip.style.cssText = "padding:2px 6px;border:1px solid var(--border-color);border-radius:10px;font-size:9px;cursor:pointer;background:var(--comfy-input-bg);";
                    chip.addEventListener("click", () => {
                        insertTag(activeEditorRef.current, tag);
                    });
                    customTagsRow.appendChild(chip);
                }
            };
            renderCustomTags();

            topRow.append(searchJsonButton, searchCsvButton, customInput, customAddBtn);
            container.append(topRow, customTagsRow);

            // === MIDDLE: Three text editors ===
            for (const field of FIELDS) {
                const textWidget = findWidget(node, field);
                if (!textWidget) continue;
                const editorWrap = document.createElement("div");
                editorWrap.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0;";
                const label = document.createElement("div");
                label.textContent = FIELD_LABELS[field];
                label.style.cssText = "font-size:11px;font-weight:600;color:var(--fg-color);margin-bottom:2px;flex-shrink:0;";
                const editor = makeEditor(textWidget, FIELD_PLACEHOLDERS[field]);
                editor.style.flex = "1";
                editor.addEventListener("focus", () => {
                    activeEditor = editor;
                    activeEditorRef.current = editor;
                });
                editors[field] = editor;
                editorWrap.append(label, editor);
                container.appendChild(editorWrap);
            }

            // === BOTTOM ROW 1: Select + Title ===
            const selectRow = document.createElement("div");
            selectRow.style.cssText = "display:flex;gap:6px;align-items:center;padding-top:6px;border-top:1px solid var(--border-color);flex-shrink:0;";

            const titleSelect = document.createElement("select");
            titleSelect.style.cssText = "flex:1;min-width:100px;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box;cursor:pointer;";
            const updateTitleSelect = () => {
                titleSelect.innerHTML = "";
                savedPrompts.forEach((prompt, index) => {
                    const title = prompt.title || `prompt_${index + 1}`;
                    const option = document.createElement("option");
                    option.value = String(index);
                    option.textContent = title.length > 12 ? title.slice(0, 12) + "..." : title;
                    titleSelect.appendChild(option);
                });
                if (savedPromptIndex >= 0 && savedPromptIndex < savedPrompts.length) {
                    titleSelect.value = String(savedPromptIndex);
                }
            };

            titleSelect.addEventListener("change", () => {
                const newIndex = parseInt(titleSelect.value, 10);
                if (!isNaN(newIndex) && newIndex >= 0 && newIndex < savedPrompts.length && newIndex !== savedPromptIndex) {
                    savedPromptIndex = newIndex;
                    applyPrompt(savedPrompts[newIndex]);
                    titleInput.value = savedPrompts[newIndex]?.title || `prompt_${newIndex + 1}`;
                    updateSavedStatus();
                }
            });

            const titleInput = document.createElement("input");
            titleInput.type = "text";
            titleInput.placeholder = "标题";
            titleInput.style.cssText = "flex:1;min-width:100px;padding:6px 8px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box;";

            selectRow.append(titleSelect, titleInput);
            container.appendChild(selectRow);

            // === BOTTOM ROW 2: Navigation + Save buttons ===
            const savedRow = document.createElement("div");
            savedRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;flex-shrink:0;";

            const previousButton = makeActionButton("◀ 上一个");
            const nextButton = makeActionButton("▶ 下一个");
            const addSaveButton = makeActionButton("💾 新增保存 / Save New");
            const updateSaveButton = makeActionButton("📝 更新 / Update");
            const deleteButton = makeActionButton("🗑 删除当前 / Del Current");

            const savedStatus = document.createElement("span");
            savedStatus.style.cssText = "font-size:9px;color:var(--desc-text);margin-left:auto;";

            savedRow.append(previousButton, nextButton, addSaveButton, updateSaveButton, deleteButton, savedStatus);
            container.appendChild(savedRow);

            // === BOTTOM ROW 3: Import/Export/Open folder ===
            const ioRow = document.createElement("div");
            ioRow.style.cssText = "display:flex;gap:6px;align-items:center;flex-shrink:0;";
            const importButton = makeActionButton("导入 / Import");
            const exportButton = makeActionButton("导出 TXT / Export TXT");
            const openFolderButton = makeActionButton("📂打开OUT文件夹");
            const importInput = document.createElement("input");
            importInput.type = "file";
            importInput.accept = ".json,application/json";
            importInput.style.display = "none";
            ioRow.append(importButton, exportButton, openFolderButton, importInput);
            container.appendChild(ioRow);

            const updateSavedStatus = () => {
                savedStatus.textContent = savedPrompts.length
                    ? `${savedPromptIndex + 1}/${savedPrompts.length}`
                    : "空";
                previousButton.disabled = savedPromptIndex <= 0;
                nextButton.disabled = savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length - 1;
                updateSaveButton.disabled = savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length;
                exportButton.disabled = savedPrompts.length === 0;
                deleteButton.disabled = savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length;
                updateTitleSelect();
            };

            const readCurrentPrompt = () => Object.fromEntries(
                FIELDS.map((field) => [field, editors[field]?.value || ""]),
            );

            const applyPrompt = (prompt) => {
                for (const field of FIELDS) {
                    const editor = editors[field];
                    const textWidget = findWidget(node, field);
                    if (!editor || !textWidget) continue;
                    editor.value = prompt[field] || "";
                    textWidget.value = editor.value;
                    textWidget.callback?.call(textWidget, editor.value);
                }
                node.setDirtyCanvas?.(true, true);
            };

            const refreshSavedPrompts = async () => {
                try {
                    const response = await fetch("/pz_easyuse/universal-prompts");
                    const data = await response.json();
                    savedPrompts = Array.isArray(data.prompts) ? data.prompts : [];
                    savedPromptIndex = savedPrompts.length ? savedPrompts.length - 1 : -1;
                    titleInput.value = savedPromptIndex >= 0
                        ? (savedPrompts[savedPromptIndex]?.title || `prompt_${savedPromptIndex + 1}`)
                        : "";
                } catch (error) {
                    console.warn("[PZ Universal] Cannot load saved prompts", error);
                }
                updateSavedStatus();
            };

            const saveNewPrompt = async () => {
                try {
                    let title = titleInput.value.trim() || `prompt_${savedPrompts.length + 1}`;
                    const existingTitles = new Set(savedPrompts.map((p) => p.title));
                    if (existingTitles.has(title)) {
                        let counter = 2;
                        while (existingTitles.has(`${title} ${counter}`)) {
                            counter++;
                        }
                        title = `${title} ${counter}`;
                    }
                    const response = await fetch("/pz_easyuse/universal-prompts", {
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
                    console.error("[PZ Universal] Cannot save prompt", error);
                }
            };

            const updateCurrentPrompt = async () => {
                if (savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length) return;
                try {
                    const title = titleInput.value.trim() || `prompt_${savedPromptIndex + 1}`;
                    const response = await fetch(`/pz_easyuse/universal-prompts/${savedPromptIndex}`, {
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
                    console.error("[PZ Universal] Cannot update prompt", error);
                }
            };

            const moveSavedPrompt = (step) => {
                if (!savedPrompts.length) return;
                savedPromptIndex = Math.max(0, Math.min(savedPrompts.length - 1, savedPromptIndex + step));
                applyPrompt(savedPrompts[savedPromptIndex]);
                titleInput.value = savedPrompts[savedPromptIndex]?.title || `prompt_${savedPromptIndex + 1}`;
                updateSavedStatus();
            };

            const exportSavedPrompts = async () => {
                if (!savedPrompts.length) return;
                const content = JSON.stringify(savedPrompts, null, 2);
                try {
                    if (typeof window.showDirectoryPicker === "function") {
                        const directory = await window.showDirectoryPicker({ mode: "readwrite" });
                        const file = await directory.getFileHandle("pz_universal_prompts.txt", { create: true });
                        const writable = await file.createWritable();
                        await writable.write(content);
                        await writable.close();
                        return;
                    }
                } catch (error) {
                    if (error.name === "AbortError") return;
                    console.warn("[PZ Universal] Cannot write to selected folder, using download", error);
                }
                const blob = new Blob([content], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "pz_universal_prompts.json";
                a.click();
                URL.revokeObjectURL(url);
            };

            const importSavedPrompts = async (file) => {
                try {
                    const text = await file.text();
                    const imported = JSON.parse(text);
                    if (!Array.isArray(imported)) throw new Error("Invalid format");
                    const response = await fetch("/pz_easyuse/universal-prompts/import", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ prompts: imported }),
                    });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Import failed");
                    savedPrompts = data.prompts || [];
                    savedPromptIndex = savedPrompts.length - 1;
                    if (savedPromptIndex >= 0) {
                        applyPrompt(savedPrompts[savedPromptIndex]);
                        titleInput.value = savedPrompts[savedPromptIndex]?.title || `prompt_${savedPromptIndex + 1}`;
                    }
                    updateSavedStatus();
                } catch (error) {
                    console.error("[PZ Universal] Cannot import prompts", error);
                    alert("导入失败 / Import failed: " + error.message);
                }
            };

            const deleteCurrentPrompt = async () => {
                if (savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length) return;
                try {
                    const response = await fetch(`/pz_easyuse/universal-prompts/${savedPromptIndex}`, { method: "DELETE" });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Delete failed");
                    savedPrompts = Array.isArray(data.prompts) ? data.prompts : [];
                    savedPromptIndex = savedPrompts.length
                        ? Math.min(savedPromptIndex, savedPrompts.length - 1)
                        : -1;
                    if (savedPromptIndex >= 0) {
                        applyPrompt(savedPrompts[savedPromptIndex]);
                        titleInput.value = savedPrompts[savedPromptIndex]?.title || `prompt_${savedPromptIndex + 1}`;
                    } else {
                        applyPrompt({});
                        titleInput.value = "";
                    }
                    updateSavedStatus();
                } catch (error) {
                    console.error("[PZ Universal] Cannot delete prompt", error);
                }
            };

            addSaveButton.addEventListener("click", saveNewPrompt);
            updateSaveButton.addEventListener("click", updateCurrentPrompt);
            previousButton.addEventListener("click", () => moveSavedPrompt(-1));
            nextButton.addEventListener("click", () => moveSavedPrompt(1));
            exportButton.addEventListener("click", exportSavedPrompts);
            deleteButton.addEventListener("click", deleteCurrentPrompt);
            importButton.addEventListener("click", () => importInput.click());
            importInput.addEventListener("change", () => {
                const file = importInput.files?.[0];
                if (file) importSavedPrompts(file);
                importInput.value = "";
            });
            openFolderButton.addEventListener("click", async () => {
                try {
                    const response = await api.fetchApi("/pz/open_output_dir", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ path: "" }),
                    });
                    if (!response.ok) throw new Error(await response.text());
                } catch (e) {
                    alert("无法打开文件夹 / Cannot open folder: " + e);
                }
            });

            refreshSavedPrompts();

            // Restore state on workflow load
            const originalConfigure = node.configure;
            node.configure = function(info) {
                const configured = originalConfigure?.apply(this, arguments);
                for (const field of FIELDS) {
                    const editor = editors[field];
                    const textWidget = findWidget(node, field);
                    if (editor && textWidget) {
                        editor.value = textWidget.value || "";
                    }
                }
                nodeCustomTags = node.properties?.pzUniversalCustomTags || [];
                const merged = [...new Set([...globalCustomTags, ...nodeCustomTags])];
                allCustomTags.length = 0;
                allCustomTags.push(...merged);
                renderCustomTags();
                return configured;
            };

            // Resize handler
            const originalResize = node.onResize;
            node.onResize = function() {
                originalResize?.apply(this, arguments);
                container.style.height = `${Math.max(340, node.size[1] - 60 - FIELDS.length)}px`;
            };

            return result;
        };
    },
});
