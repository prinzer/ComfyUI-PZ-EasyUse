import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "PZ.EasyUse",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        
        // 针对 "PZ_Save_Image" 节点添加按钮
        if (nodeData.name === "PZ_Save_Image") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                // 添加按钮 Widget
                this.addWidget("button", "📂 打开输出目录", null, async () => {
                    try {
                        // 调用 Python 端写好的接口
                        await api.fetchApi("/pz/open_output_dir", { method: "POST" });
                    } catch (e) {
                        alert("无法打开目录: " + e);
                    }
                });
                
                // 为了美观，稍微调整一下高度（可选）
                if(this.size[1] < 120) this.setSize([this.size[0], 120]);

                return r;
            };
        }
    },
});