import * as path from "path";
import { Platform } from "obsidian";
import { spawnAsync } from "./utils";

/**
 * Optional override for the Git executable. It is read on every platform,
 * not only on Windows.
 */
export const GIT_PATH_ENV_VAR = "OBSIDIAN_GIT_PATH";

export type GitLookupSource = "configured" | "env" | "path" | "default";

export interface GitAttempt {
    binary: string;
    source: GitLookupSource;
    /** Why this binary did not work. Undefined for a successful attempt. */
    error?: string;
}

export interface GitLookupResult {
    /** Executable that answered `git --version`, if any. */
    binary?: string;
    source?: GitLookupSource;
    /** Every executable that was tried, in order. */
    attempts: GitAttempt[];
}

export type GitProbe = (
    binary: string
) => Promise<{ ok: boolean; error?: string }>;

export interface GitPlatform {
    isWin?: boolean;
    isMacOS?: boolean;
}

function currentEnv(): NodeJS.ProcessEnv {
    return typeof process === "undefined" ? {} : process.env;
}

function readEnvVar(env: NodeJS.ProcessEnv, name: string): string | undefined {
    const value = env[name]?.trim();
    return value ? value : undefined;
}

/**
 * The installation location that Git uses by default on the current platform.
 * This is the only fallback that is tried when Git is not in PATH.
 */
export function defaultGitPath(
    platform: GitPlatform = Platform
): string | undefined {
    if (platform.isWin) {
        const programFiles =
            readEnvVar(currentEnv(), "ProgramFiles") ?? "C:\\Program Files";
        return path.win32.join(programFiles, "Git", "cmd", "git.exe");
    }
    // macOS ships Git with the command line tools and Linux distributions put
    // it into /usr/bin, so both use the same default location.
    return "/usr/bin/git";
}

const probeGitBinary: GitProbe = async (binary) => {
    const result = await spawnAsync(binary, ["--version"], {});
    if (!result.error && result.code === 0) return { ok: true };
    const stderr = result.stderr.trim();
    return {
        ok: false,
        error: result.error?.message ?? (stderr || `exit code ${result.code}`),
    };
};

/**
 * Looks for a working Git executable: the configured path, the
 * `OBSIDIAN_GIT_PATH` override, `git` from PATH and the platform default
 * installation location. The `probe` parameter exists for tests.
 */
export async function findGitBinary(
    configuredPath?: string | null,
    probe: GitProbe = probeGitBinary
): Promise<GitLookupResult> {
    const attempts: GitAttempt[] = [];

    const tryBinary = async (
        binary: string,
        source: GitLookupSource
    ): Promise<boolean> => {
        const result = await probe(binary);
        attempts.push({
            binary,
            source,
            error: result.ok ? undefined : (result.error ?? "failed"),
        });
        return result.ok;
    };

    if (configuredPath) {
        const ok = await tryBinary(configuredPath, "configured");
        return ok
            ? { binary: configuredPath, source: "configured", attempts }
            : { attempts };
    }

    const envPath = readEnvVar(currentEnv(), GIT_PATH_ENV_VAR);
    if (envPath && (await tryBinary(envPath, "env"))) {
        return { binary: envPath, source: "env", attempts };
    }

    if (await tryBinary("git", "path")) {
        return { binary: "git", source: "path", attempts };
    }

    const fallback = defaultGitPath();
    if (fallback && (await tryBinary(fallback, "default"))) {
        return { binary: fallback, source: "default", attempts };
    }

    return { attempts };
}

/**
 * Human readable summary of a lookup, used for the notice shown when Git
 * cannot be found. Every attempted binary is reported with its own error.
 */
export function describeGitLookup(result: GitLookupResult): string {
    if (result.binary) {
        const via: Record<GitLookupSource, string> = {
            configured: "the configured path",
            env: GIT_PATH_ENV_VAR,
            path: "PATH",
            default: "the default installation path",
        };
        const source = result.source ?? "path";
        return `Git found via ${via[source]}: ${result.binary}.`;
    }
    const attempts = result.attempts
        .map((attempt) => `'${attempt.binary}' (${attempt.error ?? "failed"})`)
        .join(", ");
    return attempts ? `Tried ${attempts}.` : "No Git executable was tried.";
}
