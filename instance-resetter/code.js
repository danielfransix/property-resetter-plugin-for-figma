figma.showUI(__html__, { width: 420, height: 460, title: 'Instance Resetter' });

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'run') {
    try {
      await runReset(msg.scope, msg.properties);
    } catch (err) {
      figma.ui.postMessage({ type: 'error', message: err.message });
    }
    return;
  }
  if (msg.type === 'open_url') {
    figma.openExternal(msg.url);
  }
};

function isMixed(value) {
  return value === figma.mixed;
}

// Session-scoped font cache — avoids redundant loadFontAsync calls within one run.
var _fontCache = {};

function clearFontCache() { _fontCache = {}; }

async function ensureFont(fontName) {
  var key = fontName.family + '::' + fontName.style;
  if (!_fontCache[key]) {
    _fontCache[key] = true;
    await figma.loadFontAsync(fontName);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function runReset(scope, properties) {
  clearFontCache();

  var totalReset   = 0;
  var totalSkipped = 0;

  if (scope === 'selection') {
    var selection = figma.currentPage.selection;
    if (!selection || selection.length === 0) {
      figma.ui.postMessage({ type: 'error', message: 'Nothing selected. Select at least one layer.' });
      return;
    }

    var instances = collectFromSelection(selection);
    if (instances.length === 0) {
      figma.ui.postMessage({ type: 'error', message: 'No instances found in selection.' });
      return;
    }

    if (properties.textStyle || properties.textContent) {
      await preloadFonts(instances);
    }

    var result = await processInstances(instances, 'Selection', properties);
    totalReset   += result.reset;
    totalSkipped += result.skipped;

    figma.ui.postMessage({ type: 'done', count: totalReset, skipped: totalSkipped, pages: 1, scope: 'selection' });
    return;
  }

  var pages = scope === 'all'
    ? figma.root.children.slice()
    : [figma.currentPage];

  for (var pi = 0; pi < pages.length; pi++) {
    var page = pages[pi];
    var instances = page.findAll(function(n) { return n.type === 'INSTANCE'; });

    if (properties.textStyle || properties.textContent) {
      await preloadFonts(instances);
    }

    var result = await processInstances(instances, page.name, properties);
    totalReset   += result.reset;
    totalSkipped += result.skipped;
  }

  figma.ui.postMessage({ type: 'done', count: totalReset, skipped: totalSkipped, pages: pages.length, scope: scope });
}

// ─────────────────────────────────────────────────────────────────────────────

function collectFromSelection(selection) {
  var seen = {};
  var instances = [];
  for (var si = 0; si < selection.length; si++) {
    var sel = selection[si];
    if (sel.type === 'INSTANCE' && !seen[sel.id]) {
      seen[sel.id] = true;
      instances.push(sel);
    }
    if ('findAll' in sel) {
      var nested = sel.findAll(function(n) { return n.type === 'INSTANCE'; });
      for (var ni = 0; ni < nested.length; ni++) {
        var nd = nested[ni];
        if (!seen[nd.id]) {
          seen[nd.id] = true;
          instances.push(nd);
        }
      }
    }
  }
  return instances;
}

// Pre-collect all unique fonts from instance text nodes AND their main component
// text nodes, then load everything in parallel. Converts N sequential awaits
// into one Promise.all — the biggest single speedup on text-heavy files.
// Each unique main component is only scanned once regardless of how many
// instances share it.
async function preloadFonts(instances) {
  var fontMap    = {};
  var seenMains  = {};

  for (var i = 0; i < instances.length; i++) {
    var inst = instances[i];
    if (inst.removed) continue;

    // Instance text nodes — needed to write to them.
    var instTexts = inst.findAll(function(n) { return n.type === 'TEXT'; });
    for (var ti = 0; ti < instTexts.length; ti++) {
      collectFontsFromNode(instTexts[ti], fontMap);
    }

    // Main component text nodes — needed when resetting style/content to main values.
    // Deduplicated: many instances share the same main component.
    var main = inst.mainComponent;
    if (main && !seenMains[main.id]) {
      seenMains[main.id] = true;
      var mainTexts = main.findAll(function(n) { return n.type === 'TEXT'; });
      for (var mi = 0; mi < mainTexts.length; mi++) {
        collectFontsFromNode(mainTexts[mi], fontMap);
      }
    }
  }

  var fonts = [];
  for (var key in fontMap) { fonts.push(fontMap[key]); }
  if (fonts.length === 0) return;

  await Promise.all(fonts.map(function(f) {
    var k = f.family + '::' + f.style;
    if (!_fontCache[k]) {
      _fontCache[k] = true;
      return figma.loadFontAsync(f);
    }
    return Promise.resolve();
  }));
}

// Uses getStyledTextSegments (O(segments)) rather than character-by-character
// iteration (O(characters)) — significantly faster for long text nodes.
function collectFontsFromNode(textNode, fontMap) {
  try {
    var segments = textNode.getStyledTextSegments(['fontName']);
    for (var i = 0; i < segments.length; i++) {
      var fn = segments[i].fontName;
      if (fn && !isMixed(fn)) {
        fontMap[fn.family + '::' + fn.style] = fn;
      }
    }
  } catch (e) {
    if (!isMixed(textNode.fontName) && textNode.fontName) {
      fontMap[textNode.fontName.family + '::' + textNode.fontName.style] = textNode.fontName;
    }
  }
}

// Processes a list of instances, throttling progress messages to at most
// one per 80ms to avoid UI message queue overhead on large batches.
async function processInstances(instances, pageName, properties) {
  var reset   = 0;
  var skipped = 0;
  var total   = instances.length;
  var lastMsg = 0;

  for (var i = 0; i < total; i++) {
    var now = Date.now();
    if (now - lastMsg > 80 || i === 0) {
      figma.ui.postMessage({ type: 'progress', page: pageName, current: i + 1, total: total });
      lastMsg = now;
    }
    try {
      if (await resetInstance(instances[i], properties)) reset++;
      else skipped++;
    } catch (e) { skipped++; }
  }

  return { reset: reset, skipped: skipped };
}

// ─────────────────────────────────────────────────────────────────────────────

async function resetInstance(instance, properties) {
  if (instance.removed) return false;
  var main = instance.mainComponent;
  if (!main) return false;

  // Skip-if-unchanged for size — avoids triggering Figma's change tracking
  // when the instance is already the correct size.
  if (properties.size) {
    if (instance.width !== main.width || instance.height !== main.height) {
      try { instance.resize(main.width, main.height); } catch (e) {}
    }
  }

  await walkTree(instance, main, properties);
  return true;
}

// Walks instance and main component trees in lockstep by child index.
// Instances mirror component structure exactly, so index-based matching is correct.
async function walkTree(node, mainNode, properties) {
  if (!node || !mainNode) return;

  if (node.type === 'TEXT' && mainNode.type === 'TEXT') {
    await resetTextNode(node, mainNode, properties);
  } else {
    resetLayerNode(node, mainNode, properties);
  }

  if ('children' in node && 'children' in mainNode) {
    var len = Math.min(node.children.length, mainNode.children.length);
    for (var i = 0; i < len; i++) {
      await walkTree(node.children[i], mainNode.children[i], properties);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function resetLayerNode(node, mainNode, props) {
  // Guard figma.mixed before deepClone — JSON/structuredClone cannot handle Symbol values.
  if (props.fills && 'fills' in node && !isMixed(mainNode.fills)) {
    try { node.fills = deepClone(mainNode.fills); } catch (e) {}
  }
  if (props.strokes && 'strokes' in node && !isMixed(mainNode.strokes)) {
    try { node.strokes = deepClone(mainNode.strokes); } catch (e) {}
  }
  if (props.effects && 'effects' in node && !isMixed(mainNode.effects)) {
    try { node.effects = deepClone(mainNode.effects); } catch (e) {}
  }
  // Skip-if-unchanged for opacity — avoids unnecessary writes.
  if (props.opacity && 'opacity' in node && node.opacity !== mainNode.opacity) {
    try { node.opacity = mainNode.opacity; } catch (e) {}
  }
  if (props.cornerRadius) {
    resetCornerRadius(node, mainNode);
  }
}

function resetCornerRadius(node, mainNode) {
  try {
    if ('topLeftRadius' in node) {
      var tl = mainNode.topLeftRadius     || 0;
      var tr = mainNode.topRightRadius    || 0;
      var bl = mainNode.bottomLeftRadius  || 0;
      var br = mainNode.bottomRightRadius || 0;
      // Skip-if-unchanged — corner radius writes are expensive.
      if (node.topLeftRadius !== tl || node.topRightRadius !== tr ||
          node.bottomLeftRadius !== bl || node.bottomRightRadius !== br) {
        node.topLeftRadius     = tl;
        node.topRightRadius    = tr;
        node.bottomLeftRadius  = bl;
        node.bottomRightRadius = br;
      }
    } else if ('cornerRadius' in node && !isMixed(mainNode.cornerRadius)) {
      if (node.cornerRadius !== mainNode.cornerRadius) {
        node.cornerRadius = mainNode.cornerRadius;
      }
    }
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────────────────────

async function resetTextNode(node, mainNode, props) {
  if (props.textStyle) {
    await resetTextStyle(node, mainNode);
  }
  if (props.textFill && !isMixed(mainNode.fills)) {
    try { node.fills = deepClone(mainNode.fills); } catch (e) {}
  }
  if (props.textStroke && !isMixed(mainNode.strokes)) {
    try { node.strokes = deepClone(mainNode.strokes); } catch (e) {}
  }
  if (props.textContent && node.characters !== mainNode.characters) {
    try {
      // Fonts were pre-loaded — attempt direct write first.
      node.characters = mainNode.characters;
    } catch (e) {
      // Fallback: load this node's fonts now and retry.
      try {
        await loadAllFonts(node);
        node.characters = mainNode.characters;
      } catch (e2) {}
    }
  }
}

async function resetTextStyle(node, mainNode) {
  try {
    // Style-ID path: fastest — no font loading required.
    var mainStyleId = mainNode.textStyleId;
    if (mainStyleId && !isMixed(mainStyleId)) {
      node.textStyleId = mainStyleId;
      return;
    }

    // Individual-properties path: font must be loaded first.
    if (!isMixed(mainNode.fontName) && mainNode.fontName) {
      await ensureFont(mainNode.fontName); // no-op if already cached by preloadFonts
    }

    if (!isMixed(mainNode.fontSize))       node.fontSize       = mainNode.fontSize;
    if (!isMixed(mainNode.fontName))       node.fontName       = mainNode.fontName;
    if (!isMixed(mainNode.lineHeight))     node.lineHeight     = mainNode.lineHeight;
    if (!isMixed(mainNode.letterSpacing))  node.letterSpacing  = mainNode.letterSpacing;
    if (!isMixed(mainNode.textCase))       node.textCase       = mainNode.textCase;
    if (!isMixed(mainNode.textDecoration)) node.textDecoration = mainNode.textDecoration;
    if (mainNode.paragraphSpacing !== undefined) node.paragraphSpacing = mainNode.paragraphSpacing;
  } catch (e) {}
}

// Fallback font loader used when preloadFonts missed a node (e.g. dynamic content).
async function loadAllFonts(textNode) {
  var fontMap = {};
  collectFontsFromNode(textNode, fontMap);
  var fonts = [];
  for (var key in fontMap) { fonts.push(fontMap[key]); }
  await Promise.all(fonts.map(function(f) { return ensureFont(f); }));
}

// ─────────────────────────────────────────────────────────────────────────────

// Prefer structuredClone (faster, native) with JSON fallback for safety.
function deepClone(value) {
  try {
    return structuredClone(value);
  } catch (e) {
    return JSON.parse(JSON.stringify(value));
  }
}
