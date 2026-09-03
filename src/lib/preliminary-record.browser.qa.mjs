const appUrl = process.env.SABAHLOT_QA_URL ?? "http://127.0.0.1:3100";
const debugUrl = process.env.SABAHLOT_CDP_URL ?? "http://127.0.0.1:9223";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const qaTimeout = setTimeout(() => {
  console.error("Browser QA timed out");
  process.exit(124);
}, 60000);
let targets;
for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    targets = await fetch(`${debugUrl}/json/list`).then((response) => response.json());
    if (targets.length) break;
  } catch {}
  await sleep(250);
}
if (!targets?.length) throw new Error("Edge CDP target unavailable");
const pageTarget = targets.find((target) => target.type === "page");
if (!pageTarget) throw new Error("Edge page target unavailable");

const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let id = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const request = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const detail =
      result.exceptionDetails.exception?.description ??
      result.exceptionDetails.text ??
      "Browser evaluation failed";
    throw new Error(detail);
  }
  return result.result.value;
};
const waitFor = async (expression, message) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(expression)) return;
    await sleep(250);
  }
  throw new Error(message);
};
const openLotDrawer = async () => {
  await evaluate("document.querySelector('.sl-menu-button').click(); true");
  await waitFor(
    "document.querySelector('.sl-category-drawer.is-open') !== null",
    "Category drawer did not open",
  );
  const selected = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.sl-category-list > button.sl-category-item')]
      .find((item) => item.querySelector('.sl-category-item-label')?.textContent.trim() === 'Land Management');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!selected) throw new Error("Land Management category not found");
  await waitFor(
    "document.querySelector('.sl-lot-drawer.is-open') !== null",
    "Lot drawer did not open",
  );
};
const currentStepTitle = () =>
  evaluate("document.querySelector('.sl-wizard-step-title')?.textContent.trim() ?? ''");
const waitForStep = async (title) => {
  const encoded = JSON.stringify(title);
  await waitFor(
    `document.querySelector('.sl-wizard-step-title')?.textContent.trim() === ${encoded}`,
    `Wizard step did not become ${title}`,
  );
};
const setControl = async (text, value) => {
  const result = await evaluate(`(() => {
    const text = ${JSON.stringify(text)};
    const value = ${JSON.stringify(value)};
    const element = [...document.querySelectorAll('.sl-lot-form label')]
      .find((label) => label.querySelector(':scope > span')?.textContent.trim() === text)
      ?.querySelector('input, select, textarea');
    if (!element) throw new Error('Missing control: ' + text);
    const prototype = element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    return true;
  })()`);
  if (!result) throw new Error(`Failed to set ${text}`);
  await sleep(80);
};
const readControl = (text) =>
  evaluate(`(() => {
    const text = ${JSON.stringify(text)};
    return [...document.querySelectorAll('.sl-lot-form label')]
      .find((label) => label.querySelector(':scope > span')?.textContent.trim() === text)
      ?.querySelector('input, select, textarea')?.value ?? null;
  })()`);
const clickNext = async () => {
  const result = await evaluate(`(() => {
    const button = document.querySelector('.sl-wizard-nav-next');
    if (!button) throw new Error('Wizard Next button not found');
    if (button.disabled) throw new Error('Wizard Next button is disabled');
    button.click();
    return true;
  })()`);
  if (!result) throw new Error("Wizard Next click failed");
  await sleep(100);
};
const toggleChecklist = async (labels) => {
  for (const text of labels) {
    const result = await evaluate(`(() => {
      const text = ${JSON.stringify(text)};
      const label = [...document.querySelectorAll('.sl-record-checklist label')]
        .find((item) => item.textContent.trim() === text);
      if (!label) throw new Error('Missing checkbox: ' + text);
      const input = label.querySelector('input');
      if (!input.checked) input.click();
      return true;
    })()`);
    if (!result) throw new Error(`Failed to toggle ${text}`);
    await sleep(50);
  }
};
const checkedChecklistLabels = () =>
  evaluate(`(() => [...document.querySelectorAll('.sl-record-checklist label')]
    .filter((label) => label.querySelector('input')?.checked)
    .map((label) => label.textContent.trim()))()`);

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await send("Page.navigate", { url: appUrl });
await waitFor("document.querySelector('.sl-map-canvas') !== null", "App did not render");
console.log("Browser QA: app rendered");

const polygon = {
  coordinates: [
    { lat: 5.98, lng: 116.07 },
    { lat: 5.98, lng: 116.08 },
    { lat: 5.99, lng: 116.08 },
  ],
  segments: [],
  areaM2: 100,
  areaSqFt: 1076.39,
  areaHa: 0.01,
  areaAcre: 0.0247,
  perimeterM: 40,
  perimeterKm: 0.04,
  perimeterFt: 131.23,
  perimeterLink: 198.84,
  perimeterChain: 1.988,
  displayDistanceUnit: "m",
  displayAreaUnit: "m2",
  displayLanguage: "en",
  displayBaseMap: "osm",
};
const draft = {
  projectId: null,
  ownerName: "",
  lotNumber: "",
  village: "",
  district: "",
  notes: "",
  landRecord: {},
  polygon,
  drawingObjects: [],
  activeObjectId: null,
  schemaVersion: 3,
  savedAt: new Date().toISOString(),
};
await evaluate(`localStorage.clear(); localStorage.setItem('sabahlot-alpha-record', ${JSON.stringify(JSON.stringify(draft))}); location.reload(); true`);
await waitFor("document.querySelector('.sl-menu-button') !== null", "App did not reload");
await sleep(1500);
await openLotDrawer();
await sleep(250);
console.log("Browser QA: mobile drawer opened");

await waitForStep("Basic Information");
await setControl("Owner name", "QA Owner");
await setControl("Lot number", "QA-ALPHA-2026");
await setControl("Village", "QA Village");
await setControl("District", "QA District");
await clickNext();

await waitForStep("Land Case Type");
await setControl("Land case type", "inheritance_land");
await clickNext();

await waitForStep("Existing Records");
await toggleChecklist(["Geran", "Koordinat GPS"]);
await clickNext();

await waitForStep("Application Age");
await setControl("Application age", "over_20_years");
await clickNext();

await waitForStep("Family / Inheritance Details");
await setControl("Original applicant name", "QA Original Applicant");
await setControl("Original applicant status", "deceased");
await setControl("Main heir name", "QA Main Heir");
await setControl("Relationship to applicant", "Child");
await setControl("Can heirs identify the land location?", "yes");
await setControl("Land history notes", "QA family land history");
await clickNext();

await waitForStep("Issues / Risks");
await toggleChecklist(["Dokumen hilang", "Pertikaian sempadan"]);
await clickNext();

await waitForStep("Notes");
await setControl("General record notes", "QA preliminary notes");
await clickNext();

await waitForStep("Review & Save");
console.log("Browser QA: wizard data entry completed");

const mobile = await evaluate(`(() => {
  const drawer = document.querySelector('.sl-lot-drawer');
  const body = document.querySelector('.sl-drawer-body');
  const save = document.querySelector('.sl-save-button');
  if (!drawer || !body || !save) return { missingRequiredElement: true };
  const rect = drawer.getBoundingClientRect();
  save.scrollIntoView({ block: 'center' });
  const saveRect = save.getBoundingClientRect();
  return {
    drawerWithinViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
    canScroll: body.scrollHeight > body.clientHeight && getComputedStyle(body).overflowY === 'auto',
    saveVisible: saveRect.top >= 0 && saveRect.bottom <= innerHeight,
    saveEnabled: !save.disabled,
    mapVisible: document.querySelector('.sl-map-canvas').getBoundingClientRect().width > 0,
  };
})()`);
if (!Object.values(mobile).every(Boolean)) throw new Error(`Mobile QA failed: ${JSON.stringify(mobile)}`);
console.log("Browser QA: mobile layout checks passed");

await evaluate("document.querySelector('.sl-save-button').click(); true");
await waitFor("JSON.parse(localStorage.getItem('sabahlot_local_lots_v1') || '[]').length === 1", "Save did not persist local lot");
console.log("Browser QA: local save passed");

await evaluate("localStorage.removeItem('sabahlot-alpha-record'); location.reload(); true");
await waitFor("document.querySelector('.sl-menu-button') !== null", "Refresh failed");
await sleep(1500);
await openLotDrawer();
await evaluate(`(() => {
  const load = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Load');
  if (!load) throw new Error('Local Load button not found');
  load.click();
  return true;
})()`);
await sleep(250);

const loaded = {};
await waitForStep("Basic Information");
loaded.ownerName = await readControl("Owner name");
loaded.lotNumber = await readControl("Lot number");
loaded.village = await readControl("Village");
loaded.district = await readControl("District");
await clickNext();

await waitForStep("Land Case Type");
loaded.caseType = await readControl("Land case type");
await clickNext();

await waitForStep("Existing Records");
loaded.records = await checkedChecklistLabels();
await clickNext();

await waitForStep("Application Age");
loaded.applicationAge = await readControl("Application age");
await clickNext();

await waitForStep("Family / Inheritance Details");
loaded.applicant = await readControl("Original applicant name");
loaded.applicantStatus = await readControl("Original applicant status");
loaded.heir = await readControl("Main heir name");
loaded.relationship = await readControl("Relationship to applicant");
loaded.locationKnowledge = await readControl("Can heirs identify the land location?");
loaded.history = await readControl("Land history notes");
await clickNext();

await waitForStep("Issues / Risks");
loaded.issues = await checkedChecklistLabels();
await clickNext();

await waitForStep("Notes");
loaded.notes = await readControl("General record notes");
await clickNext();
await waitForStep("Review & Save");

loaded.mapLeaksHeir = await evaluate(`(() => {
  const mapText = document.querySelector('.sl-map-canvas')?.textContent || '';
  return mapText.includes('QA Main Heir') || mapText.includes('QA Original Applicant');
})()`);

const expected = {
  ownerName: "QA Owner",
  lotNumber: "QA-ALPHA-2026",
  village: "QA Village",
  district: "QA District",
  caseType: "inheritance_land",
  applicationAge: "over_20_years",
  applicant: "QA Original Applicant",
  applicantStatus: "deceased",
  heir: "QA Main Heir",
  relationship: "Child",
  locationKnowledge: "yes",
  history: "QA family land history",
  notes: "QA preliminary notes",
};
for (const [key, value] of Object.entries(expected)) {
  if (loaded[key] !== value) throw new Error(`Load mismatch for ${key}: ${loaded[key]}`);
}
for (const label of ["Geran", "Koordinat GPS"]) {
  if (!loaded.records.includes(label)) throw new Error(`Available record missing after load: ${label}`);
}
for (const label of ["Dokumen hilang", "Pertikaian sempadan"]) {
  if (!loaded.issues.includes(label)) throw new Error(`Issue tag missing after load: ${label}`);
}
if (loaded.mapLeaksHeir) throw new Error("Heir data leaked into map");

await evaluate("document.querySelector('.sl-drawer-close').click(); true");
await sleep(350);
const closed = await evaluate(`(() => {
  const drawer = document.querySelector('.sl-lot-drawer');
  return !drawer.classList.contains('is-open') && drawer.getBoundingClientRect().right <= 0 && document.querySelector('.sl-map-canvas').getBoundingClientRect().width > 0;
})()`);
if (!closed) throw new Error("Drawer did not release the map after close");

console.log(JSON.stringify({ saveLoad: "PASS", mobile, loaded, drawerClose: "PASS", finalStep: await currentStepTitle() }, null, 2));
socket.close();
clearTimeout(qaTimeout);
process.exit(0);
