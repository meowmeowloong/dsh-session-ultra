/**
 * dsh-session-ultra native sidebar row-menu integration.
 *
 * Five menu items register in the `sidebar.workspaces.session.menu.item`
 * slot (orders interleaving with DSH's own pin/rename/fork/archive items):
 *   RowMenuCopyIdItem  (150) — copies the session id
 *   RowMenuMarksItem   (250) — opens the AnnotationDialog
 *   RowMenuMigrateItem (350) — opens the MigratePresetDialog
 *   RowMenuMoveItem    (375) — opens the MoveDialog
 *   RowMenuDeleteItem  (500) — opens the ConfirmDialog (danger)
 *
 * Each item renders nothing unless both its rowMenu toggle and its feature
 * gate are on. Because the native row menu unmounts on pointer-leave, items
 * cannot host dialogs themselves: they stash a payload in menuActionStore
 * and the persistent MenuDialogHost (registered in `shell.overlay`) renders
 * the matching dialog.
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mountClient, nodes, text } from "./helpers/client-harness.mjs";

const MARK_FEATURE_IDS = ["tags", "notes", "favorite", "reviewLater", "priority"];
const SESSION = { id: "s1", displayTitle: "Alpha Session", workspaceId: "ws1", agentPreset: "PresetA", running: true };

// The items under test, with their slot registration and gating.
const ITEMS = [
  {
    comp: "RowMenuCopyIdItem", slotId: "ultra-copy-id", order: 150,
    menuItemId: "copyId", label: "复制会话 ID", danger: false,
    disableFeature: fs => fs.setFeature("copyId", false),
    enableFeature: fs => fs.setFeature("copyId", true)
  },
  {
    comp: "RowMenuMarksItem", slotId: "ultra-marks", order: 250,
    menuItemId: "marks", label: "标签/备注", danger: false,
    disableFeature: fs => { for (const id of MARK_FEATURE_IDS) fs.setFeature(id, false); },
    enableFeature: fs => { for (const id of MARK_FEATURE_IDS) fs.setFeature(id, true); }
  },
  {
    comp: "RowMenuMigrateItem", slotId: "ultra-migrate", order: 350,
    menuItemId: "migrate", label: "迁移预设", danger: false,
    disableFeature: fs => fs.setFeature("migrate", false),
    enableFeature: fs => fs.setFeature("migrate", true)
  },
  {
    comp: "RowMenuMoveItem", slotId: "ultra-move", order: 375,
    menuItemId: "move", label: "移动至工作区", danger: false,
    disableFeature: fs => fs.setFeature("move", false),
    enableFeature: fs => fs.setFeature("move", true)
  },
  {
    comp: "RowMenuDeleteItem", slotId: "ultra-delete", order: 500,
    menuItemId: "delete", label: "删除会话", danger: true,
    disableFeature: fs => fs.setFeature("delete", false),
    enableFeature: fs => fs.setFeature("delete", true)
  }
];

function setup(t) {
  const app = mountClient();
  t.after(() => { app.exports.featureStore.reset(); app.exports.menuActionStore.close(); app.dispose(); });
  return app;
}

// Props the host slot framework passes to a row-menu item; useMenuOpenState
// is stubbed so tests can observe the "close the menu" call.
function rowMenuProps(t, onMenuOpen) {
  return {
    t,
    sessionId: "s1",
    displayTitle: "Alpha Session",
    useMenuOpenState: () => [true, onMenuOpen],
    useSessions: (selector) => selector({ ids: ["s1"], byId: { s1: SESSION }, current: "" })
  };
}

// A click event whose currentTarget exposes a real rect, so the static
// anchor protocol gets exercised (top = bottom + 6, left = right - 360).
const menuClickEvent = () => ({
  currentTarget: {
    nodeType: 1,
    getBoundingClientRect: () => ({ top: 40, bottom: 72, left: 468, right: 500, width: 32, height: 32 })
  }
});

test("row menu: five items register in the sidebar session-row menu slot and MenuDialogHost in shell.overlay", () => {
  const app = mountClient();
  for (const item of ITEMS) {
    const entry = app.registered.get(item.slotId);
    assert.ok(entry, `${item.slotId} must be registered`);
    assert.equal(entry.options.name, "sidebar.workspaces.session.menu.item");
    assert.equal(entry.options.order, item.order);
    assert.equal(entry.component, app.exports[item.comp], `${item.slotId} must register the exported component`);
  }
  const host = app.registered.get("ultra-menu-dialog-host");
  assert.ok(host, "MenuDialogHost must be registered");
  assert.equal(host.options.name, "shell.overlay");
  assert.equal(host.component, app.exports.MenuDialogHost);
  app.dispose();
});

test("row menu: each item renders a menu button when its feature and rowMenu toggles are on", async t => {
  const app = setup(t);
  for (const item of ITEMS) {
    const host = app.mountComponent(app.exports[item.comp], rowMenuProps(app.t, () => {}));
    const tree = host.tree;
    assert.ok(tree, `${item.comp} must render a menu item`);
    assert.equal(tree.type, "button", `${item.comp} must render a clickable button`);
    assert.equal(tree.props.role, "menuitem");
    assert.ok((tree.props.className || "").includes("sm-headerMenuItem"), `${item.comp} must use sm-headerMenuItem`);
    assert.equal((tree.props.className || "").includes("sm-headerMenuItemDanger"), item.danger,
      `${item.comp} danger styling must match its destructive nature`);
    assert.ok(text(tree).includes(item.label), `${item.comp} must show "${item.label}", got "${text(tree)}"`);
    host.dispose();
  }
});

test("row menu: each item renders null when its rowMenu toggle is off", async t => {
  const app = setup(t);
  const { featureStore } = app.exports;
  for (const item of ITEMS) {
    const host = app.mountComponent(app.exports[item.comp], rowMenuProps(app.t, () => {}));
    assert.ok(host.tree, `${item.comp} must render before the toggle flips`);
    featureStore.setMenuItem(item.menuItemId, false);
    host.render();
    assert.equal(host.tree, null, `${item.comp} must render null with rowMenu.${item.menuItemId} off`);
    featureStore.setMenuItem(item.menuItemId, true);
    host.render();
    assert.ok(host.tree, `${item.comp} must come back when rowMenu.${item.menuItemId} is on again`);
    host.dispose();
  }
});

test("row menu: each item renders null when its feature gate is off", async t => {
  const app = setup(t);
  const { featureStore } = app.exports;
  for (const item of ITEMS) {
    const host = app.mountComponent(app.exports[item.comp], rowMenuProps(app.t, () => {}));
    assert.ok(host.tree, `${item.comp} must render before the feature flips`);
    item.disableFeature(featureStore);
    host.render();
    assert.equal(host.tree, null, `${item.comp} must render null with its feature off`);
    item.enableFeature(featureStore);
    host.render();
    assert.ok(host.tree, `${item.comp} must come back when its feature is on again`);
    host.dispose();
  }
});

test("row menu: marks item needs at least one mark feature", async t => {
  const app = setup(t);
  const { featureStore } = app.exports;
  const host = app.mountComponent(app.exports.RowMenuMarksItem, rowMenuProps(app.t, () => {}));
  assert.ok(host.tree, "marks item renders with every mark feature on");

  for (const id of MARK_FEATURE_IDS) featureStore.setFeature(id, false);
  host.render();
  assert.equal(host.tree, null, "marks item must hide when no mark feature is left");

  featureStore.setFeature("notes", true);
  host.render();
  assert.ok(host.tree, "a single surviving mark feature keeps the marks item alive");
  host.dispose();
});

test("row menu: dialog items close the menu and stash the right payload in menuActionStore", async t => {
  const app = setup(t);
  const { menuActionStore } = app.exports;
  const expectations = [
    { comp: "RowMenuMarksItem", type: "marks" },
    { comp: "RowMenuMigrateItem", type: "migrate", agentPreset: "PresetA" },
    { comp: "RowMenuMoveItem", type: "move", workspaceId: "ws1" },
    { comp: "RowMenuDeleteItem", type: "delete", running: true }
  ];
  for (const spec of expectations) {
    const menuOpenCalls = [];
    const host = app.mountComponent(app.exports[spec.comp], rowMenuProps(app.t, v => menuOpenCalls.push(v)));
    host.tree.props.onClick(menuClickEvent());
    assert.deepEqual(menuOpenCalls, [false], `${spec.comp} must close the row menu`);
    const action = menuActionStore.getSnapshot();
    assert.ok(action, `${spec.comp} must open a pending menu action`);
    assert.equal(action.type, spec.type, `${spec.comp} must stash type "${spec.type}"`);
    assert.equal(action.sessionId, "s1");
    assert.equal(action.displayTitle, "Alpha Session");
    // Static-anchor protocol: { top, left } computed from the menu item rect.
    assert.equal(action.anchor.top, 78);
    assert.equal(action.anchor.left, 140);
    if (spec.agentPreset !== undefined) assert.equal(action.agentPreset, spec.agentPreset, "migrate must carry the session's preset");
    if (spec.workspaceId !== undefined) assert.equal(action.workspaceId, spec.workspaceId, "move must carry the session's workspace");
    if (spec.running !== undefined) assert.equal(action.running, spec.running, "delete must carry the running flag");
    menuActionStore.close();
    assert.equal(menuActionStore.getSnapshot(), null);
    host.dispose();
  }
});

test("row menu: copy-id item writes the session id to the clipboard and opens no dialog", async t => {
  const app = setup(t);
  const { menuActionStore } = app.exports;
  const menuOpenCalls = [];
  const host = app.mountComponent(app.exports.RowMenuCopyIdItem, rowMenuProps(app.t, v => menuOpenCalls.push(v)));
  host.tree.props.onClick(menuClickEvent());
  assert.deepEqual(app.clipboardWrites, ["s1"], "the session id must land in navigator.clipboard");
  assert.deepEqual(menuOpenCalls, [false], "copy-id must close the row menu too");
  assert.equal(menuActionStore.getSnapshot(), null, "copy-id must not open a dialog");
  host.dispose();
});

test("MenuDialogHost returns null while no action is pending and again after close()", async t => {
  const app = setup(t);
  const { MenuDialogHost, menuActionStore } = app.exports;
  const host = app.mountComponent(MenuDialogHost, { t: app.t });
  assert.equal(host.tree, null, "empty menuActionStore must render nothing");

  menuActionStore.open({ type: "marks", sessionId: "s1", displayTitle: "Alpha Session", anchor: null });
  host.render();
  assert.equal(host.tree.type, app.exports.AnnotationDialog, "a pending marks action must render AnnotationDialog");

  menuActionStore.close();
  host.render();
  assert.equal(host.tree, null, "close() must return the host to null");
  host.dispose();
});

test("MenuDialogHost renders the matching dialog component for each action type", async t => {
  const app = setup(t);
  const { MenuDialogHost, menuActionStore } = app.exports;
  const anchor = { top: 78, left: 140 };
  const cases = [
    {
      action: { type: "marks", sessionId: "s1", displayTitle: "Alpha Session", anchor },
      comp: "AnnotationDialog",
      check: (tree, t) => {
        assert.equal(tree.props.key, "marks-s1", "marks dialog must be keyed per session");
        assert.equal(tree.props.sessionId, "s1");
        assert.equal(tree.props.displayTitle, "Alpha Session");
        assert.equal(tree.props.anchor, anchor);
      }
    },
    {
      action: { type: "move", sessionId: "s1", displayTitle: "Alpha Session", workspaceId: "ws1", anchor },
      comp: "MoveDialog",
      check: (tree, t) => {
        assert.equal(tree.props.open, true);
        assert.equal(tree.props.currentWorkspaceId, "ws1", "MoveDialog must default to the session's workspace");
        assert.equal(tree.props.title, t("confirm.move.title"));
      }
    },
    {
      action: { type: "migrate", sessionId: "s1", displayTitle: "Alpha Session", agentPreset: "PresetA", anchor },
      comp: "MigratePresetDialog",
      check: (tree, t) => {
        assert.equal(tree.props.open, true);
        assert.equal(tree.props.currentPreset, "PresetA", "MigratePresetDialog must start from the session's preset");
      }
    },
    {
      action: { type: "delete", sessionId: "s1", displayTitle: "Alpha Session", running: true, anchor },
      comp: "ConfirmDialog",
      check: (tree, t) => {
        assert.equal(tree.props.open, true);
        assert.equal(tree.props.danger, true, "delete confirm must be a danger dialog");
        assert.equal(tree.props.title, t("confirm.delete.title"));
        assert.ok(tree.props.description.includes("Alpha Session"), "delete confirm must name the session");
        assert.ok(tree.props.warning.includes(t("bulk.dialog.warning.delete")), "delete confirm must carry the irreversibility warning");
      }
    }
  ];
  for (const c of cases) {
    menuActionStore.open(c.action);
    const host = app.mountComponent(MenuDialogHost, { t: app.t });
    assert.ok(host.tree, `action "${c.action.type}" must render a dialog`);
    assert.equal(host.tree.type, app.exports[c.comp], `action "${c.action.type}" must render ${c.comp}`);
    c.check(host.tree, app.t);
    menuActionStore.close();
    host.render();
    assert.equal(host.tree, null, `action "${c.action.type}" must clear after close()`);
    host.dispose();
  }
});

test("row menu: clicking the delete item hands the action to MenuDialogHost end to end", async t => {
  const app = setup(t);
  const { MenuDialogHost, menuActionStore } = app.exports;
  const itemHost = app.mountComponent(app.exports.RowMenuDeleteItem, rowMenuProps(app.t, () => {}));
  itemHost.tree.props.onClick(menuClickEvent());
  assert.equal(menuActionStore.getSnapshot().type, "delete");

  const dialogHost = app.mountComponent(MenuDialogHost, { t: app.t });
  assert.equal(dialogHost.tree.type, app.exports.ConfirmDialog, "the stashed delete action must surface a ConfirmDialog");
  assert.equal(dialogHost.tree.props.title, app.t("confirm.delete.title"));
  dialogHost.dispose();
  itemHost.dispose();
});
