// ============================================================
// SDPose 设置面板（纯 UI，不依赖 ComfyUI app）
//
// 同一个面板两处复用：
//   1) 节点上的「设置」按钮 → js/pz_sdpose_settings.js（结果写进隐藏控件 sdpose_settings）
//   2) 骨架编辑器 js/openpose_editor/index.html（含被人偶编辑器内嵌的情况）
//      → 面板开在编辑器里，值由编辑器 postMessage 回传给节点保存
//
// 所以这里不能 import ComfyUI 的 app.js：编辑器是独立 iframe，
// 在它里面加载 app.js 会连带把 ComfyUI 前端再初始化一遍。
//
// 默认值与后端 pz_pose_dual_image.py 的 SDPOSE_SETTINGS_DEFAULTS 保持一致，
// 分别对应 ComfyUI 内置节点：绘制参数 → SDPoseDrawKeypoints，提取前缩放 → ResizeImageMaskNode。
// ============================================================

export const SDPOSE_DEFAULTS = {
    // 绘制（SDPoseDrawKeypoints）
    draw_body: true,
    draw_hands: true,
    draw_face: true,
    draw_feet: true,
    draw_head: true,
    stick_width: 4,
    face_point_size: 2,
    score_threshold: 0.5,
    // 骨架编辑器「应用到节点」时是否保留图1 背景
    // （「SDPose 一键骨架」的结果始终带图1 背景，不受此项影响）
    keep_background: false,
    // 提取前缩放图1（ResizeImageMaskNode）
    resize_type: "scale longer dimension",
    longer_size: 1024,
    shorter_size: 1024,
    width: 1024,
    height: 1024,
    multiplier: 1,
    megapixels: 1,
    multiple: 8,
    crop: "disabled",
    scale_method: "area",
};

const RESIZE_TYPES = [
    "scale by multiplier",
    "scale dimensions",
    "scale longer dimension",
    "scale shorter dimension",
    "scale width",
    "scale height",
    "scale total pixels",
    "scale to multiple",
];
const SCALE_METHODS = ["nearest-exact", "bilinear", "area", "bicubic", "lanczos"];
const CROP_METHODS = ["disabled", "center"];

// 每种「调整类型」需要显示的附加参数（与 ResizeImageMaskNode 的动态控件一致）
const RESIZE_FIELDS = {
    "scale by multiplier": ["multiplier"],
    "scale dimensions": ["width", "height", "crop"],
    "scale longer dimension": ["longer_size"],
    "scale shorter dimension": ["shorter_size"],
    "scale width": ["width"],
    "scale height": ["height"],
    "scale total pixels": ["megapixels"],
    "scale to multiple": ["multiple"],
};

const FIELD_DEFS = {
    multiplier: { label: "缩放倍数 multiplier", type: "number", step: 0.01, min: 0.01, max: 8 },
    width: { label: "宽 width（0 = 自动）", type: "number", step: 1, min: 0, max: 16384 },
    height: { label: "高 height（0 = 自动）", type: "number", step: 1, min: 0, max: 16384 },
    crop: { label: "裁剪 crop", type: "select", options: CROP_METHODS },
    longer_size: { label: "长边 longer_size", type: "number", step: 1, min: 0, max: 16384 },
    shorter_size: { label: "短边 shorter_size", type: "number", step: 1, min: 0, max: 16384 },
    megapixels: { label: "总像素 megapixels", type: "number", step: 0.01, min: 0.01, max: 16 },
    multiple: { label: "对齐倍数 multiple", type: "number", step: 1, min: 1, max: 16384 },
};

const DRAW_BOOLS = [
    ["draw_body", "绘制身体 draw_body"],
    ["draw_hands", "绘制手 draw_hands"],
    ["draw_face", "绘制脸 draw_face"],
    ["draw_feet", "绘制脚 draw_feet"],
    ["draw_head", "绘制头部 draw_head"],
];

const DRAW_NUMS = [
    ["stick_width", "骨架线宽 stick_width", 1, 10, 1],
    ["face_point_size", "脸部点大小 face_point_size", 1, 10, 1],
    ["score_threshold", "置信度阈值 score_threshold", 0, 1, 0.01],
];

const OUTPUT_BOOLS = [
    ["keep_background", "保留图1 背景 keep_background"],
];

/**
 * 打开 SDPose 设置面板（自己挂到 document.body，Esc / 点空白处关闭）。
 * @param {object} cfg 当前配置（缺失项按默认值补）
 * @param {{onSave?:Function,onReset?:Function,onCancel?:Function}} handlers
 *        onSave(out) / onReset(out) 拿到完整配置，由调用方决定存到哪。
 * @returns {Function} close 手动关闭
 */
export function openSdposeSettingsPanel(cfg, handlers = {}) {
    const base = { ...SDPOSE_DEFAULTS, ...(cfg || {}) };
    const getters = {}; // key -> () => value

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100000;display:flex;align-items:center;justify-content:center;";

    const panel = document.createElement("div");
    panel.style.cssText =
        "background:#242424;border:1px solid #454545;border-radius:10px;padding:14px 16px 12px;width:400px;max-height:84vh;overflow:auto;" +
        "color:#dcdfe4;font-size:12px;font-family:system-ui,'Segoe UI',sans-serif;box-shadow:0 10px 40px #000a;";
    overlay.appendChild(panel);

    const addSection = (text) => {
        const d = document.createElement("div");
        d.textContent = text;
        d.style.cssText = "margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid #3a3a3a;color:#8ab4f8;font-weight:600;";
        panel.appendChild(d);
    };

    const addRow = (label, control, parent) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;margin:5px 0;";
        const l = document.createElement("span");
        l.textContent = label;
        l.style.cssText = "flex:1;color:#c6ccd4;";
        if (control.tagName === "INPUT" && control.type === "checkbox") {
            control.style.cssText = "width:auto;height:15px;margin:0;accent-color:#35a66f;cursor:pointer;";
        } else {
            control.style.cssText = "width:135px;background:#1b1b1b;color:#eaeaea;border:1px solid #4a4a4a;border-radius:5px;padding:3px 6px;font-size:12px;";
        }
        row.append(l, control);
        (parent || panel).appendChild(row);
        return row;
    };

    const title = document.createElement("div");
    title.textContent = "SDPose 设置";
    title.style.cssText = "font-size:13px;font-weight:600;color:#fff;";
    panel.appendChild(title);

    const note = document.createElement("div");
    note.textContent = "默认值与内置 SDPoseDrawKeypoints / 调整图像大小 节点一致。绘制与缩放参数在点「SDPose 一键骨架」时生效；背景开关在骨架编辑器点「应用到节点」时生效。";
    note.style.cssText = "margin-top:4px;color:#8b93a1;line-height:1.5;";
    panel.appendChild(note);

    // ---- 绘制 ----
    addSection("绘制（SDPoseDrawKeypoints）");
    DRAW_BOOLS.forEach(([key, label]) => {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!base[key];
        getters[key] = () => cb.checked;
        addRow(label, cb);
    });
    DRAW_NUMS.forEach(([key, label, min, max, step]) => {
        const inp = document.createElement("input");
        inp.type = "number";
        inp.min = min; inp.max = max; inp.step = step; inp.value = base[key];
        getters[key] = () => Math.min(max, Math.max(min, Number(inp.value) || 0));
        addRow(label, inp);
    });

    // ---- 应用到节点（骨架编辑器导出） ----
    addSection("应用到节点（骨架编辑器导出）");
    OUTPUT_BOOLS.forEach(([key, label]) => {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!base[key];
        getters[key] = () => cb.checked;
        addRow(label, cb);
    });
    const bgHint = document.createElement("div");
    bgHint.textContent = "关闭（默认）：在骨架编辑器点「应用到节点」时去掉背景，图2 为黑底骨架图（与内置 SDPose 一致）；图1 仍作为编辑器里的半透明底图方便微调，只是不导出。「SDPose 一键骨架」的结果始终带图1 背景。";
    bgHint.style.cssText = "margin:4px 0 0;color:#8b93a1;line-height:1.5;";
    panel.appendChild(bgHint);

    // ---- 提取前缩放 ----
    addSection("提取前缩放图1（Resize Image/Mask）");
    const typeSel = document.createElement("select");
    RESIZE_TYPES.forEach((t) => {
        const o = document.createElement("option");
        o.value = t; o.textContent = t;
        typeSel.appendChild(o);
    });
    typeSel.value = base.resize_type;
    getters.resize_type = () => typeSel.value;
    addRow("调整类型 resize_type", typeSel);

    const dynWrap = document.createElement("div");
    panel.appendChild(dynWrap);
    const dynGetters = {};
    const buildDyn = () => {
        dynWrap.innerHTML = "";
        Object.keys(dynGetters).forEach((k) => delete dynGetters[k]);
        (RESIZE_FIELDS[typeSel.value] || []).forEach((key) => {
            const def = FIELD_DEFS[key];
            let ctl;
            if (def.type === "select") {
                ctl = document.createElement("select");
                def.options.forEach((o) => {
                    const op = document.createElement("option");
                    op.value = o; op.textContent = o;
                    ctl.appendChild(op);
                });
                ctl.value = base[key];
                dynGetters[key] = () => ctl.value;
            } else {
                ctl = document.createElement("input");
                ctl.type = "number";
                ctl.min = def.min; ctl.max = def.max; ctl.step = def.step;
                ctl.value = base[key];
                dynGetters[key] = () => Math.min(def.max, Math.max(def.min, Number(ctl.value) || 0));
            }
            addRow(def.label, ctl, dynWrap);
        });
    };
    typeSel.addEventListener("change", buildDyn);

    const methodSel = document.createElement("select");
    SCALE_METHODS.forEach((m) => {
        const o = document.createElement("option");
        o.value = m; o.textContent = m;
        methodSel.appendChild(o);
    });
    methodSel.value = base.scale_method;
    getters.scale_method = () => methodSel.value;
    addRow("缩放方法 scale_method", methodSel);
    buildDyn();

    // ---- 底部按钮 ----
    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:16px;";
    const mkBtn = (text, primary) => {
        const b = document.createElement("button");
        b.textContent = text;
        b.style.cssText =
            "border-radius:6px;padding:5px 12px;font-size:12px;cursor:pointer;" +
            `border:1px solid ${primary ? "#35a66f" : "#555"};background:${primary ? "#35a66f" : "#2e2e2e"};color:${primary ? "#fff" : "#dcdcdc"};`;
        return b;
    };
    const resetBtn = mkBtn("重置为默认", false);
    const cancelBtn = mkBtn("取消", false);
    const saveBtn = mkBtn("保存", true);
    footer.append(resetBtn, cancelBtn, saveBtn);
    panel.appendChild(footer);

    const close = () => {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => { if (e.key === "Escape") { close(); handlers.onCancel?.(); } };
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) { close(); handlers.onCancel?.(); } });

    const collect = () => {
        const out = { ...base };
        Object.entries(getters).forEach(([k, get]) => { out[k] = get(); });
        Object.entries(dynGetters).forEach(([k, get]) => { out[k] = get(); });
        return out;
    };

    resetBtn.onclick = () => { const d = { ...SDPOSE_DEFAULTS }; close(); handlers.onReset?.(d); };
    cancelBtn.onclick = () => { close(); handlers.onCancel?.(); };
    saveBtn.onclick = () => { const out = collect(); close(); handlers.onSave?.(out); };

    document.body.appendChild(overlay);
    return close;
}
