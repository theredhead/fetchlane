```typescript
export interface SelectOption {
  value: string;
  label?: string;
}
// ---------------------------------------------------------------------------
// Field types
// ---------------------------------------------------------------------------

/** Supported data types for filterable fields. */
export type FilterFieldType = 'string' | 'number' | 'date';

/**
 * Describes a single filterable field.
 *
 * @typeParam T - The row object type so `key` is constrained.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface FilterFieldDefinition<T = any> {
  /** Property key on the row object. */
  key: keyof T & string;
  /** Human-readable label shown in the field dropdown. */
  label: string;
  /** Data type — determines which operators are available. */
  type: FilterFieldType;
}

/**
 * Sentinel key used for the "Any field" option.
 *
 * When a filter rule uses this key, the comparison is performed
 * as a case-insensitive string against *every* field value on the
 * row. At least one field must match for the rule to pass.
 */
export const ANY_FIELD_KEY = '__any__';

/**
 * The display mode of the filter component.
 *
 * - `simple` — a single search textbox backed by "Any field contains" logic.
 * - `advanced` — the full multi-rule predicate builder.
 */
export type FilterMode = 'simple' | 'advanced';

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

/** Comparison operators for `string` fields. */
export type StringOperator =
  | 'contains'
  | 'notContains'
  | 'equals'
  | 'notEquals'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty';

/** Comparison operators for `number` fields. */
export type NumberOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'between'
  | 'isEmpty'
  | 'isNotEmpty';

/** Comparison operators for `date` fields. */
export type DateOperator =
  | 'equals'
  | 'before'
  | 'after'
  | 'between'
  | 'inTheLast'
  | 'isEmpty'
  | 'isNotEmpty';

/** Union of every operator across all field types. */
export type FilterOperator = StringOperator | NumberOperator | DateOperator;

/** Time unit used with the `inTheLast` date operator. */
export type DateUnit = 'days' | 'weeks' | 'months' | 'years';

/** Operators that require no value input. */
export type NoValueOperator = 'isEmpty' | 'isNotEmpty';

// ---------------------------------------------------------------------------
// Rule & Descriptor
// ---------------------------------------------------------------------------

/**
 * A single filter rule — one row in the predicate builder.
 */
export interface FilterRule {
  /** Unique id for `@for` tracking. */
  id: number;
  /** The field key to filter on. */
  field: string;
  /** The comparison operator. */
  operator: FilterOperator;
  /** Primary comparison value (string-encoded for form compatibility). */
  value: string;
  /** Secondary value — used by `between` operators. */
  valueTo?: string;
  /** Time unit — used by `inTheLast` date operator. */
  unit?: DateUnit;
}

/** How multiple rules are combined. */
export type FilterJunction = 'and' | 'or';

/**
 * The complete, serialisable state of a filter predicate builder.
 *
 * @typeParam T - The row object type (for documentation; not enforced at runtime).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface FilterDescriptor<_T = any> {
  /** How the rules are combined (`and` = all must match, `or` = any). */
  junction: FilterJunction;
  /** The individual filter rules. */
  rules: FilterRule[];
}

// ---------------------------------------------------------------------------
// Operator option maps
// ---------------------------------------------------------------------------

/** Human-readable labels for every operator, grouped by field type. */
export const STRING_OPERATORS: SelectOption[] = [
  { value: 'contains', label: 'contains' },
  { value: 'notContains', label: 'does not contain' },
  { value: 'equals', label: 'equals' },
  { value: 'notEquals', label: 'does not equal' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'isEmpty', label: 'is empty' },
  { value: 'isNotEmpty', label: 'is not empty' },
];

export const NUMBER_OPERATORS: SelectOption[] = [
  { value: 'equals', label: '=' },
  { value: 'notEquals', label: '≠' },
  { value: 'greaterThan', label: '>' },
  { value: 'greaterThanOrEqual', label: '≥' },
  { value: 'lessThan', label: '<' },
  { value: 'lessThanOrEqual', label: '≤' },
  { value: 'between', label: 'between' },
  { value: 'isEmpty', label: 'is empty' },
  { value: 'isNotEmpty', label: 'is not empty' },
];

export const DATE_OPERATORS: SelectOption[] = [
  { value: 'equals', label: 'is on' },
  { value: 'before', label: 'is before' },
  { value: 'after', label: 'is after' },
  { value: 'between', label: 'is between' },
  { value: 'inTheLast', label: 'in the last' },
  { value: 'isEmpty', label: 'is empty' },
  { value: 'isNotEmpty', label: 'is not empty' },
];

export const DATE_UNIT_OPTIONS: SelectOption[] = [
  { value: 'days', label: 'days' },
  { value: 'weeks', label: 'weeks' },
  { value: 'months', label: 'months' },
  { value: 'years', label: 'years' },
];

/** Returns the operator options appropriate for a given field type. */
export function operatorsForType(type: FilterFieldType): SelectOption[] {
  switch (type) {
    case 'string':
      return STRING_OPERATORS;
    case 'number':
      return NUMBER_OPERATORS;
    case 'date':
      return DATE_OPERATORS;
  }
}

/** Operators that take no value input. */
const NO_VALUE_OPERATORS: ReadonlySet<string> = new Set<NoValueOperator>([
  'isEmpty',
  'isNotEmpty',
]);

/** Returns `true` when the operator needs no value input at all. */
export function isNoValueOperator(op: string): boolean {
  return NO_VALUE_OPERATORS.has(op);
}
```
