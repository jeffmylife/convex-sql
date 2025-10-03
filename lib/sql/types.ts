// SQL AST types

export type SelectStatement = {
  type: "SELECT";
  columns: ColumnExpression[];
  from: string;
  joins?: JoinClause[];
  where?: WhereClause;
  orderBy?: OrderByClause[];
  limit?: number;
};

export type JoinClause = {
  type: "INNER";
  table: string;
  on: JoinCondition;
};

export type JoinCondition = {
  leftTable: string;
  leftField: string;
  operator: "=";
  rightTable: string;
  rightField: string;
};

export type ColumnExpression =
  | { type: "STAR" }
  | { type: "TABLE_STAR"; table: string }
  | { type: "COLUMN"; table?: string; name: string; alias?: string };

export type WhereClause = {
  type: "AND" | "OR" | "COMPARISON";
  left?: WhereClause;
  right?: WhereClause;
  operator?: "=" | "!=" | ">" | "<" | ">=" | "<=";
  table?: string;
  field?: string;
  value?: string | number | boolean | null;
};

export type OrderByClause = {
  table?: string;
  field: string;
  direction: "asc" | "desc";
};

export type Token = {
  type: string;
  value: string;
  position: number;
};
