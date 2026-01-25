import { app } from "../../scripts/app.js";

console.log("%c ✅ PZ EasyUse Manager (Hybrid Mode) Loaded", "color:green; font-weight:bold;");

// ========================================================
// ⚡ 核心逻辑：通用的单选互斥处理器
// ========================================================
function attachRadioLogic(node, maxRows) {
    
    // 获取模式 Widget
    const modeWidget = node.widgets.find(w => w.name === "模式");
    if (!modeWidget) return;

    // 辅助函数：判断当前是否是单选模式
    const isRadioMode = () => modeWidget.value && modeWidget.value.includes("Radio");

    // 遍历所有行的开关
    for (let i = 1; i <= maxRows; i++) {
        const num = i.toString().padStart(2, '0');
        const activeName = `[${num}] 生效`;
        
        // 尝试找到这个开关 (可能因为动态显示而被隐藏/转换，要在 updateVisibility 后也能生效)
        // 注意：这里我们只处理当前在 widgets 列表里的 toggle
        const toggle = node.widgets.find(w => w.name === activeName);
        
        if (toggle && !toggle.hasPZRadioLogic) {
            // 标记防止重复绑定
            toggle.hasPZRadioLogic = true; 
            
            const originalCallback = toggle.callback;
            
            toggle.callback = function(value) {
                // 只有在【单选模式】且【当前被开启】时，才触发互斥
                if (isRadioMode() && value === true) {
                    
                    // 遍历寻找其他开关并关闭它们
                    for (let j = 1; j <= maxRows; j++) {
                        const otherNum = j.toString().padStart(2, '0');
                        // 跳过自己
                        if (otherNum === num) continue; 
                        
                        const otherName = `[${otherNum}] 生效`;
                        const otherToggle = node.widgets.find(w => w.name === otherName);
                        
                        if (otherToggle && otherToggle.value === true) {
                            otherToggle.value = false;
                        }
                    }
                    app.graph.setDirtyCanvas(true, true);
                }

                // 执行原始回调 (如果有)
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
        // 1. 提示词动态节点
        // ==========================================
        if (nodeData.name === "PZ_Prompt_Dynamic") {
            const DEFAULT_VISIBLE_ROWS = 5;
            const MAX_ROWS = 50;
            const getNames = (i) => {
                const num = i.toString().padStart(2, '0');
                return { active: `[${num}] 生效`, prompt: `[${num}] 提示词` };
            };

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.visibleRows = this.visibleRows || DEFAULT_VISIBLE_ROWS;
                
                this.addWidget("button", "➕ 增加一行", null, () => {
                    if (this.visibleRows < MAX_ROWS) {
                        this.visibleRows++;
                        this.updateVisibility();
                    }
                });

                this.addWidget("button", "➖ 减少一行", null, () => {
                    if (this.visibleRows > 1) {
                        const names = getNames(this.visibleRows);
                        const w_prompt = this.widgets.find(w => w.name === names.prompt);
                        const w_active = this.widgets.find(w => w.name === names.active);
                        if (w_prompt) w_prompt.value = "";
                        if (w_active) w_active.value = false;
                        this.visibleRows--;
                        this.updateVisibility();
                    }
                });
                
                // 绑定模式切换的回调：切换到 Radio 模式时，强制刷新一次互斥状态（可选，防止多选残留）
                const modeWidget = this.widgets.find(w => w.name === "模式");
                if (modeWidget) {
                    modeWidget.callback = () => {
                        // 如果切到单选模式，且有多个已选中，可以选择保留第一个，关掉其他的
                        if (modeWidget.value.includes("Radio")) {
                            let foundFirst = false;
                            for(let i=1; i<=MAX_ROWS; i++) {
                                const w = this.widgets.find(x => x.name === getNames(i).active);
                                if (w && w.value === true) {
                                    if (!foundFirst) foundFirst = true;
                                    else w.value = false; // 关闭后续选中的
                                }
                            }
                            app.graph.setDirtyCanvas(true, true);
                        }
                    };
                }

                setTimeout(() => { this.updateVisibility(); }, 50);
                return r;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                if(onConfigure) onConfigure.apply(this, arguments);
                let maxActiveRow = DEFAULT_VISIBLE_ROWS;
                for (let i = 1; i <= MAX_ROWS; i++) {
                    const names = getNames(i);
                    const w_prompt = this.widgets.find(w => w.name === names.prompt);
                    const w_active = this.widgets.find(w => w.name === names.active);
                    if ((w_prompt && w_prompt.value) || (w_active && w_active.value)) maxActiveRow = i;
                }
                this.visibleRows = Math.max(maxActiveRow, DEFAULT_VISIBLE_ROWS);
                setTimeout(() => { this.updateVisibility(); }, 50);
            };

            nodeType.prototype.updateVisibility = function() {
                for (let i = 1; i <= MAX_ROWS; i++) {
                    const names = getNames(i);
                    const w_active = this.widgets.find(w => w.name === names.active);
                    const w_prompt = this.widgets.find(w => w.name === names.prompt);
                    if (!w_active || !w_prompt) continue;

                    if (i <= this.visibleRows) {
                        if (w_active.type === "converted-widget") w_active.type = "toggle";
                        if (w_prompt.type === "converted-widget") w_prompt.type = w_prompt.origType || "customtext";
                        w_active.computeSize = null;
                        w_prompt.computeSize = null;
                    } else {
                        w_active.type = "converted-widget";
                        w_active.computeSize = () => [0, -4];
                        w_prompt.origType = w_prompt.type !== "converted-widget" ? w_prompt.type : w_prompt.origType;
                        w_prompt.type = "converted-widget";
                        w_prompt.computeSize = () => [0, -4];
                    }
                }
                
                // 🔥 关键：每次更新可见性后，重新绑定互斥逻辑（因为 widget 可能会被重建或改变状态）
                attachRadioLogic(this, MAX_ROWS);

                app.graph.setDirtyCanvas(true, true);
                const targetSize = this.computeSize();
                this.setSize([this.size[0], targetSize[1]]);
            };
        }

        // ==========================================
        // 2. LoRA 动态节点
        // ==========================================
        if (nodeData.name === "PZ_LoRA_Dynamic_Model" || nodeData.name === "PZ_LoRA_Dynamic_Full") {
            const DEFAULT_VISIBLE_ROWS = 5;
            const MAX_ROWS = 20;
            const getNames = (i) => {
                const num = i.toString().padStart(2, '0');
                return { active: `[${num}] 生效`, lora: `[${num}] LoRA名`, strength: `[${num}] 权重` };
            };

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.visibleRows = this.visibleRows || DEFAULT_VISIBLE_ROWS;
                
                this.addWidget("button", "➕ 增加一行", null, () => {
                    if (this.visibleRows < MAX_ROWS) {
                        this.visibleRows++;
                        this.updateVisibility();
                    }
                });
                this.addWidget("button", "➖ 减少一行", null, () => {
                    if (this.visibleRows > 1) {
                        const names = getNames(this.visibleRows);
                        const w_active = this.widgets.find(w => w.name === names.active);
                        const w_lora = this.widgets.find(w => w.name === names.lora);
                        if (w_active) w_active.value = false;
                        if (w_lora) w_lora.value = "None";
                        this.visibleRows--;
                        this.updateVisibility();
                    }
                });
                
                // 绑定模式切换回调
                const modeWidget = this.widgets.find(w => w.name === "模式");
                if (modeWidget) {
                    modeWidget.callback = () => {
                        if (modeWidget.value.includes("Radio")) {
                            let foundFirst = false;
                            for(let i=1; i<=MAX_ROWS; i++) {
                                const w = this.widgets.find(x => x.name === getNames(i).active);
                                if (w && w.value === true) {
                                    if (!foundFirst) foundFirst = true;
                                    else w.value = false;
                                }
                            }
                            app.graph.setDirtyCanvas(true, true);
                        }
                    };
                }

                setTimeout(() => { this.updateVisibility(); }, 50);
                return r;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function() {
                if(onConfigure) onConfigure.apply(this, arguments);
                let maxActiveRow = DEFAULT_VISIBLE_ROWS;
                for (let i = 1; i <= MAX_ROWS; i++) {
                    const names = getNames(i);
                    const w_active = this.widgets.find(w => w.name === names.active);
                    const w_lora = this.widgets.find(w => w.name === names.lora);
                    if ((w_active && w_active.value) || (w_lora && w_lora.value !== "None")) maxActiveRow = i;
                }
                this.visibleRows = Math.max(maxActiveRow, DEFAULT_VISIBLE_ROWS);
                setTimeout(() => { this.updateVisibility(); }, 50);
            };

            nodeType.prototype.updateVisibility = function() {
                for (let i = 1; i <= MAX_ROWS; i++) {
                    const names = getNames(i);
                    const w_active = this.widgets.find(w => w.name === names.active);
                    const w_lora = this.widgets.find(w => w.name === names.lora);
                    const w_strength = this.widgets.find(w => w.name === names.strength);
                    if (!w_active || !w_lora || !w_strength) continue;

                    if (i <= this.visibleRows) {
                        if (w_active.type === "converted-widget") w_active.type = "toggle";
                        if (w_lora.type === "converted-widget") w_lora.type = "combo";
                        if (w_strength.type === "converted-widget") w_strength.type = "number";
                        w_active.computeSize = null; 
                        w_lora.computeSize = null;
                        w_strength.computeSize = null;
                    } else {
                        w_active.type = "converted-widget"; 
                        w_lora.type = "converted-widget"; 
                        w_strength.type = "converted-widget";
                        w_active.computeSize = () => [0, -4];
                        w_lora.computeSize = () => [0, -4];
                        w_strength.computeSize = () => [0, -4];
                    }
                }
                
                // 🔥 重新绑定互斥逻辑
                attachRadioLogic(this, MAX_ROWS);

                app.graph.setDirtyCanvas(true, true);
                const targetSize = this.computeSize();
                this.setSize([this.size[0], targetSize[1]]);
            };
        }
    }
});
