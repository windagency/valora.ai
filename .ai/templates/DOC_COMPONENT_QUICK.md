# Component Documentation: [ComponentName]

| Attribute | Value |
|-----------|-------|
| **Type** | Atom / Molecule / Organism / Template / Page |
| **Path** | `src/components/[path]/[ComponentName].tsx` |
| **Last Updated** | [YYYY-MM-DD] |

---

## Overview

[Brief description of the component's purpose and usage]

---

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `variant` | `'primary' \| 'secondary'` | No | `'primary'` | Visual variant |
| `size` | `'sm' \| 'md' \| 'lg'` | No | `'md'` | Size of component |
| `disabled` | `boolean` | No | `false` | Disable interactions |
| `onClick` | `() => void` | No | - | Click handler |
| `children` | `ReactNode` | Yes | - | Content to render |

---

## Usage

### Basic

```tsx
import { ComponentName } from 'src/components/ComponentName';

<ComponentName>
  Content here
</ComponentName>
```

### With Variants

```tsx
<ComponentName variant="primary" size="lg">
  Primary Large
</ComponentName>

<ComponentName variant="secondary" size="sm">
  Secondary Small
</ComponentName>
```

### With Event Handler

```tsx
<ComponentName onClick={() => console.log('Clicked!')}>
  Click Me
</ComponentName>
```

---

## Styling

### CSS Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `--component-bg` | `#ffffff` | Background colour |
| `--component-text` | `#000000` | Text colour |
| `--component-border` | `#e0e0e0` | Border colour |

### Tailwind Classes

```tsx
// Base classes
"rounded-lg border shadow-sm"

// Variant: primary
"bg-primary text-white hover:bg-primary-dark"

// Variant: secondary
"bg-secondary text-gray-900 hover:bg-secondary-dark"

// Size: sm
"px-2 py-1 text-sm"

// Size: md
"px-4 py-2 text-base"

// Size: lg
"px-6 py-3 text-lg"
```

---

## States

| State | Appearance | Trigger |
|-------|------------|---------|
| Default | Normal styling | Initial render |
| Hover | Slightly darker | Mouse over |
| Active | Pressed appearance | Mouse down |
| Focus | Focus ring | Keyboard focus |
| Disabled | Greyed out, no cursor | `disabled={true}` |
| Loading | Spinner, disabled | `loading={true}` |

---

## Accessibility

| Feature | Implementation |
|---------|----------------|
| Keyboard Navigation | Focusable with Tab |
| Screen Reader | Uses semantic HTML |
| ARIA Labels | `aria-label` for icons |
| Focus Visible | Visible focus ring |
| Reduced Motion | Respects `prefers-reduced-motion` |

### ARIA Attributes

```tsx
<ComponentName
  aria-label="Action description"
  aria-disabled={disabled}
  role="button"
/>
```

---

## Testing

### Unit Tests

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentName } from './ComponentName';

describe('ComponentName', () => {
  it('renders children', () => {
    render(<ComponentName>Test Content</ComponentName>);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<ComponentName onClick={handleClick}>Click</ComponentName>);
    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is true', () => {
    render(<ComponentName disabled>Disabled</ComponentName>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### Accessibility Tests

```tsx
import { axe } from 'vitest-axe';

it('has no accessibility violations', async () => {
  const { container } = render(<ComponentName>Accessible</ComponentName>);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

---

## Related Components

| Component | Relationship | Description |
|-----------|--------------|-------------|
| `Button` | Similar | Base button component |
| `IconButton` | Variant | Icon-only version |
| `ButtonGroup` | Parent | Groups multiple buttons |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | [YYYY-MM-DD] | Initial implementation |
