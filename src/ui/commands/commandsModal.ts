import { App, Modal, Platform } from "obsidian";
import { mount, unmount } from "svelte";
import type ObsidianGit from "src/main";
import CommandsModalContent from "./commandsModalContent.svelte";

/**
 * Searchable Git command panel, opened from the source control header.
 * On desktop the dialog can be dragged by its title and resized from the
 * bottom right corner.
 */
export class CommandsModal extends Modal {
    private view: Record<string, unknown> | undefined;
    private cleanup: (() => void) | undefined;

    constructor(
        app: App,
        private readonly plugin: ObsidianGit
    ) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText("Git commands");
        this.titleEl.addClass("git-commands-drag-handle");
        this.modalEl.addClass("git-commands-modal-shell");
        this.contentEl.addClass("git-commands-modal");
        this.view = mount(CommandsModalContent, {
            target: this.contentEl,
            props: {
                plugin: this.plugin,
                close: () => this.close(),
            },
        });
        if (Platform.isDesktopApp) {
            this.enableDragAndResize();
        }
    }

    onClose(): void {
        this.cleanup?.();
        this.cleanup = undefined;
        const view = this.view;
        this.view = undefined;
        if (!view) {
            this.contentEl.empty();
            return;
        }
        void unmount(view).then(() => this.contentEl.empty());
    }

    private enableDragAndResize(): void {
        const modalEl = this.modalEl;
        const cleanups: (() => void)[] = [];

        const trackPointer = (
            event: PointerEvent,
            onMove: (moveEvent: PointerEvent) => void
        ): void => {
            if (event.button !== 0) return;
            const move = (moveEvent: PointerEvent): void => onMove(moveEvent);
            const up = (): void => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
            event.preventDefault();
        };

        /** Switch from the centered layout to a fixed position. */
        const detachLayout = (): void => {
            const rect = modalEl.getBoundingClientRect();
            modalEl.style.position = "fixed";
            modalEl.style.left = `${rect.left}px`;
            modalEl.style.top = `${rect.top}px`;
            modalEl.style.width = `${rect.width}px`;
            modalEl.style.margin = "0";
            modalEl.style.maxHeight = "90vh";
        };

        const onDragStart = (event: PointerEvent): void => {
            const target = event.target as HTMLElement | null;
            if (target?.closest(".modal-close-button")) return;
            detachLayout();
            const rect = modalEl.getBoundingClientRect();
            const startX = event.clientX;
            const startY = event.clientY;
            const startLeft = rect.left;
            const startTop = rect.top;
            trackPointer(event, (moveEvent) => {
                const left = Math.min(
                    Math.max(0, startLeft + moveEvent.clientX - startX),
                    window.innerWidth - 80
                );
                const top = Math.min(
                    Math.max(0, startTop + moveEvent.clientY - startY),
                    window.innerHeight - 40
                );
                modalEl.style.left = `${left}px`;
                modalEl.style.top = `${top}px`;
            });
        };
        this.titleEl.addEventListener("pointerdown", onDragStart);
        cleanups.push(() =>
            this.titleEl.removeEventListener("pointerdown", onDragStart)
        );

        const handle = modalEl.createDiv({
            cls: "git-commands-resize-handle",
        });
        const onResizeStart = (event: PointerEvent): void => {
            detachLayout();
            const rect = modalEl.getBoundingClientRect();
            const startX = event.clientX;
            const startY = event.clientY;
            const startWidth = rect.width;
            const startHeight = rect.height;
            trackPointer(event, (moveEvent) => {
                const width = Math.max(
                    420,
                    Math.min(
                        startWidth + moveEvent.clientX - startX,
                        window.innerWidth - 24
                    )
                );
                const height = Math.max(
                    280,
                    Math.min(
                        startHeight + moveEvent.clientY - startY,
                        window.innerHeight - 24
                    )
                );
                modalEl.style.width = `${width}px`;
                modalEl.style.height = `${height}px`;
            });
        };
        handle.addEventListener("pointerdown", onResizeStart);
        cleanups.push(() => handle.remove());

        this.cleanup = (): void => {
            for (const fn of cleanups) fn();
        };
    }
}
