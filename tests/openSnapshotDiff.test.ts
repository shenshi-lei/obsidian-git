import { afterEach, describe, expect, it, vi } from "vitest";
import { SPLIT_DIFF_VIEW_CONFIG } from "src/constants";
import type ObsidianGit from "src/main";
import Tools from "src/tools";
import {
    clearSnapshotDiffs,
    getSnapshotDiff,
} from "src/ui/diff/snapshotRegistry";

describe("Tools.openSnapshotDiff", () => {
    afterEach(() => clearSnapshotDiffs());

    it("registers both texts and opens the split diff view", () => {
        const setViewState = vi.fn().mockResolvedValue(undefined);
        const app = {
            workspace: {
                getLeaf: () => ({ setViewState }),
            },
        };
        const tools = new Tools({ app } as unknown as ObsidianGit);

        tools.openSnapshotDiff({
            aText: "before",
            bText: "after",
            title: "note.md",
        });

        expect(setViewState).toHaveBeenCalledTimes(1);
        const call = setViewState.mock.calls[0]?.[0] as {
            type: string;
            state: { compareSnapshotId?: string };
        };
        expect(call.type).toBe(SPLIT_DIFF_VIEW_CONFIG.type);
        expect(call.state.compareSnapshotId).toBeDefined();
        expect(getSnapshotDiff(call.state.compareSnapshotId)).toEqual({
            aText: "before",
            bText: "after",
            title: "note.md",
        });
    });
});
