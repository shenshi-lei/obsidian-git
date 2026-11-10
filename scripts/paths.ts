import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface PlatformContext {
    platform: NodeJS.Platform;
    homedir: string;
    env: NodeJS.ProcessEnv;
}

export const PLUGIN_ID = "obsidian-git";

export const currentContext: PlatformContext = {
    platform: process.platform,
    homedir: os.homedir(),
    env: process.env,
};

/**
 * Per-user data directory of the current platform. This is where the build
 * artifacts live by default so that every vault can point at one copy without
 * depending on a checkout location.
 */
export function dataRoot(ctx: PlatformContext = currentContext): string {
    switch (ctx.platform) {
        case "win32":
            return (
                ctx.env.LOCALAPPDATA ??
                path.join(ctx.homedir, "AppData", "Local")
            );
        case "darwin":
            return path.join(ctx.homedir, "Library", "Application Support");
        default:
            return (
                ctx.env.XDG_DATA_HOME ??
                path.join(ctx.homedir, ".local", "share")
            );
    }
}

/** `<data root>/obsidian-git`, overridable with `OBSIDIAN_GIT_HOME`. */
export function pluginHome(ctx: PlatformContext = currentContext): string {
    return (
        ctx.env.OBSIDIAN_GIT_HOME ?? path.join(dataRoot(ctx), PLUGIN_ID)
    );
}

/**
 * Canonical artifact directory: the plugin folder that vaults link to.
 * Overridable with `OBSIDIAN_GIT_PLUGIN_DIR` or `--out`.
 */
export function pluginDir(ctx: PlatformContext = currentContext): string {
    return (
        ctx.env.OBSIDIAN_GIT_PLUGIN_DIR ??
        path.join(pluginHome(ctx), "plugin")
    );
}

export function releasesDir(ctx: PlatformContext = currentContext): string {
    return path.join(pluginHome(ctx), "releases");
}

export function configRoot(ctx: PlatformContext = currentContext): string {
    switch (ctx.platform) {
        case "win32":
            return (
                ctx.env.APPDATA ?? path.join(ctx.homedir, "AppData", "Roaming")
            );
        case "darwin":
            return path.join(ctx.homedir, "Library", "Application Support");
        default:
            return (
                ctx.env.XDG_CONFIG_HOME ??
                path.join(ctx.homedir, ".config")
            );
    }
}

/**
 * Locations of Obsidian's vault registry, most likely first. Linux adds the
 * Flatpak and Snap sandbox paths because Obsidian writes its config there.
 */
export function vaultRegistryCandidates(
    ctx: PlatformContext = currentContext
): string[] {
    const candidates = [
        path.join(configRoot(ctx), "obsidian", "obsidian.json"),
    ];
    if (ctx.platform !== "win32" && ctx.platform !== "darwin") {
        candidates.push(
            path.join(
                ctx.homedir,
                ".var",
                "app",
                "md.obsidian.Obsidian",
                "config",
                "obsidian",
                "obsidian.json"
            ),
            path.join(
                ctx.homedir,
                "snap",
                "obsidian",
                "current",
                ".config",
                "obsidian",
                "obsidian.json"
            )
        );
    }
    return candidates;
}

export interface VaultEntry {
    path: string;
    open: boolean;
}

function isRegistry(
    value: unknown
): value is { vaults?: Record<string, unknown> } {
    return typeof value === "object" && value !== null;
}

export function readVaults(ctx: PlatformContext = currentContext): VaultEntry[] {
    for (const file of vaultRegistryCandidates(ctx)) {
        let raw: string;
        try {
            raw = fs.readFileSync(file, "utf8");
        } catch {
            continue;
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            throw new Error(`Vault registry is not valid JSON: ${file}`);
        }
        if (!isRegistry(parsed)) continue;
        const vaults = parsed.vaults ?? {};
        const entries: VaultEntry[] = [];
        for (const value of Object.values(vaults)) {
            if (typeof value !== "object" || value === null) continue;
            const candidate = value as { path?: unknown; open?: unknown };
            if (typeof candidate.path !== "string") continue;
            entries.push({
                path: candidate.path,
                open: candidate.open === true,
            });
        }
        return entries;
    }
    return [];
}

export function pluginDirForVault(vault: string): string {
    return path.join(vault, ".obsidian", "plugins", PLUGIN_ID);
}
