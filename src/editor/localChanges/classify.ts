import type { Text } from "@codemirror/state";
import type { Hunk } from "src/editor/signs/hunks";
import { alignLines } from "src/editor/diff/lineAlignment";

export type LocalLine = {
    line: number;
    kind: "added" | "modified";
    hunkIndex: number;
};

export type LocalGhost = {
    line: number;
    kind: "deleted";
    top: boolean;
    hunkIndex: number;
};

export type LocalChanges = { lines: LocalLine[]; ghosts: LocalGhost[] };

/**
 * Map diff hunks to the lines of the current document. Paired lines become
 * modifications, additional lines are additions and removed-only lines become
 * a marker at the line where they were removed. Identical lines are left
 * unmarked.
 */
export function classifyHunks(doc: Text, hunks: readonly Hunk[]): LocalChanges {
    const lines: LocalLine[] = [];
    const ghosts: LocalGhost[] = [];
    const lineCount = doc.lines;

    hunks.forEach((hunk, hunkIndex) => {
        const addedStart = hunk.added.start;
        const addedCount = hunk.added.count;

        if (hunk.type === "delete") {
            ghosts.push({
                line: Math.max(1, Math.min(addedStart || 1, lineCount)),
                kind: "deleted",
                top: addedStart <= lineCount,
                hunkIndex,
            });
            return;
        }

        if (hunk.type === "change") {
            const alignment = alignLines(hunk.removed.lines, hunk.added.lines);
            alignment.b.forEach((kind, offset) => {
                const line = addedStart + offset;
                if (kind === "unchanged" || line < 1 || line > lineCount) {
                    return;
                }
                lines.push({
                    line,
                    kind: kind === "modified" ? "modified" : "added",
                    hunkIndex,
                });
            });
            const removedOnly = alignment.a.filter(
                (kind) => kind === "deleted"
            ).length;
            if (removedOnly > 0) {
                const lastAdded = addedStart + addedCount - 1;
                const line = Math.max(1, Math.min(lastAdded + 1, lineCount));
                ghosts.push({
                    line,
                    kind: "deleted",
                    top: line < lineCount,
                    hunkIndex,
                });
            }
            return;
        }

        for (let offset = 0; offset < addedCount; offset++) {
            const line = addedStart + offset;
            if (line >= 1 && line <= lineCount) {
                lines.push({ line, kind: "added", hunkIndex });
            }
        }
    });

    return { lines, ghosts };
}
