import { requireTeam as baseRequireTeam } from '@bitwobbly/auth/server';
import { env } from 'cloudflare:workers';

import { getDb } from './db';

export async function requireTeam() {
  const vars = env;
  const db = getDb(vars.DB);
  return baseRequireTeam(db);
}
