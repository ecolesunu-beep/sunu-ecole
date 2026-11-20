/* Local, opt-in browser acceptance check. No fixtures are shipped into the product.
 * Run from the project root after starting the production preview:
 * npm exec --yes --package=playwright -- playwright install chromium --with-deps
 * npm exec --yes --package=playwright -c 'NODE_PATH="$(dirname "$(dirname "$(command -v playwright)")")" SUNU_E2E_WRITE=1 node scripts/verify-browser.cjs'
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID, randomBytes } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { sql } = require('drizzle-orm');
require('dotenv').config({ quiet: true });
const origin = process.env.SUNU_TEST_ORIGIN || 'http://localhost:3000';
const stripAuthorization = process.env.SUNU_E2E_STRIP_AUTH === '1';
let fallbackRequests = 0;
const local = (host) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
if (!local(new URL(origin).hostname)) throw new Error('Browser acceptance tests are local only.');
const id = randomUUID();
const schoolName = `Vérification du parcours ${id}`;
const agent = `SunuBrowserCheck/${id}`;
const email = `verification.${id}@example.invalid`;
const password = `Ép!7${randomBytes(16).toString('base64url')}#`;
let schoolId;

async function removeFixture() {
  if (!schoolId) return;
  if (!local(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Refusing to clean a remote database.');
  const { db, pool } = await import(pathToFileURL(path.join(process.cwd(), 'src/db/index.ts')).href);
  try {
    await db.transaction(async (tx) => {
      const match = await tx.execute(sql`select id from ecoles where id = ${schoolId} and nom_ecole = ${schoolName}`);
      assert.equal(match.rows.length, 1, 'Only delete the school created by this run');
      for (const table of ['historique', 'fiches_renvoi', 'journal', 'pieces_jointes', 'eleves', 'utilisateurs']) await tx.execute(sql`delete from ${sql.identifier(table)} where ecole_id = ${schoolId}`);
      await tx.execute(sql`delete from ecoles where id = ${schoolId}`);
    });
    console.log('OK: temporary school, users, records and sessions removed.');
  } finally { await pool.end(); }
}

async function emulatePreviewRelay(context) {
  if (!stripAuthorization) return;
  // This can only intercept this test's local application, not external traffic.
  await context.route((url) => url.origin === origin && url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request(), headers = await request.allHeaders();
    delete headers.authorization;
    if (new URL(request.url()).pathname === '/api/session/transport') {
      assert.equal(request.method(), 'POST');
      assert.equal(new URL(request.url()).search, '', 'The session must never be in the URL');
      fallbackRequests++;
    }
    await route.continue({ headers });
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, userAgent: agent, acceptDownloads: true });
  await emulatePreviewRelay(context);
  const errors = [];
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  const host = http.createServer((req, res) => {
    const tile = req.url === '/private' ? '/dashboard' : req.url === '/login' ? '/login' : '/';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><html lang="fr"><title>Contrôle de l’aperçu</title><body style="margin:0"><iframe title="Aperçu" src="${origin}${tile}" style="width:100vw;height:100vh;border:0"></iframe></body></html>`);
  });
  await new Promise((r) => host.listen(0, '127.0.0.1', r));
  try {
    const page = await context.newPage();
    const viewer = `http://127.0.0.1:${host.address().port}`;
    await page.goto(viewer);
    const frame = page.frameLocator('iframe');
    await frame.getByRole('heading', { level: 1, name: 'Sunu École' }).waitFor();
    await frame.locator('.intro-screen').waitFor({ state: 'hidden' });
    assert(await frame.locator('.product-hero__art img').evaluate((image) => image.complete && image.naturalWidth > 0), 'The hero photograph must load');
    await frame.locator('.public-links').getByRole('link', { name: 'FAQ', exact: true }).click();
    await frame.getByRole('button', { name: 'Comment importer ma liste Excel ?' }).click();
    assert.equal(await frame.getByRole('button', { name: 'Comment importer ma liste Excel ?' }).getAttribute('aria-expanded'), 'true');
    await frame.locator('.public-links').getByRole('link', { name: 'Accueil', exact: true }).click();
    await frame.getByRole('heading', { level: 1, name: 'Sunu École' }).waitFor();
    console.log('OK: framed homepage, photograph, public navigation and FAQ.');
    await frame.locator('.public-links').getByRole('link', { name: 'Espace école', exact: true }).click();
    const directory = frame.getByRole('navigation', { name: 'Répertoire des pages de l’école' });
    await directory.getByRole('link', { name: 'Ouvrir Tableau de bord', exact: true }).waitFor();
    assert.equal(await directory.getByRole('link').count(), 8);
    await frame.getByRole('button', { name: 'Administration', exact: true }).click();
    assert.equal(await directory.getByRole('link').count(), 2);
    await frame.getByRole('button', { name: 'Toutes', exact: true }).click();
    await directory.getByRole('link', { name: 'Ouvrir Gestion des élèves', exact: true }).click();
    await frame.locator('#auth-email').waitFor();
    assert.equal(await frame.locator('.login-destination strong').innerText(), 'Gestion des élèves');
    assert.equal(context.pages().length, 1, 'Trusted managed preview must not open another tab');
    console.log('OK: public directory and chosen destination stay in the trusted viewer.');
    await page.goto(viewer + '/private');
    await frame.getByRole('heading', { name: 'Tableau de bord', exact: true, level: 1 }).waitFor();
    assert.equal(await frame.locator('input[type=password]').count(), 0);
    await frame.getByRole('link', { name: 'Ouvrir mon espace' }).waitFor();
    console.log('OK: an unsigned visitor stays on the requested page until choosing to sign in.');
    const app = await context.newPage();
    await app.goto(origin + '/inscription');
    await app.locator('#auth-name').waitFor();
    await app.locator('.intro-screen').waitFor({ state: 'hidden' });
    if (process.env.SUNU_E2E_WRITE === '1') {
      if (!local(new URL(process.env.DATABASE_URL).hostname)) throw new Error('Refusing to write a temporary school in a remote database.');
      await app.locator('#auth-name').fill('Vérification navigateur');
      await app.locator('#auth-email').fill(email);
      await app.locator('#auth-school').fill(schoolName);
      await app.locator('#password-signup').fill(password);
      const created = app.waitForResponse((r) => r.url().endsWith('/api/auth/signup') && r.request().method() === 'POST');
      await app.getByRole('button', { name: /Créer mon espace/ }).click();
      const response = await created;
      const result = await response.json();
      assert.equal(response.status(), 201, result.error); schoolId = result.school.id;
      await app.getByRole('heading', { name: 'Bienvenue dans votre école', exact: true }).waitFor();
      assert.equal((await context.cookies(origin)).length, 0, 'No application cookie after signup');
      assert(await app.evaluate(() => /^se1\./.test(localStorage.getItem('sunu.browser-session.v1') || '')), 'This tab has a session');
      await app.evaluate(() => { window.__sunuNavigationMarker = 'same-document'; });
      const visit = async (label, heading) => {
        await app.locator('.sidebar-links').getByRole('link', { name: label, exact: true }).click();
        await app.getByRole('heading', { name: heading, exact: true, level: 1 }).waitFor();
        assert.equal(await app.evaluate(() => window.__sunuNavigationMarker), 'same-document', 'Navigation must not reload the document');
      };
      await app.getByRole('link', { name: 'Ouvrir le tableau de bord', exact: true }).click();
      await app.getByRole('heading', { name: 'Tableau de bord', level: 1, exact: true }).waitFor();
      const shortcuts = app.getByRole('navigation', { name: 'Accès directs à mes rubriques' });
      assert.equal(await shortcuts.getByRole('link').count(), 8);
      await shortcuts.getByRole('link', { name: 'Ouvrir Gestion des utilisateurs', exact: true }).click();
      await app.getByRole('heading', { name: 'Gestion des utilisateurs', level: 1, exact: true }).waitFor();
      await visit('Paramètres', 'Paramètres');
      await visit('Tableau de bord', 'Tableau de bord');
      assert.deepEqual(await app.locator('.stat-card__number').allTextContents(), ['0', '0', '0', '0']);
      const dashboardDownload = app.waitForEvent('download');
      await app.getByRole('button', { name: 'Exporter PDF', exact: true }).click();
      assert.match((await dashboardDownload).suggestedFilename(), /tableau-de-bord.*\.pdf$/);
      const secondTab = await context.newPage();
      await secondTab.goto(origin + '/journal');
      await secondTab.getByRole('heading', { name: 'Journal de discipline', exact: true, level: 1 }).waitFor();
      assert.equal(await secondTab.locator('#auth-email').count(), 0);
      await secondTab.close();
      const resumed = await browser.newContext({ storageState: await context.storageState() });
      await emulatePreviewRelay(resumed);
      const reopened = await resumed.newPage();
      await reopened.goto(origin + '/historique');
      await reopened.getByRole('heading', { name: 'Historique des actions', exact: true, level: 1 }).waitFor();
      await resumed.close();
      const injectError = (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Le relais est momentanément indisponible."}' });
      if (stripAuthorization) {
        let injected = false;
        await app.route('**/api/session/transport', (route) => {
          const contentType = route.request().headers()['content-type'] || '';
          if (!injected && contentType.includes('application/json') && route.request().postDataJSON()?.path === '/api/data/snapshot') {
            injected = true;
            return injectError(route);
          }
          return route.fallback();
        });
      } else await app.route('**/api/data/snapshot', injectError, { times: 1 });
      await app.locator('.offline-banner').getByText('Le relais est momentanément indisponible.', { exact: false }).waitFor();
      assert(new URL(app.url()).pathname === '/dashboard');
      assert(await app.evaluate(() => !!localStorage.getItem('sunu.browser-session.v1')));
      await app.getByRole('button', { name: 'Réessayer', exact: true }).click();
      await app.locator('.offline-banner').waitFor({ state: 'hidden' });
      console.log('OK: dashboard PDF, another tab, reopened browser storage and temporary service error without a repeated login.');
      await visit('Élèves', 'Gestion des élèves');
      const XLSX = require('@e965/xlsx');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Prénoms', 'Nom', 'Classe'], ['Élève', 'Parcours', 'Vérification'], ['Élève', 'Parcours', 'Vérification']]), 'Élèves');
      await app.getByRole('button', { name: 'Importer liste Excel' }).first().click();
      const dialog = app.getByRole('dialog');
      await dialog.locator('input[type=file]').setInputFiles({ name: 'controle.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) });
      await dialog.getByRole('button', { name: 'Importer 2 élèves', exact: true }).click();
      await dialog.getByText('Import terminé.', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Terminer' }).click();
      await app.getByRole('link', { name: 'Élève Parcours', exact: true }).waitFor();
      assert.equal(await app.locator('.data-table tbody tr').count(), 1);
      console.log('OK: empty dashboard and actual Excel upload with duplicate removal.');
      const colleagueContext = await browser.newContext({ viewport: { width: 1200, height: 900 }, userAgent: agent });
      await emulatePreviewRelay(colleagueContext);
      const colleague = await colleagueContext.newPage();
      colleague.on('pageerror', (e) => errors.push(e.message));
      await colleague.goto(origin + '/inscription');
      await colleague.locator('#auth-name').fill('Vérification équipe');
      await colleague.locator('#auth-email').fill(`equipe.${id}@example.invalid`);
      await colleague.getByRole('button', { name: /Je rejoins une école/ }).click();
      await colleague.locator('#auth-code').fill(result.school.codeParrainageUnique);
      await colleague.locator('#password-signup').fill(`Éq!8${randomBytes(18).toString('base64url')}#`);
      await colleague.getByRole('button', { name: /Créer mon espace/ }).click();
      await colleague.getByRole('heading', { name: 'Tableau de bord', exact: true, level: 1 }).waitFor();
      assert.equal(await colleague.locator('.sidebar-links a[href="/utilisateurs"]').count(), 0, 'Team administration must not be offered to a Surveillant');
      await colleague.locator('.sidebar-links').getByRole('link', { name: 'Journal', exact: true }).click();
      await colleague.getByRole('heading', { name: 'Journal de discipline', exact: true, level: 1 }).waitFor();
      await visit('Journal', 'Journal de discipline');
      await app.getByRole('button', { name: 'Nouvelle saisie', exact: true }).click();
      await dialog.locator('#student-search').fill('parcours');
      await dialog.getByRole('button', { name: /Élève Parcours/ }).click();
      await dialog.locator('#entry-motif').fill('Contrôle temporaire du parcours.');
      await dialog.locator('#entry-photo').setInputFiles(path.join(process.cwd(), 'public/images/classroom.jpg'));
      const entrySaved = app.waitForResponse((r) => r.request().method() === 'POST' && (r.url().endsWith('/api/data/journal') || (r.url().endsWith('/api/session/transport') && (r.request().headers()['content-type'] || '').includes('application/json') && r.request().postDataJSON()?.path === '/api/data/journal')));
      await dialog.getByRole('button', { name: 'Ajouter au journal', exact: true }).click();
      assert.equal((await entrySaved).status(), 201);
      const recorded = Date.now();
      await colleague.locator('.data-table').getByText('Retard', { exact: true }).waitFor({ timeout: 5000 });
      console.log(`OK: second surveillant received the saved entry without reloading (${Date.now() - recorded} ms after response).`);
      await colleague.getByRole('button', { name: 'Voir le justificatif', exact: true }).click();
      await colleague.getByRole('dialog').locator('img[src^="blob:"]').waitFor();
      await colleague.getByRole('dialog').getByRole('button', { name: 'Fermer', exact: true }).click();
      await colleagueContext.close();
      await dialog.waitFor({ state: 'hidden' });
      await app.locator('.data-table').getByText('Retard', { exact: true }).waitFor();
      await visit('Synthèse', 'Synthèse disciplinaire');
      await app.locator('.data-table').getByText('Vérification', { exact: true }).waitFor();
      await visit('Historique', 'Historique des actions');
      await app.locator('.data-table').getByText('Retard ajouté', { exact: true }).waitFor();
      await visit('Fiche de renvoi', 'Fiche de renvoi');
      await app.locator('#student-search').fill('parcours');
      await app.getByRole('button', { name: /Élève Parcours/ }).click();
      await app.locator('#fiche-days').fill('2');
      await app.locator('#fiche-reason').fill('Vérification temporaire du document.');
      await app.getByRole('button', { name: 'Enregistrer la fiche' }).click();
      const download = app.waitForEvent('download');
      await app.getByRole('button', { name: 'Export PDF', exact: true }).click();
      assert((await download).suggestedFilename().endsWith('.pdf'));
      console.log('OK: journal, summary, audit, student search, saved fiche and real PDF download.');
      const currentToken = await app.evaluate(() => localStorage.getItem('sunu.browser-session.v1'));
      const logoutResponse = app.waitForResponse((r) => r.status() === 200 && (r.url().endsWith('/api/auth/logout') || (r.url().endsWith('/api/session/transport') && (r.request().headers()['content-type'] || '').includes('application/json') && r.request().postDataJSON()?.path === '/api/auth/logout')));
      await app.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
      await logoutResponse;
      const revoked = await fetch(origin + '/api/auth/me', { headers: { Authorization: `Bearer ${currentToken}` } });
      assert.equal((await revoked.json()).code, 'SESSION_INVALID', 'Logout must also invalidate the server credential');
      await app.waitForURL(origin + '/');
      await app.goto(origin + '/synthese');
      await app.getByRole('heading', { name: 'Synthèse disciplinaire', exact: true, level: 1 }).waitFor();
      assert.equal(new URL(app.url()).pathname, '/synthese');
      await app.getByRole('link', { name: 'Ouvrir mon espace' }).click();
      await app.locator('#auth-email').waitFor();
      assert.equal(new URL(app.url()).searchParams.get('next'), '/synthese');
      assert.equal(await app.locator('.login-destination strong').innerText(), 'Synthèse disciplinaire');
      await app.locator('#auth-email').fill(email);
      assert(await app.evaluate(() => !localStorage.getItem('sunu.browser-session.v1')), 'Logout forgets the tab credential');
      await app.locator('#password-login').fill(password);
      const signedIn = app.waitForResponse((r) => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
      await app.getByRole('button', { name: 'Se connecter', exact: true }).click();
      assert.equal((await signedIn).status(), 200);
      await app.getByRole('heading', { level: 1, name: 'Synthèse disciplinaire', exact: true }).waitFor();
      await app.goto(origin + '/login');
      await app.getByRole('heading', { level: 1, name: 'Tableau de bord', exact: true }).waitFor();
      console.log('OK: protected deep link returns to the chosen page, and a signed-in tab resumes without another login.');
      await app.reload();
      await app.getByRole('heading', { level: 1, name: 'Tableau de bord' }).waitFor();
      await app.setViewportSize({ width: 390, height: 844 });
      await app.getByRole('navigation', { name: 'Navigation rapide' }).getByRole('button', { name: 'Toutes les pages', exact: true }).click();
      await app.getByRole('dialog', { name: 'Pages de mon école' }).waitFor();
      await app.locator('.sidebar-links').getByRole('link', { name: 'Élèves', exact: true }).click();
      await app.getByRole('heading', { level: 1, name: 'Gestion des élèves' }).waitFor();
      const measure = () => app.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, outside: [...document.querySelectorAll('body *')].map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 60), right: Math.round(el.getBoundingClientRect().right) })).filter((el) => el.right > innerWidth + 1).slice(0, 7) }));
      const immediate = await measure();
      await app.waitForTimeout(500);
      const settled = await measure();
      if (immediate.document > immediate.width || settled.document > settled.width) console.log('Mobile layout measurements:', JSON.stringify({ immediate, settled }));
      assert(immediate.document <= immediate.width && settled.document <= settled.width, 'The mobile viewport must fit during and after navigation');
      await app.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click();
      await app.keyboard.press('Escape');
      await app.getByRole('dialog', { name: 'Pages de mon école' }).waitFor({ state: 'hidden' });
      await app.getByRole('navigation', { name: 'Navigation rapide' }).getByRole('link', { name: 'Journal', exact: true }).click();
      await app.getByRole('heading', { name: 'Journal de discipline', level: 1, exact: true }).waitFor();
      assert.equal((await context.cookies(origin)).length, 0, 'Login and reloading do not create application cookies');
      if (stripAuthorization) {
        const embeddedContext = await browser.newContext({ viewport: { width: 1100, height: 820 } });
        await emulatePreviewRelay(embeddedContext);
        try {
          const preview = await embeddedContext.newPage();
          await preview.goto(viewer + '/login');
          const embedded = preview.frameLocator('iframe');
          await embedded.locator('#auth-email').fill(email);
          await embedded.locator('#password-login').fill(password);
          await embedded.getByRole('button', { name: 'Se connecter', exact: true }).click();
          await embedded.locator('.dashboard-page h1').waitFor();
          await embedded.locator('.sidebar-links').getByRole('link', { name: 'Journal', exact: true }).click();
          await embedded.getByRole('heading', { name: 'Journal de discipline', level: 1, exact: true }).waitFor();
          assert.equal(embeddedContext.pages().length, 1);
          assert.equal(await embedded.locator('#password-login').count(), 0);
          assert.equal((await embeddedContext.cookies()).length, 0);
          assert(fallbackRequests > 10, 'Authenticated operations used the recovery channel');
          console.log('OK: login and classroom navigation inside a preview relay that strips Authorization on every request.');
        } finally { await embeddedContext.close(); }
      }
      console.log('OK: no cookies; logout, real login, tab reload and mobile navigation.');
    }
    const withoutJs = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await withoutJs.newPage();
    await staticPage.goto(origin);
    assert.equal(await staticPage.locator('.intro-screen').isVisible(), false);
    assert(await staticPage.locator('h1').isVisible());
    await withoutJs.close();
    assert.deepEqual(errors, [], 'No unhandled browser errors');
    console.log('OK: no permanent loader or unhandled rendering error.');
  } finally {
    await browser.close();
    await new Promise((r) => host.close(r));
    await removeFixture();
  }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
