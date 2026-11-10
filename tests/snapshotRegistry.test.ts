import { afterEach, describe, expect, it } from "vitest";
import {
    clearSnapshotDiffs,
    getSnapshotDiff,
    registerSnapshotDiff,
} from "src/ui/diff/snapshotRegistry";

describe("snapshot diff registry", () => {
    afterEach(() => clearSnapshotDiffs());

    it("stores and reads a comparison by id", () => {
        const id = registerSnapshotDiff({
            aText: "before",
            bText: "after",
            title: "note.md",
        });
        expect(getSnapshotDiff(id)).toEqual({
            aText: "before",
            bText: "after",
            title: "note.md",
        });
    });

    it("returns undefined for unknown ids", () => {
        expect(getSnapshotDiff("missing")).toBeUndefined();
        expect(getSnapshotDiff(undefined)).toBeUndefined();
    });

    it("drops the oldest comparisons beyond the limit", () => {
        const ids: string[] = [];
        for (let i = 0; i < 25; i++) {
            ids.push(
                registerSnapshotDiff({
                    aText: `a${i}`,
                    bText: `b${i}`,
                    title: `note-${i}.md`,
                })
            );
        }
        expect(getSnapshotDiff(ids[0])).toBeUndefined();
        expect(getSnapshotDiff(ids[24])).toBeDefined();
    });
});
