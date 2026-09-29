import { app } from "../../scripts/app.js";
import { t } from "./i18n.js";

console.log(`%c ${t('loaded')}`, "color:green; font-weight:bold;");

// ========================================================
// ⚡ Core Logic: Generic Radio Mutex Handler
// ========================================================
function attachRadioLogic(node, maxRows) {
    
    // Get mode Widget
    const modeWidget = node.widgets.find(w => w.name === t('mode'));
    if (!modeWidget) return;

    // Helper function: Check if currently in radio mode
    const isRadioMode = () => modeWidget.value && modeWidget.value.includes("Radio");

    // Iterate through all row switches
    for (let i = 1; i <= maxRows; i++) {
        const num = i.toString().padStart(2, '0');
        const activeName = `[${num}] ${t('enabled')}`;
        
        // Try to find this toggle (may be hidden/converted due to dynamic display, must work after updateVisibility)
        // Note: We only process toggles currently in the widgets list
        const toggle = node.widgets.find(w => w.name === activeName);
        
        if (toggle && !toggle.hasPZRadioLogic) {
            // Mark to prevent duplicate binding
            toggle.hasPZRadioLogic = true; 
            
            const originalCallback = toggle.callback;
            
            toggle.callback = function(value) {
                // Only trigger mutex in [Radio Mode] and [currently enabled]
                if (isRadioMode() && value === true) {
                    
                    // Iterate to find other toggles and turn them off
                    for (let j = 1; j <= maxRows; j++) {
                        const otherNum = j.toString().padStart(2, '0');
                        // Skip self
                        if (otherNum === num) continue; 
                        
                        const otherName = `[${otherNum}] ${t('enabled')}`;
                        const otherToggle = node.widgets.find(w => w.name === otherName);
                        
                        if (otherToggle && otherToggle.value === true) {
                            otherToggle.value = false;
                        }
                    }
                    app.graph.setDirtyCanvas(true, true);
                }

                // Execute original callback (if any)
                if (originalCallback) {
                    originalCallback.apply(this, arguments);
                }
            };
        }
    }
}

app.registerExtension({
    name: "PZ.EasyUse.Manager", 
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        
        // ==========================================
        // 1. Prompt Nodes (Custom DOM UI)
        // ==========================================
        if (nodeData.name === "PZ_Prompt_Dynamic" || nodeData.name === "PZ_Prompt_Fixed" || nodeData.name === "PZ_Prompt_Dynamic_ML") {
            const isDynamic = nodeData.name === "PZ_Prompt_Dynamic" || nodeData.name === "PZ_Prompt_Dynamic_ML";
            const isMultiline = nodeData.name === "PZ_Prompt_Dynamic_ML";
            const DEFAULT_VISIBLE_ROWS = isDynamic ? 5 : 10;
            const MAX_ROWS = isDynamic ? 50 : 10;
            const getNames = (i) => {
                const num = i.toString().padStart(2, '0');
                return { active: `[${num}] ${t('enabled')}`, prompt: `[${num}] ${t('prompt')}`, title: `[${num}] ${t('title')}` };
            };

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const node = this;
                node.visibleRows = node.visibleRows || DEFAULT_VISIBLE_ROWS;

                // ---- DOM container ----
                const box = document.createElement("div");
                box.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;padding:4px 0;box-sizing:border-box;";

                const pfx = isMultiline ? "pz-ml-" : "pz-";
                const css = document.createElement("style");
                css.textContent = `
.${pfx}prow{display:flex;${isMultiline ? 'flex-direction:column;gap:4px;' : 'gap:6px;align-items:center;'}padding:5px 6px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg)}
${isMultiline ? `.${pfx}prow-top{display:flex;align-items:center;gap:6px}` : ''}
.pz-sw{flex:0 0 auto;position:relative;width:36px;height:20px}
.pz-sw input{opacity:0;width:0;height:0;position:absolute}
.pz-sl{position:absolute;cursor:pointer;inset:0;background:#555;transition:.3s;border-radius:20px}
.pz-sl:before{position:absolute;content:"";height:16px;width:16px;left:2px;bottom:2px;background:#fff;transition:.3s;border-radius:50%}
.pz-sw input:checked+.pz-sl{background:#6ea8fe}
.pz-sw input:checked+.pz-sl:before{transform:translateX(16px)}
.${pfx}pti{${isMultiline ? 'width:100%;min-height:48px;resize:vertical;' : 'flex:1;min-width:0;'}padding:4px 6px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-menu-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box}
${isMultiline ? `.${pfx}tl{font-size:10px;color:var(--desc-text);white-space:nowrap}` : ''}
${isMultiline ? `.${pfx}title-input{flex:1;min-width:0;padding:3px 6px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-menu-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box}` : ''}
.pz-nav{flex:1;padding:5px;border:1px dashed var(--border-color);border-radius:6px;background:transparent;color:var(--desc-text);cursor:pointer;font:inherit;font-size:11px}
.pz-nav:hover{border-color:var(--input-text);color:var(--input-text);background:var(--comfy-input-bg)}
                `;
                box.appendChild(css);

                const rowsContainer = document.createElement("div");
                rowsContainer.style.cssText = "display:flex;flex-direction:column;gap:4px;";
                box.appendChild(rowsContainer);

                // ---- sync DOM from native widget values ----
                function syncFromNative() {
                    const allRows = rowsContainer.querySelectorAll(`.${pfx}prow`);
                    for (let i = 1; i <= node.visibleRows; i++) {
                        const names = getNames(i);
                        const eW = node.widgets.find(w => w.name === names.active);
                        const pW = node.widgets.find(w => w.name === names.prompt);
                        const tW = isMultiline ? node.widgets.find(w => w.name === names.title) : null;
                        const rowEl = allRows[i - 1];
                        if (!rowEl) continue;

                        const cb = rowEl.querySelector(".pz-sw input");
                        const ti = rowEl.querySelector(`.${pfx}pti`);
                        const titleEl = isMultiline ? rowEl.querySelector(`.${pfx}title-input`) : null;

                        if (cb && eW) cb.checked = !!eW.value;
                        if (ti && pW) ti.value = pW.value || "";
                        if (titleEl && tW) titleEl.value = tW.value || "";
                    }
                }

                // ---- build one row ----
                function buildRow(idx) {
                    const names = getNames(idx);
                    const eW = node.widgets.find(w => w.name === names.active);
                    const pW = node.widgets.find(w => w.name === names.prompt);
                    if (!eW || !pW) return null;

                    const row = document.createElement("div");
                    row.className = pfx + "prow";

                    const sw = document.createElement("label");
                    sw.className = "pz-sw";
                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.checked = !!eW.value;
                    const slider = document.createElement("span");
                    slider.className = "pz-sl";
                    sw.append(cb, slider);

                    if (isMultiline) {
                        const tW = node.widgets.find(w => w.name === names.title);

                        const top = document.createElement("div");
                        top.className = pfx + "prow-top";

                        const titleInput = document.createElement("input");
                        titleInput.type = "text";
                        titleInput.className = pfx + "title-input";
                        titleInput.value = tW?.value || "";
                        titleInput.placeholder = t('title') + " " + idx;

                        const label = document.createElement("span");
                        label.className = pfx + "tl";
                        label.textContent = `[${idx.toString().padStart(2, '0')}]`;
                        top.append(titleInput, sw, label);
                        row.appendChild(top);

                        const ti = document.createElement("textarea");
                        ti.className = pfx + "pti";
                        ti.value = pW.value || "";
                        ti.placeholder = t('prompt') + " " + idx;
                        ti.rows = 2;
                        row.appendChild(ti);

                        titleInput.addEventListener("change", () => {
                            if (tW) {
                                tW.value = titleInput.value;
                                tW.callback?.call(tW, titleInput.value);
                            }
                        });

                        ti.addEventListener("input", () => {
                            pW.value = ti.value;
                            pW.callback?.call(pW, ti.value);
                        });
                    } else {
                        const ti = document.createElement("input");
                        ti.type = "text";
                        ti.className = pfx + "pti";
                        ti.value = pW.value || "";
                        ti.placeholder = t('prompt') + " " + idx;
                        row.append(sw, ti);

                        ti.addEventListener("change", () => {
                            pW.value = ti.value;
                            pW.callback?.call(pW, ti.value);
                        });
                    }

                    // Events
                    cb.addEventListener("change", () => {
                        eW.value = cb.checked;
                        eW.callback?.call(eW, cb.checked);
                        syncFromNative();
                        app.graph.setDirtyCanvas(true, true);
                    });

                    return row;
                }

                // ---- paint ----
                function paint() {
                    rowsContainer.innerHTML = "";
                    for (let i = 1; i <= node.visibleRows; i++) {
                        const r = buildRow(i);
                        if (r) rowsContainer.appendChild(r);
                    }

                    if (isDynamic) {
                        const nav = document.createElement("div");
                        nav.style.cssText = "display:flex;gap:6px;";

                        if (node.visibleRows > DEFAULT_VISIBLE_ROWS) {
                            const btn = document.createElement("button");
                            btn.className = "pz-nav";
                            btn.textContent = "▲ " + t('removeRow');
                            btn.onclick = () => {
                                const names = getNames(node.visibleRows);
                                const eW = node.widgets.find(w => w.name === names.active);
                                const pW = node.widgets.find(w => w.name === names.prompt);
                                const tW = isMultiline ? node.widgets.find(w => w.name === names.title) : null;
                                if (eW) { eW.value = false; }
                                if (pW) { pW.value = ""; }
                                if (tW) { tW.value = ""; }
                                node.visibleRows--;
                                paint();
                                app.graph.setDirtyCanvas(true, true);
                            };
                            nav.appendChild(btn);
                        }

                        if (node.visibleRows < MAX_ROWS) {
                            const btn = document.createElement("button");
                            btn.className = "pz-nav";
                            btn.textContent = `▼ ${t('addRow')} (${node.visibleRows}/${MAX_ROWS})`;
                            btn.onclick = () => {
                                node.visibleRows++;
                                paint();
                                app.graph.setDirtyCanvas(true, true);
                            };
                            nav.appendChild(btn);
                        }

                        if (nav.children.length) rowsContainer.appendChild(nav);
                    }

                    requestAnimationFrame(() => {
                        const h = calcH();
                        node.setSize?.([node.size[0], h]);
                    });
                }

                function calcH() {
                    const rowH = isMultiline ? 90 : 36;
                    const gap = 4;
                    const navH = isDynamic ? 40 : 0;
                    return Math.max(isMultiline ? 120 : 80, node.visibleRows * (rowH + gap) + navH + 20);
                }

                node._pzPaint = paint;

                // ---- hide all native prompt widgets ----
                for (let i = 1; i <= MAX_ROWS; i++) {
                    const names = getNames(i);
                    const keys = isMultiline ? ['active', 'prompt', 'title'] : ['active', 'prompt'];
                    for (const key of keys) {
                        const w = node.widgets.find(w => w.name === names[key]);
                        if (w) {
                            w.type = "converted-widget";
                            w.computeSize = () => [0, -4];
                        }
                    }
                }

                // ---- register DOM widget ----
                const dom = node.addDOMWidget("pz_prompt_ui", "pzPrompt", box);
                dom.computeSize = () => [node.size[0], calcH()];

                // ---- mode switch callback (Dynamic only) ----
                if (isDynamic) {
                    const modeWidget = node.widgets.find(w => w.name === t('mode'));
                    if (modeWidget) {
                        modeWidget.callback = () => {
                            if (modeWidget.value.includes("Radio")) {
                                let foundFirst = false;
                                for (let i = 1; i <= MAX_ROWS; i++) {
                                    const w = node.widgets.find(x => x.name === getNames(i).active);
                                    if (w && w.value === true) {
                                        if (!foundFirst) foundFirst = true;
                                        else w.value = false;
                                    }
                                }
                            }
                            syncFromNative();
                            app.graph.setDirtyCanvas(true, true);
                        };
                    }

                    // ---- attach Radio mutex ----
                    attachRadioLogic(node, MAX_ROWS);
                }

                // ---- hide native widget DOM elements ----
                function hideDoms() {
                    if (!node.content) return;
                    for (const el of node.content.querySelectorAll(".comfy-widget-content")) {
                        if (el === box || box.contains(el)) continue;
                        el.style.display = "none";
                    }
                }
                hideDoms();
                for (const d of [0, 50, 200, 500, 1000]) setTimeout(hideDoms, d);
                if (node.content) {
                    const obs = new MutationObserver(() => hideDoms());
                    obs.observe(node.content, { childList: true, subtree: true });
                    setTimeout(() => obs.disconnect(), 5000);
                }

                paint();
                node.setSize?.([420, calcH()]);
                app.graph.setDirtyCanvas(true, true);

                return r;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                if (onConfigure) onConfigure.apply(this, arguments);
                let maxActiveRow = DEFAULT_VISIBLE_ROWS;
                for (let i = 1; i <= MAX_ROWS; i++) {
                    const names = getNames(i);
                    const eW = this.widgets.find(w => w.name === names.active);
                    const pW = this.widgets.find(w => w.name === names.prompt);
                    if ((eW && eW.value) || (pW && pW.value)) {
                        maxActiveRow = i;
                    }
                }
                this.visibleRows = Math.max(maxActiveRow, DEFAULT_VISIBLE_ROWS);
                setTimeout(() => {
                    if (this._pzPaint) this._pzPaint();
                    app.graph.setDirtyCanvas(true, true);
                }, 50);
            };
        }

        // ==========================================
        // 2. LoRA Dynamic Node (Custom DOM UI)
        // ==========================================
        if (nodeData.name === "PZ_LoRA_Dynamic_Model" || nodeData.name === "PZ_LoRA_Dynamic_Full") {
            const DEFAULT_VISIBLE_ROWS = 5;
            const MAX_ROWS = 20;
            const getNames = (i) => {
                const num = i.toString().padStart(2, '0');
                return { 
                    active: `[${num}] ${t('enabled')}`, 
                    lora: `[${num}] ${t('loraName')}`, 
                    strength: `[${num}] ${t('weight')}`,
                    trigger: `[${num}] ${t('triggerWord')}`
                };
            };

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const node = this;
                node.visibleRows = node.visibleRows || DEFAULT_VISIBLE_ROWS;

                // ---- DOM container ----
                const box = document.createElement("div");
                box.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;padding:4px 0;box-sizing:border-box;";

                const css = document.createElement("style");
                css.textContent = `
.pz-row{display:flex;flex-direction:column;gap:3px;padding:5px 6px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg)}
.pz-main{display:flex;gap:6px;align-items:center;width:100%}
.pz-tr{display:flex;gap:6px;align-items:center;width:100%;padding-left:42px}
.pz-tr.off{opacity:.4}
.pz-sw{flex:0 0 auto;position:relative;width:36px;height:20px}
.pz-sw input{opacity:0;width:0;height:0;position:absolute}
.pz-sl{position:absolute;cursor:pointer;inset:0;background:#555;transition:.3s;border-radius:20px}
.pz-sl:before{position:absolute;content:"";height:16px;width:16px;left:2px;bottom:2px;background:#fff;transition:.3s;border-radius:50%}
.pz-sw input:checked+.pz-sl{background:#6ea8fe}
.pz-sw input:checked+.pz-sl:before{transform:translateX(16px)}
.pz-sel{flex:1;min-width:0;padding:3px 4px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-menu-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box}
.pz-wi{flex:0 0 58px;padding:3px 4px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-menu-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box}
.pz-ti{flex:1;min-width:0;padding:3px 4px;border:1px solid var(--border-color);border-radius:4px;background:var(--comfy-menu-bg);color:var(--input-text);font:inherit;font-size:11px;box-sizing:border-box}
.pz-tl{flex:0 0 auto;font-size:10px;color:var(--desc-text);white-space:nowrap}
.pz-nav{flex:1;padding:5px;border:1px dashed var(--border-color);border-radius:6px;background:transparent;color:var(--desc-text);cursor:pointer;font:inherit;font-size:11px}
.pz-nav:hover{border-color:var(--input-text);color:var(--input-text);background:var(--comfy-input-bg)}
                `;
                box.appendChild(css);

                const rows = document.createElement("div");
                rows.style.cssText = "display:flex;flex-direction:column;gap:4px;";
                box.appendChild(rows);

                // ---- sync DOM from native widget values ----
                function syncFromNative() {
                    const allRows = rows.querySelectorAll(".pz-row");
                    for (let i = 1; i <= node.visibleRows; i++) {
                        const names = getNames(i);
                        const eW = node.widgets.find(w => w.name === names.active);
                        const nW = node.widgets.find(w => w.name === names.lora);
                        const wW = node.widgets.find(w => w.name === names.strength);
                        const tW = node.widgets.find(w => w.name === names.trigger);
                        const rowEl = allRows[i - 1];
                        if (!rowEl) continue;

                        const cb = rowEl.querySelector(".pz-sw input");
                        const sel = rowEl.querySelector(".pz-sel");
                        const wt = rowEl.querySelector(".pz-wi");
                        const ti = rowEl.querySelector(".pz-ti");
                        const tr = rowEl.querySelector(".pz-tr");

                        if (cb && eW) cb.checked = !!eW.value;
                        if (sel && nW) sel.value = nW.value || "None";
                        if (wt && wW) wt.value = wW.value ?? 1;
                        if (ti && tW) { ti.value = tW.value || ""; }
                        if (tr) {
                            const isOn = eW && eW.value;
                            tr.className = "pz-tr" + (isOn ? "" : " off");
                            if (ti) ti.disabled = !isOn;
                        }
                    }
                }

                // ---- build one row ----
                function buildRow(idx) {
                    const names = getNames(idx);
                    const eW = node.widgets.find(w => w.name === names.active);
                    const nW = node.widgets.find(w => w.name === names.lora);
                    const wW = node.widgets.find(w => w.name === names.strength);
                    const tW = node.widgets.find(w => w.name === names.trigger);
                    if (!eW || !nW || !wW) return null;

                    let opts = [];
                    if (Array.isArray(nW.options)) opts = nW.options;
                    else if (Array.isArray(nW.options?.values)) opts = nW.options.values;

                    const row = document.createElement("div");
                    row.className = "pz-row";

                    // Line 1: toggle + select + weight
                    const main = document.createElement("div");
                    main.className = "pz-main";

                    const sw = document.createElement("label");
                    sw.className = "pz-sw";
                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.checked = !!eW.value;
                    const slider = document.createElement("span");
                    slider.className = "pz-sl";
                    sw.append(cb, slider);

                    const sel = document.createElement("select");
                    sel.className = "pz-sel";
                    (opts.length ? opts : ["None"]).forEach(o => {
                        const op = document.createElement("option");
                        op.value = o; op.textContent = o;
                        if (o === nW.value) op.selected = true;
                        sel.appendChild(op);
                    });

                    const wt = document.createElement("input");
                    wt.className = "pz-wi";
                    wt.type = "number";
                    wt.value = wW.value ?? 1;
                    wt.min = -10; wt.max = 10; wt.step = 0.05;

                    main.append(sw, sel, wt);
                    row.appendChild(main);

                    // Line 2: trigger word
                    const tr = document.createElement("div");
                    tr.className = "pz-tr" + (cb.checked ? "" : " off");

                    const tl = document.createElement("span");
                    tl.className = "pz-tl";
                    tl.textContent = t('triggerWord');

                    const ti = document.createElement("input");
                    ti.type = "text";
                    ti.className = "pz-ti";
                    ti.value = tW?.value || "";
                    ti.placeholder = t('triggerWord') + " (optional)";
                    ti.disabled = !cb.checked;

                    tr.append(tl, ti);
                    row.appendChild(tr);

                    // Events
                    cb.addEventListener("change", () => {
                        eW.value = cb.checked;
                        eW.callback?.call(eW, cb.checked);
                        syncFromNative();
                        app.graph.setDirtyCanvas(true, true);
                    });

                    sel.addEventListener("change", () => {
                        nW.value = sel.value;
                        nW.callback?.call(nW, sel.value);
                    });

                    wt.addEventListener("change", () => {
                        const v = parseFloat(wt.value) || 0;
                        wW.value = v;
                        wW.callback?.call(wW, v);
                    });

                    ti.addEventListener("change", () => {
                        if (tW) {
                            tW.value = ti.value;
                            tW.callback?.call(tW, ti.value);
                        }
                    });

                    return row;
                }

                // ---- paint ----
                function paint() {
                    rows.innerHTML = "";
                    for (let i = 1; i <= node.visibleRows; i++) {
                        const r = buildRow(i);
                        if (r) rows.appendChild(r);
                    }

                    const nav = document.createElement("div");
                    nav.style.cssText = "display:flex;gap:6px;";

                    if (node.visibleRows > DEFAULT_VISIBLE_ROWS) {
                        const btn = document.createElement("button");
                        btn.className = "pz-nav";
                        btn.textContent = "▲ " + t('removeRow');
                        btn.onclick = () => {
                            const names = getNames(node.visibleRows);
                            const eW = node.widgets.find(w => w.name === names.active);
                            const nW = node.widgets.find(w => w.name === names.lora);
                            const tW = node.widgets.find(w => w.name === names.trigger);
                            if (eW) { eW.value = false; }
                            if (nW) { nW.value = "None"; }
                            if (tW) { tW.value = ""; }
                            node.visibleRows--;
                            paint();
                            app.graph.setDirtyCanvas(true, true);
                        };
                        nav.appendChild(btn);
                    }

                    if (node.visibleRows < MAX_ROWS) {
                        const btn = document.createElement("button");
                        btn.className = "pz-nav";
                        btn.textContent = `▼ ${t('addRow')} (${node.visibleRows}/${MAX_ROWS})`;
                        btn.onclick = () => {
                            node.visibleRows++;
                            paint();
                            app.graph.setDirtyCanvas(true, true);
                        };
                        nav.appendChild(btn);
                    }

                    if (nav.children.length) rows.appendChild(nav);

                    requestAnimationFrame(() => {
                        const h = calcH();
                        node.setSize?.([node.size[0], h]);
                    });
                }

                function calcH() { return Math.max(120, node.visibleRows * 72 + 50); }

                node._pzPaint = paint;

                // ---- hide all native LoRA widgets ----
                for (let i = 1; i <= MAX_ROWS; i++) {
                    const names = getNames(i);
                    for (const key of ['active', 'lora', 'strength', 'trigger']) {
                        const w = node.widgets.find(w => w.name === names[key]);
                        if (w) {
                            w.type = "converted-widget";
                            w.computeSize = () => [0, -4];
                        }
                    }
                }

                // ---- register DOM widget ----
                const dom = node.addDOMWidget("pz_lora_ui", "pzLora", box);
                dom.computeSize = () => [node.size[0], calcH()];

                // ---- mode switch callback ----
                const modeWidget = node.widgets.find(w => w.name === t('mode'));
                if (modeWidget) {
                    modeWidget.callback = () => {
                        if (modeWidget.value.includes("Radio")) {
                            let foundFirst = false;
                            for (let i = 1; i <= MAX_ROWS; i++) {
                                const w = node.widgets.find(x => x.name === getNames(i).active);
                                if (w && w.value === true) {
                                    if (!foundFirst) foundFirst = true;
                                    else w.value = false;
                                }
                            }
                        }
                        syncFromNative();
                        app.graph.setDirtyCanvas(true, true);
                    };
                }

                // ---- attach Radio mutex ----
                attachRadioLogic(node, MAX_ROWS);

                // ---- hide native widget DOM elements ----
                function hideDoms() {
                    if (!node.content) return;
                    for (const el of node.content.querySelectorAll(".comfy-widget-content")) {
                        if (el === box || box.contains(el)) continue;
                        el.style.display = "none";
                    }
                }
                hideDoms();
                for (const d of [0, 50, 200, 500, 1000]) setTimeout(hideDoms, d);
                if (node.content) {
                    const obs = new MutationObserver(() => hideDoms());
                    obs.observe(node.content, { childList: true, subtree: true });
                    setTimeout(() => obs.disconnect(), 5000);
                }

                paint();
                node.setSize?.([420, calcH()]);
                app.graph.setDirtyCanvas(true, true);

                return r;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                if (onConfigure) onConfigure.apply(this, arguments);
                let maxActiveRow = DEFAULT_VISIBLE_ROWS;
                for (let i = 1; i <= MAX_ROWS; i++) {
                    const names = getNames(i);
                    const eW = this.widgets.find(w => w.name === names.active);
                    const nW = this.widgets.find(w => w.name === names.lora);
                    const tW = this.widgets.find(w => w.name === names.trigger);
                    if ((eW && eW.value) || (nW && nW.value !== "None") || (tW && tW.value)) {
                        maxActiveRow = i;
                    }
                }
                this.visibleRows = Math.max(maxActiveRow, DEFAULT_VISIBLE_ROWS);
                setTimeout(() => {
                    if (this._pzPaint) this._pzPaint();
                    app.graph.setDirtyCanvas(true, true);
                }, 50);
            };
        }
    }
});