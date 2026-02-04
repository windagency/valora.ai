---
id: review.validate-accessibility
version: 1.0.0
category: review
experimental: true
name: Validate Accessibility
description: Verify WCAG compliance, ARIA implementation, and semantic HTML usage for frontend changes
tags:
  - validation
  - accessibility
  - wcag
  - aria
model_requirements:
  min_context: 128000
  recommended:
    - claude-haiku-4.5
agents:
  - asserter
dependencies:
  requires:
    - context.gather-validation-context
inputs: []
outputs:
  - wcag_violations
  - aria_issues
  - semantic_html_issues
tokens:
  avg: 2000
  max: 4000
  min: 1000
---

# Validate Accessibility

## Objective

Execute automated accessibility audits to verify WCAG compliance, proper ARIA implementation, and semantic HTML usage.

**Note**: This prompt is conditionally executed only when `frontend_changes == true`.

## Validation Steps

### Step 1: Run Automated Accessibility Audits

Execute accessibility scanning tools:

```bash
# axe-core CLI (recommended)
pnpm exec @axe-core/cli http://localhost:3000 --tags wcag2a,wcag2aa

# Or eslint-plugin-jsx-a11y for React
pnpm exec eslint src/ --ext .jsx,.tsx

# Or Pa11y
pnpm exec pa11y http://localhost:3000
```

**Capture**:
- WCAG violations by level (A, AA, AAA)
- Rule IDs and descriptions
- Element selectors
- Remediation guidance

### Step 2: Check WCAG Compliance

Validate against WCAG 2.1/2.2 guidelines:

**Level A (Critical - Must Pass)**:
- Keyboard accessible (all interactive elements)
- Text alternatives for non-text content
- Audio/video alternatives
- Adaptable content structure
- Distinguishable content (color contrast)
- No keyboard traps

**Level AA (Target - Should Pass)**:
- Color contrast ratio ≥ 4.5:1 for normal text
- Color contrast ratio ≥ 3:1 for large text
- Resize text up to 200%
- Images of text avoided (unless essential)
- Multiple ways to navigate
- Focus visible

**Level AAA (Optional - Nice to Have)**:
- Enhanced color contrast (≥ 7:1)
- No time limits
- No interruptions

### Step 3: Validate ARIA Implementation

Check proper ARIA usage:

**Roles**:
- Landmark roles defined (main, navigation, complementary, etc.)
- Widget roles correct (button, dialog, menu, etc.)
- Document structure roles appropriate (heading, list, etc.)
- No redundant roles on semantic HTML

**States and Properties**:
- `aria-label` or `aria-labelledby` on interactive elements without visible labels
- `aria-expanded` on expandable elements
- `aria-checked` on checkboxes/radio buttons
- `aria-selected` on selectable items
- `aria-hidden` used correctly (not on focusable elements)

**Live Regions**:
- `aria-live` for dynamic content
- `aria-atomic`, `aria-relevant` set appropriately
- Polite vs. assertive used correctly

**Common ARIA Anti-Patterns**:
- `role="button"` on `<button>` (redundant)
- `aria-label` on non-interactive elements
- `aria-hidden="true"` on focusable elements
- Missing required ARIA attributes for roles

### Step 4: Check Semantic HTML

Verify proper HTML semantics:

**Heading Hierarchy**:
- Single `<h1>` per page
- No skipped heading levels (h1 → h3)
- Logical heading structure

**Form Labels**:
- All `<input>`, `<select>`, `<textarea>` have associated `<label>`
- Labels properly linked via `for` attribute or wrapping

**Images**:
- All `<img>` have `alt` attribute
- Decorative images have `alt=""` or `aria-hidden="true"`
- Meaningful `alt` text (not "image" or file names)

**Buttons vs. Links**:
- `<button>` for actions
- `<a>` for navigation
- No `<div>` or `<span>` acting as buttons without proper roles

**Lists**:
- `<ul>`, `<ol>`, `<dl>` for lists, not `<div>`
- List items properly nested

### Step 5: Verify Keyboard Accessibility

Check keyboard navigation:

**Focus Management**:
- All interactive elements focusable
- Tab order logical
- Focus indicators visible (outline or custom style)
- No focus traps

**Keyboard Shortcuts**:
- Standard keys work (Tab, Shift+Tab, Enter, Space, Esc)
- Custom shortcuts documented
- No conflicts with screen reader shortcuts

**Skip Links**:
- "Skip to main content" link present
- Skip links functional and visible on focus

## Output Format

```json
{
  "wcag_violations": {
    "status": "fail",
    "level_a_violations": 0,
    "level_aa_violations": 3,
    "level_aaa_violations": 2,
    "violations": [
      {
        "level": "AA",
        "rule": "color-contrast",
        "wcag": "1.4.3 Contrast (Minimum)",
        "severity": "serious",
        "location": "src/components/Button.tsx:12",
        "element": "<button class=\"btn-primary\">",
        "description": "Text color #888 on background #fff has contrast ratio 2.85:1 (requires 4.5:1)",
        "remediation": "Use darker text color #767676 or darker",
        "impact": "Users with low vision cannot read button text",
        "reference": "https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html"
      }
    ],
    "commands_run": [
      "pnpm exec @axe-core/cli http://localhost:3000 --tags wcag2a,wcag2aa"
    ]
  },
  "aria_issues": {
    "status": "warn",
    "issues": [
      {
        "type": "missing_role",
        "location": "src/components/Modal.tsx:45",
        "element": "<div class=\"modal\">",
        "issue": "Modal dialog missing role=\"dialog\"",
        "remediation": "Add role=\"dialog\" and aria-labelledby to modal container",
        "severity": "moderate"
      },
      {
        "type": "redundant_role",
        "location": "src/components/Button.tsx:23",
        "element": "<button role=\"button\">",
        "issue": "Redundant role on semantic button element",
        "remediation": "Remove role=\"button\" from <button> element",
        "severity": "minor"
      }
    ]
  },
  "semantic_html_issues": {
    "status": "warn",
    "issues": [
      {
        "type": "heading_hierarchy",
        "location": "src/pages/Dashboard.tsx:12",
        "issue": "Heading structure jumps from h2 to h4, skipping h3",
        "remediation": "Change h4 to h3 to maintain proper hierarchy",
        "severity": "moderate"
      },
      {
        "type": "missing_label",
        "location": "src/components/SearchBar.tsx:8",
        "element": "<input type=\"search\">",
        "issue": "Input missing associated label",
        "remediation": "Add <label for=\"search-input\"> or aria-label attribute",
        "severity": "serious"
      }
    ]
  },
  "keyboard_accessibility": {
    "status": "pass",
    "issues": []
  },
  "accessibility_score": {
    "score": 87,
    "max": 100,
    "grade": "B",
    "wcag_level_achieved": "A"
  },
  "summary": {
    "total_issues": 8,
    "critical": 0,
    "serious": 2,
    "moderate": 3,
    "minor": 3,
    "blocking": false,
    "note": "Level A violations are blockers, Level AA are warnings"
  }
}
```

## Success Criteria

- ✅ Automated accessibility audits executed
- ✅ WCAG compliance checked (Levels A and AA)
- ✅ ARIA implementation validated
- ✅ Semantic HTML verified
- ✅ Keyboard accessibility confirmed
- ✅ All violations captured with remediation guidance
- ✅ Commands documented for reproducibility

## Rules

**Blocking Issues (Fail Quality Gate)**:
- WCAG Level A violations (critical accessibility barriers)
- Keyboard traps (users cannot navigate)
- Missing form labels (inaccessible forms)
- Missing alt text on meaningful images

**Warning Issues (Non-Blocking)**:
- WCAG Level AA violations (if Level A is met)
- WCAG Level AAA violations
- Redundant ARIA roles
- Minor semantic HTML issues

**Conditional Execution**:
- This validation only runs if `frontend_changes == true`
- Skip for backend-only changes

**Note**: WCAG Level A compliance is non-negotiable. Level AA violations should be addressed but may not block if Level A is fully met.

