import mariadb, { Pool, PoolConnection } from 'mariadb';
import { DbId } from '../types';

declare global {
  // Use 'var' so it's accessible on the global scope
  var pool: Pool | undefined;
}

const getPool = () => {
  if (process.env.NODE_ENV === 'production') {
    return mariadb.createPool({
      host: process.env.MARIADB_HOST,
      user: process.env.MARIADB_USER,
      password: process.env.MARIADB_PASSWORD,
      database: process.env.MARIADB_DATABASE,
      connectionLimit: 10
    });
  } else {
    // Use global to prevent multiple pools during hot-reloading
    if (!global.pool) {
      global.pool = mariadb.createPool({
        host: process.env.MARIADB_HOST,
        user: process.env.MARIADB_USER,
        password: process.env.MARIADB_PASSWORD,
        database: process.env.MARIADB_DATABASE,
        connectionLimit: 10
      });
    }
    return global.pool;
  }
};

const pool = getPool();

const usePoolConnection = async <T>(
  query: (conn: PoolConnection) => Promise<T>
): Promise<T> => {
  if (!pool) throw new Error('Database pool not initialized');
  const conn = await pool.getConnection();
  let res;
  try {
    res = await query(conn);
  } finally {
    await conn.release();
  }
  return res;
};

export const queryPool = async <T>(
  query: string,
  values?: (DbId | DbId[] | string)[]
): Promise<T> => {
  return await usePoolConnection<T>((conn) => conn.query<T>(query, values));
};
