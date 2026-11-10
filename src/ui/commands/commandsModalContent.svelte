<script lang="ts">
    import { Notice, Platform, setIcon, setTooltip } from "obsidian";
    import { onMount } from "svelte";
    import type ObsidianGit from "src/main";
    import {
        getVisibleGroups,
        isActionAvailable,
        unavailableReason,
        type CommandAvailability,
        type GitCommandAction,
        type GitCommandGroup,
    } from "./actionCatalog";

    interface Props {
        plugin: ObsidianGit;
        close: () => void;
    }

    let { plugin, close }: Props = $props();

    let searchEl: HTMLInputElement | undefined = $state();
    let query: string = $state("");
    let collapsed: Record<string, boolean> = $state({});
    let gitReady: boolean = $state(false);
    let repositoryMissing: boolean = $state(false);
    let hasActiveEditor: boolean = $state(hasEditor());

    const availability: CommandAvailability = $derived({
        gitReady,
        repositoryMissing,
        hasActiveEditor,
        isDesktop: Platform.isDesktopApp,
    });

    const groups = $derived(getVisibleGroups(query, availability));

    const openGroupCount = $derived(
        groups.filter(({ group }) => isGroupOpen(group)).length
    );

    const columnCount = $derived(
        openGroupCount <= 2 ? 1 : openGroupCount <= 5 ? 2 : 3
    );

    const allCollapsed = $derived(
        groups.length > 0 &&
            groups.every(({ group }) => collapsed[group.id] === true)
    );

    function hasEditor(): boolean {
        return plugin.app.workspace.activeEditor?.editor != undefined;
    }

    function isGroupOpen(group: GitCommandGroup): boolean {
        if (query.trim().length > 0) return true;
        return collapsed[group.id] !== true;
    }

    function toggleGroup(group: GitCommandGroup): void {
        if (query.trim().length > 0) return;
        collapsed = { ...collapsed, [group.id]: !collapsed[group.id] };
    }

    function toggleAllGroups(): void {
        const shouldCollapse = !allCollapsed;
        const next: Record<string, boolean> = {};
        for (const { group } of groups) {
            next[group.id] = shouldCollapse;
        }
        collapsed = next;
    }

    function run(action: GitCommandAction): void {
        if (!isActionAvailable(action, availability)) return;
        const commands = (
            plugin.app as unknown as {
                commands?: {
                    executeCommandById(id: string): boolean;
                };
            }
        ).commands;
        try {
            const executed = commands?.executeCommandById(
                `${plugin.manifest.id}:${action.id}`
            );
            if (!executed) {
                new Notice(`Command is not available: ${action.label}`);
                return;
            }
            close();
        } catch (error) {
            console.error(
                "obsidian-git: failed to run command",
                action.id,
                error
            );
            new Notice(`Failed to run: ${action.label}`);
        }
    }

    function tooltip(
        node: HTMLElement,
        text: string
    ): {
        update: (next: string) => void;
    } {
        setTooltip(node, text, { placement: "left" });
        return {
            update(next: string): void {
                // Keep the tooltip text current without stacking handlers.
                node.setAttribute("aria-label", next);
            },
        };
    }

    function commandIcon(
        node: HTMLElement,
        name: string
    ): {
        update: (next: string) => void;
    } {
        setIcon(node, name);
        return {
            update(next: string): void {
                setIcon(node, next);
            },
        };
    }

    onMount(() => {
        const update = (): void => {
            gitReady = plugin.gitReady;
            repositoryMissing = plugin.repositoryMissing;
            hasActiveEditor = hasEditor();
        };
        update();
        searchEl?.focus();

        const refs = [
            plugin.app.workspace.on("active-leaf-change", update),
            plugin.app.workspace.on(
                "obsidian-git:repository-state-changed",
                update
            ),
            plugin.app.workspace.on("obsidian-git:refresh", update),
        ];

        return () => {
            for (const ref of refs) plugin.app.workspace.offref(ref);
        };
    });
</script>

<div class="git-commands-modal-content">
    <div class="git-commands-modal-toolbar">
        <input
            class="git-commands-search"
            type="search"
            placeholder="Search commands…"
            aria-label="Search Git commands"
            bind:this={searchEl}
            bind:value={query}
        />
        <button
            class="clickable-icon"
            onclick={toggleAllGroups}
            aria-label={allCollapsed
                ? "Expand all groups"
                : "Collapse all groups"}
        >
            <span
                use:commandIcon={allCollapsed ? "chevrons-down" : "chevrons-up"}
            ></span>
        </button>
    </div>

    <div
        class="git-commands-list"
        class:is-two-columns={columnCount === 2}
        class:is-three-columns={columnCount === 3}
    >
        {#each groups as { group, actions } (group.id)}
            {@const open = isGroupOpen(group)}
            <div class="git-command-group">
                <button
                    class="git-command-group-header"
                    onclick={() => toggleGroup(group)}
                    aria-expanded={open}
                    aria-label={`${open ? "Collapse" : "Expand"} ${group.title}`}
                >
                    <span
                        class="git-command-chevron"
                        use:commandIcon={open
                            ? "chevron-down"
                            : "chevron-right"}
                    ></span>
                    <span class="git-command-group-title">{group.title}</span>
                    <span class="git-command-count">{actions.length}</span>
                </button>
                {#if open}
                    <div class="git-command-items">
                        {#each actions as action (action.id)}
                            {@const enabled = isActionAvailable(
                                action,
                                availability
                            )}
                            <button
                                class="git-command"
                                class:is-disabled={!enabled}
                                class:is-danger={action.danger}
                                aria-disabled={!enabled}
                                use:tooltip={enabled
                                    ? `${action.label} — ${action.description}`
                                    : `${action.label} — ${
                                          unavailableReason(
                                              action,
                                              availability
                                          ) ?? "Unavailable"
                                      }`}
                                onclick={() => run(action)}
                            >
                                <span
                                    class="git-command-icon"
                                    use:commandIcon={action.icon}
                                ></span>
                                <span class="git-command-label"
                                    >{action.label}</span
                                >
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        {:else}
            <div class="git-commands-empty">No matching commands.</div>
        {/each}
    </div>
</div>
