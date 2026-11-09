import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    defaultGitPath,
    describeGitLookup,
    findGitBinary,
    type GitProbe,
} from "src/gitPathDiscovery";

const ENV_KEY = "OBSIDIAN_GIT_PATH";

beforeEach(() => {
    delete process.env[ENV_KEY];
});

afterEach(() => {
    delete process.env[ENV_KEY];
});

function createProbe(...working: string[]): {
    probe: GitProbe;
    probed: string[];
} {
    const probed: string[] = [];
    const probe: GitProbe = (binary) => {
        probed.push(binary);
        return Promise.resolve(
            working.includes(binary)
                ? { ok: true }
                : { ok: false, error: `spawn ${binary} ENOENT` }
        );
    };
    return { probe, probed };
}

describe("defaultGitPath", () => {
    it("points to the default Git for Windows installation", () => {
        const result = defaultGitPath({ isWin: true });
        expect(result?.toLowerCase()).toContain("git\\cmd\\git.exe");
    });

    it("uses the system location on macOS and Linux", () => {
        expect(defaultGitPath({ isMacOS: true })).toBe("/usr/bin/git");
        expect(defaultGitPath({})).toBe("/usr/bin/git");
    });
});

describe("findGitBinary", () => {
    it("only probes the configured path", async () => {
        const { probe, probed } = createProbe("C:\\custom\\git.exe");
        const result = await findGitBinary("C:\\custom\\git.exe", probe);
        expect(result.binary).toBe("C:\\custom\\git.exe");
        expect(result.source).toBe("configured");
        expect(probed).toEqual(["C:\\custom\\git.exe"]);
    });

    it("does not fall back when the configured path is broken", async () => {
        const { probe, probed } = createProbe("D:\\Git\\cmd\\git.exe");
        const result = await findGitBinary("D:\\missing\\git.exe", probe);
        expect(result.binary).toBeUndefined();
        expect(probed).toEqual(["D:\\missing\\git.exe"]);
        expect(result.attempts[0]?.error).toContain("ENOENT");
    });

    it("uses OBSIDIAN_GIT_PATH before PATH", async () => {
        process.env[ENV_KEY] = "/opt/custom/git";
        const { probe, probed } = createProbe("/opt/custom/git");
        const result = await findGitBinary(undefined, probe);
        expect(result.source).toBe("env");
        expect(probed).toEqual(["/opt/custom/git"]);
    });

    it("falls back from PATH to the default location", async () => {
        const { probe, probed } = createProbe("/usr/bin/git");
        const result = await findGitBinary(undefined, probe);
        expect(result.source).toBe("default");
        expect(probed).toEqual(["git", "/usr/bin/git"]);
    });

    it("records the error of every attempt instead of only the last one", async () => {
        const { probe } = createProbe();
        const result = await findGitBinary(undefined, probe);
        expect(result.binary).toBeUndefined();
        expect(result.attempts.map((attempt) => attempt.binary)).toEqual([
            "git",
            "/usr/bin/git",
        ]);
        expect(result.attempts.every((attempt) => attempt.error)).toBe(true);
        expect(result.attempts[1]?.error).toContain("/usr/bin/git");
    });
});

describe("describeGitLookup", () => {
    it("names the source of a successful lookup", () => {
        expect(
            describeGitLookup({
                binary: "D:\\Git\\cmd\\git.exe",
                source: "default",
                attempts: [],
            })
        ).toContain("D:\\Git\\cmd\\git.exe");
    });

    it("lists every failed attempt with its own error", () => {
        const description = describeGitLookup({
            attempts: [
                { binary: "git", source: "path", error: "spawn git ENOENT" },
                {
                    binary: "/usr/bin/git",
                    source: "default",
                    error: "exit code 1",
                },
            ],
        });
        expect(description).toContain("spawn git ENOENT");
        expect(description).toContain("/usr/bin/git");
    });
});
