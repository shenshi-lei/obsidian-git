import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    PLUGIN_ID,
    configRoot,
    dataRoot,
    pluginDir,
    pluginDirForVault,
    pluginHome,
    releasesDir,
    vaultRegistryCandidates,
    type PlatformContext,
} from "../../scripts/paths.ts";

function context(
    platform: NodeJS.Platform,
    homedir: string,
    env: NodeJS.ProcessEnv = {}
): PlatformContext {
    return { platform, homedir, env };
}

const HOME = path.join(path.sep, "home", "tester");

describe("dataRoot", () => {
    it("uses LOCALAPPDATA on Windows", () => {
        const ctx = context("win32", HOME, {
            LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local",
        });
        expect(dataRoot(ctx)).toBe("C:\\Users\\tester\\AppData\\Local");
    });

    it("falls back to AppData/Local on Windows without LOCALAPPDATA", () => {
        const ctx = context("win32", HOME);
        expect(dataRoot(ctx)).toBe(path.join(HOME, "AppData", "Local"));
    });

    it("uses Application Support on macOS", () => {
        const ctx = context("darwin", HOME);
        expect(dataRoot(ctx)).toBe(
            path.join(HOME, "Library", "Application Support")
        );
    });

    it("honours XDG_DATA_HOME on Linux", () => {
        const ctx = context("linux", HOME, { XDG_DATA_HOME: "/xdg/data" });
        expect(dataRoot(ctx)).toBe("/xdg/data");
    });

    it("falls back to ~/.local/share on Linux", () => {
        expect(dataRoot(context("linux", HOME))).toBe(
            path.join(HOME, ".local", "share")
        );
    });
});

describe("plugin locations", () => {
    it("places the plugin home under the data root", () => {
        const ctx = context("linux", HOME, { XDG_DATA_HOME: "/xdg/data" });
        expect(pluginHome(ctx)).toBe(path.join("/xdg/data", PLUGIN_ID));
        expect(pluginDir(ctx)).toBe(
            path.join("/xdg/data", PLUGIN_ID, "plugin")
        );
        expect(releasesDir(ctx)).toBe(
            path.join("/xdg/data", PLUGIN_ID, "releases")
        );
    });

    it("lets OBSIDIAN_GIT_HOME override the platform default", () => {
        const ctx = context("win32", HOME, {
            LOCALAPPDATA: "C:\\LA",
            OBSIDIAN_GIT_HOME: "D:\\obsidian-git",
        });
        expect(pluginHome(ctx)).toBe("D:\\obsidian-git");
        expect(pluginDir(ctx)).toBe(path.join("D:\\obsidian-git", "plugin"));
    });

    it("lets OBSIDIAN_GIT_PLUGIN_DIR override only the artifact directory", () => {
        const ctx = context("darwin", HOME, {
            OBSIDIAN_GIT_PLUGIN_DIR: "/tmp/plugin",
        });
        expect(pluginDir(ctx)).toBe("/tmp/plugin");
        expect(pluginHome(ctx)).toBe(
            path.join(HOME, "Library", "Application Support", PLUGIN_ID)
        );
    });
});

describe("vault registry", () => {
    it("reads %APPDATA% on Windows", () => {
        const ctx = context("win32", HOME, { APPDATA: "C:\\Roaming" });
        expect(configRoot(ctx)).toBe("C:\\Roaming");
        expect(vaultRegistryCandidates(ctx)).toEqual([
            path.join("C:\\Roaming", "obsidian", "obsidian.json"),
        ]);
    });

    it("reads Application Support on macOS", () => {
        const ctx = context("darwin", HOME);
        expect(vaultRegistryCandidates(ctx)).toEqual([
            path.join(
                HOME,
                "Library",
                "Application Support",
                "obsidian",
                "obsidian.json"
            ),
        ]);
    });

    it("adds the Flatpak and Snap config paths on Linux", () => {
        const ctx = context("linux", HOME, { XDG_CONFIG_HOME: "/xdg/config" });
        const candidates = vaultRegistryCandidates(ctx);
        expect(candidates[0]).toBe(
            path.join("/xdg/config", "obsidian", "obsidian.json")
        );
        expect(candidates).toContain(
            path.join(
                HOME,
                ".var",
                "app",
                "md.obsidian.Obsidian",
                "config",
                "obsidian",
                "obsidian.json"
            )
        );
        expect(candidates).toContain(
            path.join(
                HOME,
                "snap",
                "obsidian",
                "current",
                ".config",
                "obsidian",
                "obsidian.json"
            )
        );
    });
});

describe("pluginDirForVault", () => {
    it("points at the per-vault community plugin folder", () => {
        expect(pluginDirForVault("/vaults/notes")).toBe(
            path.join("/vaults/notes", ".obsidian", "plugins", PLUGIN_ID)
        );
    });
});
