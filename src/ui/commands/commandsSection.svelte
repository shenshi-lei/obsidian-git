<script lang="ts">
    import { Notice, Platform, setIcon, setTooltip } from "obsidian";
    import { onMount } from "svelte";
    import type ObsidianGit from "src/main";
    import {
        getDefaultCollapsedGroups,
        getVisibleGroups,
        isActionAvailable,
        unavailableReason,
        type CommandAvailability,
        type GitCommandAction,
        type GitCommandGroup,
    } from "./actionCatalog";

    interface Props {
        plugin: ObsidianGit;
    }

    let { plugin }: Props = $props();

    let sectionEl: HTMLElement | undefined = $state();
    let sectionOpen: boolean = $state(readSectionOpen());
    let collapsed: Record<string, boolean> = $state(readCollapsedGroups());
    let query: string = $state("");
    let compact: boolean = $state(false);
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

    const allCollapsed = $derived(
        groups.length > 0 &&
            groups.every(({ group }) => collapsed[group.id] === true)
    );

    function hasEditor(): boolean {
        return plugin.app.workspace.activeEditor?.editor != undefined;
    }

    function sectionStorageKey(): string {
        return `${plugin.manifest.id}:commands-section-open`;
    }

    function collapsedStorageKey(): string {
        return `${plugin.manifest.id}:commands-collapsed-groups`;
    }

    function readSectionOpen(): boolean {
        return plugin.app.loadLocalStorage(sectionStorageKey()) !== "false";
    }

    function readCollapsedGroups(): Record<string, boolean> {
        const raw = plugin.app.loadLocalStorage(collapsedStorageKey()) as
            string | null;
        if (typeof raw === "string" && raw.length > 0) {
            try {
                return JSON.parse(raw) as Record<string, boolean>;
            } catch {
                // Fall through to the defaults.
            }
        }
        return getDefaultCollapsedGroups();
    }

    function saveCollapsedGroups(): void {
        plugin.app.saveLocalStorage(
            collapsedStorageKey(),
            JSON.stringify(collapsed)
        );
    }

    function toggleSection(): void {
        sectionOpen = !sectionOpen;
        plugin.app.saveLocalStorage(sectionStorageKey(), String(sectionOpen));
    }

    function isGroupOpen(group: GitCommandGroup): boolean {
        if (query.trim().length > 0) return true;
        return collapsed[group.id] !== true;
    }

    function toggleGroup(group: GitCommandGroup): void {
        if (query.trim().length > 0) return;
        collapsed = { ...collapsed, [group.id]: !collapsed[group.id] };
        saveCollapsedGroups();
    }

    function toggleAllGroups(): void {
        const shouldCollapse = !allCollapsed;
        const next: Record<string, boolean> = {};
        for (const { group } of groups) {
            next[group.id] = shouldCollapse;
        }
        collapsed = next;
        saveCollapsedGroups();
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
            }
        } catch (error) {
            console.error(
                "obsidian-git: failed to run command",
                action.id,
                error
            );
            new Notice(`Failed to run: ${action.label}`);
        }
    }

    function tooltip(node: HTMLElement, text: string): void {
        setTooltip(node, text, { placement: "left" });
    }

    function commandIcon(node: HTMLElement, name: string): void {
        setIcon(node, name);
    }

    onMount(() => {
        const update = (): void => {
            gitReady = plugin.gitReady;
            repositoryMissing = plugin.repositoryMissing;
            hasActiveEditor = hasEditor();
        };
        update();

        const refs = [
            plugin.app.workspace.on("active-leaf-change", update),
            plugin.app.workspace.on(
                "obsidian-git:repository-state-changed",
                update
            ),
            plugin.app.workspace.on("obsidian-git:refresh", update),
        ];

        const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? 0;
            compact = width > 0 && width < 190;
        });
        if (sectionEl) observer.observe(sectionEl);

        return () => {
            observer.disconnect();
            for (const ref of refs) plugin.app.workspace.offref(ref);
        };
    });
</script>

<section
    class="git-commands"
    class:is-compact={compact}
    bind:this={sectionEl}
    aria-label="Git commands"
>
    <div class="git-commands-header">
        <button
            class="clickable-icon git-commands-toggle"
            onclick={toggleSection}
            aria-label={sectionOpen ? "Collapse commands" : "Expand commands"}
            aria-expanded={sectionOpen}
        >
            <span
                use:commandIcon={sectionOpen ? "chevron-down" : "chevron-right"}
            ></span>
        </button>
        <span class="git-commands-title">Commands</span>
        {#if sectionOpen}
            <button
                class="clickable-icon"
                onclick={toggleAllGroups}
                aria-label={allCollapsed
                    ? "Expand all groups"
                    : "Collapse all groups"}
            >
                <span
                    use:commandIcon={allCollapsed
                        ? "chevrons-down"
                        : "chevrons-up"}
                ></span>
            </button>
        {/if}
    </div>

    {#if sectionOpen}
        <input
            class="git-commands-search"
            type="search"
            placeholder="Search commands…"
            aria-label="Search Git commands"
            bind:value={query}
        />
        <div class="git-commands-list">
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
                        <span class="git-command-group-title"
                            >{group.title}</span
                        >
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
                                    {#if !compact}
                                        <span class="git-command-label"
                                            >{action.label}</span
                                        >
                                    {/if}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            {:else}
                <div class="git-commands-empty">No matching commands.</div>
            {/each}
        </div>
    {/if}
</section>
