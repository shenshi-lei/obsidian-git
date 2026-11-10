import { diffChars } from "diff";

export type AlignedKind = "added" | "deleted" | "modified" | "unchanged";

export type LineAlignment = { a: AlignedKind[]; b: AlignedKind[] };

type LinePair = { a: number; b: number };

/**
 * Above this number of line pairs the alignment gives up and pairs lines by
 * position. Large rewrites are still shown, just with less precise markers.
 */
const MAX_ALIGN_CELLS = 20000;

/**
 * Cost of leaving a line unpaired. With two gaps it has to beat a pair, so
 * lines are only treated as modified when they share roughly half their text.
 */
const GAP_COST = 0.25;

function lineSimilarity(a: string, b: string): number {
    if (a.length === 0 || b.length === 0) {
        return a.length === b.length ? 1 : 0;
    }
    let common = 0;
    for (const part of diffChars(a, b)) {
        if (!part.added && !part.removed) {
            common += part.value.length;
        }
    }
    return (2 * common) / (a.length + b.length);
}

/**
 * Non-empty lines are better anchors than blank lines, so a block of blank
 * lines cannot win against anchors such as `## 备注`.
 */
function anchorWeight(line: string): number {
    return line.length > 0 ? 3 : 1;
}

/**
 * Exact matches anchor the alignment. Without them a short shared prefix can
 * pair unrelated lines (`## 风险` with `## 备注`) and shift the whole block.
 */
function lcsAnchors(
    own: readonly string[],
    other: readonly string[]
): Array<[number, number]> {
    const rows = own.length;
    const columns = other.length;
    if (rows * columns > MAX_ALIGN_CELLS) {
        return [];
    }

    const table: Uint32Array[] = Array.from(
        { length: rows + 1 },
        () => new Uint32Array(columns + 1)
    );
    for (let i = rows - 1; i >= 0; i--) {
        const row = table[i]!;
        const next = table[i + 1]!;
        for (let j = columns - 1; j >= 0; j--) {
            row[j] =
                own[i] === other[j]
                    ? next[j + 1]! + anchorWeight(own[i]!)
                    : Math.max(next[j]!, row[j + 1]!);
        }
    }

    const anchors: Array<[number, number]> = [];
    let i = 0;
    let j = 0;
    while (i < rows && j < columns) {
        if (own[i] === other[j]) {
            anchors.push([i, j]);
            i++;
            j++;
        } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
            i++;
        } else {
            j++;
        }
    }
    return anchors;
}

/**
 * Pair the lines of a gap with different sizes. Paired lines become
 * modifications, unpaired lines become additions or deletions.
 */
function alignSegment(
    own: readonly string[],
    other: readonly string[]
): LinePair[] {
    const pairs: LinePair[] = [];
    if (own.length * other.length > MAX_ALIGN_CELLS) {
        const common = Math.min(own.length, other.length);
        for (let i = 0; i < common; i++) {
            pairs.push({ a: i, b: i });
        }
        for (let i = common; i < own.length; i++) {
            pairs.push({ a: i, b: -1 });
        }
        for (let j = common; j < other.length; j++) {
            pairs.push({ a: -1, b: j });
        }
        return pairs;
    }

    const rows = own.length + 1;
    const columns = other.length + 1;
    const cost: number[][] = Array.from({ length: rows }, () =>
        new Array<number>(columns).fill(Number.POSITIVE_INFINITY)
    );
    const direction: Uint8Array[] = Array.from(
        { length: rows },
        () => new Uint8Array(columns)
    );

    cost[0]![0] = 0;
    for (let i = 1; i < rows; i++) {
        cost[i]![0] = i * GAP_COST;
        direction[i]![0] = 1;
    }
    for (let j = 1; j < columns; j++) {
        cost[0]![j] = j * GAP_COST;
        direction[0]![j] = 2;
    }

    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < columns; j++) {
            const paired =
                cost[i - 1]![j - 1]! +
                (1 - lineSimilarity(own[i - 1]!, other[j - 1]!));
            const removed = cost[i - 1]![j]! + GAP_COST;
            const inserted = cost[i]![j - 1]! + GAP_COST;
            if (paired <= removed && paired <= inserted) {
                cost[i]![j] = paired;
                direction[i]![j] = 3;
            } else if (removed <= inserted) {
                cost[i]![j] = removed;
                direction[i]![j] = 1;
            } else {
                cost[i]![j] = inserted;
                direction[i]![j] = 2;
            }
        }
    }

    let i = own.length;
    let j = other.length;
    while (i > 0 || j > 0) {
        const step = direction[i]![j]!;
        if (step === 3) {
            pairs.push({ a: i - 1, b: j - 1 });
            i--;
            j--;
        } else if (step === 1) {
            pairs.push({ a: i - 1, b: -1 });
            i--;
        } else {
            pairs.push({ a: -1, b: j - 1 });
            j--;
        }
    }
    return pairs.reverse();
}

/**
 * Classify the lines of the changed region on both sides at once, so callers
 * always agree on which lines are modified.
 *
 * Identical lines are used as anchors. Gaps of equal size are paired by
 * position (a replacement), larger gaps are aligned by text similarity.
 */
export function alignLines(
    aLines: readonly string[],
    bLines: readonly string[]
): LineAlignment {
    const aKinds: AlignedKind[] = aLines.map(() => "deleted");
    const bKinds: AlignedKind[] = bLines.map(() => "added");

    if (aLines.length === 0 || bLines.length === 0) {
        return { a: aKinds, b: bKinds };
    }

    const anchors = lcsAnchors(aLines, bLines);
    for (const [aIndex, bIndex] of anchors) {
        aKinds[aIndex] = "unchanged";
        bKinds[bIndex] = "unchanged";
    }

    const boundaries: Array<[number, number]> = [
        [-1, -1],
        ...anchors,
        [aLines.length, bLines.length],
    ];
    for (let k = 0; k < boundaries.length - 1; k++) {
        const [aStart, bStart] = boundaries[k]!;
        const [aEnd, bEnd] = boundaries[k + 1]!;
        const segmentA = aLines.slice(aStart + 1, aEnd);
        const segmentB = bLines.slice(bStart + 1, bEnd);
        if (segmentA.length === 0 || segmentB.length === 0) {
            continue;
        }

        if (segmentA.length === segmentB.length) {
            for (let offset = 0; offset < segmentA.length; offset++) {
                const same = segmentA[offset] === segmentB[offset];
                aKinds[aStart + 1 + offset] = same ? "unchanged" : "modified";
                bKinds[bStart + 1 + offset] = same ? "unchanged" : "modified";
            }
            continue;
        }

        for (const pair of alignSegment(segmentA, segmentB)) {
            if (pair.a >= 0 && pair.b >= 0) {
                aKinds[aStart + 1 + pair.a] = "modified";
                bKinds[bStart + 1 + pair.b] = "modified";
            } else if (pair.a >= 0) {
                aKinds[aStart + 1 + pair.a] = "deleted";
            } else if (pair.b >= 0) {
                bKinds[bStart + 1 + pair.b] = "added";
            }
        }
    }

    return { a: aKinds, b: bKinds };
}
