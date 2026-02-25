---
id: documentation.export-metrics
version: 1.0.0
category: documentation
experimental: true
name: Export Metrics
description: Export feedback metrics in machine-readable formats (JSON, CSV, HTML)
tags:
  - documentation
  - export
  - metrics
  - reporting
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - product-manager
dependencies:
  requires:
    - context.use-modern-cli-tools
    - documentation.generate-feedback-report
inputs:
  - name: summary_statistics
    description: Summary statistics from feedback report
    type: object
    required: true
  - name: export_format
    description: Export format (json, csv, html, markdown)
    type: string
    required: true
    validation:
      enum: ["json", "csv", "html", "markdown"]
  - name: output_path
    description: Optional custom output path
    type: string
    required: false
outputs:
  - exported_file_path
  - export_status
tokens:
  avg: 1500
  max: 3000
  min: 800
---

# Export Metrics

## Objective

Export feedback metrics and statistics in the specified machine-readable format for programmatic analysis or sharing.

## Instructions

### Step 1: Prepare Export Data

Collect all metrics to export:
- Summary statistics
- Performance metrics
- Quality scores
- User feedback
- Recommendations
- Timeline data

### Step 2: Format Based on Export Type

#### JSON Export (`export_format = "json"`)

**Structure:**

```json
{
  "metadata": {
    "generated_at": "<ISO timestamp>",
    "workflow_type": "<type>",
    "workflow_duration_minutes": <duration>,
    "report_version": "1.0.0"
  },
  "summary": {
    "satisfaction_score": <score>,
    "efficiency_score": <score>,
    "quality_score": <score>,
    "commands_executed": <count>,
    "files_changed": <count>,
    "errors_encountered": <count>,
    "improvements_identified": <count>
  },
  "performance": {
    "time_efficiency_score": <score>,
    "time_breakdown": { <command>: <seconds> },
    "error_rate": <rate>,
    "bottlenecks": [<array>]
  },
  "quality": {
    "code_quality_score": <score>,
    "test_quality_score": <score>,
    "review_quality_score": <score>,
    "overall_quality_score": <score>
  },
  "feedback": {
    "satisfaction_score": <score>,
    "pain_points": [<array>],
    "success_highlights": [<array>]
  },
  "recommendations": {
    "agent_improvements": [<array>],
    "prompt_refinements": [<array>],
    "workflow_optimizations": [<array>]
  }
}
```

**File path:** `knowledge-base/feedback/<timestamp>-<workflow-type>.json`

#### CSV Export (`export_format = "csv"`)

**Tabular format for spreadsheet analysis:**

```csv
Metric,Value,Category,Priority
Satisfaction Score,8,User Feedback,N/A
Efficiency Score,75,Performance,N/A
Quality Score,87,Quality,N/A
Commands Executed,6,Summary,N/A
Files Changed,12,Summary,N/A
Time: fetch-task,150,Performance,N/A
Time: plan,345,Performance,N/A
...
Error Rate,0.04,Performance,N/A
Bottleneck: test,900,Performance,High
Recommendation: Parallelize tests,N/A,Optimization,High
...
```

**File path:** `knowledge-base/feedback/<timestamp>-<workflow-type>.csv`

#### HTML Export (`export_format = "html"`)

**Shareable web page with charts:**

```html
<!DOCTYPE html>
<html>
<head>
  <title>Feedback Report: <Workflow Type></title>
  <style>
    /* Clean, modern styling */
  </style>
</head>
<body>
  <h1>Feedback Report: <Workflow Type></h1>
  
  <section class="summary">
    <h2>Executive Summary</h2>
    <!-- Summary cards -->
  </section>
  
  <section class="metrics">
    <h2>Performance Metrics</h2>
    <!-- Charts using CSS or inline SVG -->
  </section>
  
  <section class="quality">
    <h2>Quality Assessment</h2>
    <!-- Quality scores visualization -->
  </section>
  
  <section class="recommendations">
    <h2>Recommendations</h2>
    <!-- Prioritized recommendations -->
  </section>
</body>
</html>
```

**File path:** `knowledge-base/feedback/<timestamp>-<workflow-type>.html`

#### Markdown Export (`export_format = "markdown"`)

**Default format from generate-feedback-report:**

Use the markdown report already generated.

**File path:** `knowledge-base/feedback/<timestamp>-<workflow-type>.md`

### Step 3: Write to File

**Determine output path:**

```
If output_path provided:
  use output_path
Else:
  use default: knowledge-base/feedback/<timestamp>-<workflow-type>.<extension>
```

**Ensure directory exists:**

```bash
mkdir -p .ai/feedback
```

**Write file:**

Use appropriate write operation for format.

### Step 4: Validate Export

**Check:**
- File created successfully
- File is not empty
- Format is valid (parse if JSON/CSV)
- File size is reasonable

**Calculate file size:**

```bash
stat -f%z <file-path>  # macOS
stat -c%s <file-path>  # Linux
```

## Output Format

```json
{
  "exported_file_path": "knowledge-base/feedback/20251115-1430-feature-implementation.json",
  "export_status": "success",
  "export_format": "json",
  "file_size_kb": 45,
  "timestamp": "2025-11-15T14:30:00Z"
}
```

## Success Criteria

- ✅ Export format correctly selected
- ✅ Data structured appropriately for format
- ✅ File written to correct location
- ✅ File is valid and non-empty
- ✅ Export status confirmed

## Error Handling

- **Invalid format**: Return error, list valid formats
- **Write permission denied**: Try alternate location or fail gracefully
- **Directory doesn't exist**: Create directory
- **File already exists**: Append timestamp to avoid overwrite

## Format Selection Guide

**JSON:**
- Best for: Programmatic analysis, API integration
- Use case: Feeding data into analytics tools

**CSV:**
- Best for: Spreadsheet analysis, data science
- Use case: Excel/Google Sheets import, pandas analysis

**HTML:**
- Best for: Sharing with non-technical stakeholders
- Use case: Email reports, web publishing

**Markdown:**
- Best for: Human reading, version control
- Use case: Default report format, git-friendly

