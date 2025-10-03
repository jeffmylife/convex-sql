import { Token, SelectStatement, ColumnExpression, WhereClause, OrderByClause } from "./types";

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): SelectStatement {
    return this.parseSelect();
  }

  private parseSelect(): SelectStatement {
    this.consume("KEYWORD", "SELECT");

    const columns = this.parseColumns();

    this.consume("KEYWORD", "FROM");
    const from = this.consume("IDENTIFIER").value;

    let where: WhereClause | undefined;
    if (this.check("KEYWORD", "WHERE")) {
      this.advance();
      where = this.parseWhere();
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
      where,
      orderBy,
      limit,
    };
  }

  private parseColumns(): ColumnExpression[] {
    const columns: ColumnExpression[] = [];

    if (this.check("STAR")) {
      this.advance();
      columns.push({ type: "STAR" });
      return columns;
    }

    do {
      const column = this.consume("IDENTIFIER").value;
      let alias: string | undefined;

      if (this.check("KEYWORD", "AS")) {
        this.advance();
        alias = this.consume("IDENTIFIER").value;
      }

      columns.push({ type: "COLUMN", name: column, alias });
    } while (this.match("COMMA"));

    return columns;
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
    const field = this.consume("IDENTIFIER").value;
    const operator = this.consume("OPERATOR").value as "=" | "!=" | ">" | "<" | ">=" | "<=";

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
      throw new Error(`Expected value in comparison at position ${this.peek().position}`);
    }

    return {
      type: "COMPARISON",
      field,
      operator,
      value,
    };
  }

  private parseOrderBy(): OrderByClause[] {
    const orderBy: OrderByClause[] = [];

    do {
      const field = this.consume("IDENTIFIER").value;
      let direction: "asc" | "desc" = "asc";

      if (this.check("KEYWORD", "ASC") || this.check("KEYWORD", "DESC")) {
        direction = this.advance().value.toLowerCase() as "asc" | "desc";
      }

      orderBy.push({ field, direction });
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
      `Expected ${type}${value ? ` '${value}'` : ""} but got ${token.type} '${token.value}' at position ${token.position}`
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
