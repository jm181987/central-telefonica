import pg from 'pg';
import {config} from './config.js';

export const db=new pg.Pool({
  connectionString:config.databaseUrl,
  max:20,
  idleTimeoutMillis:30_000,
  connectionTimeoutMillis:10_000
});
