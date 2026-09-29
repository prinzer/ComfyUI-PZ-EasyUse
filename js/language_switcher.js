// Language switcher for PZ EasyUse nodes

import { app } from "../../scripts/app.js";
import { t, getCurrentLanguage, setLanguage } from "./i18n.js";

app.registerExtension({
    name: "PZ.EasyUse.LanguageSwitcher",
    async appStarted() {
        // Create language switcher UI
        createLanguageSwitcher();
    }
});

function createLanguageSwitcher() {
    // Create a container for the language switcher
    const container = document.createElement("div");
    container.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 1000;
        background: var(--comfy-menu-bg);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
    `;
    
    // Create language label
    const label = document.createElement("span");
    label.textContent = t('language');
    label.style.cssText = "color: var(--input-text);";
    container.appendChild(label);
    
    // Create language select
    const select = document.createElement("select");
    select.style.cssText = `
        background: var(--comfy-input-bg);
        color: var(--input-text);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
    `;
    
    // Add language options
    const languages = [
        { value: 'en', label: t('languageEnglish') },
        { value: 'zh', label: t('languageChinese') }
    ];
    
    languages.forEach(lang => {
        const option = document.createElement("option");
        option.value = lang.value;
        option.textContent = lang.label;
        option.selected = lang.value === getCurrentLanguage();
        select.appendChild(option);
    });
    
    // Add change event listener
    select.addEventListener("change", (e) => {
        const selectedLang = e.target.value;
        setLanguage(selectedLang);
        // Update option labels after language change
        languages.forEach((lang, index) => {
            select.options[index].textContent = t(`language${lang.value === 'en' ? 'English' : 'Chinese'}`);
        });
        label.textContent = t('language');
    });
    
    container.appendChild(select);
    document.body.appendChild(container);
    
    console.log('PZ EasyUse: Language switcher created');
}
