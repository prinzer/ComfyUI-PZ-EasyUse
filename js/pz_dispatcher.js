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
                    this.setSize([400, 480]);
                    const refreshWidgets = () => {
                        if (!this.widgets) return;
                        try {
                            const sourceWidget = this.widgets.find(w => w.name === "image_source");
                            const dirWidget = this.widgets.find(w => w.name === "directory_path");
                            if (!sourceWidget || !dirWidget) return;
                            const mode = sourceWidget.value;
                            if (mode && mode.includes("Directory")) {
                                dirWidget.hidden = false;
                                if (dirWidget.element) dirWidget.element.style.display = ""; 
                            } else {
                                dirWidget.hidden = true;
                                if (dirWidget.element) dirWidget.element.style.display = "none";
                            }
                        } catch (err) {}
                    };
                    const sourceWidget = this.widgets ? this.widgets.find(w => w.name === "image_source") : null;
                    if (sourceWidget) {
                        sourceWidget.callback = () => {
                            refreshWidgets();
                            this.computeSize();
                            app.graph.setDirtyCanvas(true, true);
                        };
                        setTimeout(() => { 
                            if(this.onResize) this.onResize(this.size);
                            refreshWidgets(); 
                        }, 100);
                    }
                } catch (e) { console.error(e); }
                return r;
            };
        }
    },

    // --- Queue 劫持逻辑 ---
    async setup() {
        const originalQueuePrompt = app.queuePrompt;
        app.queuePrompt = async function(index = 0, batchCount = 1) {
            
            if (!app.graph) return await originalQueuePrompt.apply(this, arguments);

            let pzNode = null;
            try {
                const nodes = app.graph.findNodesByType("PZ_Commander");
                if (nodes && nodes.length > 0) pzNode = nodes[0];
            } catch(e) {}

            if (!pzNode || !pzNode.widgets || pzNode.mode === 2 || pzNode.mode === 4) {
                return await originalQueuePrompt.apply(this, arguments);
            }

            const indexWidget = pzNode.widgets.find(w => w.name === "start_index");
            const countWidget = pzNode.widgets.find(w => w.name === "count");
            const modeWidget = pzNode.widgets.find(w => w.name === "prompt_mode"); 
            
            if (!indexWidget || !countWidget) return await originalQueuePrompt.apply(this, arguments);

            // 🔥 如果是 "Generator List" 模式
            // JS 撒手不管，让 Python 端发 List 给 ComfyUI，一次 Queue 出多张图
            if (modeWidget && modeWidget.value.includes("Generator List")) {
                console.log("[PZ Commander] List Mode -> Native Single Task");
                return await originalQueuePrompt.apply(this, arguments);
            }

            // 只有 "Iterate" 模式下，JS 才帮忙点击循环
            const start = indexWidget.value;
            const count = countWidget.value;

            if (count <= 1) return await originalQueuePrompt.apply(this, arguments);

            console.log(`[PZ Commander] 🚀 Batching ${count} tasks (JS Loop)...`);
            const originalIndex = indexWidget.value;

            try {
                for (let i = 0; i < count; i++) {
                    indexWidget.value = start + i;
                    const prompt = await app.graphToPrompt();
                    await api.queuePrompt(0, prompt);
                }
            } catch (e) {
                console.error("[PZ Commander] Queue Error:", e);
            } finally {
                indexWidget.value = originalIndex;
            }
            return; 
        };
    }
});
