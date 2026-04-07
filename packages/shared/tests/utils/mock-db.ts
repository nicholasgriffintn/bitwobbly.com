type SelectRows = unknown[];

export type MockUpdateResult = {
  meta?: {
    changes?: number;
  };
};

export type MockDb = {
  inserts: Array<{ table: unknown; value: unknown }>;
  updates: Array<{ table: unknown; value: unknown }>;
  select: (_fields?: unknown) => {
    from: (_table: unknown) => unknown;
    then: (
      onFulfilled?: ((value: SelectRows) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null
    ) => Promise<unknown>;
  };
  insert: (table: unknown) => { values: (value: unknown) => Promise<void> };
  update: (table: unknown) => {
    set: (
      value: unknown
    ) => { where: (_clause: unknown) => Promise<MockUpdateResult> };
  };
};

export function createMockDb(
  selectQueue: SelectRows[],
  updateQueue: MockUpdateResult[] = []
): MockDb {
  const selects = [...selectQueue];
  const updatesQueue = [...updateQueue];
  const inserts: Array<{ table: unknown; value: unknown }> = [];
  const updates: Array<{ table: unknown; value: unknown }> = [];

  const nextSelect = (): SelectRows => {
    const rows = selects.shift();
    if (!rows) throw new Error("Missing scripted select response");
    return rows;
  };

  const query = {
    from: (_table: unknown) => query,
    where: (_clause: unknown) => query,
    orderBy: (..._clauses: unknown[]) => query,
    limit: (_count: number) => Promise.resolve(nextSelect()),
    then: (
      onFulfilled?: ((value: SelectRows) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null
    ) =>
      Promise.resolve(nextSelect()).then(
        onFulfilled ?? undefined,
        onRejected ?? undefined
      ),
  };

  return {
    inserts,
    updates,
    select: (_fields?: unknown) => query,
    insert: (table: unknown) => ({
      values: async (value: unknown) => {
        inserts.push({ table, value });
      },
    }),
    update: (table: unknown) => ({
      set: (value: unknown) => ({
        where: async (_clause: unknown) => {
          updates.push({ table, value });
          return updatesQueue.shift() ?? { meta: { changes: 0 } };
        },
      }),
    }),
  };
}
