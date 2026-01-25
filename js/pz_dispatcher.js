import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// =========================================================
// 🛡️ 防弹版辅助函数：安全地管理 UI 控件显隐
// =========================================================

function safeSetHidden(widget, shouldHide) {
    if (!widget) return;
    if (widget.hidden !== shouldHide) {
        widget.hidden = shouldHide;
        if (widget.element) {
            widget.element.style.display = shouldHide ? "none" : "";
        }
    }
}

// 管理 分隔符 输入框
function setupDelimiterWidget(node) {
    const refreshWidgets = () => {
        if (!node.widgets) return;
        try {
            const splitWidget = node.widgets.find(w => w.name === "split_mode");
            const delimiterWidget = node.widgets.find(w => w.name === "delimiter");
            
            if (splitWidget && delimiterWidget) {
                const mode = splitWidget.value;
                const shouldShow = mode && mode.includes("Custom");
                safeSetHidden(delimiterWidget, !shouldShow);
            }
        } catch (err) { console.warn("[PZ] Widget update warning:", err); }
    };

    const splitWidget = node.widgets ? node.widgets.find(w => w.name === "split_mode") : null;
    if (splitWidget) {
        splitWidget.callback = () => {
            refreshWidgets();
            node.computeSize();
            app.graph.setDirtyCanvas(true, true);
        };
        setTimeout(() => { refreshWidgets(); }, 100);
    }
}

// 管理 图片路径 输入框
function setupImageWidgets(node) {
    const refreshWidgets = () => {
        if (!node.widgets) return;
        try {
            const sourceWidget = node.widgets.find(w => w.name === "image_source");
            const dirWidget = node.widgets.find(w => w.name === "directory_path");
            
            if (sourceWidget && dirWidget) {
                const mode = sourceWidget.value;
                const shouldShow = mode && mode.includes("Directory");
                safeSetHidden(dirWidget, !shouldShow);
            }
        } catch (err) { console.warn("[PZ] Widget update warning:", err); }
    };

    const sourceWidget = node.widgets ? node.widgets.find(w => w.name === "image_source") : null;
    if (sourceWidget) {
        sourceWidget.callback = () => {
            refreshWidgets();
            node.computeSize();
            app.graph.setDirtyCanvas(true, true);
        };
        setTimeout(() => { refreshWidgets(); }, 100);
    }
}

// =========================================================
// 注册扩展
// =========================================================

app.registerExtension({
    name: "PZ.Commander.All.Fixed", 
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PZ_Commander") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.setSize([400, 500]);
                setupImageWidgets(this);
                setupDelimiterWidget(this);
                return r;
            };
        }

        if (nodeData.name === "PZ_Commander_Text") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.setSize([400, 420]);
                setupDelimiterWidget(this);
                return r;
            };
        }
    },

    async setup() {
        const originalQueuePrompt = app.queuePrompt;

        app.queuePrompt = async function(index = 0, batchCount = 1) {
            
            if (!app.graph) return await originalQueuePrompt.apply(this, arguments);

            // ============================================================
            // 🔥 核心修复：寻找真正的“活跃指挥官” (Active Driver)
            // ============================================================
            let pzNode = null;
            try {
                // 1. 获取所有 PZ 节点
                const candidates = app.graph._nodes?.filter(n => n.type === "PZ_Commander" || n.type === "PZ_Commander_Text");
                
                if (candidates && candidates.length > 0) {
                    // 2. 遍历查找：必须找到一个【没静音】且【连了线】且【是 Iterate 模式】的节点
                    for (const node of candidates) {
                        
                        // 排除被静音(2)或被旁路(4)的节点
                        if (node.mode === 2 || node.mode === 4) continue;

                        // 排除没连线的节点 (final_prompt 必须连接)
                        let isConnected = false;
                        const promptOut = node.outputs?.find(o => o.name === "final_prompt");
                        if (promptOut && promptOut.links && promptOut.links.length > 0) {
                            isConnected = true;
                        }
                        if (!isConnected) continue;

                        // 排除 Generator List 模式 (这种模式不需要 JS 劫持)
                        const modeWidget = node.widgets?.find(w => w.name === "prompt_mode");
                        if (modeWidget && modeWidget.value.includes("Generator List")) continue;

                        // 🎉 找到了！这就是我们要听从的指挥官
                        pzNode = node;
                        break; 
                    }
                }
            } catch(e) { console.error("PZ Node Search Error", e); }

            // 如果遍历了一圈，没找到任何【活跃的指挥官】，那就放行，走普通流程
            if (!pzNode) {
                return await originalQueuePrompt.apply(this, arguments);
            }
            // ============================================================

            // 以下是循环逻辑，只有找到 pzNode 才会执行
            const getWidget = (name) => pzNode.widgets.find(w => w.name === name);
            const indexWidget = getWidget("start_index");
            const countWidget = getWidget("count");
            
            if (!indexWidget || !countWidget) return await originalQueuePrompt.apply(this, arguments);

            let count = parseInt(countWidget.value);
            const start = parseInt(indexWidget.value);

            if (count <= 1) return await originalQueuePrompt.apply(this, arguments);

            // 智能截断逻辑
            const textWidget = getWidget("prompt_text");
            const splitWidget = getWidget("split_mode");
            const delimiterWidget = getWidget("delimiter");

            if (textWidget && textWidget.value) {
                const rawText = textWidget.value.trim();
                let lines = [];
                if (splitWidget?.value?.includes("Custom") && delimiterWidget) {
                    const sep = delimiterWidget.value || ";";
                    if (rawText) lines = rawText.split(sep).filter(l => l.trim() !== "");
                } else {
                    if (rawText) lines = rawText.split("\n").filter(l => l.trim() !== "");
                }

                const totalItems = lines.length;
                if (totalItems > 0) {
                    const remaining = Math.max(0, totalItems - start);
                    if (count > remaining) count = remaining;
                    if (count <= 0) return;
                }
            }

            console.log(`[PZ] 🚀 Active Driver found (ID:${pzNode.id}). looping ${count} tasks...`);
            
            const originalIndex = indexWidget.value;

            try {
                for (let i = 0; i < count; i++) {
                    indexWidget.value = start + i;
                    const prompt = await app.graphToPrompt();
                    await api.queuePrompt(0, prompt);
                }
            } catch (e) {
                console.error("[PZ] Queue Error:", e);
            } finally {
                indexWidget.value = originalIndex;
                try {
                    if(pzNode.onResize) pzNode.onResize(pzNode.size); 
                    app.graph.setDirtyCanvas(true, true);
                } catch(e){}
            }
            return; 
        };
    }
});
