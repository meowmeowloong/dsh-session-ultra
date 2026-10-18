/**
 * dsh-session-ultra feature-store coverage.
 *
 * The fork adds per-feature toggles on top of dsh-session-manager:
 *   - features.<id>   — the feature itself (archive / tags / notes / favorite /
 *                       reviewLater / priority / move / migrate / delete /
 *                       copyId / batch / workspaceMgmt), all default ON
 *   - titlebar        — the conversation title-bar cluster, default OFF
 *   - rowMenu.<id>    — which actions join the native sidebar row "⋯" menu,
 *                       all default ON
 *
 * The store persists to localStorage key `dsh-session-ultra-features-v1` and
 * normalizes unknown/legacy blobs so an old or corrupted blob can NEVER
 * accidentally disable a feature (or switch the title bar on).
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mountClient } from "./helpers/client-harness.mjs";

const KEY = "dsh-session-ultra-features-v1";

// The client bundle runs inside a vm sandbox, so its objects carry another
// realm's Object.prototype and fail deepStrictEqual against host-realm
// objects. Round-trip through JSON before deep comparisons.
const plain = value => JSON.parse(JSON.stringify(value));

function setup(t, options = {}) {
  const app = mountClient(options);
  t.after(() => { app.exports.featureStore.reset(); app.dispose(); });
  return app;
}

test("feature store: defaults are titlebar OFF, every feature and row-menu item ON", async t => {
  const app = setup(t);
  const { featureStore, defaultFeaturePrefs, FEATURE_IDS, MENU_ITEM_IDS, MARK_FEATURE_IDS } = app.exports;

  assert.equal(featureStore.isTitlebarEnabled(), false, "title bar must default to OFF");
  assert.equal(featureStore.getSnapshot().titlebar, false);
  for (const id of FEATURE_IDS) {
    assert.equal(featureStore.isEnabled(id), true, `feature ${id} must default to ON`);
    assert.equal(featureStore.getSnapshot().features[id], true);
  }
  for (const id of MENU_ITEM_IDS) {
    assert.equal(featureStore.isMenuItemEnabled(id), true, `row-menu item ${id} must default to ON`);
    assert.equal(featureStore.getSnapshot().rowMenu[id], true);
  }
  assert.equal(featureStore.marksEnabled(), true);

  // defaultFeaturePrefs() must mirror the store defaults and cover every id.
  const defaults = defaultFeaturePrefs();
  assert.equal(defaults.titlebar, false);
  assert.deepEqual(Object.keys(defaults.features).sort(), [...FEATURE_IDS].sort());
  assert.deepEqual(Object.keys(defaults.rowMenu).sort(), [...MENU_ITEM_IDS].sort());
  for (const id of FEATURE_IDS) assert.equal(defaults.features[id], true);
  for (const id of MENU_ITEM_IDS) assert.equal(defaults.rowMenu[id], true);
  for (const id of MARK_FEATURE_IDS) assert.ok(FEATURE_IDS.includes(id), `mark feature ${id} must be a feature id`);
});

test("feature store: setFeature / setMenuItem / setTitlebar persist to dsh-session-ultra-features-v1", async t => {
  const app = setup(t);
  const { featureStore } = app.exports;
  const persisted = () => JSON.parse(app.localStorage.getItem(KEY));

  featureStore.setFeature("tags", false);
  assert.equal(featureStore.isEnabled("tags"), false);
  assert.equal(featureStore.isEnabled("notes"), true, "untouched features must stay on");
  assert.equal(persisted().features.tags, false);
  assert.equal(persisted().features.notes, true);

  featureStore.setTitlebar(true);
  assert.equal(featureStore.isTitlebarEnabled(), true);
  assert.equal(persisted().titlebar, true);

  featureStore.setMenuItem("delete", false);
  assert.equal(featureStore.getSnapshot().rowMenu.delete, false);
  assert.equal(persisted().rowMenu.delete, false);

  // The whole snapshot round-trips through the blob.
  assert.deepEqual(plain(persisted()), plain(featureStore.getSnapshot()));

  // Unknown ids are ignored and never leak into the persisted blob.
  featureStore.setFeature("bogus", false);
  featureStore.setMenuItem("bogus", false);
  assert.equal(featureStore.isEnabled("bogus"), true);
  assert.equal(featureStore.isMenuItemEnabled("bogus"), true);
  assert.equal(Object.hasOwn(persisted().features, "bogus"), false);
  assert.equal(Object.hasOwn(persisted().rowMenu, "bogus"), false);

  // Every mutation replaces the snapshot object and notifies subscribers.
  const seen = [];
  const unsubscribe = featureStore.subscribe(() => seen.push(featureStore.getSnapshot()));
  const before = featureStore.getSnapshot();
  featureStore.setFeature("favorite", false);
  assert.notEqual(featureStore.getSnapshot(), before, "setFeature must produce a fresh snapshot");
  assert.equal(seen.length, 1);
  unsubscribe();
  featureStore.setFeature("favorite", true);
  assert.equal(seen.length, 1, "unsubscribe must stop notifications");
});

test("feature store: marks row-menu item requires at least one mark feature", async t => {
  const app = setup(t);
  const { featureStore, MARK_FEATURE_IDS } = app.exports;

  assert.equal(featureStore.isMenuItemEnabled("marks"), true);

  for (const id of MARK_FEATURE_IDS) featureStore.setFeature(id, false);
  assert.equal(featureStore.marksEnabled(), false);
  assert.equal(featureStore.isMenuItemEnabled("marks"), false, "marks item must hide when no mark feature is left");

  featureStore.setFeature("notes", true);
  assert.equal(featureStore.marksEnabled(), true);
  assert.equal(featureStore.isMenuItemEnabled("marks"), true, "one surviving mark feature is enough");

  // The rowMenu toggle itself still wins.
  featureStore.setMenuItem("marks", false);
  assert.equal(featureStore.isMenuItemEnabled("marks"), false);

  // Non-marks items gate on BOTH their rowMenu toggle and their feature.
  featureStore.setFeature("delete", false);
  assert.equal(featureStore.isMenuItemEnabled("delete"), false, "feature gate must hide the menu item");
  featureStore.setFeature("delete", true);
  assert.equal(featureStore.isMenuItemEnabled("delete"), true);
  featureStore.setMenuItem("delete", false);
  assert.equal(featureStore.isMenuItemEnabled("delete"), false, "rowMenu gate must hide the menu item");
});

test("feature store: reset() restores every default in memory and on disk", async t => {
  const app = setup(t);
  const { featureStore, defaultFeaturePrefs } = app.exports;

  for (const id of app.exports.FEATURE_IDS) featureStore.setFeature(id, false);
  for (const id of app.exports.MENU_ITEM_IDS) featureStore.setMenuItem(id, false);
  featureStore.setTitlebar(true);

  featureStore.reset();
  assert.deepEqual(plain(featureStore.getSnapshot()), plain(defaultFeaturePrefs()));
  assert.equal(featureStore.isTitlebarEnabled(), false);
  assert.equal(JSON.parse(app.localStorage.getItem(KEY)).titlebar, false);
  assert.deepEqual(plain(JSON.parse(app.localStorage.getItem(KEY))), plain(defaultFeaturePrefs()));
});

test("feature store: persisted prefs are picked up when the module loads", async t => {
  const app = setup(t, {
    initialStorage: {
      [KEY]: JSON.stringify({
        version: 1,
        features: { tags: false, batch: false },
        titlebar: true,
        rowMenu: { copyId: false }
      })
    }
  });
  const { featureStore } = app.exports;

  assert.equal(featureStore.isTitlebarEnabled(), true, "persisted titlebar must load");
  assert.equal(featureStore.isEnabled("tags"), false, "persisted feature toggle must load");
  assert.equal(featureStore.isEnabled("batch"), false);
  assert.equal(featureStore.isEnabled("notes"), true, "missing ids must fall back to ON");
  assert.equal(featureStore.isMenuItemEnabled("copyId"), false, "persisted rowMenu toggle must load");
  assert.equal(featureStore.isMenuItemEnabled("marks"), true);
});

test("feature store: corrupted blobs fall back to defaults instead of disabling features", async () => {
  // Invalid JSON / non-object shapes must yield the full defaults.
  for (const raw of ["{ not json at all", "null", "[]", "42", '"string"', ""]) {
    const app = mountClient({ initialStorage: { [KEY]: raw } });
    const snap = app.exports.featureStore.getSnapshot();
    app.dispose();
    assert.equal(snap.titlebar, false, `blob ${JSON.stringify(raw)} must not enable the title bar`);
    for (const id of Object.keys(snap.features)) {
      assert.equal(snap.features[id], true, `blob ${JSON.stringify(raw)} must not disable feature ${id}`);
    }
    for (const id of Object.keys(snap.rowMenu)) {
      assert.equal(snap.rowMenu[id], true, `blob ${JSON.stringify(raw)} must not disable row-menu item ${id}`);
    }
  }
});

test("feature store: legacy/junk field values never disable a feature and never enable the title bar", async t => {
  // Strings/numbers/null in boolean positions must fall back to ON for
  // features and row-menu items, and to OFF for the title bar. Only real
  // booleans are honored.
  const app = setup(t, {
    initialStorage: {
      [KEY]: JSON.stringify({
        version: 2,
        features: { tags: "false", archive: 1, notes: null, favorite: "off", reviewLater: 0, priority: "0" },
        titlebar: "true",
        rowMenu: { copyId: "no", marks: 1, delete: 0 },
        junk: { nested: true }
      })
    }
  });
  const { featureStore, FEATURE_IDS, MENU_ITEM_IDS } = app.exports;
  const snap = featureStore.getSnapshot();

  assert.equal(snap.titlebar, false, "string 'true' must not switch the title bar on");
  assert.equal(featureStore.isTitlebarEnabled(), false);
  for (const id of FEATURE_IDS) {
    assert.equal(featureStore.isEnabled(id), true, `junk value must not disable feature ${id}`);
  }
  for (const id of MENU_ITEM_IDS) {
    assert.equal(featureStore.isMenuItemEnabled(id), true, `junk value must not disable row-menu item ${id}`);
  }
  // Unknown keys are dropped by normalization.
  assert.equal(Object.hasOwn(snap.features, "junk"), false);
  assert.equal(Object.hasOwn(snap, "junk"), false);

  // Explicit boolean false IS honored (otherwise toggles could not persist)...
  featureStore.setFeature("delete", false);
  featureStore.setTitlebar(true);
  const app2 = setup(t, {
    initialStorage: {
      [KEY]: JSON.stringify({ features: { delete: false }, titlebar: true, rowMenu: { move: false } })
    }
  });
  assert.equal(app2.exports.featureStore.isEnabled("delete"), false, "explicit false must be honored");
  assert.equal(app2.exports.featureStore.isTitlebarEnabled(), true, "explicit true must be honored");
  assert.equal(app2.exports.featureStore.isMenuItemEnabled("move"), false, "explicit rowMenu false must be honored");
  // ...and so must titlebar string/number junk stay off in the same blob.
  const app3 = setup(t, { initialStorage: { [KEY]: JSON.stringify({ titlebar: 1 }) } });
  assert.equal(app3.exports.featureStore.isTitlebarEnabled(), false, "numeric 1 must not enable the title bar");
});

test("feature store: a corrupted blob leaves the store fully writable afterwards", async t => {
  const app = setup(t, { initialStorage: { [KEY]: "{{{" } });
  const { featureStore } = app.exports;

  assert.equal(featureStore.isTitlebarEnabled(), false);
  featureStore.setTitlebar(true);
  featureStore.setFeature("tags", false);
  const persisted = JSON.parse(app.localStorage.getItem(KEY));
  assert.equal(persisted.titlebar, true);
  assert.equal(persisted.features.tags, false);
  assert.equal(persisted.features.notes, true);
});
