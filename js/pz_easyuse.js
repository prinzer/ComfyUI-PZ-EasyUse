import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { t } from "./i18n.js";

app.registerExtension({
    name: "PZ.EasyUse",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        
        // Add button for "PZ_Save_Image" node
        if (nodeData.name === "PZ_Save_Image") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                const pathWidget = this.widgets.find((widget) => widget.name === "custom_output_path");

                // Open the path currently shown in the editable path widget.
                this.addWidget("button", t('openOutputFolder'), null, async () => {
                    try {
                        const response = await api.fetchApi("/pz/open_output_dir", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ path: pathWidget?.value || "" })
                        });
                        if (!response.ok) throw new Error(await response.text());
                    } catch (e) {
                        alert(t('cannotOpenFolder') + e);
                    }
                });
                
                if (this.size[1] < 170) this.setSize([Math.max(this.size[0], 420), 170]);

                return r;
            };
        }

        // Add dynamic UI for "PZ_Commander_Text_MultiBox_Dynamic" node
        if (nodeData.name === "PZ_Commander_Text_MultiBox_Dynamic") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                const node = this;
                
                // Create container for dynamic widgets
                let boxesContainer = null;
                let boxWidgetsMap = {}; // Store widget references by index
                
                // Helper function to create a box UI group (toggle + textbox)
                function createBoxGroup(index) {
                    const group = document.createElement("div");
                    group.className = "pz-box-group";
                    group.style.cssText = `
                        display: flex;
                        gap: 8px;
                        padding: 8px;
                        background: var(--comfy-menu-bg);
                        border: 1px solid var(--border-color);
                        border-radius: 4px;
                        margin-bottom: 4px;
                        align-items: flex-start;
                    `;
                    
                    const toggleWidget = node.widgets.find(w => w.name === `enable_box_${index}`);
                    const boxWidget = node.widgets.find(w => w.name === `prompt_box_${index}`);
                    
                    if (toggleWidget && boxWidget) {
                        // Move toggle and text elements into the group
                        if (toggleWidget.element) {
                            const toggleContainer = document.createElement("div");
                            toggleContainer.style.cssText = `
                                flex-shrink: 0;
                                display: flex;
                                align-items: center;
                                min-width: 40px;
                            `;
                            toggleContainer.appendChild(toggleWidget.element);
                            group.appendChild(toggleContainer);
                            boxWidgetsMap[index] = { toggle: toggleWidget, box: boxWidget, group };
                        }
                        
                        if (boxWidget.element) {
                            const boxElementContainer = document.createElement("div");
                            boxElementContainer.style.cssText = `
                                flex: 1;
                                min-width: 0;
                            `;
                            boxElementContainer.appendChild(boxWidget.element);
                            group.appendChild(boxElementContainer);
                        }
                    }
                    
                    return group;
                }
                
                // Function to rebuild the dynamic layout
                function rebuildLayout(numBoxes) {
                    // Clear container
                    if (boxesContainer) {
                        boxesContainer.innerHTML = "";
                    } else {
                        // Create container if doesn't exist
                        boxesContainer = document.createElement("div");
                        boxesContainer.className = "pz-boxes-container";
                        boxesContainer.style.cssText = `
                            width: 100%;
                            padding: 8px 0;
                            box-sizing: border-box;
                        `;
                        
                        // Find insertion point (after buttons)
                        const addBtnWidget = node.widgets.find(w => w.name && w.name.includes("Add Box"));
                        if (addBtnWidget && addBtnWidget.element && addBtnWidget.element.parentElement) {
                            addBtnWidget.element.parentElement.parentElement.appendChild(boxesContainer);
                        }
                    }
                    
                    // Add groups for visible boxes
                    for (let i = 0; i < numBoxes; i++) {
                        const group = createBoxGroup(i);
                        boxesContainer.appendChild(group);
                    }
                    
                    // Trigger node resize
                    if (node.onResize) {
                        setTimeout(() => node.onResize(node.size), 50);
                    }
                }
                
                // Get the num_boxes widget and override its callback
                const numBoxesWidget = node.widgets.find(w => w.name === "num_boxes");
                if (numBoxesWidget) {
                    const originalCallback = numBoxesWidget.callback;
                    
                    numBoxesWidget.callback = function(value) {
                        if (originalCallback) originalCallback.call(this, value);
                        rebuildLayout(value);
                    };
                }

                // Add button to increase text boxes (max 20)
                node.addWidget("button", "➕ Add Box", null, () => {
                    const numBoxesWidget = node.widgets.find(w => w.name === "num_boxes");
                    if (numBoxesWidget && numBoxesWidget.value < 20) {
                        numBoxesWidget.value = numBoxesWidget.value + 1;
                        if (numBoxesWidget.callback) numBoxesWidget.callback(numBoxesWidget.value);
                    }
                });

                // Add button to remove text boxes (min 1)
                node.addWidget("button", "➖ Remove Box", null, () => {
                    const numBoxesWidget = node.widgets.find(w => w.name === "num_boxes");
                    if (numBoxesWidget && numBoxesWidget.value > 1) {
                        numBoxesWidget.value = numBoxesWidget.value - 1;
                        if (numBoxesWidget.callback) numBoxesWidget.callback(numBoxesWidget.value);
                    }
                });

                // Initial layout build
                if (numBoxesWidget) {
                    setTimeout(() => {
                        rebuildLayout(numBoxesWidget.value);
                    }, 100);
                }

                // Adjust height for aesthetics
                if (node.size[1] < 200) node.setSize([node.size[0], 200]);

                return r;
            };
        }
    },

    async setup() {
        const originalQueuePrompt = app.queuePrompt;

        app.queuePrompt = async function(index = 0, batchCount = 1) {
            if (!app.graph) return await originalQueuePrompt.apply(this, arguments);

            const nodes = app.graph._nodes || [];
            const activeLoopers = [];

            // 检测所有活跃的循环节点（包括新增的 MultiBox Dynamic）
            for (const n of nodes) {
                if (n.mode === 2 || n.mode === 4) continue; // Muted/Bypassed
                
                const isText = n.type === "PZ_Commander_Text";
                const isMix = n.type === "PZ_Commander";
                const isImg = n.type === "PZ_Commander_Image";
                const isMultiBox = n.type === "PZ_Commander_Text_MultiBox_Dynamic";
                
                if (!isText && !isMix && !isImg && !isMultiBox) continue;

                let isActive = false;
                
                if (isText) {
                    const out = n.outputs?.find(o => o.name === "final_prompt");
                    if (out && out.links?.length) isActive = true;
                    const promptMode = n.widgets?.find(w => w.name === "prompt_mode");
                    if (promptMode && promptMode.value.includes("Generator List")) isActive = false;
                }
                else if (isMultiBox) {
                    // MultiBox 节点：如果有输出连接就激活
                    const out = n.outputs?.find(o => o.name === "final_prompts");
                    if (out && out.links?.length) isActive = true;
                }
                else if (isImg) {
                    const out = n.outputs?.find(o => o.name === "IMAGE");
                    if (out && out.links?.length) isActive = true;
                }
                else if (isMix) {
                    const outImg = n.outputs?.find(o => o.name === "IMAGE");
                    const outTxt = n.outputs?.find(o => o.name === "final_prompt");
                    const linkImg = outImg && outImg.links && outImg.links.length > 0;
                    const linkTxt = outTxt && outTxt.links && outTxt.links.length > 0;
                    if (linkImg || linkTxt) isActive = true;
                }

                if (isActive) activeLoopers.push(n);
            }

            if (activeLoopers.length > 1) {
                alert("❌ Conflict! Multiple PZ Loop nodes detected.");
                return;
            }

            let targetNode = activeLoopers[0];
            if (!targetNode) return await originalQueuePrompt.apply(this, arguments);

            let loopCount = 1;

            // 【新增：处理 MultiBox Dynamic 节点】
            if (targetNode.type === "PZ_Commander_Text_MultiBox_Dynamic") {
                const numBoxes = targetNode.widgets.find(w => w.name === "num_boxes")?.value || 5;
                let enabledCount = 0;

                // 计算启用的文本框数量
                for (let i = 0; i < numBoxes; i++) {
                    const enableWidget = targetNode.widgets.find(w => w.name === `enable_box_${i}`);
                    const boxWidget = targetNode.widgets.find(w => w.name === `prompt_box_${i}`);
                    
                    // 如果启用 且 文本框有内容，计数 +1
                    if (enableWidget && enableWidget.value === 1 && boxWidget && boxWidget.value?.trim()) {
                        enabledCount++;
                    }
                }

                loopCount = Math.max(1, enabledCount);
                console.log(`[PZ MultiBox Loop] Enabled boxes: ${enabledCount}`);

                if (enabledCount === 0) {
                    console.log("[PZ MultiBox Loop] No enabled boxes with content. Skipping.");
                    return;
                }

                // 按启用的文本框逐个运行
                let boxIndex = 0;
                const selectedBoxes = [];

                for (let i = 0; i < numBoxes; i++) {
                    const enableWidget = targetNode.widgets.find(w => w.name === `enable_box_${i}`);
                    const boxWidget = targetNode.widgets.find(w => w.name === `prompt_box_${i}`);
                    
                    if (enableWidget && enableWidget.value === 1 && boxWidget && boxWidget.value?.trim()) {
                        selectedBoxes.push(i);
                    }
                }

                try {
                    for (let idx = 0; idx < selectedBoxes.length; idx++) {
                        // 这里可以标记当前处理的文本框索引，供后续使用
                        targetNode._pz_current_box_index = selectedBoxes[idx];
                        
                        const p = await app.graphToPrompt();
                        await api.queuePrompt(0, p);
                    }
                } finally {
                    targetNode._pz_current_box_index = undefined;
                    targetNode.setDirtyCanvas(true, true);
                }
                return; // 完成后直接返回
            }

            // 【原有逻辑保持不变】
            const getW = (name) => targetNode.widgets.find(w => w.name === name);
            const idxW = getW("start_index");
            
            if (!idxW) return await originalQueuePrompt.apply(this, arguments);

            // A. 纯文本
            if (targetNode.type === "PZ_Commander_Text") {
                const promptMode = getW("prompt_mode")?.value || "";
                const pTextW = getW("prompt_text");
                
                if (promptMode.includes("Iterate") && !pTextW) {
                    alert("❌ PZ_Commander_Text Error: Cannot use external wire for prompt_text in Iterate mode!");
                    return;
                }

                const requestedCount = parseInt(getW("count")?.value || 1);
                const textVal = pTextW?.value || "";
                const splitMode = getW("split_mode")?.value || "Newline";
                const delim = getW("delimiter")?.value || ";";
                
                let lines = [];
                if (splitMode.includes("Custom") && delim) lines = textVal.split(delim).filter(x => x.trim());
                else lines = textVal.split("\n").filter(x => x.trim());
                
                if (lines.length === 0) loopCount = requestedCount;
                else {
                    const startIdx = parseInt(idxW.value || 0);
                    const remainingLines = Math.max(0, lines.length - startIdx);
                    loopCount = Math.min(requestedCount, remainingLines);
                    if (remainingLines === 0 && requestedCount > 0) loopCount = 0; 
                }
            } 
            // B. 混合/图片
            else {
                const src = getW("image_source")?.value || "";
                const forceCount = parseInt(getW("force_count")?.value || 1);

                if (src.includes("Upload")) {
                    const listStr = getW("image_list_data")?.value || "";
                    const list = listStr.split("\n").filter(x=>x.trim());
                    
                    const outImg = targetNode.outputs?.find(o => o.name === "IMAGE");
                    const linkImg = outImg && outImg.links && outImg.links.length > 0;
                    
                    if (list.length > 0) {
                        loopCount = list.length;
                    } else {
                        if (linkImg) {
                            loopCount = 0;
                            console.warn("PZ Loop: Upload mode selected, IMAGE output connected, but NO images uploaded.");
                        } else {
                            loopCount = forceCount;
                            console.log("PZ Loop: Text-only loop mode (Upload empty). Using force_count:", loopCount);
                        }
                    }
                } else {
                    loopCount = forceCount;
                }
            }

            if (loopCount <= 0) {
                console.log("[PZ Loop] Loop count is 0. Skipping.");
                return;
            }

            console.log(`[PZ Loop] Node: ${targetNode.type}, Count: ${loopCount}`);
            const originalStart = idxW.value;
            const startVal = parseInt(originalStart);

            try {
                for (let i = 0; i < loopCount; i++) {
                    idxW.value = startVal + i;
                    const p = await app.graphToPrompt();
                    await api.queuePrompt(0, p);
                }
            } finally {
                idxW.value = originalStart;
                targetNode.setDirtyCanvas(true, true);
            }
        };
    }
});