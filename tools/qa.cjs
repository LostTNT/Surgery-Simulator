// Browser interaction regression: no simulation mutations or diagnostic API.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
fs.mkdirSync("/tmp/suture-qa", { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const page = await browser.newPage({
    viewport: { width: 960, height: 640 },
  });
  const errors = [];
  const target = process.argv[2] || "http://localhost:5173";
  page.on("response", (response) => {
    if (!response.ok()) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  try {
    await page.goto(target);
    await page
      .getByRole("button", { name: "Start surgery", exact: true })
      .waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("combobox").selectOption("balanced");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page
      .getByRole("button", { name: "Start surgery", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Pick up Bone burr", exact: true })
      .click();
    await page.locator(".bone-guide line").first().waitFor();
    assert.equal(await page.title(), "SUTURE — Surgical simulation");
    assert.equal(await page.locator("vite-error-overlay").count(), 0);
    await page.screenshot({ path: "/tmp/suture-qa/bone.png" });
    let points = await page.locator(".bone-guide line").evaluateAll((lines) =>
      lines.map((l) => ({
        x: +l.getAttribute("x1"),
        y: +l.getAttribute("y1"),
      })),
    );
    console.log("Cutting", points.length, "guide points");
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (let i = 0; i < points.length; i++) {
      await page.mouse.move(points[i].x, points[i].y, { steps: 3 });
      await page.waitForFunction(
        (i) =>
          document
            .querySelectorAll(".bone-guide line")
            [i]?.classList.contains("done"),
        i,
        { timeout: 10000 },
      );
      if (i === 30)
        await page.screenshot({ path: "/tmp/suture-qa/carved.png" });
      if (i % 20 === 0) console.log("Cut point", i);
    }
    await page.mouse.up();
    await page.getByRole("button", { name: "Lift bone flap" }).click();
    await page
      .getByRole("button", { name: /Place Bone burr/ })
      .waitFor({ timeout: 60000 });
    assert.ok(
      await page
        .getByRole("button", { name: "Pick up Suction", exact: true })
        .isDisabled(),
    );
    await page.getByRole("button", { name: /Place Bone burr/ }).click();
    await page
      .getByRole("button", { name: "Pick up Suction", exact: true })
      .click();
    await page.locator(".target-marker").first().waitFor();
    await page.screenshot({ path: "/tmp/suture-qa/exposed.png" });
    for (let i = 0; i < 4; i++) {
      const marker = page.locator(".target-marker").nth(i);
      const box = await marker.boundingBox();
      await page.mouse.move(box.x + 13.5, box.y + 13.5);
      await page.mouse.down();
      await marker.waitFor({ state: "visible" });
      await page.waitForFunction(
        (i) =>
          document
            .querySelectorAll(".target-marker")
            [i]?.classList.contains("cleared"),
        i,
        { timeout: 60000 },
      );
      await page.mouse.up();
      console.log("Cleared", i + 1);
    }
    await page
      .getByRole("heading", { name: "Rinse the field", exact: true })
      .waitFor();
    await page.getByRole("button", { name: /Instrument tray/ }).click();
    await page.getByRole("button", { name: /Place Suction/ }).click();
    await page
      .getByRole("button", { name: "Pick up Irrigation", exact: true })
      .click();
    await page.locator(".target-marker").first().waitFor();
    await page.mouse.move(480, 320);
    await page.mouse.down();
    await page
      .getByRole("heading", { name: "Release to inspect", exact: true })
      .waitFor({ timeout: 60000 });
    await page.mouse.up();
    await page
      .getByRole("heading", { name: "A controlled finish.", exact: true })
      .waitFor({ timeout: 60000 });
    await page.screenshot({ path: "/tmp/suture-qa/result.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS full workflow",
      await page.locator(".result-stats").innerText(),
    );
  } catch (e) {
    console.log("Failure screen:", await page.locator("main").innerText());
    await page.screenshot({ path: "/tmp/suture-qa/flow-failure.png" });
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
