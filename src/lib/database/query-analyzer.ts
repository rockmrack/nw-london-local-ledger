/**
 * SQL Query Analyzer
 * Intelligently analyzes SQL queries to determine routing and optimization strategies
 */

export enum QueryType {
  SELECT = 'SELECT',
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  DDL = 'DDL',
  TRANSACTION = 'TRANSACTION',
  OTHER = 'OTHER'
}

export enum ConsistencyLevel {
  EVENTUAL = 'EVENTUAL',      // Can read from any replica
  BOUNDED = 'BOUNDED',         // Read from replica with lag < threshold
  STRONG = 'STRONG',           // Must read from primary
  READ_YOUR_WRITES = 'READ_YOUR_WRITES' // Session-based consistency
}

export interface QueryAnalysis {
  type: QueryType;
  isWrite: boolean;
  isTransaction: boolean;
  requiresPrimary: boolean;
  tables: string[];
  consistencyLevel: ConsistencyLevel;
  estimatedCost: number;
  canBeCached: boolean;
  cacheKey?: string;
  preparedStatementName?: string;
  hasForUpdate: boolean;
  hasReturning: boolean;
  isHotQuery: boolean;
}

export class QueryAnalyzer {
  private static readonly WRITE_PATTERNS = [
    /^\s*(INSERT|UPDATE|DELETE|MERGE|COPY)\s+/i,
    /^\s*WITH\s+.*\s+(INSERT|UPDATE|DELETE)\s+/i,
    /^\s*(CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\s+/i,
    /^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\s*/i,
    /^\s*SET\s+(TRANSACTION|SESSION|LOCAL)\s+/i,
    /^\s*LOCK\s+TABLE/i,
    /^\s*VACUUM\s+/i,
    /^\s*ANALYZE\s+/i,
    /^\s*REINDEX\s+/i,
    /^\s*CLUSTER\s+/i,
    /^\s*REFRESH\s+MATERIALIZED\s+VIEW/i
  ];

  private static readonly DDL_PATTERNS = [
    /^\s*(CREATE|ALTER|DROP)\s+(TABLE|INDEX|VIEW|SCHEMA|DATABASE|SEQUENCE|FUNCTION|PROCEDURE|TRIGGER|TYPE|DOMAIN|EXTENSION)/i,
    /^\s*TRUNCATE\s+/i
  ];

  private static readonly TRANSACTION_PATTERNS = [
    /^\s*(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/i,
    /^\s*SET\s+TRANSACTION/i
  ];

  private static readonly FOR_UPDATE_PATTERN = /FOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)/i;
  private static readonly RETURNING_PATTERN = /RETURNING\s+/i;

  private static readonly HOT_QUERY_PATTERNS = [
    // Common hot queries that should be optimized
    /^\s*SELECT\s+\*\s+FROM\s+properties\s+WHERE\s+id\s*=/i,
    /^\s*SELECT\s+.*\s+FROM\s+properties\s+.*\s+LIMIT\s+/i,
    /^\s*SELECT\s+.*\s+FROM\s+councils\s+/i,
    /^\s*SELECT\s+COUNT\(\*\)\s+FROM\s+/i,
    /^\s*SELECT\s+.*\s+FROM\s+search_index\s+/i,
    /^\s*SELECT\s+.*\s+FROM\s+cache_entries\s+/i
  ];

  private static readonly TABLE_EXTRACTION_PATTERNS = [
    /FROM\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*)*)/gi,
    /JOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    /INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    /UPDATE\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    /DELETE\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    /INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    /TRUNCATE\s+(?:TABLE\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    /(?:CREATE|ALTER|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/gi
  ];

  private preparedStatements: Map<string, string> = new Map();
  private queryStats: Map<string, { count: number; totalTime: number; avgTime: number }> = new Map();

  constructor() {
    this.initializePreparedStatements();
  }

  private initializePreparedStatements(): void {
    // High-frequency queries that benefit from preparation
    this.preparedStatements.set(
      'getPropertyById',
      'SELECT * FROM properties WHERE id = $1'
    );
    this.preparedStatements.set(
      'getPropertiesByCouncil',
      'SELECT * FROM properties WHERE council_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3'
    );
    this.preparedStatements.set(
      'searchProperties',
      `SELECT p.*, c.name as council_name,
              ts_rank(p.search_vector, plainto_tsquery($1)) as rank
       FROM properties p
       JOIN councils c ON p.council_id = c.id
       WHERE p.search_vector @@ plainto_tsquery($1)
       ORDER BY rank DESC
       LIMIT $2 OFFSET $3`
    );
    this.preparedStatements.set(
      'updatePropertyViews',
      'UPDATE properties SET views = views + 1, last_viewed = NOW() WHERE id = $1'
    );
    this.preparedStatements.set(
      'getRecentProperties',
      'SELECT * FROM properties ORDER BY created_at DESC LIMIT $1'
    );
    this.preparedStatements.set(
      'getPropertyStats',
      'SELECT COUNT(*) as total, AVG(price) as avg_price, MIN(price) as min_price, MAX(price) as max_price FROM properties WHERE council_id = $1'
    );
  }

  /**
   * Analyze a SQL query to determine routing and optimization strategies
   */
  public analyze(sql: string, params?: any[], context?: { sessionId?: string; userId?: string }): QueryAnalysis {
    const normalizedSql = this.normalizeQuery(sql);

    const type = this.detectQueryType(normalizedSql);
    const isWrite = this.isWriteQuery(normalizedSql);
    const isTransaction = this.isTransactionQuery(normalizedSql);
    const hasForUpdate = QueryAnalyzer.FOR_UPDATE_PATTERN.test(normalizedSql);
    const hasReturning = QueryAnalyzer.RETURNING_PATTERN.test(normalizedSql);
    const tables = this.extractTables(normalizedSql);
    const isHotQuery = this.isHotQuery(normalizedSql);

    // Determine if query requires primary
    const requiresPrimary = isWrite || isTransaction || hasForUpdate || hasReturning;

    // Determine consistency level
    const consistencyLevel = this.determineConsistencyLevel(
      normalizedSql,
      requiresPrimary,
      context
    );

    // Check if query can be cached
    const canBeCached = this.canQueryBeCached(type, tables, requiresPrimary);

    // Find matching prepared statement
    const preparedStatementName = this.findPreparedStatement(normalizedSql);

    // Estimate query cost (simplified heuristic)
    const estimatedCost = this.estimateQueryCost(normalizedSql, tables);

    // Generate cache key if applicable
    const cacheKey = canBeCached ? this.generateCacheKey(normalizedSql, params) : undefined;

    // Update query statistics
    this.updateQueryStats(normalizedSql);

    return {
      type,
      isWrite,
      isTransaction,
      requiresPrimary,
      tables,
      consistencyLevel,
      estimatedCost,
      canBeCached,
      cacheKey,
      preparedStatementName,
      hasForUpdate,
      hasReturning,
      isHotQuery
    };
  }

  private normalizeQuery(sql: string): string {
    return sql
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .replace(/\n/g, ' ')            // Remove newlines
      .replace(/\s*,\s*/g, ', ')      // Normalize commas
      .replace(/\s*\(\s*/g, ' (')     // Normalize parentheses
      .replace(/\s*\)\s*/g, ') ')
      .trim();
  }

  private detectQueryType(sql: string): QueryType {
    if (/^\s*SELECT/i.test(sql)) return QueryType.SELECT;
    if (/^\s*INSERT/i.test(sql)) return QueryType.INSERT;
    if (/^\s*UPDATE/i.test(sql)) return QueryType.UPDATE;
    if (/^\s*DELETE/i.test(sql)) return QueryType.DELETE;
    if (QueryAnalyzer.DDL_PATTERNS.some(pattern => pattern.test(sql))) return QueryType.DDL;
    if (QueryAnalyzer.TRANSACTION_PATTERNS.some(pattern => pattern.test(sql))) return QueryType.TRANSACTION;
    return QueryType.OTHER;
  }

  private isWriteQuery(sql: string): boolean {
    return QueryAnalyzer.WRITE_PATTERNS.some(pattern => pattern.test(sql));
  }

  private isTransactionQuery(sql: string): boolean {
    return QueryAnalyzer.TRANSACTION_PATTERNS.some(pattern => pattern.test(sql));
  }

  private isHotQuery(sql: string): boolean {
    return QueryAnalyzer.HOT_QUERY_PATTERNS.some(pattern => pattern.test(sql));
  }

  private extractTables(sql: string): string[] {
    const tables = new Set<string>();

    for (const pattern of QueryAnalyzer.TABLE_EXTRACTION_PATTERNS) {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);

      while ((match = regex.exec(sql)) !== null) {
        if (match[1]) {
          // Handle comma-separated tables
          const tableList = match[1].split(',').map(t => t.trim());
          tableList.forEach(table => {
            // Remove schema prefix if present
            const tableName = table.includes('.') ? table.split('.')[1] : table;
            if (tableName && !this.isKeyword(tableName)) {
              tables.add(tableName.toLowerCase());
            }
          });
        }
      }
    }

    return Array.from(tables);
  }

  private isKeyword(word: string): boolean {
    const keywords = [
      'select', 'from', 'where', 'join', 'left', 'right', 'inner', 'outer',
      'on', 'and', 'or', 'not', 'in', 'exists', 'between', 'like', 'limit',
      'offset', 'order', 'by', 'group', 'having', 'union', 'all', 'distinct'
    ];
    return keywords.includes(word.toLowerCase());
  }

  private determineConsistencyLevel(
    sql: string,
    requiresPrimary: boolean,
    context?: { sessionId?: string; userId?: string }
  ): ConsistencyLevel {
    // Strong consistency required for writes and transactions
    if (requiresPrimary) {
      return ConsistencyLevel.STRONG;
    }

    // Check for explicit consistency hints in query comments
    if (/\/\*\s*consistency:\s*strong\s*\*\//i.test(sql)) {
      return ConsistencyLevel.STRONG;
    }
    if (/\/\*\s*consistency:\s*bounded\s*\*\//i.test(sql)) {
      return ConsistencyLevel.BOUNDED;
    }
    if (/\/\*\s*consistency:\s*eventual\s*\*\//i.test(sql)) {
      return ConsistencyLevel.EVENTUAL;
    }

    // Read-your-writes consistency for user sessions
    if (context?.sessionId || context?.userId) {
      return ConsistencyLevel.READ_YOUR_WRITES;
    }

    // Default to eventual consistency for reads
    return ConsistencyLevel.EVENTUAL;
  }

  private canQueryBeCached(type: QueryType, tables: string[], requiresPrimary: boolean): boolean {
    // Don't cache write queries or queries requiring primary
    if (requiresPrimary || type !== QueryType.SELECT) {
      return false;
    }

    // Don't cache queries on frequently updated tables
    const volatileTables = ['sessions', 'user_activity', 'real_time_stats', 'logs'];
    if (tables.some(table => volatileTables.includes(table))) {
      return false;
    }

    // Cache queries on relatively stable tables
    const stableTables = ['properties', 'councils', 'amenities', 'transport_stops'];
    if (tables.some(table => stableTables.includes(table))) {
      return true;
    }

    return false;
  }

  private estimateQueryCost(sql: string, tables: string[]): number {
    let cost = 1;

    // Increase cost for joins
    const joinCount = (sql.match(/JOIN/gi) || []).length;
    cost += joinCount * 2;

    // Increase cost for subqueries
    const subqueryCount = (sql.match(/SELECT.*FROM.*SELECT/gi) || []).length;
    cost += subqueryCount * 3;

    // Increase cost for aggregations
    if (/GROUP BY|HAVING|COUNT\(|SUM\(|AVG\(|MIN\(|MAX\(/i.test(sql)) {
      cost += 2;
    }

    // Increase cost for full table scans (no WHERE clause)
    if (/SELECT.*FROM/i.test(sql) && !/WHERE/i.test(sql)) {
      cost += 3;
    }

    // Increase cost based on number of tables
    cost += tables.length;

    return cost;
  }

  private findPreparedStatement(sql: string): string | undefined {
    const normalizedSql = sql.replace(/\$\d+/g, '$N').replace(/\s+/g, ' ').trim();

    for (const [name, template] of this.preparedStatements) {
      const normalizedTemplate = template.replace(/\$\d+/g, '$N').replace(/\s+/g, ' ').trim();
      if (normalizedSql === normalizedTemplate) {
        return name;
      }
    }

    return undefined;
  }

  private generateCacheKey(sql: string, params?: any[]): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');

    hash.update(sql);
    if (params && params.length > 0) {
      hash.update(JSON.stringify(params));
    }

    return `query:${hash.digest('hex').substring(0, 16)}`;
  }

  private updateQueryStats(sql: string): void {
    const key = sql.substring(0, 100); // Use first 100 chars as key
    const stats = this.queryStats.get(key) || { count: 0, totalTime: 0, avgTime: 0 };

    stats.count++;
    this.queryStats.set(key, stats);

    // Clean up old stats if map gets too large
    if (this.queryStats.size > 1000) {
      const entries = Array.from(this.queryStats.entries());
      entries.sort((a, b) => b[1].count - a[1].count);

      // Keep top 500 most frequent queries
      this.queryStats = new Map(entries.slice(0, 500));
    }
  }

  /**
   * Get statistics about query patterns
   */
  public getQueryStats(): Map<string, { count: number; totalTime: number; avgTime: number }> {
    return new Map(this.queryStats);
  }

  /**
   * Register a custom prepared statement
   */
  public registerPreparedStatement(name: string, sql: string): void {
    this.preparedStatements.set(name, sql);
  }

  /**
   * Check if a query matches a prepared statement
   */
  public matchesPreparedStatement(sql: string): boolean {
    return this.findPreparedStatement(sql) !== undefined;
  }
}

// Export singleton instance
export const queryAnalyzer = new QueryAnalyzer();