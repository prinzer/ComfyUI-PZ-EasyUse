// Internationalization support for PZ EasyUse nodes

// Language packs
const translations = {
    en: {
        // Common
        addRow: "➕ Add Row",
        removeRow: "➖ Remove Row",
        on: "🟢 On",
        off: "⚪ Off",
        enabled: "Enabled",
        prompt: "Prompt",
        title: "Title",
        mode: "mode",
        multi: "Multi",
        radio: "Radio",
        prefix: "Prefix",
        suffix: "Suffix",
        language: "Language",
        languageEnglish: "English",
        languageChinese: "中文",
        
        // PZ_Prompt_Dynamic
        promptGroupDynamic: "PZ Prompt Group (Dynamic 50)",
        promptGroupDynamicML: "PZ Prompt Group (Dynamic 50 / Multiline)",
        
        // PZ_LoRA_Dynamic
        loraGroupDynamicModel: "PZ LoRA Group (Dynamic/Model Only)",
        loraGroupDynamicFull: "PZ LoRA Group (Dynamic/Full)",
        loraName: "LoRA Name",
        weight: "Weight",
        triggerWord: "Trigger Word",
        
        // PZ_Save_Image
        imageSaveEnhanced: "PZ Image Save (Enhanced)",
        filePrefix: "file_prefix",
        dateSubfolder: "date_subfolder",
        includeModelName: "include_model_name",
        embedWorkflow: "embed_workflow",
        embedCustomText: "embed_custom_text",
        customText: "custom_text",
        embed: "🟢 Embed",
        dontEmbed: "⚪ Don't Embed",
        openOutputFolder: "📂 Open Output Folder",
        
        // PZ_Resolution_Selector
        resolutionSelector: "PZ Resolution Selector",
        width: "width",
        height: "height",
        swapWidthHeight: "swap_width_height",
        swapped: "🔁 Swapped",
        normal: "➡️ Normal",
        
        // PZ_Commander
        textImageLoop: "🚀 PZ Text & Image Loop",
        textLoop: "📝 PZ Text Loop",
        imageLoop: "🖼️ PZ Image Loop",
        imageSource: "image_source",
        startIndex: "start_index",
        forceCount: "force_count",
        directoryPath: "directory_path",
        imageListData: "image_list_data",
        splitMode: "split_mode",
        delimiter: "delimiter",
        batchSize: "batch_size",
        promptText: "prompt_text",
        promptPrefix: "prompt_prefix",
        promptSuffix: "prompt_suffix",
        uploadImages: "Upload Images",
        directoryPathOption: "Directory Path",
        newline: "Newline",
        customDelimiter: "Custom Delimiter",
        promptListMainContent: "Prompt list (main content)...",
        prefixSingleLine: "Prefix (single line)...",
        suffixSingleLine: "Suffix (single line)...",
        
        // PZ_Read_Image_Metadata
        readImageMetadata: "PZ Read Image Metadata",
        image: "Image",
        customNotes: "Custom Notes",
        positivePrompt: "Positive Prompt",
        negativePrompt: "Negative Prompt",
        workflowJSON: "Workflow JSON",
        
        // PZ_String_Join
        stringJoin: "PZ String Join",
        separator: "separator",
        text1: "text1",
        text2: "text2",
        text3: "text3",
        text4: "text4",
        text5: "text5",
        text6: "text6",
        
        // Error messages
        cannotOpenFolder: "Cannot open folder: ",
        noCustomNotes: "⚠️ This image does not contain 'custom_notes' text.",
        noPromptData: "⚠️ No 'prompt' data.",
        noPositivePrompt: "No positive prompt extracted.",
        noNegativePrompt: "No negative prompt extracted.",
        parsePromptFailed: "Failed to parse prompt: ",
        noWorkflowInfo: "⚠️ This image does not contain 'workflow' information.",
        readFailed: "Read failed: ",
        
        // Console messages
        loaded: "✅ PZ EasyUse Manager (Hybrid Mode + Trigger Words + i18n) Loaded"
    },
    zh: {
        // Common
        addRow: "➕ 增加一行",
        removeRow: "➖ 减少一行",
        on: "🟢 开启",
        off: "⚪ 关闭",
        enabled: "生效",
        prompt: "提示词",
        title: "标题",
        mode: "模式",
        multi: "多选叠加 (Multi)",
        radio: "单选互斥 (Radio)",
        prefix: "前缀",
        suffix: "后缀",
        language: "语言",
        languageEnglish: "English",
        languageChinese: "中文",
        
        // PZ_Prompt_Dynamic
        promptGroupDynamic: "PZ 提示词组 (动态50)",
        promptGroupDynamicML: "PZ 提示词组 (动态50 / 多行)",
        
        // PZ_LoRA_Dynamic
        loraGroupDynamicModel: "PZ LoRA组 (动态/仅模型)",
        loraGroupDynamicFull: "PZ LoRA组 (动态/全模组)",
        loraName: "LoRA名",
        weight: "权重",
        triggerWord: "触发词",
        
        // PZ_Save_Image
        imageSaveEnhanced: "PZ 图片保存 (增强版)",
        filePrefix: "文件前缀",
        dateSubfolder: "日期子文件夹",
        includeModelName: "包含模型名",
        embedWorkflow: "嵌入工作流",
        embedCustomText: "嵌入自定义文本",
        customText: "自定义文本",
        embed: "🟢 嵌入",
        dontEmbed: "⚪ 不嵌入",
        openOutputFolder: "📂 打开输出目录",
        
        // PZ_Resolution_Selector
        resolutionSelector: "PZ 分辨率选择器",
        width: "宽 (Width)",
        height: "高 (Height)",
        swapWidthHeight: "交换宽高",
        swapped: "🔁 已交换",
        normal: "➡️ 正常",
        
        // PZ_Commander
        textImageLoop: "🚀 PZ 提示词&图片循环器",
        textLoop: "📝 PZ Commander (纯文本版)",
        imageLoop: "🖼️ PZ ImageLoop(纯图片版)",
        imageSource: "image_source",
        startIndex: "start_index",
        forceCount: "force_count",
        directoryPath: "directory_path",
        imageListData: "image_list_data",
        splitMode: "split_mode",
        delimiter: "delimiter",
        batchSize: "batch_size",
        promptText: "prompt_text",
        promptPrefix: "prompt_prefix",
        promptSuffix: "prompt_suffix",
        uploadImages: "Upload Images (拖拽上传)",
        directoryPathOption: "Directory Path (批量目录)",
        newline: "Newline (换行符)",
        customDelimiter: "Custom Delimiter (自定义)",
        promptListMainContent: "Prompt 列表 (主内容)...",
        prefixSingleLine: "前缀 (单行)...",
        suffixSingleLine: "后缀 (单行)...",
        
        // PZ_Read_Image_Metadata
        readImageMetadata: "PZ 读取图片信息",
        image: "图像 (Image)",
        customNotes: "自定义文本 (Notes)",
        positivePrompt: "正向提示词 (Positive)",
        negativePrompt: "反向提示词 (Negative)",
        workflowJSON: "工作流 JSON (Workflow)",
        
        // PZ_String_Join
        stringJoin: "PZ 字符串合并",
        separator: "分隔符",
        text1: "文本1",
        text2: "文本2",
        text3: "文本3",
        text4: "文本4",
        text5: "文本5",
        text6: "文本6",
        
        // Error messages
        cannotOpenFolder: "无法打开目录: ",
        noCustomNotes: "⚠️ 该图片没有包含 'custom_notes' 文本。",
        noPromptData: "⚠️ 没有 'prompt' 数据。",
        noPositivePrompt: "未提取到正向提示词。",
        noNegativePrompt: "未提取到反向提示词。",
        parsePromptFailed: "解析提示词失败: ",
        noWorkflowInfo: "⚠️ 该图片没有包含 'workflow' 信息。",
        readFailed: "读取失败: ",
        
        // Console messages
        loaded: "✅ PZ EasyUse Manager (混合模式 + 触发词 + 国际化) 已加载"
    }
};

// Store current language
let currentLanguage = 'en';

// Detect ComfyUI language setting
function detectComfyUILanguage() {
    console.log('PZ EasyUse i18n: Detecting language...');
    
    if (typeof window !== 'undefined' && window.localStorage) {
        console.log('PZ EasyUse i18n: localStorage available');
        
        // Check all localStorage items for language-related settings
        console.log('PZ EasyUse i18n: localStorage items:');
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            console.log(`PZ EasyUse i18n:   ${key}: ${value}`);
        }
        
        // Check for ComfyUI language setting with different possible keys
        const possibleKeys = ['comfyui.language', 'language', 'ui.language'];
        let comfyLanguage = null;
        
        for (const key of possibleKeys) {
            const value = localStorage.getItem(key);
            if (value) {
                console.log(`PZ EasyUse i18n: Found language setting in ${key}: ${value}`);
                comfyLanguage = value;
                break;
            }
        }
        
        if (comfyLanguage) {
            // Map ComfyUI language codes to our language codes
            const langMap = {
                'zh-CN': 'zh',
                'en-US': 'en',
                'zh': 'zh',
                'en': 'en'
            };
            const mappedLang = langMap[comfyLanguage] || comfyLanguage;
            console.log(`PZ EasyUse i18n: Mapped language ${comfyLanguage} to ${mappedLang}`);
            return mappedLang;
        }
        
        // Fallback: check browser language
        const browserLang = navigator.language || navigator.userLanguage;
        console.log(`PZ EasyUse i18n: Browser language: ${browserLang}`);
        
        if (browserLang) {
            if (browserLang.startsWith('zh')) {
                console.log('PZ EasyUse i18n: Detected Chinese browser language');
                return 'zh';
            } else {
                console.log('PZ EasyUse i18n: Detected non-Chinese browser language');
                return 'en';
            }
        }
    } else {
        console.log('PZ EasyUse i18n: localStorage not available');
    }
    
    console.log('PZ EasyUse i18n: Falling back to default language: en');
    return 'en';
}

// Initialize language
currentLanguage = detectComfyUILanguage();
console.log(`PZ EasyUse i18n: Detected language: ${currentLanguage}`);

// Listen for language changes in ComfyUI
if (typeof window !== 'undefined' && window.localStorage) {
    // Create a storage event listener to detect changes in language settings
    window.addEventListener('storage', (event) => {
        // Check if the language setting was changed
        if (event.key === 'comfyui.language' || event.key === 'language' || event.key === 'ui.language') {
            console.log(`PZ EasyUse i18n: Language setting changed: ${event.newValue}`);
            // Detect the new language
            const newLang = detectComfyUILanguage();
            // If the language has changed, update it
            if (newLang !== currentLanguage) {
                setLanguage(newLang);
            }
        }
    });
    
    // Also check for language changes every few seconds as a fallback
    setInterval(() => {
        const currentLang = detectComfyUILanguage();
        if (currentLang !== getCurrentLanguage()) {
            console.log(`PZ EasyUse i18n: Detected language change: ${currentLang}`);
            setLanguage(currentLang);
        }
    }, 5000); // Check every 5 seconds
}

// Get current language
function getCurrentLanguage() {
    return currentLanguage;
}

// Set language
function setLanguage(lang) {
    if (translations[lang]) {
        currentLanguage = lang;
        console.log(`PZ EasyUse i18n: Language set to ${lang}`);
        // Update node display names when language changes
        if (typeof window !== 'undefined' && window.PZ_I18N_Frontend && window.PZ_I18N_Frontend.updateNodeDisplayNames) {
            window.PZ_I18N_Frontend.updateNodeDisplayNames();
        }
        return true;
    }
    return false;
}

// Get translation
function t(key, lang = getCurrentLanguage()) {
    const langKey = lang in translations ? lang : 'en';
    return translations[langKey][key] || key;
}

// Export functions for ES modules
export { t, getCurrentLanguage, setLanguage, translations };

// Also set global object for non-module environments
if (typeof window !== 'undefined') {
    window.PZ_I18N = { t, getCurrentLanguage, setLanguage, translations };
}

// Support for CommonJS modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { t, getCurrentLanguage, setLanguage, translations };
}
