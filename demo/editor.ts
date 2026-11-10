import { EditorView, lineNumbers } from "@codemirror/view";
import { localChangesExtensions } from "../src/editor/localChanges/localChanges";

const before = `<!-- 内部草稿，发布前删除 -->
# 周报 2026-11-10

## 本周完成

- 修复同步失败的问题
- 更新插件版本到 2.43.9
- 整理发布包

## 下周计划

- 补充单元测试
- 优化差异视图

## 风险

- 历史提交暂不处理

## 备注

暂无`;

const after = `# 周报 2026-11-10

## 本周完成

- 修复同步失败的问题
- 更新插件版本到 2.44.0
- 整理发布包并归档
- 新增 IDEA 风格差异提示

## 下周计划

- 补充单元测试
- 优化差异视图的折叠体验
- 打磨 UI 细节

## 备注

暂无

## 附：参考链接

- https://github.com/shenshi-lei/obsidian-git`;

function mount(id: string, style: "idea" | "github") {
    const parent = document.getElementById(id);
    if (!parent) {
        return;
    }
    const view = new EditorView({
        doc: after,
        extensions: [
            ...localChangesExtensions({
                style,
                getFilePath: () => "notes/weekly.md",
                getBaseline: () => before,
                setBaseline: () => undefined,
                openComparison: () => {
                    window.open("compare.html", "_blank");
                },
            }),
            lineNumbers(),
            EditorView.lineWrapping,
        ],
        parent,
    });
    view.dispatch({});
}

mount("idea", "idea");
mount("github", "github");
