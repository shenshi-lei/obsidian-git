import { Platform } from "obsidian";

/** Command groups shown in the source control view. */
export type CommandGroupId =
    | "sync"
    | "commit"
    | "branch"
    | "repository"
    | "views"
    | "editor"
    | "automatics"
    | "advanced";

export interface GitCommandGroup {
    id: CommandGroupId;
    title: string;
    /** Groups that are expanded the first time the panel is shown. */
    common?: boolean;
}

export interface GitCommandAction {
    /** Command id without the plugin prefix, as registered in commands.ts. */
    id: string;
    label: string;
    description: string;
    icon: string;
    group: CommandGroupId;
    danger?: boolean;
    desktopOnly?: boolean;
    /** Only listed while an editor with an active file is open. */
    editorOnly?: boolean;
    /** Usable without an initialized Git repository. */
    worksWithoutRepo?: boolean;
}

export interface CommandAvailability {
    gitReady: boolean;
    repositoryMissing: boolean;
    hasActiveEditor: boolean;
    isDesktop: boolean;
}

export interface CommandGroupView {
    group: GitCommandGroup;
    actions: GitCommandAction[];
}

export const COMMAND_GROUPS: GitCommandGroup[] = [
    { id: "sync", title: "Sync", common: true },
    { id: "commit", title: "Commit", common: true },
    { id: "branch", title: "Branches" },
    { id: "repository", title: "Repository" },
    { id: "views", title: "Views" },
    { id: "editor", title: "Editor" },
    { id: "automatics", title: "Automatics" },
    { id: "advanced", title: "Advanced" },
];

export const GIT_COMMAND_ACTIONS: GitCommandAction[] = [
    // Sync
    {
        id: "push",
        label: "Commit-and-sync",
        description:
            "Commit all changes with the configured message, pull and push.",
        icon: "arrow-up-circle",
        group: "sync",
    },
    {
        id: "push2",
        label: "Push",
        description: "Push the local commits to the remote branch.",
        icon: "upload",
        group: "sync",
    },
    {
        id: "pull",
        label: "Pull",
        description: "Fetch and merge or rebase the remote branch.",
        icon: "download",
        group: "sync",
    },
    {
        id: "fetch",
        label: "Fetch",
        description: "Download remote refs without changing the working tree.",
        icon: "refresh-cw",
        group: "sync",
    },
    {
        id: "backup-and-close",
        label: "Commit-and-sync and close",
        description: "Commit-and-sync, then close Obsidian.",
        icon: "power",
        group: "sync",
        desktopOnly: true,
    },

    // Commit
    {
        id: "commit",
        label: "Commit all changes",
        description: "Commit every change with the configured commit message.",
        icon: "check",
        group: "commit",
    },
    {
        id: "commit-smart",
        label: "Commit…",
        description: "Open the commit dialog and choose what to commit.",
        icon: "git-commit",
        group: "commit",
    },
    {
        id: "commit-staged",
        label: "Commit staged",
        description: "Commit only the staged changes.",
        icon: "check-square",
        group: "commit",
    },
    {
        id: "commit-specified-message",
        label: "Commit all with message…",
        description: "Commit all changes and enter a commit message.",
        icon: "message-square",
        group: "commit",
    },
    {
        id: "commit-smart-specified-message",
        label: "Commit with message…",
        description: "Open the commit dialog and enter a commit message.",
        icon: "message-square",
        group: "commit",
    },
    {
        id: "commit-push-specified-message",
        label: "Commit-and-sync with message…",
        description: "Commit all changes with a custom message, pull and push.",
        icon: "message-square",
        group: "commit",
    },
    {
        id: "commit-staged-specified-message",
        label: "Commit staged with message…",
        description: "Commit staged changes and enter a commit message.",
        icon: "message-square",
        group: "commit",
    },
    {
        id: "commit-amend-staged-specified-message",
        label: "Amend staged…",
        description: "Amend the last commit with the staged changes.",
        icon: "edit",
        group: "commit",
    },

    // Branches
    {
        id: "switch-branch",
        label: "Switch branch…",
        description: "Check out another local branch.",
        icon: "git-branch",
        group: "branch",
    },
    {
        id: "switch-to-remote-branch",
        label: "Switch to remote branch…",
        description: "Check out a branch from the remote repository.",
        icon: "git-branch",
        group: "branch",
    },
    {
        id: "create-branch",
        label: "Create branch…",
        description: "Create a new local branch.",
        icon: "git-branch-plus",
        group: "branch",
    },
    {
        id: "delete-branch",
        label: "Delete branch…",
        description: "Delete a local branch.",
        icon: "trash",
        group: "branch",
        danger: true,
    },
    {
        id: "set-upstream-branch",
        label: "Set upstream branch…",
        description: "Choose the remote branch tracked by the current one.",
        icon: "link",
        group: "branch",
    },

    // Repository
    {
        id: "init-repo",
        label: "Initialize repository",
        description: "Create a new Git repository inside the vault.",
        icon: "folder-plus",
        group: "repository",
        worksWithoutRepo: true,
    },
    {
        id: "clone-repo",
        label: "Clone repository…",
        description: "Clone an existing remote repository into the vault.",
        icon: "cloud-download",
        group: "repository",
        worksWithoutRepo: true,
    },
    {
        id: "edit-remotes",
        label: "Edit remotes…",
        description: "Add, change or remove remote repositories.",
        icon: "settings",
        group: "repository",
    },
    {
        id: "remove-remote",
        label: "Remove remote…",
        description: "Remove a configured remote repository.",
        icon: "trash",
        group: "repository",
        danger: true,
    },
    {
        id: "edit-gitignore",
        label: "Edit .gitignore",
        description: "Open the .gitignore of the repository.",
        icon: "file-x",
        group: "repository",
    },
    {
        id: "list-changed-files",
        label: "List changed files",
        description: "Show the changed files in a list.",
        icon: "list",
        group: "repository",
    },
    {
        id: "discard-all",
        label: "Discard all changes",
        description: "Permanently discard all unstaged changes.",
        icon: "trash-2",
        group: "repository",
        danger: true,
    },
    {
        id: "delete-repo",
        label: "Delete repository",
        description: "Remove the Git repository from the vault.",
        icon: "trash-2",
        group: "repository",
        danger: true,
    },

    // Views
    {
        id: "open-git-view",
        label: "Open source control",
        description: "Open or focus the source control view.",
        icon: "git-pull-request",
        group: "views",
        worksWithoutRepo: true,
    },
    {
        id: "open-history-view",
        label: "Open history",
        description: "Open the commit history of the repository.",
        icon: "history",
        group: "views",
        worksWithoutRepo: true,
    },
    {
        id: "open-diff-view",
        label: "Open diff view",
        description: "Open the diff of the active file.",
        icon: "git-compare",
        group: "views",
        editorOnly: true,
    },

    // Editor
    {
        id: "add-to-gitignore",
        label: "Add file to .gitignore",
        description: "Add the active file or folder to .gitignore.",
        icon: "file-x",
        group: "editor",
        editorOnly: true,
    },
    {
        id: "stage-current-file",
        label: "Stage current file",
        description: "Stage the active file.",
        icon: "plus-circle",
        group: "editor",
        editorOnly: true,
    },
    {
        id: "unstage-current-file",
        label: "Unstage current file",
        description: "Unstage the active file.",
        icon: "minus-circle",
        group: "editor",
        editorOnly: true,
    },
    {
        id: "toggle-line-author-info",
        label: "Toggle line author info",
        description: "Show or hide the line author gutter.",
        icon: "user",
        group: "editor",
        editorOnly: true,
    },

    // Automatics
    {
        id: "pause-automatic-routines",
        label: "Pause/resume automatics",
        description:
            "Pause or resume all automatic commit, push and pull routines.",
        icon: "pause-circle",
        group: "automatics",
        worksWithoutRepo: true,
    },

    // Advanced
    {
        id: "raw-command",
        label: "Raw git command…",
        description: "Run an arbitrary Git command.",
        icon: "terminal",
        group: "advanced",
        desktopOnly: true,
    },
];

/**
 * Whether the command is listed at all. Editor commands disappear when no
 * file is open and desktop-only commands on mobile.
 */
export function isActionVisible(
    action: GitCommandAction,
    ctx: CommandAvailability
): boolean {
    if (action.desktopOnly && !ctx.isDesktop) return false;
    if (action.editorOnly && !ctx.hasActiveEditor) return false;
    return true;
}

/** Whether the command can be executed right now. */
export function isActionAvailable(
    action: GitCommandAction,
    ctx: CommandAvailability
): boolean {
    if (!isActionVisible(action, ctx)) return false;
    if (action.worksWithoutRepo) return true;
    return ctx.gitReady;
}

/** Tooltip shown for a disabled command. */
export function unavailableReason(
    action: GitCommandAction,
    ctx: CommandAvailability
): string | undefined {
    if (action.desktopOnly && !ctx.isDesktop) {
        return "Only available in the desktop app";
    }
    if (action.editorOnly && !ctx.hasActiveEditor) {
        return "Open a file first";
    }
    if (!action.worksWithoutRepo && !ctx.gitReady) {
        return ctx.repositoryMissing
            ? "No Git repository found"
            : "Git is not ready";
    }
    return undefined;
}

function matchesQuery(
    action: GitCommandAction,
    groupTitle: string,
    query: string
): boolean {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [action.label, action.description, action.id, groupTitle].some(
        (value) => value.toLowerCase().includes(needle)
    );
}

/**
 * Groups and commands for the panel. `query` filters by label, description,
 * command id or group title; while searching every matching group is shown
 * with its matching commands only.
 */
export function getVisibleGroups(
    query: string,
    ctx: CommandAvailability
): CommandGroupView[] {
    const result: CommandGroupView[] = [];
    for (const group of COMMAND_GROUPS) {
        const actions = GIT_COMMAND_ACTIONS.filter(
            (action) =>
                action.group === group.id &&
                isActionVisible(action, ctx) &&
                matchesQuery(action, group.title, query)
        );
        if (actions.length > 0) result.push({ group, actions });
    }
    return result;
}

/** Small helper so the component does not import Platform directly. */
export function isDesktopApp(): boolean {
    return Platform.isDesktopApp;
}
