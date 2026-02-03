---
pattern: react-component
complexity_range: 2-5
estimated_time: "3-5 minutes"
use_when:
  - Adding new React components
  - Building UI features
  - Creating forms
  - Adding pages/views
applies_to:
  - React
  - TypeScript
  - Component libraries
---

# React Component Implementation Plan Template

**Pattern**: React Component/Feature
**Typical Complexity**: 2-5/10
**Standard Planning Time**: 3-5 minutes (vs 13-15 min for full analysis)

## TASK OVERVIEW

**Summary**: Implement [COMPONENT_NAME] component

**Scope**:
- Component structure following Atomic Design
- Props interface and TypeScript types
- State management (if applicable)
- Event handlers and user interactions
- Styling (CSS modules or styled-components)
- Accessibility (ARIA labels, keyboard navigation)

**Success Criteria**:
- [ ] Component renders correctly with all props
- [ ] All user interactions work as expected
- [ ] Component is accessible (passes axe tests)
- [ ] Unit tests pass (> 80% coverage)
- [ ] Storybook stories created (if applicable)

## COMPLEXITY ASSESSMENT

**Score**: [AUTO_CALCULATED: 2-5/10]

**Breakdown**:
- Code Volume: 3/10 (~100-250 lines per component)
- Component Coupling: [2-4]/10 (depends on dependencies)
- Data Complexity: [2-4]/10 (depends on state management)
- Integration: 2/10 (standard React patterns)
- Business Logic: [2-5]/10 (depends on requirements)
- Testing: 5/10 (unit + accessibility tests)
- Risk Level: 2/10 (isolated component, low risk)

**Mode**: Standard (single-pass implementation)

## DEPENDENCIES

### Technical Dependencies
- ✅ React (already installed)
- ✅ TypeScript (already configured)
- [ADD_STATE_MANAGEMENT: e.g., Zustand, React Query, React Hook Form]
- [ADD_UI_LIBRARY: e.g., Radix UI, Headless UI]

### Component Dependencies
- [LIST_PARENT_COMPONENTS]
- [LIST_CHILD_COMPONENTS]
- [LIST_SHARED_COMPONENTS]

**Execution Order**:
1. Types and interfaces
2. Child components (atoms/molecules)
3. Parent component (organism/template)
4. State management integration
5. Styling
6. Tests

## RISK ASSESSMENT

### Technical Risks

**RISK-001: Props drilling beyond 2 levels**
- **Severity**: Medium
- **Likelihood**: Medium
- **Mitigation**:
  - Use React Context for shared state
  - Consider composition over props
  - Refactor to container/presentational pattern

**RISK-002: Accessibility violations**
- **Severity**: High
- **Likelihood**: Medium
- **Mitigation**:
  - Use semantic HTML elements
  - Add ARIA labels where needed
  - Test with vitest-axe
  - Ensure keyboard navigation works
  - Test with screen reader

**RISK-003: Performance issues (re-renders)**
- **Severity**: Medium
- **Likelihood**: Low
- **Mitigation**:
  - Use React.memo for expensive components
  - Optimize with useMemo/useCallback
  - Monitor renders with React DevTools

### Business Risks

**RISK-004: UX inconsistency**
- **Severity**: Medium
- **Likelihood**: Medium
- **Mitigation**:
  - Follow design system tokens
  - Reuse existing UI components
  - Get design review before implementation

### Operational Risks

**RISK-005: Breaking changes to parent components**
- **Severity**: Low
- **Likelihood**: Low
- **Mitigation**:
  - Use TypeScript for type safety
  - Add integration tests with parent components
  - Version component if part of shared library

## IMPLEMENTATION STEPS

### Step 1: Define Types and Interfaces [10 min]
**File**: `src/components/[path]/[ComponentName].types.ts`

**Actions**:
- Create props interface
- Define event handler types
- Export types for reuse

**Validation**:
- Types compile without errors
- All props documented with JSDoc

**Example**:
```typescript
// src/components/forms/LoginForm.types.ts
export interface LoginFormProps {
  onSubmit: (credentials: LoginCredentials) => Promise<void>;
  isLoading?: boolean;
  error?: string;
  className?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}
```

### Step 2: Create Component Structure [20 min]
**File**: `src/components/[path]/[ComponentName].tsx`

**Actions**:
- Implement component with TypeScript
- Add props destructuring
- Implement render logic
- Add JSDoc comments

**Validation**:
- Component renders without errors
- Props are properly typed

**Example**:
```typescript
// src/components/forms/LoginForm.tsx
import React from 'react';
import { LoginFormProps } from './LoginForm.types';

/**
 * LoginForm component for user authentication
 */
export function LoginForm({
  onSubmit,
  isLoading = false,
  error,
  className
}: LoginFormProps) {
  // Implementation
  return (
    <form className={className} onSubmit={handleSubmit}>
      {/* Form fields */}
    </form>
  );
}
```

### Step 3: Add State Management [15 min]
**Actions**:
- Add useState for local state
- Add useEffect for side effects
- Integrate with global state (if needed)
- Add form validation (React Hook Form or Zod)

**Validation**:
- State updates correctly
- No memory leaks (cleanup effects)

**Example**:
```typescript
const { register, handleSubmit, formState } = useForm<LoginCredentials>({
  resolver: zodResolver(LoginSchema),
});
```

### Step 4: Implement Event Handlers [15 min]
**Actions**:
- Add onClick, onChange, onSubmit handlers
- Add error handling
- Add loading states
- Add optimistic updates (if applicable)

**Validation**:
- Events trigger correctly
- Loading states work
- Errors are displayed

### Step 5: Add Styling [20 min]
**File**: `src/components/[path]/[ComponentName].module.css` or styled-component

**Actions**:
- Follow CSS property order (CLAUDE.md guidelines)
- Use design system tokens/variables
- Ensure responsive design (mobile-first)
- Add hover/focus/active states

**CSS Property Order**:
1. Positioning (position, top, z-index)
2. Display & Layout (display, flex, grid)
3. Box Model (width, margin, padding)
4. Typography (font-size, color)
5. Visual (background, border)
6. Transforms & Animations
7. Miscellaneous (cursor, opacity)

**Validation**:
- Component looks correct at all breakpoints
- Hover states work
- Design system tokens used

### Step 6: Add Accessibility [15 min]
**Actions**:
- Use semantic HTML (`<button>`, `<nav>`, `<form>`)
- Add ARIA labels for non-text elements
- Ensure keyboard navigation (Tab, Enter, Escape)
- Add focus indicators
- Test with vitest-axe

**Accessibility Checklist**:
- [ ] Semantic HTML used
- [ ] All interactive elements keyboard accessible
- [ ] Focus indicators visible
- [ ] ARIA labels for icons/images
- [ ] Color contrast meets WCAG AA
- [ ] Form fields have labels

**Validation**:
- axe tests pass (no violations)
- Can navigate with keyboard only

### Step 7: Write Tests [30 min]
**File**: `src/components/[path]/__tests__/[ComponentName].test.tsx`

**Test Cases**:
- **Rendering**:
  - Component renders with required props
  - Component renders correctly with optional props
  - Component handles missing optional props

- **User Interactions**:
  - Button clicks trigger handlers
  - Form submission works
  - Input changes update state
  - Error states display correctly

- **Accessibility**:
  - No axe violations
  - Keyboard navigation works
  - Screen reader labels correct

**Example**:
```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('should not have accessibility violations', async () => {
    const { container } = render(<LoginForm onSubmit={jest.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('should submit form with valid credentials', async () => {
    const onSubmit = jest.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });
});
```

**Validation**:
- All tests pass
- Coverage ≥ 80%

### Step 8: Create Storybook Stories [15 min] (Optional)
**File**: `src/components/[path]/[ComponentName].stories.tsx`

**Actions**:
- Add default story
- Add variants (loading, error, different states)
- Add interactive controls

**Validation**:
- Stories render correctly
- Controls work

## TESTING STRATEGY

### Unit Tests (Vitest + React Testing Library)
**Coverage Target**: 80%

**Test Scenarios**:
- Component renders with all prop combinations
- User interactions trigger correct handlers
- Loading states work
- Error states work
- Edge cases (empty data, null values)

### Accessibility Tests (vitest-axe)
**Coverage Target**: 100% (no violations)

**Test Scenarios**:
- No axe violations
- Keyboard navigation works
- Focus management correct
- ARIA labels present

### Visual Regression Tests (Optional - Playwright)
**Coverage Target**: Key states

**Test Scenarios**:
- Default state
- Loading state
- Error state
- Different breakpoints

## ROLLBACK STRATEGY

### Immediate Rollback (< 2 minutes)
1. Remove import of new component from parent
2. Restore previous component (if replacing)
3. Run build to verify

### Validation
- Application builds successfully
- No TypeScript errors
- Existing functionality works

## EFFORT ESTIMATE

**Total Estimated Time**: 2-3 hours

**Breakdown**:
- Types/interfaces: 10 min
- Component structure: 20 min
- State management: 15 min
- Event handlers: 15 min
- Styling: 20 min
- Accessibility: 15 min
- Tests: 30 min
- Storybook (optional): 15 min
- Buffer (testing, refinement): 20 min

**Confidence Level**: High (standard pattern, well-understood)

**Assumptions**:
- Design mockups available
- Component is isolated (low coupling)
- Standard React patterns
- No complex animations

---

## CUSTOMIZATION CHECKLIST

When using this template, replace the following placeholders:

- [ ] [COMPONENT_NAME] - Name of the component (e.g., "LoginForm", "UserCard")
- [ ] [path] - Component path based on Atomic Design (atoms/molecules/organisms/templates/pages)
- [ ] [ADD_STATE_MANAGEMENT] - Add state management library if needed
- [ ] [ADD_UI_LIBRARY] - Add UI library if used
- [ ] [LIST_PARENT_COMPONENTS] - List parent components
- [ ] [LIST_CHILD_COMPONENTS] - List child components
- [ ] Adjust complexity scores based on actual requirements
- [ ] Add/remove risks based on specific implementation
- [ ] Customize test scenarios for specific functionality
- [ ] Update time estimates based on team velocity

---

## PATTERN USAGE NOTES

**When to Use This Template**:
- ✅ Adding new React components
- ✅ Standard UI patterns (forms, cards, modals)
- ✅ Complexity score 2-5/10
- ✅ Isolated components

**When NOT to Use**:
- ❌ Complex state machines (use full planning)
- ❌ Heavy animations (different pattern)
- ❌ Real-time features (different pattern)
- ❌ Complexity > 6/10 (requires detailed analysis)

**Time Savings**: 8-10 minutes vs full planning process
