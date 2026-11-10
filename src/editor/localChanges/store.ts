/**
 * In-memory baseline texts for the "changes since opening a note" markers.
 *
 * The baseline is captured the first time an editor for a path is created and
 * is kept for the lifetime of the plugin instance. Auto commits, staging and
 * manual git commands do not modify it, so the markers survive them.
 */
const baselines = new Map<string, string>();

export function getOrCreateBaseline(path: string, text: string): string {
    const existing = baselines.get(path);
    if (existing !== undefined) {
        return existing;
    }
    baselines.set(path, text);
    return text;
}

export function getBaseline(path: string): string | undefined {
    return baselines.get(path);
}

export function setBaseline(path: string, text: string): void {
    baselines.set(path, text);
}

export function moveBaseline(oldPath: string, newPath: string): void {
    const value = baselines.get(oldPath);
    if (value === undefined) {
        return;
    }
    baselines.delete(oldPath);
    baselines.set(newPath, value);
}

export function removeBaseline(path: string): void {
    baselines.delete(path);
}

export function clearBaselines(): void {
    baselines.clear();
}
