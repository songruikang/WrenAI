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
        afterCreate: (
          conn: any,
          done: (err: Error | null, conn: any) => void,
        ) => {
          conn.pragma('journal_mode = WAL');
          conn.pragma('busy_timeout = 30000');
          conn.pragma('synchronous = NORMAL');
          conn.pragma('foreign_keys = ON');
          conn.pragma('cache_size = -64000');
          done(null, conn);
        },
      },
    });
    return knex;
  }
};
