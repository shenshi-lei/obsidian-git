import type { Extension } from "@codemirror/state";
import {
    RangeSet,
    RangeSetBuilder,
    StateEffect,
    StateField,
} from "@codemirror/state";
import type { Text } from "@codemirror/state";
import {
    Decoration,
    EditorView,
    GutterMarker,
    ViewPlugin,
    gutter,
    keymap,
    showTooltip,
} from "@codemirror/view";
import type { DecorationSet, Tooltip, ViewUpdate } from "@codemirror/view";
import type { Hunk } from "src/editor/signs/hunks";
import { computeHunks } from "src/editor/signs/diff";
import { classifyHunks } from "./classify";
import type { LocalChanges } from "./classify";
import { revertHunkEdit } from "./revert";

export type LocalChangesStyle = "idea" | "github";

export type LocalChangesOptions = {
    /** Vault path of the editor document, if it belongs to a file. */
    getFilePath: (view: EditorView) => string | undefined;
    /** Baseline text for the path; creates it on first access. */
    getBaseline: (path: string, currentText: string) => string;
    /** Replaces the baseline text of a path. */
    setBaseline?: (path: string, text: string) => void;
    /** Opens a diff between the baseline and the current text. */
    openComparison?: (
        path: string,
        currentText: string,
        event?: MouseEvent
    ) => void;
    style: LocalChangesStyle;
};

const LINE_CLASS = {
    added: "git-local-line-added",
    modified: "git-local-line-modified",
} as const;

const activePlugins = new Set<LocalChangesPlugin>();

type TooltipRequest = { line: number; hunkIndex: number };

const setLocalTooltip = StateEffect.define<TooltipRequest | null>();

const localTooltipField = StateField.define<TooltipRequest | null>({
    create: () => null,
    update(value, transaction) {
        let next = value;
        for (const effect of transaction.effects) {
            if (effect.is(setLocalTooltip)) {
                next = effect.value;
            }
        }
        return transaction.docChanged ? null : next;
    },
});

/**
 * Mark all open editors that belong to `filePath` (or all editors if it is
 * undefined) as reviewed by resetting their baseline to the current text.
 */
export function resetLocalChangesBaselines(filePath?: string): void {
    for (const plugin of activePlugins) {
        plugin.reset(filePath);
    }
}

class LocalChangeMarker extends GutterMarker {
    constructor(
        readonly kind: "added" | "modified" | "deleted",
        readonly ghost: boolean,
        readonly top: boolean
    ) {
        super();
    }

    eq(other: LocalChangeMarker): boolean {
        return (
            other.kind === this.kind &&
            other.ghost === this.ghost &&
            other.top === this.top
        );
    }

    toDOM(): HTMLElement {
        const marker = document.createElement("span");
        marker.className = `git-local-changes-marker git-local-${this.kind}`;
        if (this.ghost) {
            marker.classList.add("git-local-ghost");
            if (!this.top) {
                marker.classList.add("git-local-ghost-bottom");
            }
        }
        marker.title =
            this.kind === "added"
                ? "Added line"
                : this.kind === "modified"
                  ? "Modified line"
                  : "Removed line";
        return marker;
    }
}

function buildDecorations(doc: Text, changes: LocalChanges): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    let lastLine = -1;
    for (const line of changes.lines) {
        const from = doc.line(line.line).from;
        if (from === lastLine) {
            continue;
        }
        lastLine = from;
        builder.add(
            from,
            from,
            Decoration.line({ class: LINE_CLASS[line.kind] })
        );
    }
    return builder.finish();
}

function buildMarkers(
    doc: Text,
    changes: LocalChanges
): RangeSet<GutterMarker> {
    const marks: Array<{
        line: number;
        kind: "added" | "modified" | "deleted";
        ghost: boolean;
        top: boolean;
    }> = [
        ...changes.lines.map((line) => ({
            line: line.line,
            kind: line.kind,
            ghost: false,
            top: true,
        })),
        ...changes.ghosts.map((ghost) => ({
            line: ghost.line,
            kind: ghost.kind,
            ghost: true,
            top: ghost.top,
        })),
    ].sort((a, b) => a.line - b.line);

    const builder = new RangeSetBuilder<GutterMarker>();
    let lastLine = -1;
    for (const mark of marks) {
        if (mark.line === lastLine) {
            continue;
        }
        lastLine = mark.line;
        const pos = doc.line(mark.line).from;
        builder.add(
            pos,
            pos,
            new LocalChangeMarker(mark.kind, mark.ghost, mark.top)
        );
    }
    return builder.finish();
}

const localChangesTheme = EditorView.theme({
    ".cm-gutters .git-local-changes-gutter": {
        width: "0.65rem",
        minWidth: "0.65rem",
        padding: "0 !important",
        backgroundColor: "inherit",
    },
    ".cm-gutters .git-local-changes-gutter .cm-gutterElement": {
        display: "grid",
        placeItems: "stretch center",
        padding: "0 !important",
    },
    ".git-local-changes-marker": {
        width: "3px",
        borderRadius: "2px",
        transition: "width 100ms ease",
    },
    ".cm-gutterElement:hover .git-local-changes-marker:not(.git-local-ghost)": {
        width: "6px",
    },
    ".git-local-changes-marker.git-local-added": {
        backgroundColor: "var(--git-local-added, #2ea043)",
    },
    ".git-local-changes-marker.git-local-modified": {
        backgroundColor: "var(--git-local-modified, #3b82f6)",
    },
    ".git-local-changes-marker.git-local-deleted": {
        backgroundColor: "var(--git-local-deleted, #8b949e)",
    },
    ".git-local-changes-marker.git-local-ghost": {
        width: "0",
        height: "0",
        borderRadius: "0",
        borderTop: "4px solid transparent",
        borderBottom: "4px solid transparent",
        borderLeft: "5px solid var(--git-local-deleted, #8b949e)",
        alignSelf: "start",
        marginTop: "1px",
        backgroundColor: "transparent",
    },
    ".git-local-changes-marker.git-local-ghost.git-local-ghost-bottom": {
        alignSelf: "end",
        marginTop: "0",
        marginBottom: "1px",
    },
    ".cm-line.git-local-line-added": {
        backgroundColor: "var(--git-local-added-bg, rgba(46, 160, 67, 0.1))",
    },
    ".cm-line.git-local-line-modified": {
        backgroundColor:
            "var(--git-local-modified-bg, rgba(59, 130, 246, 0.1))",
    },
});

class LocalChangesPlugin {
    decorations: DecorationSet = Decoration.none;
    markers: RangeSet<GutterMarker> = RangeSet.empty as RangeSet<GutterMarker>;
    hunks: Hunk[] = [];

    private readonly hunkAtLine = new Map<number, number>();
    private path: string | undefined;
    private baseline: string | undefined;
    private timer: number | undefined;
    private lastDiffTime = 0;

    constructor(
        private readonly view: EditorView,
        private readonly options: LocalChangesOptions
    ) {
        activePlugins.add(this);
        this.compute(false);
        queueMicrotask(() => this.refresh());
    }

    update(update: ViewUpdate) {
        const path = this.options.getFilePath(update.view);
        if (update.docChanged) {
            // Keep the stale markers valid until the debounced diff replaces
            // them, otherwise they can point outside the new document.
            this.decorations = this.decorations.map(update.changes);
            this.markers = this.markers.map(update.changes);
        }
        if (update.docChanged || path !== this.path) {
            this.schedule();
        }
    }

    destroy() {
        activePlugins.delete(this);
        if (this.timer !== undefined) {
            window.clearTimeout(this.timer);
        }
    }

    reset(filePath?: string) {
        if (filePath !== undefined && this.path !== filePath) {
            return;
        }
        if (this.path !== undefined) {
            this.options.setBaseline?.(
                this.path,
                this.view.state.doc.toString()
            );
        }
        this.baseline = this.view.state.doc.toString();
        this.compute(false);
        this.refresh();
        this.view.dispatch({ effects: setLocalTooltip.of(null) });
    }

    /**
     * Show the baseline content of the hunk at the given line, or close the
     * popover when the same line is clicked again.
     */
    toggleTooltip(line: number): boolean {
        const hunkIndex = this.hunkAtLine.get(line);
        if (hunkIndex === undefined) {
            return false;
        }
        const current = this.view.state.field(localTooltipField, false);
        const next = current?.line === line ? null : { line, hunkIndex };
        this.view.dispatch({ effects: setLocalTooltip.of(next) });
        return true;
    }

    /** Restore the baseline content of one hunk. */
    revertHunk(hunkIndex: number): void {
        const hunk = this.hunks[hunkIndex];
        if (!hunk) {
            return;
        }
        const edit = revertHunkEdit(this.view.state.doc, hunk);
        if (!edit) {
            return;
        }
        this.view.dispatch({
            changes: edit,
            userEvent: "revert",
            scrollIntoView: true,
        });
        this.compute(true);
    }

    get canCompare(): boolean {
        return (
            this.path !== undefined && this.options.openComparison !== undefined
        );
    }

    /** Open a diff of the opening baseline against the current editor text. */
    compare(event?: MouseEvent): void {
        if (this.path === undefined) {
            return;
        }
        this.options.openComparison?.(
            this.path,
            this.view.state.doc.toString(),
            event
        );
    }

    private schedule() {
        if (this.timer !== undefined) {
            window.clearTimeout(this.timer);
        }
        const delay = this.lastDiffTime > 16 ? 800 : 300;
        this.timer = window.setTimeout(() => this.compute(true), delay);
    }

    private compute(refresh: boolean) {
        if (this.timer !== undefined) {
            window.clearTimeout(this.timer);
            this.timer = undefined;
        }
        this.hunks = [];
        this.hunkAtLine.clear();

        const path = this.options.getFilePath(this.view);
        const text = this.view.state.doc.toString();
        if (path === undefined) {
            this.path = undefined;
            this.baseline = undefined;
            this.decorations = Decoration.none;
            this.markers = RangeSet.empty as RangeSet<GutterMarker>;
            if (refresh) {
                this.refresh();
            }
            return;
        }

        if (path !== this.path) {
            this.path = path;
            this.baseline = this.options.getBaseline(path, text);
        }

        const baseline = this.baseline;
        if (baseline === undefined || baseline === text) {
            this.decorations = Decoration.none;
            this.markers = RangeSet.empty as RangeSet<GutterMarker>;
        } else {
            const startTime = performance.now();
            const { hunks } = computeHunks(
                baseline,
                text,
                undefined,
                undefined
            );
            this.lastDiffTime = performance.now() - startTime;
            this.hunks = hunks;
            const changes = classifyHunks(this.view.state.doc, hunks);
            for (const line of changes.lines) {
                this.hunkAtLine.set(line.line, line.hunkIndex);
            }
            for (const ghost of changes.ghosts) {
                if (!this.hunkAtLine.has(ghost.line)) {
                    this.hunkAtLine.set(ghost.line, ghost.hunkIndex);
                }
            }
            this.decorations = buildDecorations(this.view.state.doc, changes);
            this.markers = buildMarkers(this.view.state.doc, changes);
        }

        if (refresh) {
            this.refresh();
        }
    }

    private refresh() {
        if (this.view.dom.isConnected) {
            this.view.dispatch({});
        }
    }
}

function createTooltipDom(
    view: EditorView,
    plugin: ViewPlugin<LocalChangesPlugin>,
    request: TooltipRequest
): { dom: HTMLElement } {
    const instance = view.plugin(plugin);
    const hunk = instance?.hunks[request.hunkIndex];
    const dom = document.createElement("div");
    dom.className = "git-local-tooltip";
    if (!hunk) {
        return { dom };
    }

    const header = document.createElement("div");
    header.className = "git-local-tooltip-header";
    const title = document.createElement("span");
    title.className = "git-local-tooltip-title";
    title.textContent = "打开笔记时的内容";
    header.appendChild(title);
    const counts = document.createElement("span");
    counts.className = "git-local-tooltip-counts";
    counts.textContent = `-${hunk.removed.count} / +${hunk.added.count}`;
    header.appendChild(counts);
    dom.appendChild(header);

    const content = document.createElement("div");
    content.className = "git-local-tooltip-content";
    if (hunk.removed.lines.length === 0) {
        const empty = document.createElement("div");
        empty.className = "git-local-tooltip-empty";
        empty.textContent = "这里原本没有内容";
        content.appendChild(empty);
    } else {
        for (const line of hunk.removed.lines) {
            const row = document.createElement("div");
            row.className = "git-local-tooltip-line";
            row.textContent = line.length > 0 ? line : "\u00a0";
            content.appendChild(row);
        }
    }
    dom.appendChild(content);

    const actions = document.createElement("div");
    actions.className = "git-local-tooltip-actions";
    if (instance?.canCompare) {
        const compare = document.createElement("button");
        compare.className = "git-local-compare";
        compare.textContent = "比对";
        compare.onclick = (event) => {
            instance.compare(event);
            view.dispatch({ effects: setLocalTooltip.of(null) });
        };
        actions.appendChild(compare);
    }
    const revert = document.createElement("button");
    revert.className = "git-local-revert";
    revert.textContent = "撤回这处修改";
    revert.onclick = () => {
        instance?.revertHunk(request.hunkIndex);
        view.dispatch({ effects: setLocalTooltip.of(null) });
    };
    actions.appendChild(revert);
    const close = document.createElement("button");
    close.className = "git-local-close";
    close.textContent = "关闭";
    close.onclick = () => {
        view.dispatch({ effects: setLocalTooltip.of(null) });
    };
    actions.appendChild(close);
    dom.appendChild(actions);

    return { dom };
}

function localTooltipExtensions(
    plugin: ViewPlugin<LocalChangesPlugin>
): Extension[] {
    return [
        localTooltipField,
        showTooltip.compute([localTooltipField], (state) => {
            const request = state.field(localTooltipField);
            if (!request) {
                return null;
            }
            const line = Math.min(Math.max(1, request.line), state.doc.lines);
            const tooltip: Tooltip = {
                pos: state.doc.line(line).from,
                above: false,
                arrow: false,
                strictSide: true,
                create: (view) => createTooltipDom(view, plugin, request),
            };
            return tooltip;
        }),
        EditorView.domEventHandlers({
            mousedown: (event, view) => {
                if (!view.state.field(localTooltipField, false)) {
                    return false;
                }
                const target = event.target as HTMLElement | null;
                if (
                    target?.closest(".git-local-tooltip") ||
                    target?.closest(".git-local-changes-gutter")
                ) {
                    return false;
                }
                view.dispatch({ effects: setLocalTooltip.of(null) });
                return false;
            },
        }),
        keymap.of([
            {
                key: "Escape",
                run: (view) => {
                    if (!view.state.field(localTooltipField, false)) {
                        return false;
                    }
                    view.dispatch({ effects: setLocalTooltip.of(null) });
                    return true;
                },
            },
        ]),
    ];
}

const pluginSpec = (options: LocalChangesOptions) =>
    ViewPlugin.define((view) => new LocalChangesPlugin(view, options), {
        decorations: (value) => value.decorations,
    });

export function localChangesExtensions(
    options: LocalChangesOptions
): Extension[] {
    const plugin = pluginSpec(options);
    return [
        EditorView.editorAttributes.of({
            class:
                options.style === "github"
                    ? "git-local-style-github"
                    : "git-local-style-idea",
        }),
        gutter({
            class: "git-local-changes-gutter",
            markers: (view) =>
                view.plugin(plugin)?.markers ??
                (RangeSet.empty as RangeSet<GutterMarker>),
            domEventHandlers: {
                mousedown: (view, line, event) => {
                    const instance = view.plugin(plugin);
                    if (!instance) {
                        return false;
                    }
                    const lineNumber = view.state.doc.lineAt(line.from).number;
                    const handled = instance.toggleTooltip(lineNumber);
                    if (handled) {
                        event.preventDefault();
                    }
                    return handled;
                },
            },
        }),
        plugin,
        localChangesTheme,
        ...localTooltipExtensions(plugin),
    ];
}
