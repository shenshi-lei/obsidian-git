import { Text } from "@codemirror/state";
import { beforeEach, describe, expect, it } from "vitest";
import { classifyHunks } from "src/editor/localChanges/classify";
import type { LocalChanges } from "src/editor/localChanges/classify";
import { revertHunkEdit } from "src/editor/localChanges/revert";
import {
    clearBaselines,
    getBaseline,
    getOrCreateBaseline,
    moveBaseline,
    setBaseline,
} from "src/editor/localChanges/store";
import type { Hunk } from "src/editor/signs/hunks";

const doc = Text.of(["one", "two", "three", "four", "five"]);

function hunk(partial: Partial<Hunk> & Pick<Hunk, "type">): Hunk {
    return {
        type: partial.type,
        added: partial.added ?? { start: 1, count: 0, lines: [] },
        removed: partial.removed ?? { start: 1, count: 0, lines: [] },
        vend: partial.vend ?? 0,
    };
}

function classify(partial: Partial<Hunk> & Pick<Hunk, "type">): LocalChanges {
    return classifyHunks(doc, [hunk(partial)]);
}

describe("classifyHunks", () => {
    it("marks a pure insertion as added lines", () => {
        const changes = classify({
            type: "add",
            added: { start: 2, count: 2, lines: ["x", "y"] },
            removed: { start: 1, count: 0, lines: [] },
        });
        expect(changes).toEqual({
            lines: [
                { line: 2, kind: "added", hunkIndex: 0 },
                { line: 3, kind: "added", hunkIndex: 0 },
            ],
            ghosts: [],
        });
    });

    it("marks replaced lines of equal size as modified", () => {
        const changes = classify({
            type: "change",
            added: { start: 2, count: 2, lines: ["x", "y"] },
            removed: { start: 1, count: 2, lines: ["a", "b"] },
        });
        expect(changes).toEqual({
            lines: [
                { line: 2, kind: "modified", hunkIndex: 0 },
                { line: 3, kind: "modified", hunkIndex: 0 },
            ],
            ghosts: [],
        });
    });

    it("keeps identical lines unmarked inside a change", () => {
        const changes = classify({
            type: "change",
            added: { start: 2, count: 2, lines: ["one", "two"] },
            removed: { start: 1, count: 1, lines: ["one"] },
        });
        expect(changes).toEqual({
            lines: [{ line: 3, kind: "added", hunkIndex: 0 }],
            ghosts: [],
        });
    });

    it("turns a larger insertion into added lines plus a removal marker", () => {
        const changes = classify({
            type: "change",
            added: { start: 2, count: 3, lines: ["x", "y", "z"] },
            removed: { start: 1, count: 1, lines: ["a"] },
        });
        expect(changes.lines).toEqual([
            { line: 2, kind: "added", hunkIndex: 0 },
            { line: 3, kind: "added", hunkIndex: 0 },
            { line: 4, kind: "added", hunkIndex: 0 },
        ]);
        expect(changes.ghosts).toEqual([
            { line: 5, kind: "deleted", top: false, hunkIndex: 0 },
        ]);
    });

    it("adds a removal marker after a change that removed more lines", () => {
        const changes = classify({
            type: "change",
            added: { start: 2, count: 1, lines: ["x"] },
            removed: { start: 1, count: 3, lines: ["a", "b", "c"] },
        });
        expect(changes.lines).toEqual([
            { line: 2, kind: "added", hunkIndex: 0 },
        ]);
        expect(changes.ghosts).toEqual([
            { line: 3, kind: "deleted", top: true, hunkIndex: 0 },
        ]);
    });

    it("places a removal at the top when lines were removed first", () => {
        const changes = classify({
            type: "delete",
            added: { start: 0, count: 0, lines: [] },
            removed: { start: 1, count: 2, lines: ["a", "b"] },
        });
        expect(changes.lines).toEqual([]);
        expect(changes.ghosts).toEqual([
            { line: 1, kind: "deleted", top: true, hunkIndex: 0 },
        ]);
    });

    it("aligns a removal at the end of the document to the bottom", () => {
        const changes = classify({
            type: "delete",
            added: { start: 6, count: 0, lines: [] },
            removed: { start: 6, count: 1, lines: ["a"] },
        });
        expect(changes.ghosts).toEqual([
            { line: 5, kind: "deleted", top: false, hunkIndex: 0 },
        ]);
    });

    it("ignores lines outside the document", () => {
        const changes = classify({
            type: "add",
            added: { start: 5, count: 3, lines: ["x", "y", "z"] },
            removed: { start: 4, count: 0, lines: [] },
        });
        expect(changes.lines).toEqual([
            { line: 5, kind: "added", hunkIndex: 0 },
        ]);
    });

    it("keeps the hunk index for multiple hunks", () => {
        const changes = classifyHunks(doc, [
            hunk({
                type: "add",
                added: { start: 2, count: 1, lines: ["x"] },
                removed: { start: 1, count: 0, lines: [] },
            }),
            hunk({
                type: "change",
                added: { start: 4, count: 1, lines: ["y"] },
                removed: { start: 4, count: 1, lines: ["four"] },
            }),
        ]);
        expect(changes.lines).toEqual([
            { line: 2, kind: "added", hunkIndex: 0 },
            { line: 4, kind: "modified", hunkIndex: 1 },
        ]);
    });
});

function applyTextEdit(
    doc: Text,
    edit: { from: number; to: number; insert: string }
): string {
    return doc
        .replace(edit.from, edit.to, Text.of(edit.insert.split("\n")))
        .toString();
}
describe("revertHunkEdit", () => {
    it("replaces a modified block with the baseline lines", () => {
        const edit = revertHunkEdit(
            doc,
            hunk({
                type: "change",
                added: { start: 2, count: 2, lines: ["x", "y"] },
                removed: { start: 2, count: 2, lines: ["two", "three"] },
            })
        )!;
        expect(applyTextEdit(doc, edit)).toBe("one\ntwo\nthree\nfour\nfive");
    });

    it("removes added lines", () => {
        const addedDoc = Text.of(["one", "x", "y", "five"]);
        const edit = revertHunkEdit(
            addedDoc,
            hunk({
                type: "add",
                added: { start: 2, count: 2, lines: ["x", "y"] },
                removed: { start: 2, count: 0, lines: [] },
            })
        )!;
        expect(applyTextEdit(addedDoc, edit)).toBe("one\nfive");
    });

    it("inserts removed lines at the deletion point", () => {
        const shortDoc = Text.of(["one", "two", "five"]);
        const edit = revertHunkEdit(
            shortDoc,
            hunk({
                type: "delete",
                added: { start: 2, count: 0, lines: [] },
                removed: { start: 3, count: 2, lines: ["three", "four"] },
            })
        )!;
        expect(applyTextEdit(shortDoc, edit)).toBe(
            "one\ntwo\nthree\nfour\nfive"
        );
    });

    it("appends removed lines at the end of the document", () => {
        const shortDoc = Text.of(["one", "two"]);
        const edit = revertHunkEdit(
            shortDoc,
            hunk({
                type: "delete",
                added: { start: 3, count: 0, lines: [] },
                removed: { start: 3, count: 1, lines: ["three"] },
            })
        )!;
        expect(applyTextEdit(shortDoc, edit)).toBe("one\ntwo\nthree");
    });
});

describe("local change baselines", () => {
    beforeEach(() => clearBaselines());

    it("keeps the first captured baseline", () => {
        expect(getOrCreateBaseline("a.md", "first")).toBe("first");
        expect(getOrCreateBaseline("a.md", "second")).toBe("first");
    });

    it("returns undefined until a baseline exists", () => {
        expect(getBaseline("missing.md")).toBeUndefined();
        getOrCreateBaseline("missing.md", "text");
        expect(getBaseline("missing.md")).toBe("text");
    });

    it("replaces a baseline explicitly", () => {
        getOrCreateBaseline("a.md", "first");
        setBaseline("a.md", "second");
        expect(getOrCreateBaseline("a.md", "third")).toBe("second");
    });

    it("moves a baseline when a file is renamed", () => {
        getOrCreateBaseline("a.md", "first");
        moveBaseline("a.md", "b.md");
        expect(getOrCreateBaseline("b.md", "other")).toBe("first");
        expect(getOrCreateBaseline("a.md", "fresh")).toBe("fresh");
    });

    it("drops every baseline on clear", () => {
        getOrCreateBaseline("a.md", "first");
        clearBaselines();
        expect(getOrCreateBaseline("a.md", "fresh")).toBe("fresh");
    });
});
