# Instance Resetter

A Figma plugin that bulk-resets component instance overrides — surgically, across any scope you choose.

Built by **Daniel Fransix** · [x.com/danielfransix](https://x.com/danielfransix)

---

## What it does

When instances are detached from their main component's intended appearance through overrides — wrong fill, wrong font, stretched to the wrong size — fixing them one by one is tedious. Instance Resetter scans your chosen scope, finds every instance, and resets only the properties you select, leaving everything else untouched.

---

## Scope

Choose where the plugin looks for instances before running.

| Scope | What it targets |
|---|---|
| **This Page** | Every instance on the current Figma page |
| **All Pages** | Every instance across all pages in the file |
| **Selection** | Only instances within your current selection — including any instances nested inside selected frames or groups |

The **Selection** scope is useful for targeted fixes: select a section of your canvas, a specific frame, or a handful of instances directly, and the plugin restricts its work to that area.

---

## Properties

### Instance

These properties are reset on the instance node and every layer inside it down to the deepest child.

| Property | What gets reset |
|---|---|
| **Size** | Resets the instance's width and height to exactly match the main component dimensions |
| **Fill** | Copies fills from the corresponding layer in the main component to each layer in the instance |
| **Stroke** | Copies strokes from the corresponding layer in the main component |
| **Corner Radius** | Resets corner radius — handles both uniform radius and individual per-corner values |
| **Effects** | Resets drop shadows, inner shadows, blurs, and background blurs |
| **Opacity** | Resets the opacity of every layer back to the main component value |

### Text Layers

These properties target only `TEXT` nodes found inside instances. Non-text layers are skipped when these are selected.

| Property | What gets reset |
|---|---|
| **Text Style** | Restores the text style (if a named style is applied on the main component, it is re-applied by style ID; otherwise individual properties — font family, weight, size, line height, letter spacing, text case, text decoration — are individually restored) |
| **Text Fill** | Resets the text color fills back to what the main component specifies |
| **Text Stroke** | Resets text stroke back to the main component value |
| **Text Content** | Replaces the text characters with the original content from the main component |

You can combine any mix of properties in a single run. Only checked properties are touched — the rest are left exactly as they are.

---

## How to use

1. Open the plugin from **Plugins → Instance Resetter**
2. Choose a scope: **This Page**, **All Pages**, or **Selection**
3. Check the properties you want to reset
4. Click **Run Reset**
5. Watch the live progress counter — the status bar shows the current page and how many instances have been processed
6. When complete, the status shows how many instances were reset and across how many pages

---

## How the reset works internally

The plugin walks each instance's layer tree in lockstep with the main component's layer tree, matching children by index (Figma instances always mirror the component structure exactly). For each matching pair of nodes it copies the selected properties from the main component node to the instance node.

- **Size** is only applied to the root instance node, not its children
- **Text properties** are applied exclusively to `TEXT` nodes; all other nodes are skipped for text-specific options
- **Mixed values** (e.g. per-character text colors) are detected and skipped safely — the plugin never attempts to clone a `figma.mixed` value
- **Nested instances** are each processed independently — the plugin finds all instances at every depth and queues them individually, deduplicating by ID to avoid processing the same instance twice if both a parent and child are in the selection
- **Font loading** is handled automatically before any text modification; the plugin resolves all font variants used in mixed-font text nodes before writing

---

## Notes

- Instances whose main component has been deleted or is from a disconnected library will be skipped silently
- The entire run is grouped as a single undo action — one Ctrl+Z / Cmd+Z undoes everything
- For large files with many instances, use **Selection** scope to limit the blast radius before doing a full page run
- When resetting **Text Content**, the characters are set to what the main component contains at the time the plugin runs — if the component's text was also overridden, the component's current value is used

---

## Files

```
instance-resetter/
├── manifest.json   Plugin manifest
├── code.js         Main thread — scanning, tree walking, property resets
├── ui.html         Plugin UI — scope selector, property checkboxes, status
└── README.md       This file
```

---

## Publishing

To publish this plugin to the Figma Community:

1. Go to **figma.com → Your profile → Plugins → Create new plugin**
2. Follow the setup steps — Figma will generate a unique numeric plugin ID
3. Replace the `id` field in `manifest.json` with the generated ID
4. Submit for review through the Figma developer portal

---

*Made with care by Daniel Fransix*
