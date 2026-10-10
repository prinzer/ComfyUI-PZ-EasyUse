import { app } from "../../scripts/app.js";
import { SDPOSE_DEFAULTS, openSdposeSettingsPanel } from "./pz_sdpose_settings_ui.js";

// ============================================================
// SDPose 设置（PZ_Pose_Dual_Image_Loader）的「存取」与节点侧入口
//
// 面板本体在 pz_sdpose_settings_ui.js（不依赖 app，骨架编辑器里也要用同一套）。
// 结果写入隐藏控件 sdpose_settings（JSON 字符串），随工作流保存。
// ============================================================

export { SDPOSE_DEFAULTS };

const settingsWidgetOf = (node) => node.widgets?.find((w) => w.name === "sdpose_settings");

export function readSdposeSettings(node) {
    let obj = {};
    try { obj = JSON.parse(settingsWidgetOf(node)?.value || "{}"); } catch {}
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) obj = {};
    return { ...SDPOSE_DEFAULTS, ...obj };
}

export function writeSdposeSettings(node, obj) {
    const w = settingsWidgetOf(node);
    if (!w) return;
    w.value = JSON.stringify({ ...SDPOSE_DEFAULTS, ...(obj || {}) });
    if (typeof w.callback === "function") w.callback(w.value);
    app.graph?.change();
}

/**
 * 节点侧的「设置」按钮：打开 SDPose 设置面板并存回本节点。
 * @param {object} node PZ_Pose_Dual_Image_Loader 节点
 */
export function openSdposeSettings(node) {
    openSdposeSettingsPanel(readSdposeSettings(node), {
        onSave: (out) => writeSdposeSettings(node, out),
        onReset: (out) => writeSdposeSettings(node, out),
    });
}
