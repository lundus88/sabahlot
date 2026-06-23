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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const waitFor = async (expression, message) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(expression)) return;
    await sleep(250);
  }
  throw new Error(message);
};

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
await evaluate("document.querySelector('.sl-menu-button').click(); true");
await waitFor("document.querySelector('.sl-lot-drawer.is-open') !== null", "Drawer did not open");
await sleep(400);
console.log("Browser QA: mobile drawer opened");

const fillResult = await evaluate(`(() => {
  document.querySelectorAll('.sl-record-section').forEach((section) => { section.open = true; });
  const control = (text) => [...document.querySelectorAll('.sl-lot-form label')]
    .find((label) => label.querySelector(':scope > span')?.textContent.trim() === text)
    ?.querySelector('input, select, textarea');
  const set = (text, value) => {
    const element = control(text);
    if (!element) throw new Error('Missing control: ' + text);
    const prototype = element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  };
  set('Owner name', 'QA Owner');
  set('Lot number', 'QA-ALPHA-2026');
  set('Village', 'QA Village');
  set('District', 'QA District');
  set('Land case type', 'inheritance_land');
  set('Application age', 'over_20_years');
  set('Original applicant name', 'QA Original Applicant');
  set('Original applicant status', 'deceased');
  set('Main heir name', 'QA Main Heir');
  set('Relationship to applicant', 'Child');
  set('Can heirs identify the land location?', 'yes');
  set('Land history notes', 'QA family land history');
  set('General record notes', 'QA preliminary notes');
  ['Geran', 'Koordinat GPS', 'Dokumen hilang', 'Pertikaian sempadan'].forEach((text) => {
    const label = [...document.querySelectorAll('.sl-record-checklist label')]
      .find((item) => item.textContent.trim() === text);
    if (!label) throw new Error('Missing checkbox: ' + text);
    label.querySelector('input').click();
  });
  return true;
})()`);
if (!fillResult) throw new Error("Form fill failed");
await sleep(200);

const mobile = await evaluate(`(() => {
  const drawer = document.querySelector('.sl-lot-drawer');
  const body = document.querySelector('.sl-drawer-body');
  const save = document.querySelector('.sl-save-button');
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
await evaluate("document.querySelector('.sl-menu-button').click(); true");
await waitFor("document.querySelector('.sl-lot-drawer.is-open') !== null", "Drawer did not reopen");
await evaluate(`(() => {
  const load = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Load');
  if (!load) throw new Error('Local Load button not found');
  load.click();
  return true;
})()`);
await sleep(250);

const loaded = await evaluate(`(() => {
  const labelValue = (text) => [...document.querySelectorAll('.sl-lot-form label')]
    .find((label) => label.querySelector(':scope > span')?.textContent.trim() === text)
    ?.querySelector('input, select, textarea')?.value;
  const stored = JSON.parse(localStorage.getItem('sabahlot_local_lots_v1'))[0];
  const mapText = document.querySelector('.sl-map-canvas')?.textContent || '';
  return {
    lotNumber: labelValue('Lot number'),
    caseType: labelValue('Land case type'),
    applicant: labelValue('Original applicant name'),
    applicantStatus: labelValue('Original applicant status'),
    heir: labelValue('Main heir name'),
    relationship: labelValue('Relationship to applicant'),
    locationKnowledge: labelValue('Can heirs identify the land location?'),
    history: labelValue('Land history notes'),
    records: stored.land_record.recordsAvailable,
    issues: stored.land_record.issueTags,
    mapLeaksHeir: mapText.includes('QA Main Heir') || mapText.includes('QA Original Applicant'),
  };
})()`);
const expected = {
  lotNumber: "QA-ALPHA-2026",
  caseType: "inheritance_land",
  applicant: "QA Original Applicant",
  applicantStatus: "deceased",
  heir: "QA Main Heir",
  relationship: "Child",
  locationKnowledge: "yes",
  history: "QA family land history",
};
for (const [key, value] of Object.entries(expected)) {
  if (loaded[key] !== value) throw new Error(`Load mismatch for ${key}: ${loaded[key]}`);
}
if (loaded.records.join() !== "title,gps_coordinates") throw new Error("Available records mismatch");
if (loaded.issues.join() !== "lost_documents,boundary_dispute") throw new Error("Issue tags mismatch");
if (loaded.mapLeaksHeir) throw new Error("Heir data leaked into map");

await evaluate("document.querySelector('.sl-drawer-close').click(); true");
await sleep(350);
const closed = await evaluate(`(() => {
  const drawer = document.querySelector('.sl-lot-drawer');
  return !drawer.classList.contains('is-open') && drawer.getBoundingClientRect().right <= 0 && document.querySelector('.sl-map-canvas').getBoundingClientRect().width > 0;
})()`);
if (!closed) throw new Error("Drawer did not release the map after close");

console.log(JSON.stringify({ saveLoad: "PASS", mobile, loaded, drawerClose: "PASS" }, null, 2));
socket.close();
clearTimeout(qaTimeout);
process.exit(0);
