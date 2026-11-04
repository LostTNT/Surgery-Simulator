// Full browser playthrough of Case 04 using visible controls only (real mouse and keys).
// Usage: node tools/qa-aneurysm.cjs [http://localhost:5173]
// Needs the dev server (window.__SUTURE__ is only used to read screen positions and progress).
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
fs.mkdirSync("/tmp/suture-qa", { recursive: true });
const target = process.argv.find((a) => /^https?:/.test(a)) || "http://localhost:5173";
const dpr = Number(process.env.SUTURE_DPR || "0.5");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
    headless: true,
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: dpr });
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const an = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__SUTURE__.state.aneurysm)));
  const until = async (label, fn, ms = 600000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await fn()) return;
      await page.waitForTimeout(700);
    }
    throw new Error(`Timed out: ${label}`);
  };
  const screen = (x, y) =>
    page.evaluate(([x, y]) => { const e = window.__SUTURE__; return e.project(x, y, e.surface(x, y) + 0.1); }, [x, y]);
  const swap = async (placing, picking) => {
    await page.keyboard.press("t");
    await page.getByRole("button", { name: new RegExp(`^Place ${placing}`) }).waitFor();
    await page.getByRole("button", { name: new RegExp(`^Place ${placing}`) }).click();
    await page.getByRole("button", { name: `Pick up ${picking}`, exact: true }).click();
  };
  try {
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.getByRole("button", { name: "Start surgery", exact: true }).waitFor({ timeout: 90000 });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("combobox").selectOption("balanced");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Suture case files", exact: true }).click();
    await page.getByRole("button", { name: /Aneurysm clipping/ }).click();
    await page.getByRole("button", { name: "Prepare & start surgery", exact: true }).click();
    assert.ok(await page.getByText("Unruptured aneurysm, surface artery").isVisible());
    await page.getByRole("button", { name: "Resident" }).click();
    await page.getByRole("button", { name: "Scrub in", exact: true }).click();
    await page.getByRole("button", { name: "Pick up Bipolar", exact: true }).click();
    await page.waitForTimeout(2500);
    const a = await an();
    for (let i = 0; i < a.bridges.length; i++) {
      await until(`tether ${i}`, async () => {
        const cur = await an();
        if (cur.bridges[i].done) return true;
        const p = await screen(cur.bridges[i].x, cur.bridges[i].y);
        await page.mouse.move(p.x, p.y, { steps: 3 });
        await page.mouse.down();
        await page.waitForTimeout(1500);
        await page.mouse.up();
        return (await an()).bridges[i].done;
      });
      console.log(`Tether ${i + 1} released`);
    }
    await swap("Bipolar", "Suction");
    await until("neck", async () => {
      const cur = await an();
      if (cur.dissection >= 0.9) return true;
      const p = await screen(cur.work[0], cur.work[1]);
      await page.mouse.move(p.x, p.y, { steps: 3 });
      await page.mouse.down();
      await page.waitForTimeout(2000);
      await page.mouse.up();
      return (await an()).dissection >= 0.9;
    });
    console.log("Neck freed");
    await swap("Suction", "Aneurysm clip");
    const p = await screen(a.clipSpot[0], a.clipSpot[1]);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    // Rotate with the real keys until aligned.
    await until("alignment", async () => {
      const err = await page.evaluate(() => { const s = window.__SUTURE__.state; return s.clipAngle - s.aneurysm.axis; });
      if (Math.abs(err) < 0.25) return true;
      await page.keyboard.press(err > 0 ? "d" : "a");
      return false;
    });
    await page.screenshot({ path: "/tmp/suture-qa/case04-aligned.png" });
    await until("clip", async () => {
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.waitForTimeout(2500);
      await page.mouse.up();
      return (await an()).phase === "clipped";
    });
    console.log("Clipped");
    await page.screenshot({ path: "/tmp/suture-qa/case04-clipped.png" });
    await page.keyboard.press("t");
    await page.getByRole("button", { name: /^Place Aneurysm clip/ }).click();
    await page.keyboard.press("t");
    await page.getByRole("button", { name: /^Examine field/ }).waitFor();
    await until("examine ready", async () => !(await page.getByRole("button", { name: /^Examine field/ }).isDisabled()));
    await page.getByRole("button", { name: /^Examine field/ }).click();
    await page.getByRole("heading", { name: "A controlled finish." }).waitFor({ timeout: 300000 });
    await page.screenshot({ path: "/tmp/suture-qa/case04-result.png" });
    assert.ok(await page.getByText(/OPERATION COMPLETE/).isVisible());
    console.log("PASS case04", errors.length ? `(browser errors: ${errors.join("; ")})` : "(no browser errors)");
    assert.equal(errors.length, 0);
  } catch (e) {
    console.error("FAIL", e.message);
    await page.screenshot({ path: "/tmp/suture-qa/case04-failure.png" }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
