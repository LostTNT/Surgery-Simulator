// Browser interaction regression: only visible controls and rendered DOM.
// Usage: npm run qa -- --case=case02 [http://localhost:5173]
// Browser plugin not available; use the project's installed Playwright runtime.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
fs.mkdirSync("/tmp/suture-qa", { recursive: true });

const args = process.argv.slice(2);
const smokeOnly = args.includes("--smoke");
const caseOption = args.find((arg) => arg.startsWith("--case="));
const caseFlag = args.indexOf("--case");
const caseId =
  caseOption?.slice("--case=".length) ||
  (caseFlag >= 0 ? args[caseFlag + 1] : "") ||
  process.env.SUTURE_CASE ||
  "lab";
const cases = {
  lab: { name: "Instrument lab", pockets: 4, clarity: 88 },
  case01: { name: "Extra-axial collection", pockets: 4, clarity: 88 },
  case02: { name: "Focal bleeding control", pockets: 4, clarity: 90 },
  case03: { name: "Loculated collection washout", pockets: 6, clarity: 96 },
};
assert.ok(cases[caseId], `Unknown case ${caseId}; choose ${Object.keys(cases).join(", ")}`);
const selectedCase = cases[caseId];
const target = args.find((arg) => /^https?:\/\//.test(arg)) ||
  process.env.SUTURE_URL || "http://localhost:5173";
// Keep the CSS viewport native while reducing software WebGL raster work.
const deviceScaleFactor = Number(process.env.SUTURE_DPR || "0.5");
assert.ok(deviceScaleFactor > 0 && deviceScaleFactor <= 2, "SUTURE_DPR must be in (0, 2]");
const artifact = (name) => `/tmp/suture-qa/${caseId}-${name}.png`;
// Simulation time advances conservatively on slow software-rendered frames.
const operationTimeout = Number(process.env.SUTURE_OPERATION_TIMEOUT || "120000");

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
    viewport: smokeOnly ? { width: 1440, height: 900 } : { width: 960, height: 640 },
    deviceScaleFactor,
  });
  page.setDefaultTimeout(15000);
  const errors = [];
  const warnings = [];
  page.on("response", (response) => {
    if (!response.ok()) errors.push(`${response.status()} ${response.url()}`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
    if (m.type() === "warning") warnings.push(m.text());
  });

  // Read the target's on-screen anchor, not game or engine state. Marker labels
  // may grow while a tool is active, so their full bounding-box center can move.
  async function markerPoint(marker) {
    await marker.waitFor({ state: "visible" });
    return marker.evaluate((el) => {
      const parent = el.offsetParent.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        x: parent.left + parseFloat(style.left),
        y: parent.top + parseFloat(style.top),
      };
    });
  }

  async function pickTool(name, previous) {
    const pick = page.getByRole("button", { name: `Pick up ${name}`, exact: true });
    if (!(await page.locator(".tray-controls").isVisible()))
      await page.getByRole("button", { name: /Instrument tray/ }).click();
    await pick.waitFor({ state: "visible", timeout: 60000 });
    if (previous) {
      assert.ok(await pick.isDisabled(), "Place the held instrument before collecting another");
      await page.getByRole("button", { name: new RegExp(`^Place ${previous}`) }).click();
    }
    await pick.click();
  }

  async function assertExaminationBlocked(reason) {
    const examine = page.getByRole("button", { name: /^Examine field/ });
    assert.ok(await examine.isDisabled(), reason);
    // The E shortcut must obey the same prerequisites as the visible button.
    await page.keyboard.press("e");
    assert.equal(await page.locator(".examine-panel.is-examining").count(), 0);
    assert.equal(await page.getByRole("heading", { name: "A controlled finish.", exact: true }).count(), 0);
  }

  async function waitForOperation(operation, label) {
    const progressText = async () => (await page.locator(".objective, .examine-panel").allInnerTexts()).join("\n");
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = await progressText();
      try {
        return await operation(operationTimeout);
      } catch (error) {
        const after = await progressText();
        if (attempt === 0 && error.name === "TimeoutError" && after !== before) {
          console.log(`${label}: visible progress continues; extending software-rendering deadline`);
          continue;
        }
        throw error;
      }
    }
  }

  try {
    console.log(`Testing ${caseId}: ${selectedCase.name} at ${target} (DPR ${deviceScaleFactor})`);
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page
      .getByRole("button", { name: "Start surgery", exact: true })
      .waitFor({ timeout: 90000 });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("combobox").selectOption("balanced");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Suture case files", exact: true }).click();
    const caseRow = page.getByRole("button", { name: new RegExp(selectedCase.name) });
    await caseRow.click();
    assert.ok((await caseRow.innerText()).includes(`${selectedCase.pockets} pockets`));
    if (caseId === "case02" || smokeOnly) {
      await page.mouse.move(12, 12);
      await page.waitForTimeout(250);
      await page.screenshot({ path: artifact("workstation") });
    }
    await page.getByRole("button", { name: "Prepare & start surgery", exact: true }).click();
    await page
      .getByRole("button", { name: "Pick up Bone burr", exact: true })
      .click();
    await page.locator(".bone-guide line").first().waitFor();
    assert.equal(await page.title(), "SUTURE — Surgical simulation");
    assert.equal(new URL(page.url()).origin, new URL(target).origin);
    assert.equal(await page.locator("vite-error-overlay").count(), 0);
    if (caseId === "lab" && process.env.SUTURE_SKIP_MOBILE !== "1") {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => {
        const lines = [...document.querySelectorAll(".bone-guide line")];
        return lines.length > 0 && lines.every((line) =>
          [1, 2].every((point) => {
            const x = +line.getAttribute(`x${point}`);
            const y = +line.getAttribute(`y${point}`);
            return x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight;
          }),
        );
      }, null, { timeout: 15000 });
      const depthBox = await page.locator(".depth-control").boundingBox();
      assert.ok(depthBox && depthBox.height < 180, "Portrait depth controls must stay compact");
      assert.ok(depthBox.y >= 0 && depthBox.y + depthBox.height <= 844);
      await page.screenshot({ path: artifact("mobile-held-burr") });
      console.log("PASS portrait held-burr field: guide visible and depth controls compact");
      await page.setViewportSize({ width: 960, height: 640 });
      // Wait for the rendered guide to return from portrait to desktop geometry.
      await page.waitForFunction(() => {
        const lines = [...document.querySelectorAll(".bone-guide line")];
        return lines.length > 0 && Math.max(...lines.map((line) => +line.getAttribute("x1"))) > 390;
      }, null, { timeout: 15000 });
    }
    await page.screenshot({ path: artifact("bone") });
    if (smokeOnly) {
      assert.ok(await page.locator(".bone-guide line").count() > 0);
      assert.deepEqual(errors, []);
      fs.rmSync(artifact("flow-failure"), { force: true });
      console.log(`PASS ${caseId} case selection/start smoke: ${selectedCase.pockets} pockets`);
      console.log(`Health: ${errors.length} errors, ${warnings.length} browser warnings`);
      return;
    }
    const points = await page.locator(".bone-guide line").evaluateAll((lines) =>
      lines.map((l) => ({
        x: +l.getAttribute("x1"),
        y: +l.getAttribute("y1"),
      })),
    );
    assert.ok(points.length > 0, "The visible bone guide must have a cutting path");
    console.log("Cutting", points.length, "guide points");
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (let i = 0; i < points.length; i++) {
      await page.mouse.move(points[i].x, points[i].y);
      await page.waitForFunction(
        (i) =>
          document
            .querySelectorAll(".bone-guide line")
            [i]?.classList.contains("done"),
        i,
        { timeout: 10000 },
      );
      if (i === 30)
        await page.screenshot({ path: artifact("carved") });
      if (i % 20 === 0) console.log("Cut point", i);
    }
    await page.mouse.up();
    await page.getByRole("button", { name: "Lift bone flap" }).click();
    await page
      .getByRole("button", { name: /Place Bone burr/ })
      .waitFor({ timeout: 60000 });
    if (caseId === "case02") {
      await pickTool("Bipolar", "Bone burr");
      const source = page.locator(".bleed-marker, .bleeding-marker");
      await source.waitFor({ state: "visible" });
      await assertExaminationBlocked("Uncontrolled bleeding blocks examination");
      await page.screenshot({ path: artifact("bleeding-source") });
      const point = await markerPoint(source);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await waitForOperation((timeout) => source.waitFor({ state: "hidden", timeout }), "Source control");
      await page.mouse.up();
      console.log("Bleeding source controlled");
      await pickTool("Suction", "Bipolar");
    } else {
      await pickTool("Suction", "Bone burr");
    }
    await page.locator(".target-marker").first().waitFor();
    await assertExaminationBlocked("Remaining pockets block examination");
    await page.screenshot({ path: artifact("exposed") });
    const pocketCount = await page.locator(".target-marker").count();
    assert.equal(pocketCount, selectedCase.pockets);
    for (let i = 0; i < pocketCount; i++) {
      const marker = page.locator(".target-marker").nth(i);
      const point = await markerPoint(marker);
      await page.mouse.move(point.x, point.y);
      if (i === 0) await page.mouse.down();
      await marker.waitFor({ state: "visible" });
      await waitForOperation((timeout) => page.waitForFunction(
        (i) =>
          document
            .querySelectorAll(".target-marker")
            [i]?.classList.contains("cleared"),
        i,
        { timeout },
      ), `Pocket ${i + 1}`);
      console.log("Cleared", i + 1);
    }
    await page.mouse.up();
    await page
      .getByRole("heading", { name: "Rinse the field", exact: true })
      .waitFor();
    await assertExaminationBlocked("Cleared pockets still require the rinse target");
    console.log("Examination correctly blocked until rinse target is met");
    const checklist = page.getByRole("region", { name: "Final examination checklist" });
    assert.ok((await checklist.innerText()).includes(`/${selectedCase.clarity}% clarity`));
    await pickTool("Irrigation", "Suction");
    await page.locator(".target-marker").first().waitFor();
    await page.mouse.move(480, 320);
    await page.mouse.down();
    console.log(`Rinsing to ${selectedCase.clarity}% clarity`);
    await waitForOperation((timeout) => page.waitForFunction(() => {
      const button = document.querySelector(".examine-button");
      return button && !button.disabled;
    }, null, { timeout }), "Rinse");
    await page.mouse.up();
    // Resting after irrigation must leave the field awaiting a deliberate check.
    await page.waitForTimeout(3500);
    assert.ok(await page.getByRole("button", { name: /^Examine field/ }).isEnabled());
    assert.equal(await page.locator(".examine-panel.is-examining").count(), 0);
    assert.equal(await page.getByRole("heading", { name: "A controlled finish.", exact: true }).count(), 0);
    assert.ok((await checklist.innerText()).includes(`${pocketCount}/${pocketCount} pockets cleared`));
    await page.screenshot({ path: artifact("ready-to-examine") });
    console.log("Ready to examine; releasing irrigation did not auto-start inspection");
    await page.getByRole("button", { name: /^Examine field/ }).click();
    await page.locator(".examine-panel.is-examining").waitFor();
    await page.waitForFunction(() => {
      const button = document.querySelector(".examine-button");
      return button && /Examining · [1-9]\d*%/.test(button.textContent);
    }, null, { timeout: 15000 });
    assert.ok(await page.locator(".examine-button").isDisabled());
    await page.screenshot({ path: artifact("examining") });
    console.log("Explicit examination progress visible");
    await waitForOperation((timeout) => page
      .getByRole("heading", { name: "A controlled finish.", exact: true })
      .waitFor({ timeout }), "Final examination");
    await page.screenshot({ path: artifact("result") });
    assert.deepEqual(errors, []);
    fs.rmSync(artifact("flow-failure"), { force: true });
    console.log(
      `PASS ${caseId} full workflow`,
      await page.locator(".result-stats").innerText(),
    );
    console.log(`Health: ${errors.length} errors, ${warnings.length} browser warnings`);
    for (const warning of [...new Set(warnings)].slice(0, 5))
      console.log("Browser warning:", warning);
  } catch (e) {
    console.error("Workflow failure:", e);
    console.log("Captured browser errors:", errors);
    console.log("Failure screen:", await page.locator("body").innerText({ timeout: 3000 }).catch(() => "Page unavailable"));
    await page.screenshot({ path: artifact("flow-failure") }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
