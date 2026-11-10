import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pluginDir as defaultPluginDir } from "./paths.ts";

const REPO_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
const ARTIFACTS = [
    "main.js",
    "manifest.json",
    "styles.css",
    "versions.json",
] as const;
const BUNDLE_MARKER = "GENERATED/BUNDLED FILE BY ESBUILD";

interface BuildInfo {
    version: string;
    commit: string;
    builtAt: string;
    files: Record<string, number>;
}

function fail(message: string): never {
    console.error(`artifacts: ${message}`);
    process.exit(1);
}

function argValue(argv: string[], name: string): string | undefined {
    const index = argv.indexOf(name);
    return index === -1 ? undefined : argv[index + 1];
}

function readVersion(): string {
    try {
        const manifest: unknown = JSON.parse(
            fs.readFileSync(path.join(REPO_ROOT, "manifest.json"), "utf8")
        );
        if (typeof manifest === "object" && manifest !== null) {
            const version = (manifest as { version?: unknown }).version;
            if (typeof version === "string") return version;
        }
    } catch {
        // Fall through to the placeholder below.
    }
    return "unknown";
}

function readCommit(): string {
    const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
    });
    return result.status === 0 ? result.stdout.trim() : "unknown";
}

function assertBuilt(): void {
    const bundle = path.join(REPO_ROOT, "main.js");
    if (!fs.existsSync(bundle)) {
        fail('root main.js is missing; run "pnpm run build" first');
    }
    const head = fs.readFileSync(bundle, "utf8").slice(0, 400);
    if (!head.includes(BUNDLE_MARKER)) {
        fail("root main.js does not look like an esbuild bundle");
    }
}

function writeAtomic(target: string, data: string | Buffer): void {
    const temp = `${target}.tmp-${String(process.pid)}`;
    fs.writeFileSync(temp, data);
    fs.renameSync(temp, target);
}

function main(): void {
    const argv = process.argv.slice(2);
    const outDir = path.resolve(
        argValue(argv, "--out") ?? defaultPluginDir()
    );

    if (argv.includes("--print-path")) {
        console.log(outDir);
        return;
    }

    assertBuilt();
    fs.mkdirSync(outDir, { recursive: true });

    const files: Record<string, number> = {};
    for (const name of ARTIFACTS) {
        const source = path.join(REPO_ROOT, name);
        if (!fs.existsSync(source)) continue;
        const data = fs.readFileSync(source);
        writeAtomic(path.join(outDir, name), data);
        files[name] = data.length;
    }

    const info: BuildInfo = {
        version: readVersion(),
        commit: readCommit(),
        builtAt: new Date().toISOString(),
        files,
    };
    writeAtomic(
        path.join(outDir, "build-info.json"),
        `${JSON.stringify(info, null, 4)}\n`
    );

    console.log(
        `artifacts: ${info.version} (${info.commit}) -> ${outDir}`
    );
    for (const [name, bytes] of Object.entries(files)) {
        console.log(`  ${name} ${bytes.toLocaleString()} bytes`);
    }
}

main();
