# Planning Template: React Feature/Component

## Pattern Type: React Feature

**Use when**: Adding new React features, pages, or complex component hierarchies.

---

## Quick Fill Template

### 1. Feature Overview

| Field | Value |
|-------|-------|
| **Feature Name** | [e.g., UserProfile, Dashboard, Settings] |
| **Type** | [ ] Page [ ] Feature [ ] Component Library |
| **State Management** | [ ] Local [ ] Context [ ] Zustand [ ] Redux |
| **Data Fetching** | [ ] TanStack Query [ ] SWR [ ] Custom |
| **Forms** | [ ] React Hook Form [ ] Formik [ ] Custom |

### 2. Component Hierarchy

```
[FeatureName]/
├── index.ts                 # Public exports
├── [FeatureName].tsx        # Main container
├── components/
│   ├── [Component1].tsx     # Molecule
│   ├── [Component2].tsx     # Molecule
│   └── [Component3].tsx     # Organism
├── hooks/
│   ├── use[Feature].ts      # Feature hook
│   └── use[Feature]Query.ts # Data hook
├── types/
│   └── index.ts             # Type definitions
├── utils/
│   └── index.ts             # Utilities
└── __tests__/
    ├── [FeatureName].test.tsx
    └── components/
```

### 3. Files to Create

| File | Type | Purpose |
|------|------|---------|
| `src/features/[feature]/index.ts` | Export | Public API |
| `src/features/[feature]/[Feature].tsx` | Container | Main component |
| `src/features/[feature]/components/*.tsx` | UI | Child components |
| `src/features/[feature]/hooks/*.ts` | Logic | Custom hooks |
| `src/features/[feature]/types/index.ts` | Types | TypeScript types |
| `src/features/[feature]/__tests__/*.test.tsx` | Tests | Component tests |

### 4. Standard Implementation Steps

#### Step 1: Define Types

**Objective**: Create TypeScript interfaces

**Files**:
- `src/features/[feature]/types/index.ts`

```typescript
export interface [Feature]Props {
  // Component props
}

export interface [Feature]State {
  // State shape
}

export interface [Feature]Data {
  // API response type
}
```

**Validation**: Types compile without errors

---

#### Step 2: Create Data Hooks

**Objective**: Implement data fetching with TanStack Query

**Files**:
- `src/features/[feature]/hooks/use[Feature]Query.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function use[Feature]Query(id: string) {
  return useQuery({
    queryKey: ['[feature]', id],
    queryFn: () => fetch[Feature](id),
  });
}

export function use[Feature]Mutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: update[Feature],
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['[feature]'] });
    },
  });
}
```

**Validation**: Hooks fetch and cache data correctly

---

#### Step 3: Create UI Components

**Objective**: Build component hierarchy (atoms → molecules → organisms)

**Files**:
- `src/features/[feature]/components/[Component].tsx`

```typescript
interface [Component]Props {
  // Props
}

export function [Component]({ ...props }: [Component]Props) {
  return (
    <div className="...">
      {/* Component JSX */}
    </div>
  );
}
```

**Validation**: Components render correctly in Storybook

---

#### Step 4: Create Main Container

**Objective**: Compose components with data and logic

**Files**:
- `src/features/[feature]/[Feature].tsx`

```typescript
import { use[Feature]Query } from './hooks/use[Feature]Query';
import { [Component1], [Component2] } from './components';

export function [Feature]({ id }: [Feature]Props) {
  const { data, isLoading, error } = use[Feature]Query(id);

  if (isLoading) return <[Feature]Skeleton />;
  if (error) return <[Feature]Error error={error} />;

  return (
    <div className="[feature]-container">
      <[Component1] data={data} />
      <[Component2] data={data} />
    </div>
  );
}
```

**Validation**: Container orchestrates data and components

---

#### Step 5: Add Form Handling (if applicable)

**Objective**: Implement forms with React Hook Form

**Files**:
- `src/features/[feature]/components/[Feature]Form.tsx`

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

export function [Feature]Form({ onSubmit }: [Feature]FormProps) {
  const form = useForm<[Feature]FormData>({
    resolver: zodResolver([feature]FormSchema),
    defaultValues: {},
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* Form fields */}
    </form>
  );
}
```

**Validation**: Form validates and submits correctly

---

#### Step 6: Write Tests

**Objective**: Add component and integration tests

**Files**:
- `src/features/[feature]/__tests__/[Feature].test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { [Feature] } from '../[Feature]';

describe('[Feature]', () => {
  it('renders loading state', () => {
    render(<[Feature] id="123" />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('renders data when loaded', async () => {
    render(<[Feature] id="123" />);
    expect(await screen.findByText('...')).toBeInTheDocument();
  });

  it('renders error state', async () => {
    // Mock error
    render(<[Feature] id="invalid" />);
    expect(await screen.findByText(/error/i)).toBeInTheDocument();
  });
});
```

**Validation**: `pnpm test:quick` passes

---

#### Step 7: Add Accessibility Tests

**Objective**: Ensure WCAG compliance

**Files**:
- `src/features/[feature]/__tests__/[Feature].a11y.test.tsx`

```typescript
import { axe } from 'vitest-axe';

it('has no accessibility violations', async () => {
  const { container } = render(<[Feature] id="123" />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

**Validation**: No a11y violations

---

### 5. Standard Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| React 18+ | UI library | [ ] Available |
| TanStack Query | Data fetching | [ ] Available |
| React Hook Form | Forms | [ ] Available |
| Zod | Validation | [ ] Available |
| Tailwind CSS | Styling | [ ] Available |

### 6. Standard Risks

| Risk | Mitigation |
|------|------------|
| Prop drilling | Use composition or context |
| Re-render performance | Use memo, useMemo, useCallback |
| Missing loading states | Add Suspense boundaries |
| Missing error states | Add Error boundaries |
| Accessibility issues | Test with axe, screen reader |

### 7. Rollback

```bash
# Revert all changes
git revert HEAD

# Or remove feature folder
rm -rf src/features/[feature]
```

---

## Estimated Effort

| Step | Points | Confidence |
|------|--------|------------|
| Types | 1 | High |
| Data Hooks | 2 | High |
| UI Components | 3 | Medium |
| Main Container | 2 | High |
| Form Handling | 2 | Medium |
| Tests | 2 | High |
| A11y Tests | 1 | High |
| **Total** | **13** | **Medium** |
