import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { diffGutter } from "../src/ui/diff/diffGutter";

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

const readOnly = () => [
    lineNumbers(),
    EditorView.lineWrapping,
    EditorState.readOnly.of(true),
];

function mountLegacy(id: string) {
    const parent = document.getElementById(id);
    if (!parent) {
        return;
    }
    new MergeView({
        a: { doc: before, extensions: readOnly() },
        b: { doc: after, extensions: readOnly() },
        diffConfig: { timeout: 200 },
        parent,
    });
}

function mountGutter(
    id: string,
    palette: "idea" | "github"
) {
    const parent = document.getElementById(id);
    if (!parent) {
        return;
    }
    const extensions = (side: "a" | "b") => [
        diffGutter(side),
        lineNumbers(),
        EditorView.lineWrapping,
        EditorState.readOnly.of(true),
    ];
    const view = new MergeView({
        a: { doc: before, extensions: extensions("a") },
        b: { doc: after, extensions: extensions("b") },
        gutter: false,
        diffConfig: { timeout: 200 },
        parent,
    });
    parent.classList.add(`git-diff-colors-${palette}`);
    view.a.dispatch({});
    view.b.dispatch({});
}

mountLegacy("legacy");
mountGutter("idea", "idea");
mountGutter("github", "github");
