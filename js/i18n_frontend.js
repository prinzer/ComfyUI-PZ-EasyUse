// Frontend internationalization for PZ EasyUse nodes
// This script handles translating node display names based on language settings

import { app } from "../../scripts/app.js";
import { t, getCurrentLanguage } from "./i18n.js";

// Node display name translations
const nodeDisplayNames = {
    "PZ_Commander": {
        en: "🚀 PZ Text & Image Loop",
        zh: "🚀 PZ 提示词&图片循环器"
    },
    "PZ_Commander_Text": {
        en: "📝 PZ Text Loop",
        zh: "📝 PZ Commander (纯文本版)"
    },
    "PZ_Commander_Image": {
        en: "🖼️ PZ Image Loop",
        zh: "🖼️ PZ ImageLoop(纯图片版)"
    },
    "PZ_Read_Image_Metadata": {
        en: "PZ Read Image Metadata",
        zh: "PZ 读取图片信息"
    },
    "PZ_Prompt_Dynamic": {
        en: "PZ Prompt Group (Dynamic 50)",
        zh: "PZ 提示词组 (动态50)"
    },
    "PZ_Prompt_Dynamic_ML": {
        en: "PZ Prompt Group (Dynamic 50 / Multiline)",
        zh: "PZ 提示词组 (动态50 / 多行)"
    },
    "PZ_LoRA_Dynamic_Model": {
        en: "PZ LoRA Group (Dynamic/Model Only)",
        zh: "PZ LoRA组 (动态/仅模型)"
    },
    "PZ_LoRA_Dynamic_Full": {
        en: "PZ LoRA Group (Dynamic/Full)",
        zh: "PZ LoRA组 (动态/全模组)"
    },
    "PZ_Save_Image": {
        en: "PZ Image Save (Enhanced)",
        zh: "PZ 图片保存 (增强版)"
    },
    "PZ_Resolution_Selector": {
        en: "PZ Resolution Selector",
        zh: "PZ 分辨率选择器"
    },
    "PZ_Prompt_Fixed": {
        en: "PZ Prompt Group (Fixed 10)",
        zh: "PZ 提示词组 (固定10)"
    },
    "PZ_String_Join": {
        en: "PZ String Join",
        zh: "PZ 字符串合并"
    },
    "PZ_LoRA_Fixed_Model": {
        en: "PZ LoRA Group (Fixed/Model Only)",
        zh: "PZ LoRA组 (固定/仅模型)"
    },
    "PZ_LoRA_Fixed_Full": {
        en: "PZ LoRA Group (Fixed/Full)",
        zh: "PZ LoRA组 (固定/全模组)"
    }
};

// Update node display names based on current language
function updateNodeDisplayNames() {
    const lang = getCurrentLanguage();
    
    // Update node display names in the graph
    if (app.graph) {
        app.graph.nodes.forEach(node => {
            if (nodeDisplayNames[node.type]) {
                node.title = nodeDisplayNames[node.type][lang] || nodeDisplayNames[node.type].en;
            }
        });
    }
    
    // Update node display names in the menu
    if (app.menu) {
        // This would require more complex logic to update the menu
        // For now, we'll rely on the node creation process
    }
    
    console.log(`%c PZ EasyUse: Updated node display names to ${lang}`, "color:blue; font-weight:bold;");
}

app.registerExtension({
    name: "PZ.EasyUse.i18n",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Update node display name when node is registered
        if (nodeDisplayNames[nodeData.name]) {
            const lang = getCurrentLanguage();
            nodeData.display_name = nodeDisplayNames[nodeData.name][lang] || nodeDisplayNames[nodeData.name].en;
        }
    },
    async appStarted() {
        // Update existing nodes when app starts
        setTimeout(updateNodeDisplayNames, 1000);
    }
});

// Export functions for other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { updateNodeDisplayNames, nodeDisplayNames };
} else {
    window.PZ_I18N_Frontend = { updateNodeDisplayNames, nodeDisplayNames };
}
