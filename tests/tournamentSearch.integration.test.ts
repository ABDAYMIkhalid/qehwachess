import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { describe, expect, it } from 'vitest';
import { tournamentSearchFilter } from '@/lib/tournamentSearch';

// Opt in against the developer's test backend; never requires a service key.
describe.skipIf(process.env.RUN_SUPABASE_TESTS !== '1')('tournament search API', () => {
  const env = loadEnv('test', process.cwd(), 'VITE_');
  const client = createClient(env.VITE_SUPABASE_URL || 'http://localhost:54321', env.VITE_SUPABASE_ANON_KEY || 'test', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  it.each(['Rabat', 'Rabat,', '(Rabat)', '"Rabat"', 'Rabat\\', '%', '_', '*', 'Rabat,venue.not.is.null', 'الرباط']) (
    'treats %j as a literal search term', async (search) => {
      const { data, error } = await client.from('tournaments')
        .select('title,description,venue').eq('status', 'published')
        .or(tournamentSearchFilter(search));
      expect(error).toBeNull();
      for (const item of data ?? []) {
        expect([item.title, item.description, item.venue].some((value) =>
          value.toLowerCase().includes(search.trim().toLowerCase()),
        )).toBe(true);
      }
    },
  );
});
