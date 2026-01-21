import { app } from "../../scripts/app.js";
console.log("%c ✅ 成功加载本js");
            
// 更新了扩展名称
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
                return {
                    active: `[${num}] 生效`,
                    prompt: `[${num}] 提示词`
                };
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

                setTimeout(() => {
                    this.updateVisibility();
                }, 50);

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
                    
                    const hasText = w_prompt && w_prompt.value && w_prompt.value.trim() !== "";
                    const isActive = w_active && w_active.value === true;
                    
                    if (hasText || isActive) {
                        maxActiveRow = i;
                    }
                }
                this.visibleRows = Math.max(maxActiveRow, DEFAULT_VISIBLE_ROWS);
                
                setTimeout(() => {
                    this.updateVisibility();
                }, 50);
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
                        if (w_prompt.type !== "converted-widget") w_prompt.origType = w_prompt.type;
                        w_prompt.type = "converted-widget";
                        w_prompt.computeSize = () => [0, -4];
                    }
                }

                app.graph.setDirtyCanvas(true, true);
                const targetSize = this.computeSize();
                this.setSize([this.size[0], targetSize[1]]);
            };
        }

        // ==========================================
        // 2. LoRA 动态节点逻辑
        // ==========================================
        if (nodeData.name === "PZ_LoRA_Dynamic_Model" || nodeData.name === "PZ_LoRA_Dynamic_Full") {
            
            const DEFAULT_VISIBLE_ROWS = 5;
            const MAX_ROWS = 20;

            const getNames = (i) => {
                const num = i.toString().padStart(2, '0');
                return {
                    active: `[${num}] 生效`,
                    lora: `[${num}] LoRA名`,
                    strength: `[${num}] 权重`
                };
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
                        const rowToRemove = this.visibleRows;
                        const names = getNames(rowToRemove);
                        
                        const w_active = this.widgets.find(w => w.name === names.active);
                        const w_lora = this.widgets.find(w => w.name === names.lora);
                        const w_strength = this.widgets.find(w => w.name === names.strength);
                        
                        if (w_active) w_active.value = false;
                        if (w_lora) w_lora.value = "None";
                        if (w_strength) w_strength.value = 1.0;

                        this.visibleRows--;
                        this.updateVisibility();
                    }
                });

                setTimeout(() => {
                    this.updateVisibility();
                }, 50);

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
                    
                    if ((w_active && w_active.value === true) || (w_lora && w_lora.value !== "None")) {
                        maxActiveRow = i;
                    }
                }
                this.visibleRows = Math.max(maxActiveRow, DEFAULT_VISIBLE_ROWS);
                
                setTimeout(() => {
                    this.updateVisibility();
                }, 50);
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

                app.graph.setDirtyCanvas(true, true);
                const targetSize = this.computeSize();
                this.setSize([this.size[0], targetSize[1]]);
            };
        }
    }
});