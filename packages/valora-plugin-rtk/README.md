# @windagency/valora-plugin-rtk

[RTK](https://github.com/rtk-ai/rtk) (Rust Token Killer) integration for Valora — transparently prepends `rtk` to known-noisy CLI tools, reducing LLM token consumption by 60–90%.

## Install

```bash
valora plugin add rtk
```

The plugin depends on the `rtk` binary. On first activation Valora downloads the install script from a **pinned commit SHA** of `rtk-ai/rtk`, verifies its sha256 against an embedded constant, and only then executes it. A mismatch fails closed.

The pin is currently `rtk-ai/rtk@2fbc7514` (v0.39.0). Maintainers can override at runtime via:

| Env var                            | Effect                                                |
| ---------------------------------- | ----------------------------------------------------- |
| `VALORA_PLUGIN_RTK_INSTALL_URL`    | Replace the install-script URL (e.g. private mirror). |
| `VALORA_PLUGIN_RTK_INSTALL_SHA256` | Replace the expected sha256 of the script.            |

Bumping the pin requires updating both `DEFAULT_INSTALL_URL` and `DEFAULT_INSTALL_SHA256` in `src/binary-manager.ts` together — they are validated against each other on every install.

## What it contributes

- **PreToolUse hook** (`hooks/rtk-rewrite.sh`) — rewrites `run_terminal_cmd` payloads to prepend `rtk` for known-noisy tools.
- `api.lifecycle.onActivate(...)` — ensures the `rtk` binary is present and verified before the hook fires.

## Permissions

- `shell-hooks` — required to register the hook contribution.
- `code-exec` — required by the loader.
- `fs-write` — informational; the install script writes the binary, the plugin's own code does not.
- `network` — justified: the install fetches the script and the binary from `github.com`.

## Requires

`jq >=1.6` (declared in `requiresBinary`) — the rewrite hook uses `jq` to manipulate the tool-call JSON.

## See also

- [Plugins user guide](../../documentation/user-guide/plugins.md)
- [ADR-009: Supply Chain Hardening](../../documentation/adr/009-supply-chain-hardening.md) — the policy that prompted this plugin's pinned-install design
