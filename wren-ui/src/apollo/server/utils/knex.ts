interface KnexOptions {
  dbType: string;
  pgUrl?: string;
  debug?: boolean;
  sqliteFile?: string;
}

export const bootstrapKnex = (options: KnexOptions) => {
  if (options.dbType === 'pg') {
    const { pgUrl, debug } = options;
    console.log('using pg');
    /* eslint-disable @typescript-eslint/no-var-requires */
    return require('knex')({
      client: 'pg',
      connection: pgUrl,
      debug,
      pool: { min: 2, max: 10 },
    });
  } else {
    console.log('using sqlite');
    /* eslint-disable @typescript-eslint/no-var-requires */
    const knex = require('knex')({
      client: 'better-sqlite3',
      connection: {
        filename: options.sqliteFile,
      },
      useNullAsDefault: true,
      pool: {
        afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
          // SQLite 稳定性关键配置 — 解决 Docker volume 上并发写入导致的 "disk image is malformed"
          conn.pragma('journal_mode = WAL');         // WAL 模式：读写并发不阻塞，避免 journal 文件损坏
          conn.pragma('busy_timeout = 30000');        // 锁等待 30 秒（默认 5 秒太短）
          conn.pragma('synchronous = NORMAL');        // WAL 模式下 NORMAL 即可保证一致性，性能更好
          conn.pragma('foreign_keys = ON');
          conn.pragma('cache_size = -64000');         // 64MB 缓存
          done(null, conn);
        },
      },
    });
    return knex;
  }
};
