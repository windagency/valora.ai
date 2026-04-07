# Claude CLI–Inspired UI/UX Design Specification

> **Summary**: Valora's UI/UX is inspired by the Claude CLI — calm, minimal, text-first, and cognitively efficient. The design prioritises readability and conversational flow over decoration.

---

## Overview

This design is inspired by the **Claude CLI** experience: calm, minimal, text-first, and cognitively efficient. The interface emphasizes clarity, low visual noise, and a sense of conversational flow, prioritizing productivity and trust over decoration.

The goal is to make users feel like they are **thinking alongside the system**, not navigating a traditional app.

---

## Design Philosophy

- **Text is the primary UI**
- **Whitespace is intentional**
- **Motion is minimal and purposeful**
- **Visual hierarchy mirrors conversation hierarchy**
- **Nothing distracts from reading or writing**

This design favours _quiet confidence_ over visual flair.

---

## Layout Structure

### 1. Overall Canvas

- Single-column layout
- Max width: ~720–800 px
- Centred horizontally
- Full-height viewport
- Generous vertical spacing between elements

No sidebars by default. Secondary controls are hidden or context-driven.

---

### 2. Header

- Very minimal
- Left-aligned product name or logo (monochrome)
- Optional subtle status indicator (e.g., "Connected", "Ready")
- No heavy navigation bars

Typography-only header, no background colour block.

---

### 3. Conversation Area

- Appears like a **structured transcript**, not chat bubbles
- Messages are stacked vertically
- Each message block has:
  - Role label (e.g., "You", "Assistant") in small, muted text
  - Message content below, full-width
- No avatars or speech bubbles

The conversation should feel like reading a clean document.

---

### 4. Input Area

- Anchored to bottom or inline after the last message
- Single multi-line text field
- No visible borders or heavy containers
- Placeholder text is instructional, not decorative

Example:

> "Type your prompt and press Enter…"

Primary action is **Enter**. Secondary actions are hidden behind keyboard shortcuts.

---

## Typography

- Font style: Modern serif or humanist sans-serif
- Highly readable at small sizes
- Clear distinction between:
  - Body text
  - Labels
  - Code blocks
  - System messages

### Text Characteristics

- Line height: Generous (1.5–1.7)
- Paragraph spacing over indentation
- No excessive font weights

---

## Colour Palette

- Predominantly neutral
- Light mode:
  - Off-white background
  - Dark grey text (not pure black)
- Dark mode:
  - Charcoal background
  - Soft off-white text

Accent colours are used sparingly — only to draw attention to interactive elements or state changes. They never compete with content.

---

## Interaction Principles

- **Keyboard-first**: all primary actions accessible without a mouse
- **Progressive disclosure**: complexity is hidden until needed
- **Immediate feedback**: every action has a visible response within 100 ms
- **Graceful loading**: streaming responses render incrementally, never block

---

## Component Notes

### Code Blocks

- Monospace font at slightly reduced size
- Subtle background tint to distinguish from prose
- Syntax highlighting optional — readability over colour
- Copy button appears on hover only

### System Messages

- Italicised, muted colour
- Used for status updates, errors, and confirmations
- Never compete visually with user or assistant messages

### Tool Call Display

- Collapsible by default
- Shows tool name and summary when collapsed
- Expands to show full input/output on demand

---

_This specification applies to both the terminal dashboard and any future web interface extensions._
