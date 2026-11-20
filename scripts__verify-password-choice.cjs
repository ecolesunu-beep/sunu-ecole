// Opt in against a running LOCAL instance only. No demo data is shipped.
// SUNU_E2E_WRITE=1 node scripts/verify-password-choice.cjs
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash, createCipheriv } = require('node:crypto');
const { sql } = require('drizzle-orm');
require('dotenv').config({ quiet: true });

async function run() {
  const origin = process.env.SUNU_TEST_ORIGIN || 'http://localhost:3000';
  const local = (url) => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  assert(process.env.SUNU_E2E_WRITE === '1' && local(origin) && local(process.env.DATABASE_URL), 'A local instance and explicit opt-in are required.');
  const { db, pool } = await import('../src/db/index.ts');
  const id = randomUUID(), agent = `SunuSessionCheck/${id}`, email = `${id}@example.invalid`;
  const signup = { nom: 'Vérification', email, nomEcole: `Contrôle de session ${id}`, mode: 'create', type: 'Autre' };
  const schools = [];
  const request = async (path, method, body, token, extra = {}) => {
    const r = await fetch(origin + path, { method, credentials: 'omit', headers: { origin, 'user-agent': agent, ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}), ...extra }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    assert.equal(r.headers.has('set-cookie'), false, 'The application must never set a session cookie');
    return { status: r.status, value: await r.json() };
  };
  const post = (action, body, token) => request('/api/auth/' + action, 'POST', body, token);
  const me = (token) => request('/api/auth/me', 'GET', null, token);
  try {
    for (const invalid of ['', null, 0]) assert.equal((await post('signup', { ...signup, password: invalid })).status, 400);
    const first = await post('signup', { ...signup, password: '7' });
    assert.equal(first.status, 201, first.value.error);
    const schoolId = first.value.school.id, userId = first.value.user.id;
    schools.push({ id: schoolId, name: signup.nomEcole });
    const token = first.value.sessionToken;
    assert.match(token, /^se1\.[a-zA-Z0-9_-]{43}$/);
    assert.equal((await me(token)).value.user.id, userId);
    assert.equal((await me()).status, 401);
    assert.equal((await request('/api/data/snapshot', 'GET', null, null, { cookie: `sunu_access=${token}; sunu_refresh=${token}` })).status, 401);
    const loadHash = async () => (await db.execute(sql`select password_hash from utilisateurs where id=${userId} and ecole_id=${schoolId}`)).rows[0].password_hash;
    const firstHash = await loadHash(); assert(firstHash.startsWith('$argon2id$'));
    console.log('OK: one-character password, hashed at rest, no cookie issued or accepted for authentication.');

    // Simulate pre-upgrade flags in this test account, not changes to a real user.
    await db.execute(sql`update utilisateurs set password_changed_at=now()-interval '100 days', must_change_password=true where id=${userId} and ecole_id=${schoolId}`);
    const emailKey = (await db.execute(sql`select email_lookup from utilisateurs where id=${userId}`)).rows[0].email_lookup;
    await db.execute(sql`insert into login_attempts (scope,scope_key,tentatives_echouees,bloque_jusqua_at,statut,user_agent) values ('email',${emailKey},3,now()+interval '2 hours','bloque',${agent})`);
    let generic;
    for (let n = 0; n < 6; n++) {
      const wrong = await post('login', { email, password: 'incorrect' });
      assert.equal(wrong.status, 401); generic ||= wrong.value.error;
      assert.deepEqual(wrong.value, { error: generic });
    }
    const login = await post('login', { email, password: '7' });
    assert.equal(login.status, 200, login.value.error); assert.equal(login.value.redirect, '/dashboard');
    assert.equal((await db.execute(sql`select count(*)::int as n from login_events where user_agent=${agent}`)).rows[0].n, 0);
    const student = await request('/api/data/eleves', 'POST', { prenom: 'Vérification', nom: 'Session', classe: 'Test temporaire' }, token);
    assert.equal(student.status, 201, student.value.error);
    console.log('OK: six incorrect attempts do not change the error or block a correct login; old lockouts and forced password changes ignored.');

    // This fixture represents a restored account whose old key is not mounted.
    // Its original email, lookup index and password hash must not be rewritten.
    const original = (await db.execute(sql`select email,email_lookup from utilisateurs where id=${userId}`)).rows[0];
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', randomBytes(32), iv);
    const encrypted = Buffer.concat([cipher.update(email, 'utf8'), cipher.final()]);
    const legacyEmail = 'v1:' + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
    const legacyIndex = randomBytes(32).toString('hex');
    await db.execute(sql`update utilisateurs set email=${legacyEmail},email_lookup=${legacyIndex} where id=${userId} and ecole_id=${schoolId}`);
    const alternative = { identifier: 'school', nom: signup.nom, establishment: signup.nomEcole, password: '7' };
    assert.equal((await post('login', { ...alternative, password: 'incorrect' })).status, 401);
    assert.equal((await post('login', { ...alternative, establishment: '' })).status, 400);
    const recovered = await post('login', alternative);
    assert.equal(recovered.status, 200); assert.equal(recovered.value.user.id, userId);
    assert.equal(recovered.value.user.emailUnavailable, true);
    assert.equal((await request('/api/data/snapshot', 'GET', null, recovered.value.sessionToken)).value.school.id, schoolId);
    const preserved = (await db.execute(sql`select email,email_lookup,password_hash from utilisateurs where id=${userId}`)).rows[0];
    assert.equal(preserved.email, legacyEmail); assert.equal(preserved.email_lookup, legacyIndex); assert.equal(preserved.password_hash, firstHash);
    await db.execute(sql`update utilisateurs set email=${original.email},email_lookup=${original.email_lookup} where id=${userId} and ecole_id=${schoolId}`);
    console.log('OK: legacy member access requires their name, school and password; old ciphertext and hashes are preserved.');

    const secondName = signup.nomEcole + ' B';
    const second = await post('signup', { ...signup, email: `b.${email}`, nomEcole: secondName, password: 'b' });
    assert.equal(second.status, 201, second.value.error); schools.push({ id: second.value.school.id, name: secondName });
    assert.equal((await request('/api/data/eleves?id=' + student.value.id, 'GET', null, second.value.sessionToken)).status, 404);
    assert.equal((await post('logout', {}, second.value.sessionToken)).status, 200);
    assert.equal((await me(second.value.sessionToken)).status, 401);
    console.log('OK: school isolation and server-side logout still enforced.');

    assert.equal((await post('password', { currentPassword: 'incorrect', password: 'mot' }, token)).status, 403);
    assert.equal((await post('password', { currentPassword: '7', password: '' }, token)).status, 400);
    const change = await post('password', { currentPassword: '7', password: 'mot' }, token);
    assert.equal(change.status, 200, change.value.error);
    assert.equal((await me(token)).status, 401);
    assert.equal((await me(login.value.sessionToken)).status, 401);
    const reuse = await post('password', { currentPassword: 'mot', password: '7' }, change.value.sessionToken);
    assert.equal(reuse.status, 200, reuse.value.error); assert.notEqual(await loadHash(), firstHash);
    const resetToken = randomBytes(32).toString('base64url');
    const digest = createHash('sha256').update(resetToken).digest('hex');
    await db.execute(sql`insert into password_resets (utilisateur_id,token_hash,expire_at) values (${userId},${digest},now()+interval '5 minutes')`);
    assert.equal((await post('reset', { token: resetToken, password: '' })).status, 400);
    assert.equal((await post('reset', { token: resetToken, password: ' é ' })).status, 200);
    assert.equal((await post('reset', { token: resetToken, password: '7' })).status, 400);
    assert.equal((await me(reuse.value.sessionToken)).status, 401);
    const finalLogin = await post('login', { email, password: ' é ' }); assert.equal(finalLogin.status, 200);
    assert.equal((await post('login', { email, password: 'é' })).status, 401);
    await db.execute(sql`update utilisateurs set actif=false where id=${userId} and ecole_id=${schoolId}`);
    assert.equal((await me(finalLogin.value.sessionToken)).status, 401);
    assert.equal((await post('login', { email, password: ' é ' })).status, 401);
    console.log('OK: unrestricted password changes, exact spaces, single-use reset and disabled accounts.');
  } finally {
    try {
      await db.transaction(async (tx) => {
        for (const school of schools) {
          const own = await tx.execute(sql`select id from ecoles where id=${school.id} and nom_ecole=${school.name}`);
          assert.equal(own.rows.length, 1, 'Only remove schools created by this test.');
          for (const table of ['historique', 'fiches_renvoi', 'journal', 'pieces_jointes', 'eleves', 'utilisateurs']) await tx.execute(sql`delete from ${sql.identifier(table)} where ecole_id=${school.id}`);
          await tx.execute(sql`delete from ecoles where id=${school.id} and nom_ecole=${school.name}`);
        }
        await tx.execute(sql`delete from login_attempts where user_agent=${agent}`);
      });
    } finally { await pool.end(); }
  }
}
run().catch((error) => { console.error(error.message); process.exitCode = 1; });
