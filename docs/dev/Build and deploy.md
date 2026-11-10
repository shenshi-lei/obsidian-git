# Build artifacts and vault deployment

`pnpm run build` writes the bundle to `main.js` in the repository root. That is
convenient for tests and CI, but Obsidian only loads a community plugin from
`<vault>/.obsidian/plugins/obsidian-git/`. This page describes the small tooling
that copies one build into a per-user artifact directory and then installs it
into any number of vaults.

## Where artifacts live

The artifact directory defaults to `<data root>/obsidian-git/plugin`, where
`<data root>` is the per-user data directory of the platform:

| Platform | Data root | Artifact directory |
| --- | --- | --- |
| Windows | `%LOCALAPPDATA%` | `%LOCALAPPDATA%\obsidian-git\plugin` |
| macOS | `~/Library/Application Support` | `~/Library/Application Support/obsidian-git/plugin` |
| Linux | `$XDG_DATA_HOME` or `~/.local/share` | `${XDG_DATA_HOME:-~/.local/share}/obsidian-git/plugin` |

Release archives belong in `<plugin home>/releases` and are not written by
these scripts; the release workflow still builds the zip.

Overrides, highest priority first:

1. `--out <dir>` on `scripts/artifacts.ts`
2. `OBSIDIAN_GIT_PLUGIN_DIR` (artifact directory only)
3. `OBSIDIAN_GIT_HOME` (moves `plugin` and `releases` together)

`node scripts/artifacts.ts --print-path` prints the resolved directory without
writing anything.

## Commands

```sh
pnpm run build:plugin   # build, then copy artifacts into the default directory
pnpm run artifacts      # copy the existing root main.js, without rebuilding
pnpm run deploy:link    # link every vault from Obsidian's registry to the artifacts
pnpm run deploy:copy    # copy the files into every vault instead of linking
pnpm run unlink:all     # remove the links again
```

`deploy` selects vaults with `--vault <path>` (repeatable), with
`OBSIDIAN_GIT_VAULTS` (paths joined by the platform path separator), or with
`--all` to read Obsidian's vault registry:

| Platform | Registry |
| --- | --- |
| Windows | `%APPDATA%\obsidian\obsidian.json` |
| macOS | `~/Library/Application Support/obsidian/obsidian.json` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/obsidian/obsidian.json`, plus the Flatpak and Snap config paths |

Useful flags: `--dry-run`, `--force` (repoint a link that points elsewhere),
`--unlink`, `--copy`.

## Linking versus copying

Linking installs one directory junction on Windows (no administrator rights
needed) or one symlink on macOS and Linux. Rebuild and reload Obsidian and every
linked vault runs the new bundle.

Copying keeps a real plugin folder inside each vault. Files are written
atomically and `data.json` is never touched.

The trade-off: a link points the whole plugin folder at the artifact directory,
so the `data.json` that Obsidian writes there is shared by every linked vault.
Git settings, the auto commit/pull intervals and the stored server password are
therefore common to all of them. A vault that needs its own settings must use
`--copy` instead.

## Platform notes

- Windows: `lstat` reports a junction as a directory, so link detection falls
  back to the parent directory entry. Links are removed with `fs.rmSync`; the
  target directory is untouched. Junction targets must be absolute paths.
- macOS: symlinks are resolved with `realpath`, which also normalises the
  case-insensitive volume.
- Linux: Flatpak and Snap sandbox paths are searched for the vault registry, but
  always prefer `--vault` when Obsidian runs in a container.
- Vault paths with spaces are handled by the scripts; pass them quoted on the
  command line.

## After deploying

Obsidian reads `main.js` at startup. Reload each vault with `Ctrl+P` ->
"Reload app without saving", or restart the application. The plugin still has to
be enabled once per vault under Settings -> Community plugins.
