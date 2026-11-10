import type { Text } from "@codemirror/state";
import type { Hunk } from "src/editor/signs/hunks";

export type RevertEdit = { from: number; to: number; insert: string };

/**
 * Text replacement that restores the baseline content of one hunk.
 *
 * Mirrors the reset logic of the git signs feature, but works on the snapshot
 * baseline instead of the index.
 */
export function revertHunkEdit(doc: Text, hunk: Hunk): RevertEdit | undefined {
    const removed = hunk.removed.lines.join("\n");
    const insert =
        removed.length > 0
            ? removed + (hunk.removed.no_nl_at_eof ? "" : "\n")
            : "";

    if (hunk.type === "delete") {
        const insertLine = hunk.added.start + 1;
        if (insertLine > doc.lines) {
            const leading =
                doc.length > 0 &&
                !doc.sliceString(doc.length - 1).endsWith("\n")
                    ? "\n"
                    : "";
            return {
                from: doc.length,
                to: doc.length,
                insert: leading + removed,
            };
        }
        const from = doc.line(Math.max(1, insertLine)).from;
        return { from, to: from, insert };
    }

    if (hunk.added.count <= 0) {
        return undefined;
    }

    const first = Math.min(Math.max(1, hunk.added.start), doc.lines);
    const last = Math.min(
        Math.max(first, hunk.added.start + hunk.added.count - 1),
        doc.lines
    );
    const from = doc.line(first).from;
    const to = Math.min(doc.line(last).to + 1, doc.length);
    return { from, to, insert };
}
