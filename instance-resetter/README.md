# Instance Property Resetter

A Figma plugin that bulk-resets component instance overrides — surgically, across any scope you choose.

Built by **Daniel Fransix** · [x.com/danielfransix](https://x.com/danielfransix)

---

## What it does

When instances drift from their main component through overrides — wrong fill, wrong font, stretched to the wrong size — fixing them one by one is tedious. Instance Property Resetter scans your chosen scope, finds every instance, and resets only the properties you select, leaving everything else untouched.

---

## Requirements

- **Figma desktop app** — local plugins only work in the desktop app, not in the browser. Download it at [figma.com/downloads](https://www.figma.com/downloads/).
- The files from this repository downloaded or cloned to your computer.

---

## Loading the plugin

1. **Open the Figma desktop app** and open any file.
2. In the top menu bar, click **Main menu (the Figma logo) → Plugins → Development → Import plugin from manifest…**
3. In the file picker that opens, navigate to the `instance-resetter` folder and select `manifest.json`.
4. Click **Open**. The plugin is now installed locally.

To run it: **Main menu → Plugins → Development → Instance Property Resetter**

> The plugin only lives in your local Figma — it won't appear for other people or in the web app.

---

## How to use

1. Open the plugin from **Main menu → Plugins → Development → Instance Property Resetter**
2. Choose a **scope** — where the plugin should look for instances
3. Check the **properties** you want to reset
4. Click **Run Reset**
5. Watch the live progress counter at the bottom
6. When done, the status bar shows how many instances were reset

**Before running on a large file:** use the **Selection** scope first to test on a small area. If anything looks wrong, one **Ctrl+Z** (Windows) or **Cmd+Z** (Mac) undoes the entire run in a single step.

---

## Scope

| Scope | What it targets |
|---|---|
| **This Page** | Every instance on the current Figma page |
| **All Pages** | Every instance across all pages in the file |
| **Selection** | Only instances within your current selection — including instances nested inside selected frames or groups |

---

## Properties

### Instance

These properties are reset on the instance node and every layer inside it, all the way down.

| Property | What gets reset |
|---|---|
| **Size** | Resets the instance's width and height to match the main component |
| **Fill** | Resets fills on each layer to match the main component |
| **Stroke** | Resets strokes on each layer to match the main component |
| **Corner Radius** | Resets corner rounding — handles both uniform and individual per-corner values |
| **Effects** | Resets drop shadows, inner shadows, blurs, and background blurs |
| **Opacity** | Resets the opacity of every layer back to the main component value |

### Text Layers

These properties target only text layers found inside instances.

| Property | What gets reset |
|---|---|
| **Text Style** | Resets the text style — re-applies by style ID if one is set on the main component, otherwise resets font family, weight, size, line height, letter spacing, text case, and decoration individually |
| **Text Fill** | Resets text color to the main component's value |
| **Text Stroke** | Resets text stroke color and weight |
| **Text Content** | Resets the text characters to what the main component contains |

### Layer Names

Resets each layer's name to its Figma node type — frames become "Frame", text layers become "Text", ellipses become "Ellipse", boolean operations become "Union" / "Subtract" / "Intersect" / "Exclude", and so on.

Two sub-options appear when Layer Name is checked:

| Sub-option | What it does |
|---|---|
| **Include master components** | Component and component set layers are skipped by default — they're usually named intentionally. Enable this to rename them too. |
| **Include instances** | When on, each instance is renamed to its main component's name instead of the generic "Instance" label. When off, instances are left untouched. |

You can combine any mix of properties in a single run. Only checked properties are touched — everything else is left exactly as it is.

---

## How it works internally

The plugin walks each instance's layer tree in step with the main component's layer tree, matching children by index. For each matched pair it resets the selected properties from the component onto the instance layer — only writing a value if it actually differs from the master, so no unnecessary overrides are created.

- **Size** is applied only to the root instance node, not its children
- **Text properties** apply exclusively to text nodes
- **Mixed values** are detected and skipped — the plugin never writes a mixed/Symbol value
- **Nested instances** are each processed independently; deduplication prevents the same instance being processed twice
- **Font loading** happens automatically before any text modification
- **Large files** are processed one top-level frame at a time to keep memory bounded
- The entire run is grouped as a single undo action

---

## Notes

- Instances whose main component has been deleted or is from a disconnected library are silently skipped
- For large files, run on a **Selection** first to verify the result before doing a full-page run
- When resetting **Text Content**, the characters are set to whatever the main component contains at the time the plugin runs

---

## Files

```
instance-resetter/
├── manifest.json   Plugin manifest — tells Figma the plugin name and entry points
├── code.js         Main thread — scanning, tree walking, property resets
├── ui.html         Plugin UI — scope selector, property checkboxes, status bar
└── README.md       This file
```

---

*Made with care by Daniel Fransix*
