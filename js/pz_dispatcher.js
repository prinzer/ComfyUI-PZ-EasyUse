import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "PZ.BatchDispatcher",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PZ_Batch_Dispatcher") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                this.addWidget("button", "🚀 开始执行 (Run Batch)", null, async () => {
                    const btn = this.widgets.find(w => w.type === "button");
                    const originalLabel = "🚀 开始执行 (Run Batch)";
                    
                    if(btn) { btn.name = "⏳ 发送中..."; app.graph.setDirtyCanvas(true); }

                    try {
                        const prompt = await app.graphToPrompt();
                        if (!prompt || !prompt.output) throw new Error("无法生成 Workflow");

                        const w = (name) => this.widgets.find(i => i.name === name);
                        
                        const body = {
                            "text": w("text")?.value || "",
                            "prefix": w("prefix")?.value || "",
                            "suffix": w("suffix")?.value || "",
                            "delimiter": w("delimiter")?.value || ", ",
                            "start_index": w("start_index")?.value || 0,
                            "count": w("count")?.value || 0,
                            "prompt": prompt.output, 
                            "extra_data": prompt.workflow,
                            "node_id": this.id,
                            "client_id": api.clientId 
                        };

                        const response = await api.fetchApi("/pz/dispatch_batch", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(body),
                        });

                        if (response.ok) {
                            const data = await response.json();
                            if (btn) btn.name = `✅ ${data.message}`;
                        } else {
                            if (btn) btn.name = "❌ 发送失败";
                        }
                    } catch (error) {
                        if (btn) btn.name = "❌ 错误";
                        console.error(error);
                    } finally {
                        setTimeout(() => {
                            if (btn) { btn.name = originalLabel; app.graph.setDirtyCanvas(true); }
                        }, 2000);
                    }
                });

                return r;
            };
        }
    },
});