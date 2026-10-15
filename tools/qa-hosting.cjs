// Production smoke check: no development diagnostic API or hidden state changes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const target = process.argv[2] || 'http://localhost:4174/Surgery-Simulator/';
  const root = new URL(target);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
    const errors = [], assets = new Set();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('response', response => {
      if (!response.ok()) errors.push(`${response.status()} ${response.url()}`);
      const url = new URL(response.url());
      if (/\/(models|textures)\//.test(url.pathname)) {
        assert.ok(url.pathname.startsWith(root.pathname), `Asset escaped base path: ${url}`);
        assets.add(url.pathname);
      }
    });
    await page.goto(target);
    const enter = page.getByRole('button', { name: 'Enter operating room', exact: true });
    await enter.waitFor({ timeout: 60000 });
    assert.equal(await page.evaluate(() => typeof window.__SUTURE__), 'undefined');
    await enter.click();
    await page.keyboard.down('w');
    try {
      await page.getByText('Take suction', { exact: true }).waitFor({ timeout: 45000 });
    } finally {
      await page.keyboard.up('w');
    }
    await page.keyboard.press('e');
    await page.locator('.held-instrument').filter({ hasText: 'Suction' }).waitFor();
    await page.keyboard.down('w');
    try {
      await page.getByText('Enter surgical view', { exact: true }).waitFor({ timeout: 45000 });
    } finally {
      await page.keyboard.up('w');
    }
    await page.keyboard.press('e');
    await page.locator('.objective').filter({ hasText: 'Find your depth' }).waitFor();
    for (const name of ['cortex.glb', 'suction.glb', 'irrigation.glb', 'bipolar.glb', 'drape.png', 'cortex.png', 'instruments.png']) {
      assert.ok([...assets].some(path => path.endsWith('/' + name)), `Missing asset: ${name}`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: production subpath, all runtime assets, no diagnostic API, room → tool pickup → surgery, no browser errors.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
