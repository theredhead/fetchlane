# FetchRequest Examples

This guide shows practical `FetchRequest` payloads for `POST /api/data-access/fetch`, starting with basic reads and building toward more realistic filtered and grouped queries.

## Endpoint

```http
POST /api/data-access/fetch
Content-Type: application/json
```

## Request shape

```json
{
  "table": "member",
  "predicates": [],
  "sort": [],
  "pagination": {
    "size": 25,
    "index": 0
  }
}
```

Field overview:

- `table`: source table to query
- `predicates`: ordered list of filter clauses
- `sort`: ordered list of sort clauses
- `pagination.size`: page size
- `pagination.index`: zero-based page number

## Placeholder note

Predicate `text` is passed through to the active connector, so placeholder syntax should match what your engine expects.

Examples in this guide mostly use `?` because it is easy to read and already used in the test suite. If your connector expects numbered placeholders such as `$1`, write the predicate text accordingly.

## 1. Read the first page of a table

Use this when you just want a simple, paginated table browse.

```json
{
  "table": "customers",
  "predicates": [],
  "sort": [
    {
      "column": "id",
      "direction": "ASC"
    }
  ],
  "pagination": {
    "size": 25,
    "index": 0
  }
}
```

## 2. Find active customers in alphabetical order

This is a common CRM-style query.

```json
{
  "table": "customers",
  "predicates": [
    {
      "text": "is_active = ?",
      "args": [true]
    }
  ],
  "sort": [
    {
      "column": "last_name",
      "direction": "ASC"
    },
    {
      "column": "first_name",
      "direction": "ASC"
    }
  ],
  "pagination": {
    "size": 50,
    "index": 0
  }
}
```

## 3. Show recent orders for a single customer

Useful for account detail pages or customer service tooling.

```json
{
  "table": "orders",
  "predicates": [
    {
      "text": "customer_id = ?",
      "args": [1042]
    }
  ],
  "sort": [
    {
      "column": "created_at",
      "direction": "DESC"
    }
  ],
  "pagination": {
    "size": 20,
    "index": 0
  }
}
```

## 4. Search overdue invoices with multiple conditions

This is still straightforward, but now the filter combines several independent conditions.

```json
{
  "table": "invoices",
  "predicates": [
    {
      "text": "status = ?",
      "args": ["open"]
    },
    {
      "text": "due_date < ?",
      "args": ["2026-04-01"]
    },
    {
      "text": "balance_due > ?",
      "args": [0]
    }
  ],
  "sort": [
    {
      "column": "due_date",
      "direction": "ASC"
    }
  ],
  "pagination": {
    "size": 100,
    "index": 0
  }
}
```

Because top-level predicates are joined with `AND`, the query above reads like:

```text
status = 'open'
AND due_date < '2026-04-01'
AND balance_due > 0
```

## 5. Match either city or postal code

This is the first example using a grouped `OR`.

```json
{
  "table": "addresses",
  "predicates": [
    {
      "type": "OR",
      "predicates": [
        {
          "text": "city = ?",
          "args": ["Enschede"]
        },
        {
          "text": "postal_code = ?",
          "args": ["7511AA"]
        }
      ]
    }
  ],
  "sort": [
    {
      "column": "street_name",
      "direction": "ASC"
    }
  ],
  "pagination": {
    "size": 25,
    "index": 0
  }
}
```

## 6. Product catalog search with grouped filters

This is a more realistic e-commerce example: only active products, in stock, and in one of several categories.

```json
{
  "table": "products",
  "predicates": [
    {
      "text": "is_active = ?",
      "args": [true]
    },
    {
      "text": "stock_quantity > ?",
      "args": [0]
    },
    {
      "type": "OR",
      "predicates": [
        {
          "text": "category = ?",
          "args": ["electronics"]
        },
        {
          "text": "category = ?",
          "args": ["accessories"]
        },
        {
          "text": "category = ?",
          "args": ["wearables"]
        }
      ]
    }
  ],
  "sort": [
    {
      "column": "popularity_score",
      "direction": "DESC"
    },
    {
      "column": "name",
      "direction": "ASC"
    }
  ],
  "pagination": {
    "size": 24,
    "index": 0
  }
}
```

## 7. Support queue with nested business logic

This is where grouped predicates start paying off. Imagine a support dashboard that wants:

- only open tickets
- high priority tickets
- and either unassigned tickets or tickets assigned to a specific team

```json
{
  "table": "support_tickets",
  "predicates": [
    {
      "text": "status = ?",
      "args": ["open"]
    },
    {
      "text": "priority IN (?, ?)",
      "args": ["high", "urgent"]
    },
    {
      "type": "OR",
      "predicates": [
        {
          "text": "assigned_to IS NULL",
          "args": []
        },
        {
          "text": "team_id = ?",
          "args": [7]
        }
      ]
    }
  ],
  "sort": [
    {
      "column": "priority",
      "direction": "DESC"
    },
    {
      "column": "created_at",
      "direction": "ASC"
    }
  ],
  "pagination": {
    "size": 50,
    "index": 0
  }
}
```

## 8. Analytics-style slice for a dashboard

This example is still row-oriented, but it shows the kind of richer filtering you might drive from a dashboard UI.

```json
{
  "table": "events",
  "predicates": [
    {
      "text": "created_at >= ?",
      "args": ["2026-03-01T00:00:00Z"]
    },
    {
      "text": "created_at < ?",
      "args": ["2026-04-01T00:00:00Z"]
    },
    {
      "type": "OR",
      "predicates": [
        {
          "text": "event_type = ?",
          "args": ["signup"]
        },
        {
          "text": "event_type = ?",
          "args": ["purchase"]
        },
        {
          "text": "event_type = ?",
          "args": ["upgrade"]
        }
      ]
    },
    {
      "text": "environment = ?",
      "args": ["production"]
    }
  ],
  "sort": [
    {
      "column": "created_at",
      "direction": "DESC"
    }
  ],
  "pagination": {
    "size": 200,
    "index": 0
  }
}
```

## Tips

- Always provide a deterministic `sort` when using pagination.
- Keep top-level predicates simple, then use grouped `OR` or `AND` blocks when the logic becomes more complex.
- Prefer parameterized predicate text plus `args` instead of string interpolation.
- Treat `pagination.index` as zero-based.
- Use Swagger UI at `http://localhost:3000/api/docs` to test payloads interactively against your running instance.

## Related docs

- [Project README](../README.md)
- [TypeDoc API](./api/index.html)
