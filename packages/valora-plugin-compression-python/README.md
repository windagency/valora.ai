# @windagency/valora-plugin-compression-python

Output-compression strategies for Python and adjacent tooling.

## Install

```bash
valora plugin add compression-python
```

## What it contributes

Registers 6 compression strategies via `api.compression.registerStrategy`: `python`, `pytest`, `pip`, `pip3`, `cargo`, `ruff`.

The `cargo` strategy is here for projects that mix Python with Rust extensions (`maturin`, `pyo3`); a future split into a dedicated rust compression plugin is plausible.

## Permissions

`code-exec` — required by the loader to register a `code` contribution.

## See also

- [Plugins user guide](../../documentation/user-guide/plugins.md)
- [Writing plugins](../../documentation/developer-guide/writing-plugins.md)
