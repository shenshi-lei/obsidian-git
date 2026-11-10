import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import type ObsidianGit from "src/main";
import CommandsModalContent from "./commandsModalContent.svelte";

/**
 * Searchable Git command panel, opened from the source control header.
 */
export class CommandsModal extends Modal {
    private view: Record<string, unknown> | undefined;

    constructor(
        app: App,
        private readonly plugin: ObsidianGit
    ) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText("Git commands");
        this.contentEl.addClass("git-commands-modal");
        this.view = mount(CommandsModalContent, {
            target: this.contentEl,
            props: {
                plugin: this.plugin,
                close: () => this.close(),
            },
        });
    }

    onClose(): void {
        const view = this.view;
        this.view = undefined;
        if (!view) {
            this.contentEl.empty();
            return;
        }
        void unmount(view).then(() => this.contentEl.empty());
    }
}
