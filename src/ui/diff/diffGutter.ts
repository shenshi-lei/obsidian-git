import { getChunks, mergeViewSiblings } from "@codemirror/merge";
import type { Chunk } from "@codemirror/merge";
import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import { alignLines } from "src/editor/diff/lineAlignment";
import type { EditorState, Extension, Text } from "@codemirror/state";
import {
    Decoration,
    EditorView,
    GutterMarker,
    ViewPlugin,
    gutter,
} from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";

export type DiffSide = "a" | "b";

type DiffLineKind = "added" | "deleted" | "modified";

type DiffLine = { line: number; kind: DiffLineKind };

type Classification = {
    lines: DiffLine[];
    ghosts: DiffLine[];
    markers: RangeSet<GutterMarker>;
    decorations: DecorationSet;
};

type Classifications = { a: Classification; b: Classification };

const LINE_CLASS: Record<DiffLineKind, string> = {
    added: "git-diff-added-line",
    deleted: "git-diff-deleted-line",
    modified: "git-diff-modified-line",
};

const MARKER_TITLE: Record<DiffLineKind, string> = {
    added: "Added line",
    deleted: "Deleted line",
    modified: "Modified line",
};

const GHOST_TITLE: Record<DiffLineKind, string> = {
    added: "Lines inserted here",
    deleted: "Lines removed here",
    modified: "Modified line",
};

/**
 * Classification is expensive (line alignment), so it is cached per chunk set.
 * A new chunk array is produced whenever either document changes.
 */
const classificationCache = new WeakMap<readonly Chunk[], Classifications>();

/**
 * Gutter marker for a single diff line. A ghost marker is placed on a side
 * where the chunk has no lines, so deletions stay visible in the changed pane
 * and insertions stay visible in the original pane.
 */
class DiffMarker extends GutterMarker {
    constructor(
        readonly kind: DiffLineKind,
        readonly ghost: boolean
    ) {
        super();
    }

    eq(other: DiffMarker): boolean {
        return other.kind === this.kind && other.ghost === this.ghost;
    }

    toDOM(): HTMLElement {
        const marker = document.createElement("span");
        marker.className = `git-diff-marker git-diff-marker-${this.kind}`;
        if (this.ghost) {
            marker.classList.add("git-diff-marker-ghost");
        }
        marker.title = this.ghost
            ? GHOST_TITLE[this.kind]
            : MARKER_TITLE[this.kind];
        return marker;
    }
}

function chunksOf(state: EditorState) {
    return getChunks(state)?.chunks;
}

function lineRangeNumbers(doc: Text, from: number, to: number): number[] {
    if (from >= to) {
        return [];
    }
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(
        Math.max(from, Math.min(to - 1, doc.length))
    ).number;
    const lines: number[] = [];
    for (let line = first; line <= last; line++) {
        lines.push(line);
    }
    return lines;
}

function computeClassifications(view: EditorView): Classifications | null {
    const info = getChunks(view.state);
    const side = info?.side;
    const siblings = mergeViewSiblings(view);
    const otherView = side === "a" ? siblings?.b : siblings?.a;
    if (!info || !side || !otherView) {
        return null;
    }

    const aDoc = side === "a" ? view.state.doc : otherView.state.doc;
    const bDoc = side === "b" ? view.state.doc : otherView.state.doc;
    const aLines: DiffLine[] = [];
    const bLines: DiffLine[] = [];
    const aGhosts: DiffLine[] = [];
    const bGhosts: DiffLine[] = [];

    for (const chunk of info.chunks) {
        const aFrom = chunk.fromA;
        const bFrom = chunk.fromB;
        const aTo = Math.min(chunk.endA, aDoc.length);
        const bTo = Math.min(chunk.endB, bDoc.length);
        const aNumbers = lineRangeNumbers(aDoc, aFrom, aTo);
        const bNumbers = lineRangeNumbers(bDoc, bFrom, bTo);

        if (aNumbers.length === 0) {
            aGhosts.push({
                line: aDoc.lineAt(Math.min(aFrom, aDoc.length)).number,
                kind: "added",
            });
            for (const line of bNumbers) {
                bLines.push({ line, kind: "added" });
            }
            continue;
        }

        if (bNumbers.length === 0) {
            bGhosts.push({
                line: bDoc.lineAt(Math.min(bFrom, bDoc.length)).number,
                kind: "deleted",
            });
            for (const line of aNumbers) {
                aLines.push({ line, kind: "deleted" });
            }
            continue;
        }

        const alignment = alignLines(
            aNumbers.map((line) => aDoc.line(line).text),
            bNumbers.map((line) => bDoc.line(line).text)
        );
        aNumbers.forEach((line, index) => {
            const kind = alignment.a[index]!;
            if (kind !== "unchanged") {
                aLines.push({ line, kind });
            }
        });
        bNumbers.forEach((line, index) => {
            const kind = alignment.b[index]!;
            if (kind !== "unchanged") {
                bLines.push({ line, kind });
            }
        });
    }

    return {
        a: createClassification(aDoc, aLines, aGhosts),
        b: createClassification(bDoc, bLines, bGhosts),
    };
}

function createClassification(
    doc: Text,
    lines: DiffLine[],
    ghosts: DiffLine[]
): Classification {
    const markerBuilder = new RangeSetBuilder<GutterMarker>();
    const marks = [
        ...lines.map((line) => ({ ...line, ghost: false })),
        ...ghosts.map((line) => ({ ...line, ghost: true })),
    ].sort((a, b) => a.line - b.line);

    let lastLine = -1;
    for (const mark of marks) {
        if (mark.line === lastLine) {
            continue;
        }
        lastLine = mark.line;
        const pos = doc.line(mark.line).from;
        markerBuilder.add(pos, pos, new DiffMarker(mark.kind, mark.ghost));
    }

    const decorationBuilder = new RangeSetBuilder<Decoration>();
    let lastLineFrom = -1;
    for (const line of lines) {
        const from = doc.line(line.line).from;
        if (from === lastLineFrom) {
            continue;
        }
        lastLineFrom = from;
        decorationBuilder.add(
            from,
            from,
            Decoration.line({ class: LINE_CLASS[line.kind] })
        );
    }

    return {
        lines,
        ghosts,
        markers: markerBuilder.finish(),
        decorations: decorationBuilder.finish(),
    };
}

function getClassification(
    view: EditorView,
    side: DiffSide
): Classification | null {
    const chunks = chunksOf(view.state);
    if (!chunks) {
        return null;
    }

    const cached = classificationCache.get(chunks);
    if (cached) {
        return cached[side];
    }

    const computed = computeClassifications(view);
    if (!computed) {
        return null;
    }
    classificationCache.set(chunks, computed);
    return computed[side];
}

function buildMarkers(view: EditorView, side: DiffSide) {
    return getClassification(view, side)?.markers ?? RangeSet.empty;
}

function diffLineDecorations(side: DiffSide): Extension {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;
            private ready = false;

            constructor(view: EditorView) {
                this.decorations = this.build(view);
            }

            private build(view: EditorView): DecorationSet {
                const classification = getClassification(view, side);
                this.ready = classification !== null;
                return classification
                    ? classification.decorations
                    : Decoration.none;
            }

            update(update: ViewUpdate) {
                if (
                    !this.ready ||
                    update.docChanged ||
                    chunksOf(update.startState) !== chunksOf(update.state)
                ) {
                    this.decorations = this.build(update.view);
                }
            }
        },
        { decorations: (value) => value.decorations }
    );
}

/**
 * Line colors and gutter markers inspired by the IntelliJ IDEA diff viewer:
 * added lines are green, modified lines are blue and deleted lines are gray.
 * The GitHub palette (red for deletions, green for both added and modified
 * lines) is selected through the `git-diff-colors-github` class in the CSS.
 */
const diffGutterTheme = EditorView.theme({
    ".cm-gutters .git-diff-gutter": {
        width: "0.65rem",
        minWidth: "0.65rem",
        padding: "0 !important",
        backgroundColor: "inherit",
    },
    ".cm-gutters .git-diff-gutter .cm-gutterElement": {
        display: "grid",
        placeItems: "stretch center",
        padding: "0 !important",
    },
    ".git-diff-marker": {
        width: "3px",
        borderRadius: "2px",
        transition: "width 100ms ease",
    },
    ".cm-gutterElement:hover .git-diff-marker:not(.git-diff-marker-ghost)": {
        width: "6px",
    },
    ".git-diff-marker-added": {
        backgroundColor: "var(--git-diff-added-color, #2ea043)",
    },
    ".git-diff-marker-deleted": {
        backgroundColor: "var(--git-diff-deleted-color, #8b949e)",
    },
    "&.cm-merge-a .git-diff-marker-modified": {
        backgroundColor: "var(--git-diff-modified-color-a, #3b82f6)",
    },
    "&.cm-merge-b .git-diff-marker-modified": {
        backgroundColor: "var(--git-diff-modified-color-b, #3b82f6)",
    },
    ".git-diff-marker-ghost": {
        width: "0",
        height: "0",
        borderRadius: "0",
        borderTop: "4px solid transparent",
        borderBottom: "4px solid transparent",
        borderLeft: "5px solid currentColor",
        alignSelf: "start",
        marginTop: "1px",
        backgroundColor: "transparent",
    },
    ".git-diff-marker-added.git-diff-marker-ghost": {
        color: "var(--git-diff-added-color, #2ea043)",
    },
    ".git-diff-marker-deleted.git-diff-marker-ghost": {
        color: "var(--git-diff-deleted-color, #8b949e)",
    },
    // Chunks may contain identical lines that the merge view still marks as
    // changed; IDEA only colors the lines that really changed.
    ".cm-line.cm-changedLine": {
        backgroundColor: "transparent",
    },
    ".cm-line.git-diff-added-line": {
        backgroundColor: "var(--git-diff-added-bg, rgba(46, 160, 67, 0.1))",
    },
    ".cm-line.git-diff-deleted-line": {
        backgroundColor:
            "var(--git-diff-deleted-bg, rgba(139, 148, 158, 0.12))",
    },
    "&.cm-merge-a .cm-line.git-diff-modified-line": {
        backgroundColor:
            "var(--git-diff-modified-bg-a, rgba(59, 130, 246, 0.1))",
    },
    "&.cm-merge-b .cm-line.git-diff-modified-line": {
        backgroundColor:
            "var(--git-diff-modified-bg-b, rgba(59, 130, 246, 0.1))",
    },
    ".cm-line.git-diff-added-line .cm-changedText": {
        backgroundColor: "var(--git-diff-added-inline, rgba(46, 160, 67, 0.3))",
    },
    ".cm-line.git-diff-deleted-line .cm-changedText": {
        backgroundColor:
            "var(--git-diff-deleted-inline, rgba(139, 148, 158, 0.35))",
    },
    "&.cm-merge-a .cm-line.git-diff-modified-line .cm-changedText": {
        backgroundColor:
            "var(--git-diff-modified-inline-a, rgba(59, 130, 246, 0.3))",
    },
    "&.cm-merge-b .cm-line.git-diff-modified-line .cm-changedText": {
        backgroundColor:
            "var(--git-diff-modified-inline-b, rgba(59, 130, 246, 0.3))",
    },
    ".cm-line.git-diff-added-line .cm-changedText, .cm-line.git-diff-deleted-line .cm-changedText, .cm-line.git-diff-modified-line .cm-changedText":
        {
            borderRadius: "2px",
            boxShadow: "none",
        },
});

/**
 * IDEA style diff decorations for one side of a split merge view.
 */
export function diffGutter(side: DiffSide): Extension {
    return [
        gutter({
            class: "git-diff-gutter",
            markers: (view) => buildMarkers(view, side),
        }),
        diffLineDecorations(side),
        diffGutterTheme,
    ];
}
