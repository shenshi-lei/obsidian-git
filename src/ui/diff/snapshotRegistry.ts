export type SnapshotDiff = { aText: string; bText: string; title: string };

const MAX_SNAPSHOTS = 20;

const snapshots = new Map<string, SnapshotDiff>();
let counter = 0;

/**
 * Store a transient comparison for the split diff view. Keeping the texts in
 * memory avoids serialising whole notes into the saved workspace layout; the
 * view only remembers the short id.
 */
export function registerSnapshotDiff(data: SnapshotDiff): string {
    const id = `snapshot-${++counter}`;
    snapshots.set(id, data);
    while (snapshots.size > MAX_SNAPSHOTS) {
        const oldest = snapshots.keys().next().value;
        if (oldest === undefined) {
            break;
        }
        snapshots.delete(oldest);
    }
    return id;
}

export function getSnapshotDiff(
    id: string | undefined
): SnapshotDiff | undefined {
    return id === undefined ? undefined : snapshots.get(id);
}

export function clearSnapshotDiffs(): void {
    snapshots.clear();
}
