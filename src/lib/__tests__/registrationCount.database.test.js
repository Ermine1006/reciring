import { expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
it('counts registered Auth accounts globally and exposes only a total to signed-in callers', async () => {
  const db = await PGlite.create()
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean);
      INSERT INTO auth.users VALUES
        ('00000000-0000-4000-8000-000000000001',false),
        ('00000000-0000-4000-8000-000000000002',false),
        ('00000000-0000-4000-8000-000000000003',true);
      GRANT USAGE ON SCHEMA public TO anon,authenticated;`)
    const sql = await readFile(new URL('../../../scripts/migration-mutu-registration-count.sql', import.meta.url), 'utf8')
    await db.exec(sql); await db.exec(sql)
    await db.exec("SET ROLE anon")
    await expect(db.query('SELECT public.mutu_registration_count()')).rejects.toThrow(/permission denied/)
    await db.exec("RESET ROLE; SET ROLE authenticated")
    await expect(db.query('SELECT public.mutu_registration_count()')).rejects.toThrow('not_authenticated')
    await db.exec("SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false)")
    expect((await db.query('SELECT public.mutu_registration_count() AS total')).rows[0].total).toBe(2)
    await expect(db.query('SELECT * FROM auth.users')).rejects.toThrow(/permission denied/)
    await db.exec("RESET ROLE; DELETE FROM auth.users WHERE id='00000000-0000-4000-8000-000000000002'; SET ROLE authenticated")
    expect((await db.query('SELECT public.mutu_registration_count() AS total')).rows[0].total).toBe(1)
  } finally { await db.close() }
}, 30000)
