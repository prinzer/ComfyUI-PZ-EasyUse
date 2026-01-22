import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "PZ.Commander",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PZ_Commander") {
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                try {
                    this.setSize([400, 450]); // 稍微调小一点高度

                    // --- UI 显隐逻辑 ---
                    const refreshWidgets = () => {
                        try {
                            const sourceWidget = this.widgets?.find(w => w.name === "image_source");
                            const dirWidget = this.widgets?.find(w => w.name === "directory_path");

                            if (!sourceWidget || !dirWidget) return;

                            const mode = sourceWidget.value;

                            // 这里的逻辑很简单了
                            if (mode.includes("Directory")) {
                                dirWidget.hidden = false;
                            } else {
                                // None 模式
                                dirWidget.hidden = true;
                            }

                            // 强制重绘
                            this.computeSize();
                            app.graph.setDirtyCanvas(true, true);
                        
                        } catch (err) {
                            console.warn("PZ Commander UI Refresh warning:", err);
                        }
                    };

                    const sourceWidget = this.widgets.find(w => w.name === "image_source");
                    if (sourceWidget) {
                        sourceWidget.callback = refreshWidgets;
                        // 延迟执行以确保安全
                        setTimeout(() => { refreshWidgets(); }, 200);
                    }

                } catch (e) {
                    console.error("PZ Commander Create Error:", e);
                }

                return r;
            };
        }
    },

    // --- Queue 劫持逻辑 (不变) ---
    async setup() {
        const originalQueuePrompt = app.queuePrompt;
        app.queuePrompt = async function(index = 0, batchCount = 1) {
            
            let pzNode = null;
            try {
                if (app.graph) {
                    pzNode = app.graph.findNodesByType("PZ_Commander")?.[0];
                }
            } catch(e) {}

            if (!pzNode || pzNode.mode === 2 || pzNode.mode === 4) {
                return await originalQueuePrompt.apply(this, arguments);
            }

            const indexWidget = pzNode.widgets?.find(w => w.name === "start_index");
            const countWidget = pzNode.widgets?.find(w => w.name === "count");
            
            if (!indexWidget || !countWidget) return await originalQueuePrompt.apply(this, arguments);

            const start = indexWidget.value;
            const count = countWidget.value;

            if (count <= 1) return await originalQueuePrompt.apply(this, arguments);

            console.log(`[PZ Commander] 🚀 Batching ${count} tasks...`);
            const originalIndex = indexWidget.value;

            try {
                for (let i = 0; i < count; i++) {
                    indexWidget.value = start + i;
                    const prompt = await app.graphToPrompt();
                    await api.queuePrompt(0, prompt);
                }
            } catch (e) {
                console.error(e);
            } finally {
                indexWidget.value = originalIndex;
            }
            return; 
        };
    }
});
