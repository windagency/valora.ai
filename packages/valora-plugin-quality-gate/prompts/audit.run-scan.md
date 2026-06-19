---
id: audit.run-scan
version: 1.0.0
category: audit
experimental: true
name: Run Cross-Duplication Scan
description: Execute the audit scan CLI subcommand and capture the structured JSON output
tags:
  - audit
  - architecture
inputs:
  - name: path
    description: Root path to scan
    type: string
    required: false
    default: .
  - name: depth
    description: Directory depth to scan
    type: number
    required: false
  - name: threshold
    description: Minimum sibling count to flag a concern
    type: number
    required: false
  - name: concerns
    description: Comma-separated concern categories to check
    type: string
    required: false
  - name: exclude
    description: Glob pattern to exclude sibling directories
    type: string
    required: false
outputs:
  - scan_json
  - total_violations
---

Run the cross-duplication audit scan against the project.

## Instructions

1. Build the scan command from the inputs:
   - Base command: `valora audit scan`
   - Append `{path}` if provided (default: `.`)
   - Append `--depth={depth}` if provided
   - Append `--threshold={threshold}` if provided
   - Append `--concerns={concerns}` if provided
   - Append `--exclude={exclude}` if provided

2. Execute the command using `run_terminal_cmd`. Capture stdout as the JSON report.

3. Check the exit code:
   - Exit code `0`: output a message "No cross-duplication violations found." and set `total_violations` to `0`.
   - Exit code `1`: proceed — set `scan_json` to the captured stdout, parse `summary.totalViolations` from the JSON and set `total_violations`.
   - Exit code `2`: halt with the error message from stderr.

4. Output `scan_json` (the raw JSON string) and `total_violations` (integer).
