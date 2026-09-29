import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { t } from "./i18n.js";

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

const GLOBAL_CUSTOM_TAGS_KEY = "pz_minimax_custom_tags";

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

async function uploadCsvLibrary(file) {
    const formData = new FormData();
    formData.append("file", file);
    try {
        const resp = await api.fetchApi("/pz_easyuse/tag-library/upload", {
            method: "POST",
            body: formData,
        });
        if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            throw new Error(data.error || "Upload failed");
        }
        _tagLibCsvCache = null;
        return true;
    } catch (e) {
        console.error("[PZ MiniMax] Cannot upload CSV", e);
        alert("上传失败 / Upload failed: " + e.message);
        return false;
    }
}

function flattenTags(library) {
    const result = [];
    const categories = library?.categories || [];
    for (const cat of categories) {
        for (const sub of cat.subcategories || []) {
            for (const tag of sub.tags || []) {
                if (tag.enabled === false) continue;
                result.push({
                    en: tag.en || "",
                    zh: tag.zh || "",
                    aliases: tag.aliases || [],
                    weight: tag.weight ?? 1.0,
                    categoryName: cat.name || "",
                    categoryIcon: cat.icon || "",
                    subcategoryName: sub.name || "",
                    categoryId: cat.id || "",
                    subcategoryId: sub.id || "",
                });
            }
        }
    }
    return result;
}

function filterTags(tags, query) {
    if (!query) return tags;
    const q = query.toLowerCase();
    return tags.filter(tag =>
        tag.en.toLowerCase().includes(q) ||
        tag.zh.toLowerCase().includes(q) ||
        tag.aliases.some(a => a.toLowerCase().includes(q))
    );
}

function mountTagPickerDialog(activeEditorRef, customInput, source = "json") {
    const dialog = document.createElement("dialog");
    dialog.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(900px,85vw);max-height:80vh;padding:0;border:1px solid var(--border-color);border-radius:10px;background:var(--comfy-bg,#1e1e1e);color:var(--input-text);overflow:hidden;";

    const style = document.createElement("style");
    style.textContent = `
        .pz-taglib-inner { display:flex;flex-direction:column;height:min(75vh,700px); }
        .pz-taglib-header { display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border-color);flex:none; }
        .pz-taglib-search { flex:1;padding:7px 10px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:13px;box-sizing:border-box;outline:none; }
        .pz-taglib-search:focus { border-color:#6ea8fe; }
        .pz-taglib-close { background:none;border:none;color:var(--input-text);font-size:20px;cursor:pointer;padding:0 4px;line-height:1;opacity:0.7; }
        .pz-taglib-close:hover { opacity:1; }
        .pz-taglib-body { display:flex;flex:1;min-height:0;overflow:hidden; }
        .pz-taglib-sidebar { width:200px;flex:none;border-right:1px solid var(--border-color);overflow-y:auto;padding:6px 0; }
        .pz-taglib-cat { padding:6px 12px;cursor:pointer;font-size:12px;color:var(--input-text);display:flex;align-items:center;gap:5px;user-select:none;border-radius:0; }
        .pz-taglib-cat:hover { background:color-mix(in srgb, var(--comfy-input-bg) 80%, #6ea8fe); }
        .pz-taglib-cat.active { background:color-mix(in srgb, var(--comfy-input-bg) 60%, #6ea8fe);font-weight:600; }
        .pz-taglib-sub { padding:4px 12px 4px 28px;cursor:pointer;font-size:11px;color:var(--desc-text,#aaa);user-select:none; }
        .pz-taglib-sub:hover { background:color-mix(in srgb, var(--comfy-input-bg) 80%, #6ea8fe); }
        .pz-taglib-sub.active { color:var(--input-text);font-weight:600;background:color-mix(in srgb, var(--comfy-input-bg) 60%, #6ea8fe); }
        .pz-taglib-content { flex:1;overflow-y:auto;padding:10px 14px; }
        .pz-taglib-tags { display:flex;flex-wrap:wrap;gap:6px; }
        .pz-taglib-chip { display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid var(--border-color);border-radius:14px;background:var(--comfy-input-bg);color:var(--input-text);font-size:11px;cursor:pointer;transition:border-color 120ms,background 120ms;user-select:none;line-height:1.3; }
        .pz-taglib-chip:hover { border-color:#6ea8fe;background:color-mix(in srgb, var(--comfy-input-bg) 80%, #6ea8fe); }
        .pz-taglib-chip .pz-taglib-zh { color:var(--desc-text,#aaa);font-size:10px; }
        .pz-taglib-chip .pz-taglib-w { color:#6ea8fe;font-size:10px;font-weight:600; }
        .pz-taglib-empty { padding:30px;text-align:center;color:var(--desc-text,#aaa);font-size:13px; }
        .pz-taglib-count { padding:4px 12px;font-size:10px;color:var(--desc-text,#aaa);border-bottom:1px solid color-mix(in srgb, var(--border-color) 50%, transparent); }
        .pz-taglib-toggle { display:flex;align-items:center;gap:5px;font-size:11px;color:var(--desc-text,#aaa);cursor:pointer;user-select:none;white-space:nowrap; }
        .pz-taglib-toggle input { cursor:pointer;accent-color:#6ea8fe; }
        .pz-taglib-pagination { display:flex;align-items:center;justify-content:center;gap:6px;padding:6px 12px;border-top:1px solid var(--border-color);flex:none;font-size:11px;color:var(--desc-text,#aaa); }
        .pz-taglib-pagination button { padding:3px 8px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;cursor:pointer; }
        .pz-taglib-pagination button:hover:not(:disabled) { border-color:#6ea8fe; }
        .pz-taglib-pagination button:disabled { opacity:0.4;cursor:default; }
        .pz-taglib-pagination select { padding:2px 4px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;cursor:pointer; }
        dialog::backdrop { background:rgba(0,0,0,0.5); }
    `;
    dialog.appendChild(style);

    const inner = document.createElement("div");
    inner.className = "pz-taglib-inner";

    const header = document.createElement("div");
    header.className = "pz-taglib-header";
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "pz-taglib-search";
    searchInput.placeholder = "搜索标签 (英文/中文/别名)...";
    const autoCloseLabel = document.createElement("label");
    autoCloseLabel.className = "pz-taglib-toggle";
    const autoCloseCheckbox = document.createElement("input");
    autoCloseCheckbox.type = "checkbox";
    autoCloseCheckbox.checked = localStorage.getItem("pz_taglib_auto_close") !== "false";
    autoCloseCheckbox.addEventListener("change", () => {
        localStorage.setItem("pz_taglib_auto_close", autoCloseCheckbox.checked ? "true" : "false");
    });
    autoCloseLabel.append(autoCloseCheckbox, document.createTextNode("选用后自动关闭"));
    const underscoreLabel = document.createElement("label");
    underscoreLabel.className = "pz-taglib-toggle";
    const underscoreCheckbox = document.createElement("input");
    underscoreCheckbox.type = "checkbox";
    underscoreCheckbox.checked = true;
    underscoreLabel.append(underscoreCheckbox, document.createTextNode("_ → 空格"));
    const closeButton = document.createElement("button");
    closeButton.className = "pz-taglib-close";
    closeButton.textContent = "×";
    closeButton.type = "button";
    header.append(searchInput, underscoreLabel, autoCloseLabel, closeButton);

    const body = document.createElement("div");
    body.className = "pz-taglib-body";
    const sidebar = document.createElement("div");
    sidebar.className = "pz-taglib-sidebar";
    const content = document.createElement("div");
    body.append(sidebar, content);
    content.className = "pz-taglib-content";

    const countBar = document.createElement("div");
    countBar.className = "pz-taglib-count";
    const tagsContainer = document.createElement("div");
    tagsContainer.className = "pz-taglib-tags";
    const paginationBar = document.createElement("div");
    paginationBar.className = "pz-taglib-pagination";
    content.append(countBar, tagsContainer, paginationBar);

    inner.append(header, body);
    dialog.appendChild(inner);

    let allTags = [];
    let activeCategoryId = null;
    let activeSubcategoryId = null;
    let currentQuery = "";
    let currentPage = 0;
    let pageSize = 200;
    let filteredTags = [];

    const updatePagination = () => {
        paginationBar.innerHTML = "";
        const totalPages = Math.max(1, Math.ceil(filteredTags.length / pageSize));
        if (currentPage >= totalPages) currentPage = totalPages - 1;
        if (currentPage < 0) currentPage = 0;

        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.textContent = "‹ 上一页";
        prevBtn.disabled = currentPage <= 0;
        prevBtn.addEventListener("click", () => { currentPage--; renderTags(); });

        const info = document.createElement("span");
        info.textContent = `${currentPage + 1} / ${totalPages} 页`;

        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.textContent = "下一页 ›";
        nextBtn.disabled = currentPage >= totalPages - 1;
        nextBtn.addEventListener("click", () => { currentPage++; renderTags(); });

        const sizeSelect = document.createElement("select");
        sizeSelect.title = "每页显示数量";
        for (const size of [100, 200, 500, 1000]) {
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
            node.setSize?.([900, 680]);

            const container = document.createElement("div");
            container.style.cssText = "display:flex;gap:12px;width:100%;height:100%;padding:8px 0;box-sizing:border-box;overflow:hidden;";

            const leftColumn = document.createElement("div");
            leftColumn.style.cssText = "display:flex;flex-direction:column;gap:8px;flex:1;min-width:0;overflow:auto;padding-right:4px;";

            const rightColumn = document.createElement("div");
            rightColumn.style.cssText = "display:flex;flex-direction:column;gap:8px;flex:2;min-width:0;overflow:auto;";

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
            container.append(leftColumn, rightColumn);
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
                if (renderedCustomTags.has(tag)) return null;
                renderedCustomTags.add(tag);
                const group = makeTagButton(tag, activeEditorRef, (group) => {
                    renderedCustomTags.delete(tag);
                    const globalTags = loadGlobalCustomTags().filter((item) => item !== tag);
                    saveGlobalCustomTags(globalTags);
                    node.properties = node.properties || {};
                    node.properties.pzMinimaxCustomTags = globalTags;
                    group.remove();
                    node.setDirtyCanvas?.(true, true);
                });
                tagBar.appendChild(group);
                return group;
            };

            const addCustomTag = () => {
                const tag = customInput.value.trim();
                if (!tag) return;
                renderCustomTag(tag);
                const globalTags = loadGlobalCustomTags();
                if (!globalTags.includes(tag)) {
                    globalTags.push(tag);
                    saveGlobalCustomTags(globalTags);
                }
                node.properties = node.properties || {};
                node.properties.pzMinimaxCustomTags = globalTags;
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
            leftColumn.append(tagTitle, tagBar, customRow);

            const tagPickerJson = mountTagPickerDialog(activeEditorRef, customInput, "json");
            document.body.appendChild(tagPickerJson.dialog);
            const searchJsonButton = makeActionButton("🔍 搜索标签库 (JSON)");
            searchJsonButton.addEventListener("click", () => tagPickerJson.open());

            const tagPickerCsv = mountTagPickerDialog(activeEditorRef, customInput, "csv");
            document.body.appendChild(tagPickerCsv.dialog);
            const searchCsvButton = makeActionButton("🔍 搜索标签库 (CSV)");
            searchCsvButton.addEventListener("click", () => tagPickerCsv.open());

            const searchRow = document.createElement("div");
            searchRow.style.cssText = "display:flex;gap:5px;width:100%;";
            searchJsonButton.style.cssText += "flex:1;height:29px;";
            searchCsvButton.style.cssText += "flex:1;height:29px;";
            searchRow.append(searchJsonButton, searchCsvButton);
            leftColumn.appendChild(searchRow);

            const previewWidget = findWidget(node, "prompt_preview");
            hideNative(previewWidget);
            const previewDetails = document.createElement("details");
            previewDetails.open = true;
            previewDetails.style.cssText = "width:100%;border:1px solid var(--border-color);border-radius:6px;background:color-mix(in srgb, var(--comfy-input-bg) 65%, transparent);box-sizing:border-box;";
            const previewSummary = document.createElement("summary");
            previewSummary.textContent = "完整提示词预览 / Full Prompt Preview";
            previewSummary.style.cssText = "padding:7px 9px;color:var(--fg-color);font-size:12px;font-weight:600;cursor:pointer;user-select:none;";
            const previewEditor = document.createElement("textarea");
            previewEditor.readOnly = true;
            previewEditor.placeholder = "完整提示词将在这里显示...";
            previewEditor.style.cssText = "display:block;width:calc(100% - 14px);flex:1;min-height:200px;margin:0 7px 7px;box-sizing:border-box;resize:vertical;padding:8px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;line-height:1.4;";
            previewDetails.style.cssText += "display:flex;flex-direction:column;flex:1;";
            previewDetails.append(previewSummary, previewEditor);
            leftColumn.appendChild(previewDetails);

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

            const titleSelect = document.createElement("select");
            titleSelect.style.cssText = "flex:1 1 100%;min-width:120px;padding:7px 9px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box;cursor:pointer;";
            const updateTitleSelect = () => {
                titleSelect.innerHTML = "";
                savedPrompts.forEach((prompt, index) => {
                    const title = prompt.title || `promp${index + 1}`;
                    const option = document.createElement("option");
                    option.value = String(index);
                    option.textContent = title;
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
                    titleInput.value = savedPrompts[newIndex]?.title || `promp${newIndex + 1}`;
                    updateSavedStatus();
                }
            });

            const titleInput = document.createElement("input");
            titleInput.type = "text";
            titleInput.placeholder = "提示词标题（默认 promp + 序号）";
            titleInput.style.cssText = "flex:1 1 100%;min-width:120px;padding:7px 9px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box;";

            const previousButton = makeActionButton("上一个 / Pre");
            const nextButton = makeActionButton("下一个 / Next");
            const addSaveButton = makeActionButton("新增保存 / Save New");
            const updateSaveButton = makeActionButton("保存修改 / Update");
            const deleteButton = makeActionButton("删除当前 / Del Current");
            const importButton = makeActionButton("导入 / Import");
            const exportButton = makeActionButton("导出 TXT / Export TXT");
            const importInput = document.createElement("input");
            importInput.type = "file";
            importInput.accept = ".json,application/json";
            importInput.style.display = "none";
            savedRow.append(titleSelect, titleInput, previousButton, nextButton, addSaveButton, updateSaveButton, deleteButton, importInput);
            rightColumn.append(savedTitle, savedRow);

            const openFolderButton = makeActionButton(t('openOutputFolder'));
            openFolderButton.style.cssText += "width:100%;flex:none;height:29px;";
            openFolderButton.addEventListener("click", async () => {
                try {
                    const response = await api.fetchApi("/pz/open_output_dir", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ path: "" }),
                    });
                    if (!response.ok) throw new Error(await response.text());
                } catch (e) {
                    alert(t('cannotOpenFolder') + e);
                }
            });

            const ioRow = document.createElement("div");
            ioRow.style.cssText = "display:flex;gap:5px;width:100%;";
            importButton.style.cssText += "flex:1;height:29px;";
            exportButton.style.cssText += "flex:1;height:29px;";
            ioRow.append(importButton, exportButton);
            leftColumn.append(ioRow, openFolderButton);

            const updateSavedStatus = () => {
                savedStatus.textContent = savedPrompts.length
                    ? `${savedPromptIndex + 1}/${savedPrompts.length}`
                    : "暂无保存记录 / Empty";
                previousButton.disabled = savedPromptIndex <= 0;
                nextButton.disabled = savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length - 1;
                updateSaveButton.disabled = savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length;
                exportButton.disabled = savedPrompts.length === 0;
                deleteButton.disabled = savedPromptIndex < 0 || savedPromptIndex >= savedPrompts.length;
                updateTitleSelect();
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
                    let title = titleInput.value.trim() || `promp${savedPrompts.length + 1}`;
                    const existingTitles = new Set(savedPrompts.map((p) => p.title));
                    if (existingTitles.has(title)) {
                        let counter = 2;
                        while (existingTitles.has(`${title} ${counter}`)) {
                            counter++;
                        }
                        title = `${title} ${counter}`;
                    }
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

            const FLEX_SECTION = "detailed_description";
            const FIXED_EDITOR_HEIGHT = "60px";

            for (const section of SECTIONS) {
                const textWidget = findWidget(node, section);
                if (!textWidget) continue;
                hideNative(textWidget);

                const isFlexible = section === FLEX_SECTION;
                const field = document.createElement("div");
                field.style.cssText = isFlexible
                    ? "display:flex;flex-direction:column;gap:4px;flex:1;min-height:120px;width:100%;"
                    : "display:flex;flex-direction:column;gap:4px;flex:none;width:100%;";
                const label = document.createElement("div");
                label.textContent = SECTION_LABELS[section];
                label.style.cssText = "font-size:12px;font-weight:600;color:var(--fg-color);";
                const editor = makeEditor(textWidget, SECTION_PLACEHOLDERS[section]);
                if (!isFlexible) {
                    editor.style.minHeight = FIXED_EDITOR_HEIGHT;
                    editor.style.height = FIXED_EDITOR_HEIGHT;
                    editor.style.resize = "none";
                } else {
                    editor.style.flex = "1";
                    editor.style.minHeight = "120px";
                }
                editor.addEventListener("focus", () => { activeEditor = editor; });
                editors[section] = editor;
                editor.addEventListener("input", updatePromptPreview);
                field.append(label, editor);
                rightColumn.appendChild(field);
            }

            const originalResize = node.onResize;
            node.onResize = function (size) {
                originalResize?.apply(this, arguments);
                container.style.height = `${Math.max(520, size[1] - 80)}px`;
            };

            const originalConfigure = node.configure;
            node.configure = function (info) {
                const configured = originalConfigure?.apply(this, arguments);
                const customTags = loadGlobalCustomTags();
                for (const tag of customTags) renderCustomTag(tag);
                for (const section of SECTIONS) {
                    const textWidget = findWidget(node, section);
                    if (editors[section] && textWidget) editors[section].value = textWidget.value || "";
                }
                updatePromptPreview();
                return configured;
            };

            container.style.height = "630px";
            for (const tag of loadGlobalCustomTags()) renderCustomTag(tag);
            updatePromptPreview();
            updateSavedStatus();
            refreshSavedPrompts();
            node.setDirtyCanvas?.(true, true);
            return result;
        };
    },
});
