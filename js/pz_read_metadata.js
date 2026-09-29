import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "PZ_Read_Image_Metadata";

function getImageWidget(node) {
    return node.widgets?.find((widget) => widget.name === "image");
}

function decodeMetadataValue(value) {
    if (typeof value !== "string") return value || "";
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

app.registerExtension({
    name: "PZ.ReadImageMetadata.Preview",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            const node = this;
            const imageWidget = getImageWidget(node);
            const preview = document.createElement("div");
            preview.style.cssText = "width:100%;margin-top:8px;padding:8px;box-sizing:border-box;border:1px solid var(--border-color);border-radius:5px;background:var(--comfy-input-bg);color:var(--input-text);font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;min-height:34px;";
            preview.textContent = "选择图片后显示自定义信息";

            node.addDOMWidget("custom_notes_preview", "custom_notes_preview", preview);

            const renderMetadata = async (filename) => {
                if (!filename) {
                    preview.textContent = "选择图片后显示自定义信息";
                    return;
                }

                preview.textContent = "正在读取图片信息...";
                try {
                    const response = await api.fetchApi(
                        `/pz/image_metadata?filename=${encodeURIComponent(filename)}`
                    );
                    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
                    const metadata = await response.json();
                    const notes = decodeMetadataValue(metadata?.custom_notes);
                    preview.textContent = notes || "该图片没有 custom_notes 信息";
                } catch (error) {
                    console.warn("[PZ Read Image Metadata] Preview failed:", error);
                    preview.textContent = "无法读取图片自定义信息";
                }
                node.setSize?.([Math.max(360, node.size[0]), Math.max(node.size[1], 180)]);
                node.setDirtyCanvas?.(true, true);
            };

            if (imageWidget) {
                const originalCallback = imageWidget.callback;
                imageWidget.callback = function (value) {
                    originalCallback?.call(this, value);
                    renderMetadata(value);
                };
                setTimeout(() => renderMetadata(imageWidget.value), 100);
            }

            node.setSize?.([Math.max(360, node.size[0]), Math.max(170, node.size[1])]);
            return result;
        };
    }
});