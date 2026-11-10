import fs from "node:fs";
import path from "node:path";
import {
    PLUGIN_ID,
    pluginDir as defaultPluginDir,
    pluginDirForVault,
    readVaults,
} from "./paths.ts";

const ARTIFACTS = ["main.js", "manifest.json", "styles.css", "versions.json"];

interface Options {
    vaults: string[];
    all: boolean;
    copy: boolean;
    unlink: boolean;
    force: boolean;
    dryRun: boolean;
    out: string;
}

type TargetState = "missing" | "link-current" | "link-other" | "dir" | "file";

function parseOptions(argv: string[]): Options {
    const options: Options = {
        vaults: [],
        all: false,
        copy: false,
        unlink: false,
        force: false,
        dryRun: false,
        out: defaultPluginDir(),
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        switch (arg) {
            case "--vault": {
                index += 1;
                const vaultPath = argv[index];
                if (!vaultPath) throw new Error("--vault needs a path");
                options.vaults.push(path.resolve(vaultPath));
                break;
            }
            case "--all":
                options.all = true;
                break;
            case "--copy":
                options.copy = true;
                break;
            case "--unlink":
                options.unlink = true;
                break;
            case "--force":
                options.force = true;
                break;
            case "--dry-run":
                options.dryRun = true;
                break;
            case "--out":
                index += 1;
                if (!argv[index]) throw new Error("--out needs a path");
                options.out = path.resolve(argv[index]);
                break;
            default:
                throw new Error(`unknown argument: ${String(arg)}`);
        }
    }

    const fromEnv = process.env.OBSIDIAN_GIT_VAULTS;
    if (fromEnv) {
        for (const entry of fromEnv.split(path.delimiter)) {
            if (entry.trim()) options.vaults.push(path.resolve(entry.trim()));
        }
    }

    if (options.unlink && options.copy) {
        throw new Error("--unlink and --copy are mutually exclusive");
    }
    if (options.vaults.length === 0 && !options.all) {
        throw new Error(
            "no vault selected; pass --vault <path> (repeatable), set OBSIDIAN_GIT_VAULTS, or use --all"
        );
    }
    return options;
}

/**
 * True for symlinks and, on Windows, for directory junctions. Node reports a
 * junction as a plain directory via lstat, but the parent directory entry
 * still marks it as a link.
 */
function isLink(target: string): boolean {
    let stat: fs.Stats;
    try {
        stat = fs.lstatSync(target);
    } catch {
        return false;
    }
    if (stat.isSymbolicLink()) return true;
    if (process.platform !== "win32") return false;
    try {
        const entry = fs
            .readdirSync(path.dirname(target), { withFileTypes: true })
            .find((candidate) => candidate.name === path.basename(target));
        return entry?.isSymbolicLink() ?? false;
    } catch {
        return false;
    }
}

function realPath(target: string): string {
    try {
        return fs.realpathSync.native(target);
    } catch {
        return path.resolve(target);
    }
}

function isSamePath(left: string, right: string): boolean {
    const a = realPath(left);
    const b = realPath(right);
    return process.platform === "win32"
        ? a.toLowerCase() === b.toLowerCase()
        : a === b;
}

function classify(target: string, artifacts: string): TargetState {
    let stat: fs.Stats;
    try {
        stat = fs.lstatSync(target);
    } catch {
        return "missing";
    }
    if (isLink(target)) {
        return isSamePath(target, artifacts) ? "link-current" : "link-other";
    }
    return stat.isDirectory() ? "dir" : "file";
}

function createLink(artifacts: string, target: string): void {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // A Windows junction needs an absolute target and no administrator rights.
    fs.symlinkSync(
        artifacts,
        target,
        process.platform === "win32" ? "junction" : "dir"
    );
}

function removeLink(target: string): void {
    // Verified on Windows: this drops the junction itself and keeps the target.
    fs.rmSync(target, { recursive: true, force: true });
}

function verify(target: string): string[] {
    const problems: string[] = [];
    try {
        const manifest: unknown = JSON.parse(
            fs.readFileSync(path.join(target, "manifest.json"), "utf8")
        );
        const id =
            typeof manifest === "object" && manifest !== null
                ? (manifest as { id?: unknown }).id
                : undefined;
        if (id !== PLUGIN_ID) {
            problems.push(`manifest id is ${String(id)}, expected ${PLUGIN_ID}`);
        }
    } catch {
        problems.push("manifest.json is missing or unreadable");
    }
    try {
        const bundle = fs.statSync(path.join(target, "main.js"));
        if (bundle.size < 100_000) problems.push("main.js looks too small");
    } catch {
        problems.push("main.js is missing");
    }
    return problems;
}

function copyArtifacts(artifacts: string, target: string): void {
    fs.mkdirSync(target, { recursive: true });
    for (const name of ARTIFACTS) {
        const source = path.join(artifacts, name);
        if (!fs.existsSync(source)) continue;
        const destination = path.join(target, name);
        const temp = `${destination}.tmp-${String(process.pid)}`;
        fs.copyFileSync(source, temp);
        fs.renameSync(temp, destination);
    }
}

function describe(options: Options): string {
    if (options.unlink) return "unlink";
    if (options.copy) return "copy";
    return "link";
}

function deployVault(
    vault: string,
    artifacts: string,
    options: Options
): string {
    const target = pluginDirForVault(vault);
    const state = classify(target, artifacts);

    if (options.dryRun) {
        return `would ${describe(options)} (${state})`;
    }

    if (options.unlink) {
        if (state === "link-current" || state === "link-other") {
            removeLink(target);
            return "unlinked";
        }
        if (state === "missing") return "absent";
        return `failed: not a link (${state}), refusing to delete`;
    }

    if (options.copy) {
        if (state === "link-current" || state === "link-other") {
            return "failed: target is a link; run --unlink first";
        }
        if (state === "file") return "failed: target is a file";
        copyArtifacts(artifacts, target);
    } else {
        switch (state) {
            case "missing":
                createLink(artifacts, target);
                break;
            case "link-current":
                return "already linked";
            case "link-other":
                if (!options.force) {
                    return "failed: links elsewhere; pass --force to repoint";
                }
                removeLink(target);
                createLink(artifacts, target);
                break;
            case "dir":
                return "failed: real directory; pass --copy to update it instead";
            case "file":
                return "failed: target is a file";
        }
    }

    const problems = verify(target);
    if (problems.length > 0) return `failed: ${problems.join("; ")}`;
    return options.copy ? "copied" : state === "missing" ? "linked" : "repointed";
}

function main(): void {
    let options: Options;
    try {
        options = parseOptions(process.argv.slice(2));
    } catch (error) {
        console.error(`deploy: ${(error as Error).message}`);
        process.exit(1);
    }

    const artifacts = options.out;
    if (!fs.existsSync(path.join(artifacts, "main.js"))) {
        console.error(
            `deploy: no artifacts in ${artifacts}; run "pnpm run build:plugin" first`
        );
        process.exit(1);
    }

    let vaults = options.vaults;
    if (options.all) {
        const registryVaults = readVaults();
        if (registryVaults.length === 0) {
            console.error(
                "deploy: no vaults found in the Obsidian registry; pass --vault <path>"
            );
            process.exit(1);
        }
        for (const entry of registryVaults) {
            if (!vaults.includes(entry.path)) vaults.push(entry.path);
        }
    }

    console.log(`artifacts: ${artifacts}`);
    console.log(`mode: ${describe(options)}${options.dryRun ? " (dry run)" : ""}`);

    const failures: string[] = [];
    for (const vault of vaults) {
        const label = path.basename(vault) || vault;
        let status: string;
        try {
            status = deployVault(vault, artifacts, options);
        } catch (error) {
            status = `failed: ${(error as Error).message}`;
        }
        if (status.startsWith("failed:")) failures.push(`${label}: ${status}`);
        console.log(`  ${label.padEnd(24)} ${status}`);
    }

    if (!options.copy && !options.unlink) {
        console.log(
            "note: linked vaults share the settings Obsidian writes to data.json in the artifact directory; use --copy for per-vault settings."
        );
    }

    if (failures.length > 0) {
        console.error(`deploy: ${String(failures.length)} vault(s) failed`);
        process.exit(1);
    }
    console.log(
        "deploy: done; reload Obsidian in each vault (Ctrl+P -> Reload app without saving)."
    );
}

main();
