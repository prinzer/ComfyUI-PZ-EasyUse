import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// =========================================================
// 辅助函数：管理 UI 控件的显隐
// =========================================================

// 管理文本版的 分隔符 输入框
function setupDelimiterWidget(node) {
    const refreshWidgets = () => {
        if (!node.widgets) return;
        try {
            const splitWidget = node.widgets.find(w => w.name === "split_mode");
            const delimiterWidget = node.widgets.find(w => w.name === "delimiter");
            
            if (!splitWidget || !delimiterWidget) return;
            
            const mode = splitWidget.value;
            // 只有选择 Custom 模式才显示 delimiter
            if (mode && mode.includes("Custom")) {
                delimiterWidget.hidden = false;
                if (delimiterWidget.element) delimiterWidget.element.style.display = ""; 
            } else {
                delimiterWidget.hidden = true;
                if (delimiterWidget.element) delimiterWidget.element.style.display = "none";
            }
        } catch (err) {}
    };

    const splitWidget = node.widgets ? node.widgets.find(w => w.name === "split_mode") : null;
    if (splitWidget) {
        splitWidget.callback = () => {
            refreshWidgets();
            node.computeSize();
            app.graph.setDirtyCanvas(true, true);
        };
        // 初始化时运行一次
        setTimeout(() => { 
            refreshWidgets(); 
            if(node.onResize) node.onResize(node.size);
        }, 100);
    }
}

// 管理全功能版的 图片路径 输入框
function setupImageWidgets(node) {
    const refreshWidgets = () => {
        if (!node.widgets) return;
        try {
            const sourceWidget = node.widgets.find(w => w.name === "image_source");
            const dirWidget = node.widgets.find(w => w.name === "directory_path");
            
            if (!sourceWidget || !dirWidget) return;
            
            const mode = sourceWidget.value;
            // 只有选择 Directory 模式才显示路径框
            if (mode && mode.includes("Directory")) {
                dirWidget.hidden = false;
                if (dirWidget.element) dirWidget.element.style.display = ""; 
            } else {
                dirWidget.hidden = true;
                if (dirWidget.element) dirWidget.element.style.display = "none";
            }
        } catch (err) {}
    };

    const sourceWidget = node.widgets ? node.widgets.find(w => w.name === "image_source") : null;
    if (sourceWidget) {
        sourceWidget.callback = () => {
            refreshWidgets();
            node.computeSize();
            app.graph.setDirtyCanvas(true, true);
        };
        setTimeout(() => { 
            refreshWidgets(); 
            if(node.onResize) node.onResize(node.size); 
        }, 100);
    }
}

// =========================================================
// 注册扩展
// =========================================================

app.registerExtension({
    name: "PZ.Commander.All",
    
    // 1. 初始化节点 UI
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        
        // --- 针对 PZ_Commander (全功能版) ---
        if (nodeData.name === "PZ_Commander") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.setSize([400, 480]);
                setupImageWidgets(this); // 绑定图片控件显隐逻辑
                return r;
            };
        }

        // --- 针对 PZ_Commander_Text (文本版) ---
        if (nodeData.name === "PZ_Commander_Text") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.setSize([400, 420]);
                setupDelimiterWidget(this); // 绑定分隔符控件显隐逻辑
                return r;
            };
        }
    },

    // 2. Queue 劫持逻辑 (处理 JS Loop)
    async setup() {
        const originalQueuePrompt = app.queuePrompt;

        // 重写 app.queuePrompt
        app.queuePrompt = async function(index = 0, batchCount = 1) {
            
            // 如果 graph 未加载，直接放行
            if (!app.graph) return await originalQueuePrompt.apply(this, arguments);

            // 查找是否存在 PZ Commander 系列节点
            let pzNode = null;
            try {
                // 查找所有相关节点
                const nodes = app.graph._nodes.filter(n => n.type === "PZ_Commander" || n.type === "PZ_Commander_Text");
                // 优先取第一个（如果有多个，逻辑可能会冲突，这里只处理第一个）
                if (nodes && nodes.length > 0) pzNode = nodes[0];
            } catch(e) {}

            // 基础检查：如果找不到节点、节点被静音(Mute=2)或旁路(Bypass=4)，直接放行
            if (!pzNode || !pzNode.widgets || pzNode.mode === 2 || pzNode.mode === 4) {
                return await originalQueuePrompt.apply(this, arguments);
            }

            // =========================================================
            // 🔒 安全检查：final_prompt 是否真的连接了？
            // 如果用户没连这个口，说明不想用 Prompt 循环功能，直接放行
            // =========================================================
            let isPromptConnected = false;
            if (pzNode.outputs) {
                const promptOutput = pzNode.outputs.find(out => out.name === "final_prompt");
                if (promptOutput && promptOutput.links && promptOutput.links.length > 0) {
                    isPromptConnected = true;
                }
            }

            if (!isPromptConnected) {
                // console.log("[PZ Commander] Final prompt not connected, skipping loop logic.");
                return await originalQueuePrompt.apply(this, arguments);
            }
            // =========================================================

            // 获取控件引用
            const indexWidget = pzNode.widgets.find(w => w.name === "start_index");
            const countWidget = pzNode.widgets.find(w => w.name === "count");
            const modeWidget = pzNode.widgets.find(w => w.name === "prompt_mode");
            
            // 获取文本内容用于计算长度
            const textWidget = pzNode.widgets.find(w => w.name === "prompt_text");
            // 获取分割符相关控件
            const splitWidget = pzNode.widgets.find(w => w.name === "split_mode");
            const delimiterWidget = pzNode.widgets.find(w => w.name === "delimiter");

            if (!indexWidget || !countWidget) return await originalQueuePrompt.apply(this, arguments);

            // 如果选择了 "Generator List" 模式，交给 Python 处理，JS 不劫持
            if (modeWidget && modeWidget.value.includes("Generator List")) {
                return await originalQueuePrompt.apply(this, arguments);
            }

            // 获取基础循环参数
            let count = parseInt(countWidget.value);
            const start = parseInt(indexWidget.value);

            if (count <= 1) return await originalQueuePrompt.apply(this, arguments);

            // =========================================================
            // 🧠 智能截断逻辑：防止重复循环
            // =========================================================
            if (textWidget && textWidget.value) {
                const rawText = textWidget.value.trim();
                let lines = [];
                
                // 判断分割方式 (只有 Text 节点有 splitWidget)
                if (splitWidget && splitWidget.value.includes("Custom") && delimiterWidget) {
                    const sep = delimiterWidget.value || ";";
                    if (rawText) lines = rawText.split(sep).filter(l => l.trim() !== "");
                } else {
                    // 默认按换行符
                    if (rawText) lines = rawText.split("\n").filter(l => l.trim() !== "");
                }

                const totalItems = lines.length;
                if (totalItems > 0) {
                    // 计算从当前 start 开始，还剩多少个可以用
                    const remaining = Math.max(0, totalItems - start);
                    
                    if (count > remaining) {
                        console.log(`[PZ Commander] Count (${count}) > Remaining (${remaining}). Auto-limiting.`);
                        count = remaining; // 🔥 核心：截断循环次数
                    }
                    
                    // 如果根本没有剩余的了 (start 已经超了)
                    if (count <= 0) {
                        console.log(`[PZ Commander] Finished. No items left (Start ${start} >= Total ${totalItems}).`);
                        return; // 直接停止，不发任务
                    }
                }
            }
            // =========================================================

            console.log(`[PZ Commander] 🚀 JS Loop executing ${count} tasks...`);
            
            // 记录原始索引，循环结束后恢复
            const originalIndex = indexWidget.value;

            try {
                for (let i = 0; i < count; i++) {
                    // 修改临时索引
                    indexWidget.value = start + i;
                    
                    // 生成 Prompt 并发送 (这里使用的是 api.queuePrompt，不会再次触发被劫持的 app.queuePrompt)
                    const prompt = await app.graphToPrompt();
                    await api.queuePrompt(0, prompt);
                }
            } catch (e) {
                console.error("[PZ Commander] Queue Error:", e);
            } finally {
                // 恢复索引显示
                indexWidget.value = originalIndex;
                if(pzNode.onResize) pzNode.onResize(pzNode.size); 
                app.graph.setDirtyCanvas(true, true);
            }
            
            // 拦截原始点击，因为我们已经手动发完了
            return; 
        };
    }
});
