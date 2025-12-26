# Design Guidelines: Accessibility HTML Repair Tool

## Design Approach
**System-Based Approach**: Developer tool aesthetic inspired by VS Code, GitHub, and Linear
- Rationale: Utility-focused application prioritizing code readability, diff clarity, and functional density
- Key principles: Clarity over decoration, consistent information hierarchy, professional developer UX

## Typography
- **Primary Font**: `'Inter', system-ui, sans-serif`
- **Code Font**: `'JetBrains Mono', 'Fira Code', monospace`
- **Hierarchy**:
  - Tool title/headers: `text-xl font-semibold` (20px)
  - Section labels: `text-sm font-medium uppercase tracking-wide` (14px)
  - Code editor: `text-sm` (14px, monospace)
  - Report items: `text-base` (16px)
  - Helper text: `text-sm text-gray-600`

## Layout System
**Spacing Units**: Tailwind 2, 4, 6, 8, 12, 16 (p-2, p-4, p-6, etc.)

**Main Layout Structure**:
```
Header: h-16 with px-6 py-4
Toolbar: h-14 with gap-3 for buttons
Code Panels: Split 50/50, min-h-[500px]
Report Section: mt-8 with p-6
```

**Grid System**:
- Container: `max-w-[1600px] mx-auto px-6`
- Code panels: `grid grid-cols-2 gap-4`
- Report cards: `space-y-3`

## Component Library

### Header & Toolbar
- Toolbar buttons: `px-4 py-2 rounded-md text-sm font-medium` with icon + text
- Primary action: Filled button style
- Secondary actions: Outlined button style
- Action group spacing: `gap-3`

### Code Editor Panels
**Left Panel (Original)**:
- Header: "Original Input" with `bg-red-50 border-l-4 border-red-500`
- Problem highlighting: `bg-red-100 border-red-400` for inline issues
- Line numbers: `text-gray-400 select-none w-12`
- Readonly state: Subtle gray background `bg-gray-50`

**Right Panel (Repaired)**:
- Header: "Repaired Output" with `bg-green-50 border-l-4 border-green-500`
- Fix highlighting: `bg-green-100 border-green-400`
- Needs review: `bg-yellow-100 border-yellow-400`
- Copy button: Top-right corner

**Shared Panel Styles**:
- Border: `border border-gray-300 rounded-lg`
- Padding: `p-6`
- Code blocks: `font-mono text-sm leading-relaxed`

### Report Section
**Report Container**:
- Background: `bg-white border border-gray-200 rounded-lg`
- Padding: `p-6`
- Shadow: `shadow-sm`

**Report Items**:
- Success items: `border-l-4 border-green-500 bg-green-50 p-4 rounded-r-md`
- Warning items: `border-l-4 border-yellow-500 bg-yellow-50 p-4 rounded-r-md`
- Info items: `border-l-4 border-blue-500 bg-blue-50 p-4 rounded-r-md`

**Report Typography**:
- Rule ID: `font-mono text-xs bg-gray-100 px-2 py-1 rounded`
- Count badges: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium`
- Issue descriptions: `text-sm leading-relaxed`

### Icons
**Library**: Heroicons (via CDN)
- Toolbar: 20px icons (h-5 w-5)
- Report status: 16px icons (h-4 w-4)
- Inline indicators: 14px icons (h-3.5 w-3.5)

### Status Indicators
- Fixed: Green checkmark icon
- Warning: Yellow alert triangle
- Manual review needed: Orange info icon
- Error: Red X icon

## Interaction Patterns

### Diff Visualization
- Hover on changed lines: Subtle background change `hover:bg-gray-100`
- Tooltip on hover: Shows rule explanation
- Click to highlight corresponding report item

### Code Highlighting
- Syntax highlighting: Use Prism.js or similar
- Problem zones: Wavy underline + background tint
- Fixed zones: Solid left border accent

### Report Interactions
- Expandable sections: Chevron icon, smooth height transition
- Click report item → scroll and highlight corresponding code
- Copy code snippet button per issue

## Accessibility Implementation
- High contrast for all diff indicators
- Keyboard navigation: Tab through panels, arrows in code
- Screen reader announcements for auto-fixes
- Focus indicators: `ring-2 ring-blue-500 ring-offset-2`
- ARIA labels on all toolbar buttons

## Visual Density
- Compact mode by default (developer preference)
- Line height in code: `leading-relaxed` (1.625)
- Comfortable whitespace between report items: `space-y-3`
- Panel headers: Clear separation with `border-b pb-3 mb-4`

## No Images Required
This is a pure utility application - no hero images or decorative graphics needed. Focus entirely on functional clarity and code presentation.