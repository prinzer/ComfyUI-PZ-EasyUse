import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { openSdposeSettings, readSdposeSettings, writeSdposeSettings } from "./pz_sdpose_settings.js";

// ============================================================
// PZ_Pose_Dual_Image_Loader 前端逻辑（从 pz_dual_image.js 分离）
//
// 本文件只负责“姿势”相关部分，依赖 pz_dual_image.js 中的共享双图节点界面：
//   - VNCCS 3D 人偶编辑器 / OpenPose 二维骨架编辑器 的 iframe 通信
//   - 图2 预览区下方的工具条：“人偶图 / 骨骼图”分段 + 打开姿势编辑器 / 骨架编辑器
//     / SDPose 一键骨架 / 设置 按钮
//   - 应用姿势后覆盖图2 并同步写回绑定的图片加载节点
//
// setupPoseNode 由 pz_dual_image.js 在节点为 POSE_NODE_TYPE 时调用，
// 通过 ctx 传入共享句柄：{ slots, currentLoadListenId2 }。
// ============================================================

// 【临时开关】隐藏“骨骼图”相关按钮（骨骼图类型按钮 / 骨架编辑器 / SDPose 一键骨架 / 设置）。
// true = 只保留人偶图一行（类型强制为人偶图）；改成 false 即恢复完整两行。
// 2026-10-11：两种类型都验证可用后收回；「设置」已搬进骨架编辑器（挨着「锁定比例」），
// 编辑器里点「⚙ 设置」改的同样是本节点的 sdpose_settings。
const HIDE_SKELETON_UI = true;
const MANNEQUIN_KIND = "人偶图 / Mannequin";

// —— 统一隐藏“不该给用户看的原生控件” ——
// 新版前端（1.5x）的控件可见性是有状态的：widget.hidden = true 会写进
// 前端的 visibility 组件（suppression.byExtension），canvas / vueNode / 面板
// 三个面都不再渲染，且不会被重绘或载入工作流冲掉——这是首选手段。
// （早期只改 element.style.display，对布尔控件没用：它由前端组件渲染，
//   样式会被重建覆盖，所以画面里总多出一行 sdpose_extract。）
// 下面的 DOM/computeSize 处理只作为老前端的兜底。
function hideWidgetDom(widget) {
    if (!widget) return () => {};
    widget.computeSize = () => [0, -4];
    const apply = () => {
        // 前端可能在这些时刻重装控件状态，每次都把 hidden 再压一遍
        if (widget.hidden !== true) widget.hidden = true;
        const el = widget.element;
        if (el && el.style.display !== "none") el.style.display = "none";
    };
    apply();
    [60, 300, 1000, 3000, 8000].forEach((ms) => setTimeout(apply, ms));
    return apply;
}


// —— 图2 工具条按钮的统一皮肤 ——
// 之前这块混了三种写法：pz-di-toggle（有样式）、pz-btn pz-btn-ghost（全仓库没定义，只能走浏览器默认）、
// 类型按钮的硬编码内联样式。这里统一成 .pz-pose-btn：动作按钮为中性描边，
// 两个类型按钮用「蓝 = 人偶图 / 琥珀 = 骨骼图」区分，选中为实心。
const POSE_BAR_STYLE_ID = "pz-pose-bar-style";
function ensurePoseBarStyle() {
    if (document.getElementById(POSE_BAR_STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = POSE_BAR_STYLE_ID;
    s.textContent = [
        ".pz-pose-btn{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;padding:2px 8px;border:1px solid var(--border-color);border-radius:6px;background:var(--comfy-input-bg);color:var(--input-text);font:inherit;font-size:11px;line-height:1.35;white-space:nowrap;cursor:pointer;box-sizing:border-box;}",
        ".pz-pose-btn:hover:not(:disabled){border-color:#6ea8fe;}",
        ".pz-pose-btn:active:not(:disabled){filter:brightness(.92);}",
        ".pz-pose-btn:disabled{opacity:.45;cursor:default;}",
        ".pz-pose-btn.pz-pose-kind{min-width:64px;font-weight:600;margin-right:2px;}",
        ".pz-pose-btn.pz-pose-kind-mannequin{border-color:#6ea8fe;color:#6ea8fe;}",
        ".pz-pose-btn.pz-pose-kind-skeleton{border-color:#e8a33d;color:#e8a33d;}",
        ".pz-pose-btn.pz-pose-kind-mannequin:hover{border-color:#6ea8fe;filter:brightness(1.08);}",
        ".pz-pose-btn.pz-pose-kind-skeleton:hover{border-color:#e8a33d;filter:brightness(1.08);}",
        ".pz-pose-btn.pz-pose-kind-mannequin.pz-pose-on{background:#6ea8fe;color:#fff;}",
        ".pz-pose-btn.pz-pose-kind-skeleton.pz-pose-on{background:#e8a33d;color:#fff;}",
        // 「显示绑定图」开关：开着时按人偶图那套蓝色淡底高亮（它不是类型按钮，所以要单独给样式）
        ".pz-pose-btn.pz-pose-toggle{font-weight:600;}",
        ".pz-pose-btn.pz-pose-toggle.pz-pose-on{border-color:#6ea8fe;color:#6ea8fe;background:rgba(110,168,254,.18);}",
        // 行级配色：该行的动作按钮沿用本行类型的颜色（淡描边，hover 时变实色）
        ".pz-pose-row-mannequin .pz-pose-btn:not(.pz-pose-kind){border-color:rgba(110,168,254,.45);}",
        ".pz-pose-row-mannequin .pz-pose-btn:not(.pz-pose-kind):hover:not(:disabled){border-color:#6ea8fe;color:#6ea8fe;}",
        ".pz-pose-row-skeleton .pz-pose-btn:not(.pz-pose-kind){border-color:rgba(232,163,61,.45);}",
        ".pz-pose-row-skeleton .pz-pose-btn:not(.pz-pose-kind):hover:not(:disabled){border-color:#e8a33d;color:#e8a33d;}",
    ].join(" ");
    document.head.appendChild(s);
}

// —— 姿势编辑器：复用 ComfyUI-Fisher-Pose 已安装的 VNCCS 3D 人偶编辑器（freepose.html） ——
// 编辑器是独立 iframe，通过 postMessage 交换 pose_json（含 base64 人偶图 poseReference）。
// 模型（pose_studio_makehuman.v2.bin）已在 Fisher-Pose 目录，前端 three.js 渲染，后端只需解码。
function openPoseEditor(node, onApplied, editorType = "fisher", opts = {}) {
    const editorUrl = (editorType === "openpose"
        ? new URL("./openpose_editor/index.html", import.meta.url).href
        : new URL("./fisher_editor/editor/freepose.html", import.meta.url).href);
    const overlay = document.createElement("dialog");
    overlay.style.cssText = "width:96vw;max-width:1700px;height:94vh;max-height:1100px;padding:0;border:1px solid #dce3ed;border-radius:12px;background:#f4f6f8;box-shadow:0 20px 90px #0007;overflow:hidden;";
    const frame = document.createElement("iframe");
    frame.style.cssText = "border:0;width:100%;height:100%;display:block";
    // v= 是缓存标识：改了 freepose.html / freepose.mjs 后必须同步抬版本号，否则浏览器仍用旧模块
    frame.src = editorUrl + (editorType === "openpose" ? "?v=20261011-12" : "?embedded=1&v=20261011-12");
    overlay.append(frame);
    // 一键图1转人偶：编辑器先当“按骨架摆姿 → 出人偶图”的后台工序，
    // 用加载层盖住（iframe 必须真实可见，WebGL 才渲染）；出图后【不关闭】，
    // 撤掉加载层停在编辑页面，让用户继续微调、再点「应用到节点」写回。
    let loading = null;
    if (opts.autoApply) {
        loading = document.createElement("div");
        loading.style.cssText = "position:absolute;inset:0;z-index:9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:#f4f6f8;color:#4a5568;font-size:14px;text-align:center;padding:24px;";
        loading.innerHTML = '<div style="font-weight:600;color:#2d3748">正在按骨架摆姿并生成人偶图…</div><div style="font-size:12px">首次打开需加载 3D 模型，约十几秒</div>';
        overlay.append(loading);
    }
    const hideLoading = () => { if (loading) { loading.remove(); loading = null; } };
    // 自动摆姿已回传过一次的标志：之后的「应用到节点」按普通流程处理（写回后关闭）
    let autoApplied = false;
    const toast = (text) => {
        const tip = document.createElement("div");
        tip.style.cssText = "position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:10;padding:6px 12px;border-radius:999px;background:rgba(45,55,72,.92);color:#fff;font-size:12px;box-shadow:0 6px 20px #0004;pointer-events:none;transition:opacity .4s;";
        tip.textContent = text;
        overlay.append(tip);
        setTimeout(() => { tip.style.opacity = "0"; setTimeout(() => tip.remove(), 500); }, 6000);
    };
    function close() { clearTimeout(watchdog); window.removeEventListener("message", receive); overlay.close(); overlay.remove(); }
    const watchdog = setTimeout(() => {
        if (!overlay.open || !opts.autoApply || autoApplied) return;
        // 超时也不关：撤掉加载层，摆好多少算多少，留给用户手动调整和出图
        hideLoading();
        toast("自动摆姿超时，可在此手动调整后再点「应用到节点」。");
    }, 180000);
    function receive(event) {
        if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
        if (event.data?.type === "fisher-ready") {
            const w = node.widgets?.find((x) => x.name === "pose_json");
            frame.contentWindow.postMessage({
                type: "fisher-load",
                payload: {
                    pose_json: w?.value || "{}",
                    // 一键 SDPose 生成的黑底骨架图 + 画布宽高：人偶编辑器据此直接摆好姿势
                    openposeEntry: opts.openposeEntry || null,
                    width: Number(opts.width) || 0,
                    height: Number(opts.height) || 0,
                    // 一键图1转人偶：摆好后直接出图回传，宿主收到即关闭
                    autoApply: !!opts.autoApply,
                    // SDPose 的鼻/双眼/双耳（骨架图里画不下，编辑器读不到）：
                    // 头骨朝向只能靠它们，单独以数据形式交给编辑器
                    headPoints: opts.headPoints || null,
                    // 图1 的 url：编辑器里「叠加图1」对位用（只当参考，不进人偶图）
                    image1: opts.image1 || "",
                    // 节点上的 SDPose 设置：内嵌骨架编辑器的「保留图1 背景」等按它来，
                    // 编辑器里点「⚙ 设置」要值时也能直接答，不用再绕一圈
                    sdposeSettings: readSdposeSettings(node),
                },
            }, location.origin);
        } else if (event.data?.type === "fisher-request-doll") {
            // 编辑器内点的「一键图1转人偶」/「导入图转人偶」（后者带 file）：
            // 宿主跑 SDPose 识别，再把骨架发回当前这个编辑器自动摆姿
            if (typeof opts.onDollRequest === "function") {
                // send(type, payload)：宿主用同一个通道回话 —— 成功发 fisher-load（带骨架），
                // 失败发 fisher-doll-failed，编辑器那边才不会一直卡在「识别中…」
                opts.onDollRequest(
                    (type, payload) => frame.contentWindow?.postMessage({ type, payload }, location.origin),
                    event.data.file || null
                );
            } else {
                close();
            }
        } else if (event.data?.type === "fisher-error") {
            // 自动摆姿失败：也停在编辑页面（撤掉加载层），让用户手动摆/手动出图
            alert("人偶自动摆姿失败：" + (event.data.message || "未知错误"));
            if (opts.autoApply) { hideLoading(); return; }
            close();
        } else if (event.data?.type === "fisher-close") {
            close();
        } else if (event.data?.type === "fisher-apply") {
            const payload = event.data.payload || {};
            const poseJson = payload.pose_json;
            let reference = "";
            try { reference = JSON.parse(poseJson || "{}").poseReference || ""; } catch {}
            if (typeof poseJson === "string") {
                if (typeof onApplied === "function") onApplied(poseJson, reference);
                void previewPoseNodeOutput(node, reference).catch(() => {});
            }
            // 一键图1转人偶的首次自动出图：写回节点后保留编辑器，等用户继续微调
            if (opts.autoApply && !autoApplied) {
                autoApplied = true;
                clearTimeout(watchdog);
                hideLoading();
                toast("已按图1 骨架生成人偶图并写回图2，可继续微调后再点「应用到节点」。");
                return;
            }
            close();
        } else if (event.data?.type === "openpose-ready") {
            const w = node.widgets?.find((x) => x.name === "pose_json");
            let payloadJson = w?.value || "{}";
            // 若 pose_json 里已存 SDPose / 骨架关键点（poseOpenpose），优先把它交给编辑器微调
            try {
                const obj = JSON.parse(payloadJson);
                const op = obj && obj.poseOpenpose;
                if (op && op.people) {
                    payloadJson = JSON.stringify({
                        width: op.canvas_width || op.width || 512,
                        height: op.canvas_height || op.height || 512,
                        people: op.people,
                    });
                }
            } catch {}
            frame.contentWindow.postMessage(
                {
                    type: "openpose-load",
                    payload: {
                        pose_json: payloadJson,
                        bg: opts.bg || "",
                        // 未指定时保持编辑器原行为（手动背景图照旧导出）
                        keepBg: opts.keepBg == null ? true : !!opts.keepBg,
                    },
                },
                location.origin,
            );
        } else if (event.data?.type === "openpose-settings-request") {
            // 编辑器里的「⚙ 设置」按钮（骨架编辑器自带的，或人偶编辑器内嵌的那个转发的）
            frame.contentWindow.postMessage({ type: "openpose-settings", payload: readSdposeSettings(node) }, location.origin);
        } else if (event.data?.type === "openpose-settings-save") {
            // 编辑器里改完的设置写回本节点的 sdpose_settings（随工作流保存）
            writeSdposeSettings(node, event.data.payload || {});
            toast("SDPose 设置已存到节点（随工作流保存）");
        } else if (event.data?.type === "openpose-close") {
            close();
        } else if (event.data?.type === "openpose-apply") {
            const payload = event.data.payload || {};
            const poseJson = payload.pose_json;
            const reference = payload.skeleton || "";
            if (typeof poseJson === "string") {
                // skeleton: true → 这是「骨架图」，两个字段都写它（见 onPoseApplied）
                if (typeof onApplied === "function") onApplied(poseJson, reference, { skeleton: true });
                void previewPoseNodeOutput(node, reference).catch(() => {});
            }
            close();
        }
    }
    window.addEventListener("message", receive);
    overlay.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    document.body.append(overlay);
    overlay.showModal();
}

async function previewPoseNodeOutput(node, reference) {
    if (typeof reference !== "string" || !reference.startsWith("data:image/png;base64,")) return;
    // 仅当图2 输出接了 PreviewImage 时才把图挂到节点输出预览上；
    // 否则不在节点上渲染（图2 槽已由 setPosePreview 显示人偶图），避免节点上多出一张姿态图
    const imageOutputs = (node.outputs || []).map((o, i) => (o.type === "IMAGE" ? i : -1)).filter((i) => i >= 0);
    const slot = imageOutputs.length ? imageOutputs[imageOutputs.length - 1] : -1;
    const previews = (node.outputs?.[slot]?.links || []).map((id) => app.graph.getNodeById(app.graph.links[id]?.target_id)).filter((t) => t?.type === "PreviewImage");
    if (!previews.length) return;
    let hash = 2166136261;
    for (let i = 0; i < reference.length; i += 7) hash = Math.imul(hash ^ reference.charCodeAt(i), 16777619);
    const form = new FormData();
    form.append("image", await (await fetch(reference)).blob(), `pz_pose_${(hash >>> 0).toString(16)}.png`);
    form.append("type", "temp");
    form.append("overwrite", "true");
    const response = await api.fetchApi("/upload/image", { method: "POST", body: form });
    if (!response.ok) return;
    const { name, subfolder } = await response.json();
    const images = [{ filename: name, subfolder: subfolder || "", type: "temp" }];
    for (const target of previews) app.nodeOutputs[target.id] = { ...(app.nodeOutputs[target.id] || {}), images };
    app.graph.setDirtyCanvas(true, true);
}

// 由 pz_dual_image.js（双图共享节点界面）在 POSE_NODE_TYPE 时调用。
// ctx: { slots: 共享 slots 数组, currentLoadListenId2: 图2 绑定取值函数,
//        findNodeById / widgetFor / refreshFilePreview: 图2 预览取绑定图用的共享句柄 }
export function setupPoseNode(node, ctx) {
    const { slots, currentLoadListenId2, findNodeById, widgetFor, refreshFilePreview } = ctx;

    // 需要在载入工作流/重绘后反复隐藏的原生控件
    const hiddenAppliers = [];

    const poseWidgetOf = () => node.widgets?.find((w) => w.name === "pose_json");
    const pw = poseWidgetOf();
    if (pw) hiddenAppliers.push(hideWidgetDom(pw));
    // 隐藏原生“图2 类型”控件，改用工具条上的分段（人偶图/骨骼图）
    const kindWidget = node.widgets?.find((w) => w.name === "image_2_kind");
    if (kindWidget) hiddenAppliers.push(hideWidgetDom(kindWidget));
    const isSkeletonVal = () => (kindWidget?.value) === "骨骼图 / OpenPose Skeleton";

    // ===== 图2 功能工具条：放在“图2 预览区下面” =====
    // box 的子元素顺序是 [header, subtitle, wrap(预览区), fileSelect(隐藏), fileInput(隐藏)]，
    // 插到隐藏的 fileSelect 之前 → 视觉上正好是预览区下方的那一行。
    ensurePoseBarStyle();
    const bar = document.createElement("div");
    bar.className = "pz-di-posebar";
    bar.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:4px;flex:0 0 auto;";
    if (slots[1]) {
        if (slots[1].fileSelect) slots[1].box.insertBefore(bar, slots[1].fileSelect);
        else slots[1].box.appendChild(bar);
    }

    // 把图2 图写回绑定的图片加载节点的 image 控件，使其预览与下游连线一起更新
    const syncPoseToLoader = async (loaderId, b64) => {
        // 返回值 = 到底有没有落到绑定节点上（true / false）：调用方要据此提示用户，
        // 免得“看着换了图、实际下游还在用旧图”
        if (!loaderId || !b64 || !b64.startsWith("data:image/png;base64,")) return false;
        const loader = (app.graph?._nodes || []).find((n) => String(n.id) === loaderId);
        const w = loader?.widgets?.find((x) => x.name === "image");
        if (!w) return false;
        let hash = 2166136261;
        for (let i = 0; i < b64.length; i += 7) hash = Math.imul(hash ^ b64.charCodeAt(i), 16777619);
        try {
            const form = new FormData();
            form.append("image", await (await fetch(b64)).blob(), `pz_pose_${(hash >>> 0).toString(16)}.png`);
            form.append("type", "input");
            form.append("overwrite", "true");
            const resp = await api.fetchApi("/upload/image", { method: "POST", body: form });
            if (!resp.ok) return false;
            const { name, subfolder } = await resp.json();
            const newVal = subfolder ? { filename: name, subfolder, type: "input" } : name;
            // 加载节点的 image 是下拉框：新上传的文件名不在选项里，直接赋值会被前端显示成空白/回退旧值，
            // 于是“写进去了却没生效” → 先把文件名补进选项再赋值
            if (name && Array.isArray(w.options?.values) && !w.options.values.includes(name)) w.options.values.unshift(name);
            if (typeof w.value === "object" && w.value && JSON.stringify(w.value) === JSON.stringify(newVal)) return true;
            if (w.value === newVal) return true;
            w.value = newVal;
            w.callback?.call(w, newVal); // 触发加载节点刷新预览，并随其输出更新图2 连线
            return true;
        } catch (e) { console.warn("[PZ Pose] 同步到加载节点失败", e); return false; }
    };

    // ===== 「显示绑定图」：图2 预览读绑定节点里的图（默认开）=====
    // 绑定图 = 工具条「图2 加载图绑定」选中那个图片加载节点里的图；姿势结果也会被写回它，
    // 所以开=看真实落盘结果（与工作流一致），关=看编辑器刚生成的结果（原来的行为）。
    const SHOW_BOUND_PROP = "pz_show_bound";
    const showBoundOn = () => node.properties?.[SHOW_BOUND_PROP] !== false; // 没设过 = 默认显示绑定图
    const boundLoaderImage = () => {
        const lid = currentLoadListenId2();
        return (lid ? findNodeById(lid) : null)?.widgets?.find((w) => w.name === "image")?.value || "";
    };
    // 把绑定节点当前的图同步进图2 的 image 控件并刷新预览（与共享界面里的“劫持同步”同一套写法）
    const pullBoundPreview = () => {
        if (!slots[1]) return;
        const value = boundLoaderImage();
        const widget = widgetFor?.(2);
        if (value && widget && widget.value !== value) {
            widget.value = value;
            widget.callback?.call(widget, value);
        }
        refreshFilePreview?.(slots[1]);
        // 兜底：图2 预览可能被 setPosePreview("") 藏起来过（display:none），
        // 而刷新预览只改 src → 会出现“文件名/尺寸都在、图却是空白”，有图就显回来
        if (value && slots[1].preview && slots[1].preview.style.display === "none") slots[1].preview.style.display = "";
    };

    const setPosePreview = (b64) => {
        if (!slots[1]) return;
        // 「显示绑定图」（默认）：预览一直跟着图2 的绑定加载节点走，编辑器结果只负责写回节点，
        // 不抢预览区（写回完成后 pullBoundPreview 会把新图取回来显示）
        if (showBoundOn() && currentLoadListenId2()) { pullBoundPreview(); return; }
        if (b64) {
            slots[1].preview.src = b64;
            slots[1].preview.style.display = "";
            slots[1].placeholder.style.display = "none";
            slots[1].subtitle.textContent = "图2 = 姿势编辑器";
            slots[1].syncSize?.(); // 尺寸角标：先清空，等图 load 完由事件写上“宽 × 高”
        } else {
            slots[1].preview.style.display = "none";
            slots[1].placeholder.style.display = "";
            slots[1].subtitle.textContent = "当前编辑图：未选择";
            if (slots[1].sizeBadge) { slots[1].sizeBadge.textContent = ""; slots[1].sizeBadge.title = ""; }
        }
    };

    // 把编辑器出图写进节点预览槽（slot 2 = 图2，slot 3 = 画布 / SDPose 黑底骨架），
    // 让节点上的「图2」「画布」立刻显示这张图，而不是等下次执行才变
    const saveSlotPreview = async (slot, b64) => {
        try {
            const resp = await api.fetchApi("/pz_easyuse/dual-image-preview/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node: String(node.id), slot: String(slot), image: b64 }),
            });
            return resp.ok;
        } catch (e) { console.warn("[PZ Pose] 写预览槽失败", e); return false; }
    };

    const onPoseApplied = (poseJson, reference, opts = {}) => {
        if (typeof poseJson !== "string" || !poseJson) return;
        let prev = {};
        try { prev = JSON.parse(poseWidgetOf()?.value || "{}") || {}; } catch {}
        let obj = {};
        try { obj = JSON.parse(poseJson) || {}; } catch { return; }
        // 骨架编辑器回传的是 OpenPose 格式（只有 width/height/people）：不能拿它整份顶掉节点里的姿势文档
        // （那会把人偶姿势丢掉）→ 以旧文档为底再合入；人偶编辑器带 kind=vnccs-free-pose，整份以它为准
        const merged = obj.kind === "vnccs-free-pose" ? { ...obj } : { ...prev, ...obj };
        if (!merged.poseOpenpose && prev.poseOpenpose) merged.poseOpenpose = prev.poseOpenpose;
        // 这一趟出的是「骨架图」（骨架编辑器 / 人偶编辑器里的骨骼图模式）：poseReference 与 poseSkeleton
        // 两个字段都写它 —— 图2 类型锁在人偶图、或以后切回骨骼图，后端取到的都是这同一张编辑好的骨架图
        // （以前只写一个：切类型/切字段时只是“看着变了”，实际取的是另一个字段里的旧图）
        const fromSkeleton = !!opts.skeleton || obj.editorKind === "skeleton";
        if (reference) {
            if (fromSkeleton || !merged.poseReference) merged.poseReference = reference;
            if (fromSkeleton) merged.poseSkeleton = reference;
        }
        if (!merged.poseSkeleton && prev.poseSkeleton) merged.poseSkeleton = prev.poseSkeleton;
        // 手动改过骨架：清掉「待自动摆姿」，免得之后打开人偶编辑器又被 SDPose 那套覆盖掉
        merged.sdposeSkeleton = { ...(prev.sdposeSkeleton || {}), pending: false };
        const w = poseWidgetOf();
        if (w) { w.value = JSON.stringify(merged); if (typeof w.callback === "function") w.callback(w.value); }
        // 图2 写回绑定的图片加载节点（下游连线/预览跟着换）+ 节点自己的图2 预览
        const lid2 = currentLoadListenId2();
        const synced = lid2 && reference ? syncPoseToLoader(lid2, reference) : null;
        setPosePreview(reference);
        if (synced && showBoundOn()) void synced.then(() => setPosePreview(reference));
        // 预览槽：图2（slot 2）与画布/骨架（slot 3）都换成这张，节点上看图不再是旧的
        if (reference && reference.startsWith("data:image/png;base64,")) {
            void saveSlotPreview(2, reference).then((ok) => {
                if (!ok) return;
                // 图2 槽接了上游时 refreshFilePreview 会直接 return（不刷预览）→ 这里直接指向刚写好的 slot 2 文件，
                // 保证节点上看到的图 = 真正写进去的那张，不给“看着换了、其实是旧图”留余地
                const slot = slots[1];
                if (slot?.preview) {
                    slot.preview.src = `/pz_easyuse/dual-image-preview?node=${node.id}&slot=2&rand=${Math.random()}`;
                    slot.preview.style.display = "";
                    if (slot.placeholder) slot.placeholder.style.display = "none";
                    if (slot.subtitle) slot.subtitle.textContent = fromSkeleton ? "图2 = 骨架图（已应用）" : "图2 = 姿势编辑器";
                    slot.syncSize?.();
                }
                refreshFilePreview?.(slots[1]);
            });
            if (fromSkeleton) void saveSlotPreview(3, reference);
        }
        // 说清楚到底落到哪了：写回失败时下游可能还拿旧图，必须让用户看见
        if (fromSkeleton) {
            void Promise.resolve(synced).then((r) => {
                const size = `${Number(obj.width) || 0}×${Number(obj.height) || 0}`;
                if (r === true) toast(`骨架图（${size}）已应用到图2 并同步到绑定节点，跑工作流就跟这张走。`);
                else if (r === false) toast(`骨架图（${size}）已写进图2；但「图2 加载图绑定」的加载节点没写成功，下游若从它取图仍是旧图。`);
                else toast(`骨架图（${size}）已应用到图2（没设「图2 加载图绑定」：下游请从本节点的 image_2 输出取图）。`);
            });
        }
        node.setDirtyCanvas(true, true);
        app.graph.change();
    };

    // ===== 工具条：按类型分两行，行首是类型按钮，其后是这一类型对应的编辑器 / 一键按钮 =====
    // 第 1 行：[人偶图] [打开姿势编辑器] [一键图1转人偶]
    // 第 2 行：[骨骼图] [骨架编辑器] [SDPose 一键骨架] [设置]
    const mkPoseRow = (tone) => {
        const row = document.createElement("div");
        // pz-pose-row-mannequin / pz-pose-row-skeleton：整行按类型配色（按钮描边 + hover 同色）
        row.className = `pz-di-poserow ${tone}`;
        // flex-wrap：节点窄时按钮在本行内换行，而不是被预览区裁掉
        row.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:4px;width:100%;flex:0 0 100%;box-sizing:border-box;";
        return row;
    };
    const mannequinRow = mkPoseRow("pz-pose-row-mannequin");
    const skeletonRow = mkPoseRow("pz-pose-row-skeleton");
    bar.append(mannequinRow, skeletonRow);
    // 骨骼图整行建好但直接隐藏：SDPose 识别（runSdposeExtract）是「一键图1转人偶」的底层步骤，
    // 仍要保留，这里只把入口按钮藏掉
    if (HIDE_SKELETON_UI) skeletonRow.style.display = "none";

    // 显示绑定图（人偶图按钮左边，默认开）：切换图2 预览是看「绑定节点里的图」还是「编辑器结果」
    const boundButton = document.createElement("button");
    boundButton.type = "button";
    boundButton.className = "pz-pose-btn pz-pose-toggle";
    const refreshBoundButton = () => {
        const on = showBoundOn();
        boundButton.classList.toggle("pz-pose-on", on);
        boundButton.textContent = on ? "显示绑定图" : "显示编辑器图";
        boundButton.title = on
            ? "图2 预览正在显示「绑定图」：即「图2 加载图绑定」那个图片加载节点里的图（姿势结果也会写回它）。点一下改成显示编辑器生成的结果。"
            : "图2 预览正在显示编辑器生成的结果。点一下改回显示「绑定图」（绑定节点里的图）。";
    };
    boundButton.onclick = () => {
        node.properties[SHOW_BOUND_PROP] = !showBoundOn();
        refreshBoundButton();
        // 按新状态立刻刷一次预览：开 → 取绑定图；关 → 取 pose_json 里的编辑器结果
        try {
            const obj = JSON.parse(poseWidgetOf()?.value || "{}");
            setPosePreview(isSkeletonVal() ? (obj.poseSkeleton || "") : (obj.poseReference || ""));
        } catch { setPosePreview(""); }
        node.setDirtyCanvas(true, true);
        app.graph.change();
    };
    mannequinRow.appendChild(boundButton);
    refreshBoundButton();

    const kindBtns = {};
    const mkKind = (row, label, val, title, variant) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `pz-pose-btn pz-pose-kind ${variant}`;
        b.textContent = label; b.__val = val; b.title = title;
        b.onclick = () => setKind(val);
        row.appendChild(b); kindBtns[val] = b;
    };
    // 人偶图 = 蓝，骨骼图 = 琥珀：颜色本身就能区分两行，选中时变实心
    mkKind(mannequinRow, "人偶图", "人偶图 / Mannequin", "图2 用 3D 人偶图 / Mannequin in image 2", "pz-pose-kind-mannequin");
    mkKind(skeletonRow, "骨骼图", "骨骼图 / OpenPose Skeleton", "图2 用 OpenPose 骨架图 / Skeleton in image 2", "pz-pose-kind-skeleton");

    // 创建“打开姿势编辑器”按钮（人偶图一行）
    const poseButton = document.createElement("button");
    poseButton.type = "button";
    poseButton.className = "pz-pose-btn";
    poseButton.textContent = "打开姿势编辑器";
    poseButton.title = "打开 VNCCS 3D 人偶编辑器，生成图2 姿势图";
    mannequinRow.append(poseButton);

    const poseSkelButton = document.createElement("button");
    poseSkelButton.type = "button";
    poseSkelButton.textContent = "骨架编辑器";
    poseSkelButton.id = "pz-pose-skel-btn";
    poseSkelButton.className = "pz-pose-btn";
    skeletonRow.appendChild(poseSkelButton);

    const setKind = (val) => {
        // 骨骼图入口已隐藏时，类型一律锁在人偶图，避免残留的“骨骼图”取值让图2 输出骨架图
        if (HIDE_SKELETON_UI) val = MANNEQUIN_KIND;
        if (kindWidget) { kindWidget.value = val; if (typeof kindWidget.callback === "function") kindWidget.callback(val); }
        Object.values(kindBtns).forEach((b) => {
            b.classList.toggle("pz-pose-on", b.__val === val);
        });
        // 切换类型时按对应字段刷新图2 预览
        try {
            const obj = JSON.parse(poseWidgetOf()?.value || "{}");
            setPosePreview(isSkeletonVal() ? (obj.poseSkeleton || "") : (obj.poseReference || ""));
        } catch {}
        node.setDirtyCanvas(true, true);
        app.graph.change();
    };
    setKind(isSkeletonVal() ? "骨骼图 / OpenPose Skeleton" : MANNEQUIN_KIND); // 隐藏时 setKind 内部会强制改成人偶图

    // 图1 当前显示的图（绝对 URL），交给骨架编辑器当背景对照
    const image1BgUrl = () => {
        const src = slots[0]?.preview?.src;
        return typeof src === "string" ? src : "";
    };

    // ===== 一键 SDPose 的骨架图交接给人偶编辑器（黑底纯骨架图 slot 3 + 画布宽高）=====
    // 人偶编辑器的 OpenPose 一键摆姿只认黑底身体骨架图；auto（= sdposeSkeleton.pending）表示
    // 这次一键骨架还没被接过，打开编辑器时自动摆好；之后编辑器里的按钮仍可手动重新摆。
    // 一旦人偶编辑器「应用到节点」，pose_json 会被编辑器整体替换，pending 随之消失。
    // COCO-18 的鼻/左眼/右眼/左耳/右耳（含置信度），画布像素坐标。
    // 黑底骨架图只画身体 14 点（画了脸/手会被编辑器判为“彩色标记过密”），
    // 所以头部朝向（左右转、侧倾）只能这样以数据形式送进去。
    const sdposeHeadPoints = (op) => {
        try {
            const kp = op?.people?.[0]?.pose_keypoints_2d;
            if (!Array.isArray(kp) || kp.length < 15) return null;
            const at = (i) => [Number(kp[i * 3]), Number(kp[i * 3 + 1]), Number(kp[i * 3 + 2])];
            const [nose, lEye, rEye, lEar, rEar] = [0, 1, 2, 3, 4].map(at);
            const good = (p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[2] > 0.2;
            if (!good(nose) && !(good(lEye) && good(rEye))) return null;
            return { nose, lEye, rEye, lEar, rEar };
        } catch { return null; }
    };

    const sdposeHandoff = () => {
        try {
            const obj = JSON.parse(poseWidgetOf()?.value || "{}");
            const sk = obj.sdposeSkeleton;
            const op = obj.poseOpenpose;
            if (!sk && !op) return null;
            return {
                entry: {
                    key: `sdpose:${node.id}`,
                    name: "SDPose 骨架",
                    url: `/pz_easyuse/dual-image-preview?node=${node.id}&slot=3&rand=${Math.random()}`,
                    // 没记到宽高（如旧版后端未回传）时按“还没接过”处理，打开即自动摆
                    auto: sk ? !!sk.pending : true,
                },
                width: Number(sk?.width) || Number(op?.canvas_width) || 0,
                height: Number(sk?.height) || Number(op?.canvas_height) || 0,
                head: sdposeHeadPoints(op),
            };
        } catch { return null; }
    };

    // 点“打开姿势编辑器”→ 人偶编辑器；点“骨架编辑器”→ OpenPose 骨架编辑器
    if (poseButton) poseButton.addEventListener("click", () => {
        setKind("人偶图 / Mannequin");
        const handoff = sdposeHandoff();
        // onDollRequest：编辑器里还没有骨架图时，也能在页面上点「一键图1转人偶」回头让宿主跑识别
        openPoseEditor(node, onPoseApplied, "fisher", handoff
            ? { openposeEntry: handoff.entry, width: handoff.width, height: handoff.height, headPoints: handoff.head, image1: image1BgUrl(), onDollRequest }
            : { image1: image1BgUrl(), onDollRequest });
    });
    // keepBg 取自「设置」面板的“保留图1 背景”：默认 false，即应用到节点时去掉背景
    if (poseSkelButton) poseSkelButton.addEventListener("click", () => {
        setKind("骨骼图 / OpenPose Skeleton");
        const cfg = readSdposeSettings(node);
        openPoseEditor(node, onPoseApplied, "openpose", { bg: image1BgUrl(), keepBg: !!cfg.keep_background });
    });

    // 若已存姿势，载入时按当前类型直接预览
    try {
        const stored = poseWidgetOf()?.value;
        const obj = stored ? JSON.parse(stored) : {};
        const ref = isSkeletonVal() ? (obj.poseSkeleton || "") : (obj.poseReference || "");
        if (ref) setPosePreview(ref);
    } catch {}

    // ===== SDPose 一键：用 SDPose 从图1 提取骨架，以图1 为背景合成图2，随后可在骨架编辑器微调 =====
    const sdposeWidget = node.widgets?.find((w) => w.name === "sdpose_extract");
    if (sdposeWidget) hiddenAppliers.push(hideWidgetDom(sdposeWidget));
    const sdposeSettingsWidget = node.widgets?.find((w) => w.name === "sdpose_settings");
    if (sdposeSettingsWidget) hiddenAppliers.push(hideWidgetDom(sdposeSettingsWidget));
    // 载入工作流（configure）后前端会重排/重建控件 DOM，这里再兜一次
    const origOnConfigure = node.onConfigure;
    node.onConfigure = function () {
        const result = origOnConfigure?.apply(this, arguments);
        hiddenAppliers.forEach((apply) => apply());
        return result;
    };
    // 每次画布重绘也兜一次：控件被前端重建后立刻压回隐藏（已隐藏时是空操作）
    const origDrawForeground = node.onDrawForeground;
    node.onDrawForeground = function () {
        const result = origDrawForeground?.apply(this, arguments);
        hiddenAppliers.forEach((apply) => apply());
        return result;
    };

    const sdposeButton = document.createElement("button");
    sdposeButton.type = "button";
    sdposeButton.textContent = "SDPose 一键骨架";
    sdposeButton.className = "pz-pose-btn";
    sdposeButton.title = "用 SDPose 从图1 提取骨架，并以图1 作背景合成图2（之后可在骨架编辑器继续微调）";
    skeletonRow.appendChild(sdposeButton);

    // 设置面板：绘制参数（对应 SDPoseDrawKeypoints）+ 提取前缩放（对应 调整图像大小）
    const sdposeSettingsButton = document.createElement("button");
    sdposeSettingsButton.type = "button";
    sdposeSettingsButton.textContent = "设置";
    sdposeSettingsButton.className = "pz-pose-btn";
    sdposeSettingsButton.title = "SDPose 绘制参数与提取前缩放设置（默认值与内置节点一致）";
    skeletonRow.appendChild(sdposeSettingsButton);
    if (sdposeSettingsButton) sdposeSettingsButton.addEventListener("click", () => openSdposeSettings(node));

    const inputLinked = (name) => !!node.inputs?.some((i) => i.name === name && i.link != null);

    // 排队执行本节点，只让本次执行携带 sdpose_extract=True（只跑本节点所在的子图）
    // 改动布尔值会让前端重渲染该控件（行又会显形），每次改完都重新压回隐藏状态
    const restoreSdposeWidget = (prev) => {
        if (sdposeWidget) sdposeWidget.value = prev;
        hiddenAppliers.forEach((apply) => apply());
    };
    // overrideImage1 非空时，只把「这一份要排队的工作流」里的图1 换成它（「导入图转人偶」的临时替身）。
    // 关键点：改的是提交给后端的工作流，不是节点上的控件值 ——
    // 所以图1 就算接了上游连线也照样生效（连线上游时控件值是不参与工作流的），
    // 同时节点上的图1 取值 / 预览 / 与绑定节点的同步一点都不用动，也就不用事后还原。
    const runSdposeExtract = async (overrideImage1) => {
        const prev = sdposeWidget?.value;
        if (sdposeWidget) sdposeWidget.value = true;
        try {
            const prompt = await app.graphToPrompt();
            restoreSdposeWidget(prev);
            if (overrideImage1 && prompt?.output) {
                const self = prompt.output[String(node.id)];
                if (self?.inputs) {
                    self.inputs.image_1 = overrideImage1;
                    // 顺带告诉后端：本次只是临时借用这张图识别，别覆盖图1/图2 的预览
                    // （见 pz_pose_dual_image.py 的 _import_only）
                    self.inputs.sdpose_settings = JSON.stringify({ ...(readSdposeSettings(node) || {}), _import_only: true });
                }
            }
            const queued = await api.queuePrompt(0, prompt, { partialExecutionTargets: [String(node.id)] });
            return { ok: true, promptId: queued?.prompt_id || "" };
        } catch (e) {
            restoreSdposeWidget(prev);
            console.warn("[PZ SDPose] 提取失败", e);
            alert("SDPose 提取失败：" + (e?.message || e));
            return { ok: false, promptId: "" };
        }
    };

    // 等后端把本次提取的关键点回传（成功 true / 失败或超时 false）
    // sdposeImportOnly：本次是「导入图转人偶」的临时识别，只取数据，不切骨骼图 / 不落图2 / 不写回绑定节点
    let sdposeImportOnly = false;
    let sdposeWaiters = [];
    // 等待必须能认出「是哪一次执行」：本节点的每次运行（含普通运行）都会来一个 executed 事件，
    // 不看 prompt_id 就会把正在进行的一键流程误判成“识别失败”。
    const waitSdposeDone = () => {
        const waiter = { promptId: "", resolve: null };
        const promise = new Promise((resolve) => { waiter.resolve = resolve; });
        sdposeWaiters.push(waiter);
        return { promise, waiter };
    };
    const dropWaiter = (waiter) => { sdposeWaiters = sdposeWaiters.filter((w) => w !== waiter); };
    const flushSdposeWaiters = (ok, promptId) => {
        const id = promptId == null ? "" : String(promptId);
        const ws = sdposeWaiters;
        sdposeWaiters = [];
        for (const w of ws) if (!id || !w.promptId || w.promptId === id) w.resolve(ok);
    };

    if (sdposeButton) sdposeButton.addEventListener("click", async () => {
        if (!inputLinked("sdpose_model") || !inputLinked("sdpose_vae")) {
            alert("请先把 Checkpoint 加载器的 MODEL / VAE 分别接到本节点的 sdpose_model / sdpose_vae 输入，再点「SDPose 一键骨架」。");
            return;
        }
        sdposeButton.disabled = true;
        sdposeButton.textContent = "提取中…";
        try { await runSdposeExtract(); }
        finally { sdposeButton.disabled = false; sdposeButton.textContent = "SDPose 一键骨架"; }
    });

    // ===== 一键图1转人偶（人偶图一行，排在「打开姿势编辑器」右边）=====
    // 识别图1 骨架 → 后台开 3D 人偶编辑器自动摆姿 → 自动应用到节点 → 人偶图落到图2
    const dollButton = document.createElement("button");
    dollButton.type = "button";
    dollButton.textContent = "一键图1转人偶";
    dollButton.className = "pz-pose-btn";
    dollButton.title = "用 SDPose 从图1 识别骨架，交给 3D 人偶编辑器自动摆好姿势，人偶图直接落到图2（之后可打开人偶编辑器继续微调）";
    mannequinRow.appendChild(dollButton);

    // 上传本地图到 input 目录，返回可直接写进图片控件的值（失败 null）
    const uploadImage = async (file) => {
        try {
            const form = new FormData();
            form.append("image", file, file.name || "pz_import.png");
            form.append("type", "input");
            form.append("overwrite", "true");
            const resp = await api.fetchApi("/upload/image", { method: "POST", body: form });
            if (!resp.ok) throw new Error(`上传失败 ${resp.status}`);
            const { name, subfolder } = await resp.json();
            return subfolder ? { filename: name, subfolder, type: "input" } : name;
        } catch (e) {
            alert("导入图片失败：" + (e?.message || e));
            return null;
        }
    };

    // 识别 → 等关键点回传 → 取出交给人偶编辑器的数据（两条一键流程共用；文案只用于失败提示）
    const extractDollHandoff = async (label, sourceText, overrideImage1) => {
        const pending = waitSdposeDone(); // 先挂上等待再排队，免得回执比等待先到
        const run = await runSdposeExtract(overrideImage1);
        if (!run.ok) { dropWaiter(pending.waiter); return null; }
        pending.waiter.promptId = run.promptId || ""; // 只认这一次执行的回执
        const ok = await Promise.race([pending.promise, new Promise((r) => setTimeout(() => r(false), 180000))]);
        if (!ok) { alert(`骨架识别失败：${sourceText}里没检测到人物，或执行超时。换一张图重试。`); return null; }
        const handoff = sdposeHandoff();
        if (!handoff) { alert(`没有拿到骨架数据，请重试「${label}」。`); return null; }
        // 人偶图要写进 poseReference，所以显式切回人偶图类型
        setKind("人偶图 / Mannequin");
        return {
            openposeEntry: { ...handoff.entry, auto: true },
            width: handoff.width,
            height: handoff.height,
            headPoints: handoff.head,
        };
    };

    // 完整「一键图1转人偶」流程：识别图1 骨架，返回交给人偶编辑器自动摆姿所需的参数（失败返回 null）
    const runDollPose = async () => {
        if (!inputLinked("sdpose_model") || !inputLinked("sdpose_vae")) {
            alert("请先把 Checkpoint 加载器的 MODEL / VAE 分别接到本节点的 sdpose_model / sdpose_vae 输入，再点「一键图1转人偶」。");
            return null;
        }
        const handoff = await extractDollHandoff("一键图1转人偶", "图1");
        return handoff ? { ...handoff, autoApply: true } : null;
    };

    // ===== 导入图转人偶：借任意一张图的姿势 / 身材数据，纯粹不干扰节点的图1 / 图2 =====
    // SDPose 只认图1，所以这里把导入的图作为「本次执行」的图1（只改提交的这一份工作流，见 runSdposeExtract）；
    // 节点上的图1（控件值 / 预览 / 上游连线 / 绑定节点）一律不碰，也不用事后还原。
    // 只把这张图的骨架 / 头部朝向 / 画布尺寸记进 pose_json，用来弥补当前姿势图的不足。
    const runDollPoseFromImport = async (file) => {
        if (!inputLinked("sdpose_model") || !inputLinked("sdpose_vae")) {
            alert("请先把 Checkpoint 加载器的 MODEL / VAE 分别接到本节点的 sdpose_model / sdpose_vae 输入，再点「导入图转人偶」。");
            return null;
        }
        const value = await uploadImage(file);
        if (!value) return null;
        const imageName = typeof value === "string"
            ? value
            : [value.subfolder, value.filename].filter(Boolean).join("/");
        if (!imageName) { alert("导入图片失败：没有拿到文件名。"); return null; }
        sdposeImportOnly = true;
        try {
            const handoff = await extractDollHandoff("导入图转人偶", "导入的图", imageName);
            return handoff ? { ...handoff, autoApply: false } : null;
        } finally {
            sdposeImportOnly = false;
            node.setDirtyCanvas?.(true, true);
            app.graph.change?.();
        }
    };

    // 编辑器里点「一键图1转人偶」/「导入图转人偶」：宿主跑完识别后，把骨架发回当前已打开的编辑器自动摆姿（不再新开窗口）。
    // autoApply 刻意置 false：这一路只摆姿、不出图回传，编辑器保持打开，让用户手动微调后再点「应用到节点」。
    // （节点上那个「一键图1转人偶」按钮仍走 autoApply=true 的后台出图流程。）
    const onDollRequest = (send, file) => {
        void (async () => {
            const opts = file ? await runDollPoseFromImport(file) : await runDollPose();
            if (!opts) {
                // 失败也要回一声，否则编辑器里那两个按钮一直卡在「识别中…」（具体原因页面上已弹窗提示）
                send?.("fisher-doll-failed", {
                    message: file ? "导入的图里没检测到人物，或识别未成功" : "图1 里没检测到人物，或识别未成功",
                });
                return;
            }
            send?.("fisher-load", { pose_json: poseWidgetOf()?.value || "{}", ...opts, image1: image1BgUrl(), autoApply: false });
        })();
    };

    if (dollButton) dollButton.addEventListener("click", async () => {
        const label = dollButton.textContent;
        dollButton.disabled = true;
        dollButton.textContent = "识别中…";
        try {
            const opts = await runDollPose();
            if (!opts) return;
            dollButton.textContent = "摆姿中…";
            openPoseEditor(node, onPoseApplied, "fisher", { ...opts, image1: image1BgUrl(), onDollRequest });
        } finally { dollButton.disabled = false; dollButton.textContent = label; }
    });

    // 后端回传 SDPose 关键点：落图2（图1 为背景的骨架合成图）+ 存入 pose_json 供骨架编辑器微调
    const onSdposeExecuted = async ({ detail }) => {
        if (String(detail?.node) !== String(node.id)) return;
        // 只结束「同一次执行」的等待：普通运行也会来一个 executed（没有骨架数据），
        // 不看 prompt_id 会把正在跑的一键流程提前判成失败。
        const promptId = detail?.prompt_id;
        let ok = false;
        try {
        const arr = detail?.output?.pz_sdpose_keypoints;
        if (!arr || !arr.length) return;
        let frames;
        try { frames = JSON.parse(arr[0]); } catch { return; }
        const frame = Array.isArray(frames) ? frames[0] : frames;
        if (!frame || !frame.people) return;
        let obj = {};
        try { obj = JSON.parse(poseWidgetOf()?.value || "{}"); } catch {}
        obj.poseOpenpose = frame;
        // 取后端合成的「图1 + 骨架」图作为 poseSkeleton，使图2 与导出结果一致
        // 「导入图转人偶」不取：那是导入图的合成图，不该留在 pose_json 里当图2
        if (!sdposeImportOnly) {
        try {
            const url = `/pz_easyuse/dual-image-preview?node=${node.id}&slot=2&rand=${Math.random()}`;
            const blob = await (await fetch(url)).blob();
            obj.poseSkeleton = await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(fr.result);
                fr.onerror = reject;
                fr.readAsDataURL(blob);
            });
        } catch (e) { console.warn("[PZ SDPose] 读取合成图失败", e); }
        }
        // 记下黑底骨架图（slot 3）的宽高，打开人偶编辑器时连图一起传过去
        try {
            const sizeArr = detail?.output?.pz_sdpose_canvas;
            if (sizeArr && sizeArr.length) {
                const size = JSON.parse(sizeArr[0]);
                obj.sdposeSkeleton = { width: Number(size.width) || 0, height: Number(size.height) || 0, pending: true };
            }
        } catch {}
        const w = poseWidgetOf();
        if (w) { w.value = JSON.stringify(obj); if (typeof w.callback === "function") w.callback(w.value); }
        // 「导入图转人偶」的临时识别：只借用这张图的姿势 / 身材数据，
        // 不切骨骼图、也不把「导入图 + 骨架」落到图2 与绑定节点（图1 由调用方还原）
        if (!sdposeImportOnly) {
            setKind("骨骼图 / OpenPose Skeleton");
            if (obj.poseSkeleton) {
                setPosePreview(obj.poseSkeleton);
                const lid2 = currentLoadListenId2();
                if (lid2) void syncPoseToLoader(lid2, obj.poseSkeleton);
            }
        }
        node.setDirtyCanvas(true, true);
        app.graph.change();
        ok = true;
        } finally { flushSdposeWaiters(ok, promptId); }
    };
    api.addEventListener("executed", onSdposeExecuted);
    // 本次执行报错时立刻结束等待，别白等 3 分钟
    api.addEventListener("execution_error", (event) => {
        flushSdposeWaiters(false, event?.detail?.prompt_id);
    });
}
