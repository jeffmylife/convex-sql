import {
  Token,
  SelectStatement,
  ColumnExpression,
  WhereClause,
  OrderByClause,
  JoinClause,
  GroupByClause,
} from "./types";

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): SelectStatement {
    // Validate that the query is a SELECT statement (read-only)
    if (this.tokens.length === 0) {
      throw new Error("Empty SQL query");
    }

    const firstToken = this.tokens[0];
    if (
      firstToken.type !== "KEYWORD" ||
      !firstToken.value ||
      firstToken.value.trim() === ""
    ) {
      throw new Error(
        firstToken.value
          ? `Expected SQL command, got: ${firstToken.value}`
          : "Empty SQL query",
      );
    }

    const command = firstToken.value.toUpperCase();

    // Only SELECT is supported - reject all write operations
    const unsupportedCommands = [
      "INSERT",
      "UPDATE",
      "DELETE",
      "DROP",
      "CREATE",
      "ALTER",
      "TRUNCATE",
      "REPLACE",
      "MERGE",
      "GRANT",
      "REVOKE",
    ];

    if (unsupportedCommands.includes(command)) {
      throw new Error(
        `Write operations are not supported. '${command}' is a write operation. ` +
          `Only SELECT queries are allowed for safety.`,
      );
    }

    if (command !== "SELECT") {
      throw new Error(
        `Unsupported SQL command: '${command}'. Only SELECT queries are supported.`,
      );
    }

    return this.parseSelect();
  }

  private parseSelect(): SelectStatement {
    this.consume("KEYWORD", "SELECT");

    const columns = this.parseColumns();

    this.consume("KEYWORD", "FROM");
    const { table: from, index: fromIndex } = this.parseTableWithIndex();

    // Parse JOINs
    const joins: JoinClause[] = [];
    while (this.check("KEYWORD", "INNER")) {
      joins.push(this.parseJoin());
    }

    let where: WhereClause | undefined;
    if (this.check("KEYWORD", "WHERE")) {
      this.advance();
      where = this.parseWhere();
    }

    let groupBy: GroupByClause[] | undefined;
    if (this.check("KEYWORD", "GROUP")) {
      this.advance();
      this.consume("KEYWORD", "BY");
      groupBy = this.parseGroupBy();
    }

    let having: WhereClause | undefined;
    if (this.check("KEYWORD", "HAVING")) {
      this.advance();
      having = this.parseWhere(); // HAVING uses same structure as WHERE
    }

    let orderBy: OrderByClause[] | undefined;
    if (this.check("KEYWORD", "ORDER")) {
      this.advance();
      this.consume("KEYWORD", "BY");
      orderBy = this.parseOrderBy();
    }

    let limit: number | undefined;
    if (this.check("KEYWORD", "LIMIT")) {
      this.advance();
      const limitToken = this.consume("NUMBER");
      limit = parseInt(limitToken.value);
    }

    this.consume("EOF");

    return {
      type: "SELECT",
      columns,
      from,
      fromIndex,
      joins: joins.length > 0 ? joins : undefined,
      where,
      groupBy,
      having,
      orderBy,
      limit,
    };
  }

  private parseTableWithIndex(): { table: string; index?: string } {
    const table = this.consume("IDENTIFIER").value;
    let index: string | undefined;

    if (this.check("AT")) {
      this.advance(); // consume @
      index = this.consume("IDENTIFIER").value;
    }

    return { table, index };
  }

  private parseColumns(): ColumnExpression[] {
    const columns: ColumnExpression[] = [];

    if (this.check("STAR")) {
      this.advance();
      columns.push({ type: "STAR" });
      return columns;
    }

    do {
      const first = this.consume("IDENTIFIER").value;

      // Check for function call: identifier(
      if (this.check("LPAREN")) {
        this.advance(); // consume (
        const args = this.parseFunctionArgs();
        this.consume("RPAREN"); // consume )

        let alias: string | undefined;
        if (this.check("KEYWORD", "AS")) {
          this.advance();
          alias = this.consume("IDENTIFIER").value;
        }

        columns.push({
          type: "FUNCTION",
          name: first.toUpperCase(),
          args,
          alias,
        });
      }
      // Check for table.column or table.*
      else if (this.check("DOT")) {
        this.advance();

        if (this.check("STAR")) {
          this.advance();
          columns.push({ type: "TABLE_STAR", table: first });
        } else {
          const column = this.consume("IDENTIFIER").value;
          let alias: string | undefined;

          if (this.check("KEYWORD", "AS")) {
            this.advance();
            alias = this.consume("IDENTIFIER").value;
          }

          columns.push({ type: "COLUMN", table: first, name: column, alias });
        }
      } else {
        // Just a column name
        let alias: string | undefined;

        if (this.check("KEYWORD", "AS")) {
          this.advance();
          alias = this.consume("IDENTIFIER").value;
        }

        columns.push({ type: "COLUMN", name: first, alias });
      }
    } while (this.match("COMMA"));

    return columns;
  }

  private parseFunctionArgs(): ColumnExpression[] {
    const args: ColumnExpression[] = [];

    if (!this.check("RPAREN")) {
      // If not empty args
      do {
        if (this.check("STAR")) {
          this.advance();
          args.push({ type: "STAR" });
        } else {
          const first = this.consume("IDENTIFIER").value;

          if (this.check("DOT")) {
            this.advance();
            if (this.check("STAR")) {
              this.advance();
              args.push({ type: "TABLE_STAR", table: first });
            } else {
              const column = this.consume("IDENTIFIER").value;
              args.push({ type: "COLUMN", table: first, name: column });
            }
          } else {
            args.push({ type: "COLUMN", name: first });
          }
        }
      } while (this.match("COMMA"));
    }

    return args;
  }

  private parseJoin(): JoinClause {
    this.consume("KEYWORD", "INNER");
    this.consume("KEYWORD", "JOIN");

    const { table, index } = this.parseTableWithIndex();

    this.consume("KEYWORD", "ON");

    const conditions: Array<{
      leftTable: string;
      leftField: string;
      operator: "=";
      rightTable: string;
      rightField: string;
    }> = [];

    const parseJoinEquality = () => {
      const leftTable = this.consume("IDENTIFIER").value;
      this.consume("DOT");
      const leftField = this.consume("IDENTIFIER").value;

      const operator = this.consume("OPERATOR").value;
      if (operator !== "=") {
        throw new Error(`JOIN only supports '=' operator, got '${operator}'`);
      }

      const rightTable = this.consume("IDENTIFIER").value;
      this.consume("DOT");
      const rightField = this.consume("IDENTIFIER").value;

      conditions.push({
        leftTable,
        leftField,
        operator: "=",
        rightTable,
        rightField,
      });
    };

    // First equality
    parseJoinEquality();

    // Additional equalities chained with AND
    while (this.check("KEYWORD", "AND")) {
      this.advance();
      parseJoinEquality();
    }

    return {
      type: "INNER",
      table,
      index,
      on: conditions,
    };
  }

  private parseWhere(): WhereClause {
    return this.parseOrExpression();
  }

  private parseOrExpression(): WhereClause {
    let left = this.parseAndExpression();

    while (this.check("KEYWORD", "OR")) {
      this.advance();
      const right = this.parseAndExpression();
      left = { type: "OR", left, right };
    }

    return left;
  }

  private parseAndExpression(): WhereClause {
    let left = this.parseComparison();

    while (this.check("KEYWORD", "AND")) {
      this.advance();
      const right = this.parseComparison();
      left = { type: "AND", left, right };
    }

    return left;
  }

  private parseComparison(): WhereClause {
    const first = this.consume("IDENTIFIER").value;

    let table: string | undefined;
    let field: string;

    // Check for function call (e.g., COUNT(*), SUM(age))
    if (this.check("LPAREN")) {
      this.advance(); // consume (
      const args = this.parseFunctionArgs();
      this.consume("RPAREN"); // consume )

      // For HAVING clauses, we use the function call as the field name
      field = `${first}(${this.formatFunctionArgsForComparison(args)})`;
    }
    // Check for table.field syntax
    else if (this.check("DOT")) {
      this.advance();
      table = first;
      field = this.consume("IDENTIFIER").value;
    } else {
      field = first;
    }

    const operator = this.consume("OPERATOR").value as
      | "="
      | "!="
      | ">"
      | "<"
      | ">="
      | "<=";

    let value: string | number | boolean | null;

    if (this.check("STRING")) {
      value = this.advance().value;
    } else if (this.check("NUMBER")) {
      value = parseFloat(this.advance().value);
    } else if (this.check("IDENTIFIER")) {
      const id = this.advance().value;
      if (id.toLowerCase() === "true") value = true;
      else if (id.toLowerCase() === "false") value = false;
      else if (id.toLowerCase() === "null") value = null;
      else throw new Error(`Unexpected identifier in comparison: ${id}`);
    } else {
      throw new Error(
        `Expected value in comparison at position ${this.peek().position}`,
      );
    }

    return {
      type: "COMPARISON",
      table,
      field,
      operator,
      value,
    };
  }

  private formatFunctionArgsForComparison(args: ColumnExpression[]): string {
    return args
      .map((arg) => {
        switch (arg.type) {
          case "STAR":
            return "*";
          case "TABLE_STAR":
            return `${arg.table}.*`;
          case "COLUMN":
            return arg.table ? `${arg.table}.${arg.name}` : arg.name;
          case "FUNCTION":
            return `${arg.name}(${this.formatFunctionArgsForComparison(arg.args)})`;
          default:
            return "?";
        }
      })
      .join(", ");
  }

  private parseGroupBy(): GroupByClause[] {
    const groupBy: GroupByClause[] = [];

    do {
      const first = this.consume("IDENTIFIER").value;

      let table: string | undefined;
      let field: string;

      // Check for table.field syntax
      if (this.check("DOT")) {
        this.advance();
        table = first;
        field = this.consume("IDENTIFIER").value;
      } else {
        field = first;
      }

      groupBy.push({ table, field });
    } while (this.match("COMMA"));

    return groupBy;
  }

  private parseOrderBy(): OrderByClause[] {
    const orderBy: OrderByClause[] = [];

    do {
      const first = this.consume("IDENTIFIER").value;

      let table: string | undefined;
      let field: string;

      // Check for table.field syntax
      if (this.check("DOT")) {
        this.advance();
        table = first;
        field = this.consume("IDENTIFIER").value;
      } else {
        field = first;
      }

      let direction: "asc" | "desc" = "asc";

      if (this.check("KEYWORD", "ASC") || this.check("KEYWORD", "DESC")) {
        direction = this.advance().value.toLowerCase() as "asc" | "desc";
      }

      orderBy.push({ table, field, direction });
    } while (this.match("COMMA"));

    return orderBy;
  }

  private check(type: string, value?: string): boolean {
    const token = this.peek();
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    return true;
  }

  private match(type: string): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private consume(type: string, value?: string): Token {
    if (this.check(type, value)) return this.advance();

    const token = this.peek();
    throw new Error(
      `Expected ${type}${value ? ` '${value}'` : ""} but got ${token.type} '${token.value}' at position ${token.position}`,
    );
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === "EOF";
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }
}
