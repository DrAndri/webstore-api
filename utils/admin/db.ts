import mariadb, { Pool, PoolConnection } from 'mariadb';

declare global {
  var adminPool: Pool | undefined;
}

// The admin interface uses its own database user, which can write to the
// tables it manages. The public api user stays read only.
const getAdminPool = () => {
  if (!global.adminPool) {
    global.adminPool = mariadb.createPool({
      host: process.env.MARIADB_HOST,
      user: process.env.MARIADB_ADMIN_USER,
      password: process.env.MARIADB_ADMIN_PASSWORD,
      database: process.env.MARIADB_DATABASE,
      connectionLimit: 5,
      // Job times are stored in UTC
      timezone: 'Z',
      bigIntAsNumber: true,
      decimalAsNumber: true,
      insertIdAsNumber: true
    });
  }
  return global.adminPool;
};

export const adminQuery = <T>(sql: string, values?: unknown[]): Promise<T> =>
  getAdminPool().query<T>(sql, values);

// Runs the queries of run in one transaction, which is rolled back when run
// throws
export const adminTransaction = async <T>(
  run: (connection: PoolConnection) => Promise<T>
): Promise<T> => {
  const connection = await getAdminPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await run(connection);
    await connection.commit();
    return result;
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    await connection.release();
  }
};

// JSON columns are returned as strings by MariaDB
export const parseJsonColumn = <T>(value: unknown): T | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};
