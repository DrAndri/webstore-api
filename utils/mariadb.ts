import mariadb, { PoolConnection } from 'mariadb';
import { DbId } from '../types';

const pool = mariadb.createPool({
  host: process.env.MARIADB_HOST,
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectionLimit: 5
});

const usePoolConnection = async <T>(
  query: (conn: PoolConnection) => Promise<T>
): Promise<T> => {
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
  values?: (DbId[] | Date)[]
): Promise<T> => {
  return usePoolConnection<T>((conn) => conn.query<T>(query, values));
};
