import type { Extension } from "@codemirror/state";
import { editorInfoField } from "obsidian";
import type ObsidianGit from "src/main";
import {
    localChangesExtensions,
    resetLocalChangesBaselines,
} from "./localChanges";
import {
    clearBaselines,
    getBaseline,
    getOrCreateBaseline,
    moveBaseline,
    setBaseline,
} from "./store";

/**
 * Wires the "changes since opening a note" markers into the editor. The
 * baseline is a session snapshot, so auto commits and staging do not clear the
 * markers.
 */
export class LocalChangesFeature {
    private extensions: Extension[] = [];

    constructor(private plugin: ObsidianGit) {}

    onLoadPlugin() {
        this.plugin.registerEditorExtension(this.extensions);
        this.plugin.registerEvent(
            this.plugin.app.vault.on("rename", (file, oldPath) =>
                moveBaseline(oldPath, file.path)
            )
        );
    }

    onUnloadPlugin() {
        this.deactivate();
        clearBaselines();
    }

    conditionallyActivateBySettings() {
        if (this.plugin.settings.showLocalChanges) {
            this.activate();
        } else {
            this.deactivate();
        }
    }

    refresh() {
        this.deactivate();
        this.conditionallyActivateBySettings();
    }

    activate() {
        if (this.extensions.length > 0) {
            return;
        }
        const style =
            this.plugin.settings.diffGutterStyle === "github"
                ? "github"
                : "idea";
        this.extensions.push(
            ...localChangesExtensions({
                style,
                getFilePath: (view) =>
                    view.state.field(editorInfoField, false)?.file?.path,
                getBaseline: (path, text) => getOrCreateBaseline(path, text),
                setBaseline,
                openComparison: (path, currentText, event) => {
                    const baseline = getBaseline(path);
                    if (baseline === undefined) {
                        return;
                    }
                    this.plugin.tools.openSnapshotDiff({
                        aText: baseline,
                        bText: currentText,
                        title: path,
                        event,
                    });
                },
            })
        );
        this.plugin.app.workspace.updateOptions();
    }

    /**
     * Open the baseline comparison for the active note, if a baseline exists.
     */
    compareActiveFile(): boolean {
        const active = this.plugin.app.workspace.activeEditor;
        const path = active?.file?.path;
        const text = active?.editor?.getValue();
        if (path === undefined || text === undefined) {
            return false;
        }
        const baseline = getBaseline(path);
        if (baseline === undefined) {
            return false;
        }
        this.plugin.tools.openSnapshotDiff({
            aText: baseline,
            bText: text,
            title: path,
        });
        return true;
    }

    canCompareActiveFile(): boolean {
        const file = this.plugin.app.workspace.activeEditor?.file;
        return file != null && getBaseline(file.path) !== undefined;
    }

    deactivate() {
        if (this.extensions.length === 0) {
            return;
        }
        this.extensions.splice(0, this.extensions.length);
        this.plugin.app.workspace.updateOptions();
    }

    /** Mark every open editor of the active note as reviewed. */
    resetActiveFile(): void {
        const file = this.plugin.app.workspace.activeEditor?.file;
        if (file) {
            resetLocalChangesBaselines(file.path);
        }
    }

    /** Drop the session baseline of every open note. */
    resetAll(): void {
        resetLocalChangesBaselines();
    }
}
