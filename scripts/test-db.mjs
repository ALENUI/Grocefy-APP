// Applies every migration to a disposable PostgreSQL 15 container and runs supabase/tests/*.test.sql.
// Requires Docker. Usage: npm run test:db
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const container = 'grocefy-db-test';
const root = join(import.meta.dirname, '..');
const sqlFiles = (dir, suffix) => readdirSync(join(root, dir)).filter((name) => name.endsWith(suffix)).sort().map((name) => join(dir, name));
const docker = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', ...options });

function psql(file) {
  process.stdout.write(`  ${file} ... `);
  try {
    docker(['exec', '-i', container, 'psql', '-U', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-X'], { input: readFileSync(join(root, file)), stdio: ['pipe', 'pipe', 'pipe'] });
    console.log('ok');
  } catch (error) {
    console.log('FAILED');
    console.error(error.stderr || error.message);
    throw error;
  }
}

let failed = false;
try {
  docker(['rm', '-f', container], { stdio: 'ignore' });
  docker(['run', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD=postgres', 'postgres:15']);
  for (let attempt = 0; ; attempt++) {
    try { docker(['exec', container, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1'], { stdio: 'ignore' }); break; }
    catch { if (attempt > 60) throw new Error('PostgreSQL did not become ready'); execFileSync(process.execPath, ['-e', 'setTimeout(() => {}, 500)']); }
  }
  console.log('Applying schema');
  // The demo seed (supabase/seed/seed.sql) needs the real Supabase auth schema; it is exercised by `supabase db reset`.
  for (const file of ['supabase/tests/harness/supabase_stub.sql', ...sqlFiles('supabase/migrations', '.sql'), 'supabase/tests/harness/helpers.sql']) psql(file);
  console.log('Running tests');
  for (const file of sqlFiles('supabase/tests', '.test.sql')) {
    try { psql(file); } catch { failed = true; }
  }
} catch {
  failed = true;
} finally {
  docker(['rm', '-f', container], { stdio: 'ignore' });
}
console.log(failed ? '\nDatabase tests failed.' : '\nAll database tests passed.');
process.exit(failed ? 1 : 0);
