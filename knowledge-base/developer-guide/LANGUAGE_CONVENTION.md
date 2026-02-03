# Language Convention Guide

## Language Standards

This project follows a dual-language convention:

### American English (Technical Content)

- ✅ **Commands** (all command definitions in `.ai/commands/`)
- ✅ **Agents** (all agent definitions in `.ai/agents/`)
- ✅ **Prompts** (all prompt files in `.ai/prompts/`)
- ✅ **Templates** (all templates in `.ai/templates/`)
- ✅ **Code** (all TypeScript/JavaScript code)

### British English (Documentation & Comments)

- ✅ **Documentation**
- ✅ **Comments** (all inline comments in documentation)
- ✅ **Reports** (CHANGELOG, TODO, etc.)
- ✅ **Guides** (README, etc.)
- ✅ **Summaries** (all summary documents)

---

## Rationale

### Why American English for Technical Content?

1. **Industry Standard**: Most AI/ML documentation uses American English
2. **Framework Compatibility**: Libraries, APIs, and tools use American spelling
3. **Code Consistency**: JavaScript/TypeScript use American spelling (`color`, `behavior`)
4. **Global Recognition**: More universally recognized in tech industry

### Why British English for Documentation?

1. **Professional Standard**: British English is preferred for formal documentation
2. **Clarity**: Distinct separation between technical and documentary content
3. **Consistency**: All documentation follows same convention

---

## Spelling Differences

### Common American → British Conversions

| American     | British      | Context                   |
| ------------ | ------------ | ------------------------- |
| optimization | optimisation | Documentation only        |
| organization | organisation | Documentation only        |
| analyze      | analyse      | Documentation only        |
| color        | colour       | Documentation only        |
| behavior     | behaviour    | Documentation only        |
| center       | centre       | Documentation only        |
| defense      | defence      | Documentation only        |
| license      | licence      | Documentation only (noun) |
| catalog      | catalogue    | Documentation only        |
| modeling     | modelling    | Documentation only        |
| fulfill      | fulfil       | Documentation only        |

### Keep American Spelling

| Term             | Keep American | Reason                   |
| ---------------- | ------------- | ------------------------ |
| `optimize()`     | Yes           | Function names, code     |
| `color: red`     | Yes           | CSS, code properties     |
| `analyze-`       | Yes           | Command/prompt IDs       |
| Template content | Yes           | Technical specifications |
| Variable names   | Yes           | Code consistency         |

---

## Examples

### ✅ Correct: Agent Definition (American English)

```markdown
---
id: software-engineer-typescript
name: Software Engineer - TypeScript
description: Specialized in TypeScript development and optimization
---

# Software Engineer - TypeScript

## Expertise

- Code optimization
- Performance analysis
- Behavioral patterns
```

### ✅ Correct: Documentation (British English)

```markdown
# Optimisation Strategy

## Overview

This document outlines the strategy for optimising prompts whilst maintaining
quality and clarity.

## Organisation

The optimisation process is organised into six core strategies:
1. Template extraction
2. Content condensation
```

### ✅ Correct: Template (American English)

```markdown
# Product Requirements Document

## Functional Requirements

- Analyze user behavior patterns
- Optimize performance metrics
- Centralize configuration management
```

### ✅ Correct: Comment in Documentation (British English)

```markdown
<!-- 
This optimisation strategy was developed to reduce file sizes whilst
maintaining functionality. The organisation of templates follows
British conventions for documentation.
-->
```

---

## Maintenance Guidelines

### When Creating New Files

**Documentation**:

- Use British English spelling
- Run through British spellchecker
- Follow this guide

**Prompts** (`.md` files in `.ai/prompts/*/*.md`):

- Use American English spelling
- Maintain technical consistency
- Keep aligned with templates

**Templates** (`.md` files in `.ai/templates/`):

- Use American English spelling
- Technical specifications
- Code examples use American

**Code** (`.ts`, `.tsx`, `.js`, `.jsx` files):

- Always American English
- Function names, variables use American
- Comments in code use British English

---

## Quality Assurance

### Checklist for New Documentation

- [ ] File type determined (technical vs documentation)
- [ ] Appropriate language selected (American vs British)
- [ ] Spelling consistent throughout
- [ ] No mixed spelling in same document
- [ ] Verified with spellchecker
- [ ] Follows this guide
