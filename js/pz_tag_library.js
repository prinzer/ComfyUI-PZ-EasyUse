import { api } from "../../scripts/api.js";
import { t } from "./i18n.js";

let _tagLibJsonCache = null;
let _tagLibCsvCache = null;

export async function loadTagLibrary(source = "json") {
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

export function flattenTags(library) {
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

export function filterTags(tags, query) {
    if (!query) return tags;
    const q = query.toLowerCase();
    return tags.filter(tag =>
        tag.en.toLowerCase().includes(q) ||
        tag.zh.toLowerCase().includes(q) ||
        tag.aliases.some(a => a.toLowerCase().includes(q))
    );
}

export function insertTagIntoEditor(editor, tag) {
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

export function mountTagPickerDialog(activeEditorRef, customInput, source = "json") {
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
                insertTagIntoEditor(activeEditorRef.current, displayEn);
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

export function createOpenFolderButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = t('openOutputFolder');
    button.style.cssText = "width:100%;flex:none;height:29px;border:1px solid color-mix(in srgb, var(--border-color) 75%, #6ea8fe);border-radius:6px;background:linear-gradient(180deg, color-mix(in srgb, var(--comfy-input-bg) 92%, #6ea8fe), var(--comfy-input-bg));color:var(--input-text);cursor:pointer;font:inherit;font-size:11px;line-height:1.2;";
    button.addEventListener("click", async () => {
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
    return button;
}
