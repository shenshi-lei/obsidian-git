import { describe, expect, it } from "vitest";
import {
    getVisibleGroups,
    isActionAvailable,
    unavailableReason,
    type CommandAvailability,
} from "src/ui/commands/actionCatalog";

function context(
    overrides: Partial<CommandAvailability> = {}
): CommandAvailability {
    return {
        gitReady: true,
        repositoryMissing: false,
        hasActiveEditor: true,
        isDesktop: true,
        ...overrides,
    };
}

function actionIds(query: string, ctx = context()): string[] {
    return getVisibleGroups(query, ctx).flatMap(({ actions }) =>
        actions.map((action) => action.id)
    );
}

describe("getVisibleGroups", () => {
    it("returns all groups when everything is available", () => {
        const groups = getVisibleGroups("", context());
        expect(groups.map(({ group }) => group.id)).toContain("sync");
        expect(groups.map(({ group }) => group.id)).toContain("editor");
    });

    it("filters by command label and description", () => {
        const ids = actionIds("push");
        expect(ids).toContain("push2");
        expect(ids).toContain("push");
        expect(ids).toContain("commit-push-specified-message");
        expect(ids).not.toContain("pull");
    });

    it("returns every action of a group matched by its title", () => {
        const groups = getVisibleGroups("branches", context());
        const branchGroup = groups.find(({ group }) => group.id === "branch");
        expect(branchGroup).toBeDefined();
        expect(branchGroup!.actions.map((action) => action.id)).toContain(
            "set-upstream-branch"
        );
    });

    it("is case insensitive", () => {
        expect(actionIds("PULL")).toEqual(actionIds("pull"));
    });

    it("hides the editor group without an active editor", () => {
        const groups = getVisibleGroups(
            "",
            context({ hasActiveEditor: false })
        );
        expect(groups.map(({ group }) => group.id)).not.toContain("editor");
    });

    it("hides desktop only commands on mobile", () => {
        const ids = actionIds("", context({ isDesktop: false }));
        expect(ids).not.toContain("raw-command");
        expect(ids).not.toContain("backup-and-close");
    });

    it("returns nothing for a query without matches", () => {
        expect(getVisibleGroups("no-such-command", context())).toEqual([]);
    });
});

describe("availability", () => {
    it("disables repository commands while Git is not ready", () => {
        const ctx = context({
            gitReady: false,
            repositoryMissing: true,
        });
        const commit = getVisibleGroups("", ctx)
            .flatMap(({ actions }) => actions)
            .find((action) => action.id === "commit");
        expect(commit).toBeDefined();
        expect(isActionAvailable(commit!, ctx)).toBe(false);
        expect(unavailableReason(commit!, ctx)).toBe("No Git repository found");
    });

    it("keeps commands that work without a repository enabled", () => {
        const ctx = context({ gitReady: false, repositoryMissing: true });
        const init = getVisibleGroups("", ctx)
            .flatMap(({ actions }) => actions)
            .find((action) => action.id === "init-repo");
        expect(init).toBeDefined();
        expect(isActionAvailable(init!, ctx)).toBe(true);
        expect(unavailableReason(init!, ctx)).toBeUndefined();
    });

    it("explains a missing Git installation", () => {
        const ctx = context({ gitReady: false, repositoryMissing: false });
        const pull = getVisibleGroups("", ctx)
            .flatMap(({ actions }) => actions)
            .find((action) => action.id === "pull");
        expect(unavailableReason(pull!, ctx)).toBe("Git is not ready");
    });
});
