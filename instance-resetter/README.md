# Instance Property Resetter

A Figma plugin that bulk-resets component instance overrides — so your instances stay in sync with their master components, no matter how many there are.

Built by **Daniel Fransix** · [x.com/danielfransix](https://x.com/danielfransix)

---

## The problem it solves

You're working with component instances in Figma. Over time, they drift — someone changed a fill colour here, resized a text layer there, tweaked some padding somewhere else. Now a hundred instances across your file no longer look like the master component.

Fixing these overrides one by one is painful. **Instance Property Resetter** does it all at once — and you control exactly what gets reset.

---

## What you need

- **Figma desktop app** — local plugins only work in the desktop app (Windows or Mac), not in the browser.  
  Download it free at [figma.com/downloads](https://www.figma.com/downloads/).
- The files from this repository — download or clone them to your computer.

---

## How to install

1. Open the **Figma desktop app** and open any design file (or create a new one).
2. In the top menu bar, click the **Figma logo** (the main menu) → **Plugins** → **Development** → **Import plugin from manifest…**
3. A file picker window will open. Navigate to the `instance-resetter` folder (the one containing `manifest.json`), select **`manifest.json`**, and click **Open**.
4. That's it — the plugin is now installed on your machine.

> ⚠️ The plugin is installed **locally only**. It won't appear for teammates or in the browser version of Figma.

To run it after installing: **Figma logo → Plugins → Development → Instance Property Resetter**

---

## How to use

1. Open the plugin from **Figma logo → Plugins → Development → Instance Property Resetter**
2. Choose a **scope** — where should the plugin look for instances?
3. Tick the **properties** you want to reset
4. Click **Run Reset**
5. Watch the live progress indicator at the bottom of the plugin window
6. When it finishes, the status bar tells you how many instances were reset

💡 **Tip:** If you're working with a large file, test on a small **Selection** first. If anything looks off, a single **Ctrl+Z** (Windows) or **Cmd+Z** (Mac) undoes the entire run.

---

## Scope

This determines which part of your file the plugin scans for instances.

| Scope | What it affects |
|---|---|
| **This Page** | Every instance on the current page |
| **All Pages** | Every instance across every page in the file |
| **Selection** | Only instances inside whatever you currently have selected (including nested ones) |

---

## Properties you can reset

Tick only the properties you care about. Anything left unticked stays exactly as it is.

### Instance properties

These reset visual and layout properties on every layer inside every instance.

| Property | What gets reset |
|---|---|
| **Size** | Width and height of the instance, matched to the main component |
| **Fill** | Fill colours and gradients on every layer |
| **Stroke** | Stroke colours, weights, and styles on every layer |
| **Corner Radius** | Corner rounding — handles both uniform and individual per-corner values |
| **Effects** | Drop shadows, inner shadows, layer blurs, and background blurs |
| **Opacity** | Opacity value on every layer inside the instance |
| **Clip Content** | Whether content is clipped to the layer's bounds |
| **Auto Layout** | Direction, alignment, sizing modes, wrapping, positioning, and grow/shrink behaviour |
| **Padding** | Horizontal and vertical padding values (left, right, top, bottom) |
| **Spacing** | Space between auto-layout items and cross-axis spacing |

### Text properties

These only affect text layers found inside instances.

| Property | What gets reset |
|---|---|
| **Text Style** | Font family, weight, size, line height, letter spacing, text case, and decoration — applies by style ID if one is set on the main component, or resets each attribute individually |
| **Text Fill** | Text colour, matched to the main component |
| **Text Stroke** | Text stroke colour and weight |
| **Text Content** | The actual text characters — replaced with whatever the main component's text says |

### Layer Names

| Property | What gets reset |
|---|---|
| **Layer Name** | Renames each layer to its Figma node type — frames become "Frame", text layers become "Text", rectangles become "Rectangle", boolean operations become "Union" / "Subtract" / "Intersect" / "Exclude", and so on |

When **Layer Name** is ticked, two extra options appear:

| Sub-option | What it does |
|---|---|
| **Include master components** | By default, components and component sets are skipped (they're usually named intentionally). Turn this on to rename them too. |
| **Include instances** | When on, instances are renamed to their main component's name instead of the generic "Instance" label. When off, instances are left untouched. |

---

## How it works (under the hood)

1. The plugin scans your chosen scope and collects every component instance.
2. For each instance, it walks its layer tree side-by-side with the main component's layer tree.
3. For every matching layer pair, it compares the selected properties. If they differ, it copies the value from the main component to the instance — only when they're actually different, so no unnecessary overrides get created.
4. All text fonts are loaded automatically before any text changes are made.
5. The entire run is grouped into a single undo step — so **Ctrl+Z / Cmd+Z** undoes everything in one go.

**Design decisions that keep it snappy:**

- Instances are processed one top-level frame at a time to keep memory usage bounded.
- A main-component cache (capped at 1,000 entries) prevents redundant fetching.
- Fonts are loaded in batches of 5 to avoid hitting Figma's API limits.
- Deduplication ensures no instance is processed twice, even if it appears in nested selections.

---

## Troubleshooting

- **"No instances found"** — Make sure your selection or page actually contains component instances (not just regular frames or groups).
- **Instance skipped silently** — This happens when the instance's main component has been deleted, is in a disconnected library, or can't be loaded. The plugin skips these gracefully rather than throwing an error.
- **Plugin feels slow on a huge file** — It's processing thousands of layers. Use the **Selection** scope to narrow the work area, or be patient — the progress indicator will keep you updated.

---

## Files in this project

```
instance-resetter/
├── manifest.json   ← Tells Figma the plugin name and entry point
├── code.js         ← Main logic — scanning, tree walking, property resetting
├── ui.html         ← Plugin window — scope picker, checkboxes, status bar
└── README.md       ← This file
```

---

*Made with care by Daniel Fransix*
