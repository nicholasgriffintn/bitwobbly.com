export interface R2SQLConfig {
  accountId: string;
  authToken: string;
}

export interface QueryResult<T = unknown> {
  result: {
    request_id: string;
    schema: Array<{
      name: string;
      descriptor: {
        type: {
          name: string;
        };
        nullable: boolean;
      };
    }>;
    rows: T[];
    metrics: {
      r2_requests_count: number;
      files_scanned: number;
      bytes_scanned: number;
    };
  };
  success: boolean;
  errors: Array<{
    code: number;
    message: string;
  }>;
  messages: Array<{
    code: string;
    message: string;
  }>;
}

export async function executeR2SQL<T = unknown>(
  config: R2SQLConfig,
  bucketName: string,
  query: string,
): Promise<QueryResult<T>> {
  const url = `https://api.sql.cloudflarestorage.com/api/v1/accounts/${config.accountId}/r2-sql/query/${bucketName}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`R2 SQL query failed: ${error}`);
  }

  return response.json();
}
