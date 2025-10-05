// SQL AST types

export type SelectStatement = {
  type: "SELECT";
  columns: ColumnExpression[];
  from: string;
  fromIndex?: string; // Index for the main table
  joins?: JoinClause[];
  where?: WhereClause;
  groupBy?: GroupByClause[];
  having?: WhereClause; // Same structure as WHERE but applied after grouping
  orderBy?: OrderByClause[];
  limit?: number;
};

export type JoinClause = {
  type: "INNER";
  table: string;
  index?: string; // Index for this joined table
  on: JoinCondition[]; // Support multiple equality conditions combined with AND
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
  | { type: "COLUMN"; table?: string; name: string; alias?: string }
  | {
      type: "FUNCTION";
      name: string;
      args: ColumnExpression[];
      alias?: string;
    };

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

export type GroupByClause = {
  table?: string;
  field: string;
};

export type Token = {
  type: string;
  value: string;
  position: number;
};
