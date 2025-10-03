// SQL AST types

export type SelectStatement = {
  type: "SELECT";
  columns: ColumnExpression[];
  from: string;
  where?: WhereClause;
  orderBy?: OrderByClause[];
  limit?: number;
};

export type ColumnExpression =
  | { type: "STAR" }
  | { type: "COLUMN"; name: string; alias?: string };

export type WhereClause = {
  type: "AND" | "OR" | "COMPARISON";
  left?: WhereClause;
  right?: WhereClause;
  operator?: "=" | "!=" | ">" | "<" | ">=" | "<=";
  field?: string;
  value?: string | number | boolean | null;
};

export type OrderByClause = {
  field: string;
  direction: "asc" | "desc";
};

export type Token = {
  type: string;
  value: string;
  position: number;
};
