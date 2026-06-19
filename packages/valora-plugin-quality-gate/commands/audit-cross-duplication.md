---
name: audit-cross-duplication
description: Detect N×M concern duplication across sibling directories and generate a prioritised refactoring narrative
experimental: true
argument-hint: '[<path>] [--depth=<N>] [--threshold=<N>] [--concerns=<csv>] [--exclude=<glob>]'
allowed-tools:
  - run_terminal_cmd
  - read_file
model: claude-opus-4.6
agent: lead
prompts:
  pipeline:
    - stage: scan
      prompt: audit.run-scan
      required: true
      inputs:
        path: $ARG_1
        depth: $ARG_depth
        threshold: $ARG_threshold
        concerns: $ARG_concerns
        exclude: $ARG_exclude
      outputs:
        - scan_json
        - total_violations
    - stage: narrative
      prompt: audit.generate-narrative
      required: true
      inputs:
        scan_json: $STAGE_scan.scan_json
        total_violations: $STAGE_scan.total_violations
      outputs:
        - narrative_markdown
        - report_path
---
