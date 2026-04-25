figma.showUI(__html__, { width: 600, height: 800, title: 'Instance Property Resetter' });

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'resize') {
    figma.ui.resize(600, msg.height);
    return;
  }
  if (msg.type === 'run') {
    try {
      await runReset(msg.scope, msg.properties);
    } catch (err) {
      figma.ui.postMessage({
        type: 'error',
        message: err.message || 'An unexpected error occurred. Try a smaller selection and run again.',
      });
    }
    return;
  }
  if (msg.type === 'open_url') {
    var allowed = [
      'https://x.com/danielfransix',
      'https://danielfransix.short.gy/buy-coffee',
    ];
    if (allowed.indexOf(msg.url) !== -1) {
      figma.openExternal(msg.url);
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────

function isMixed(value) {
  return value === figma.mixed;
}

var _fontCache = {};
var _mainComponentCache = {};
function clearCaches() { 
  _fontCache = {}; 
  _mainComponentCache = {};
}

async function getMainComponentCached(instance) {
  if (instance.mainComponentId) {
    if (_mainComponentCache[instance.mainComponentId]) {
      return _mainComponentCache[instance.mainComponentId];
    }
    var main = await instance.getMainComponentAsync();
    _mainComponentCache[instance.mainComponentId] = main;
    return main;
  }
  return await instance.getMainComponentAsync();
}

async function ensureFont(fontName) {
  var key = fontName.family + '::' + fontName.style;
  if (!_fontCache[key]) {
    _fontCache[key] = true;
    await figma.loadFontAsync(fontName);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function runReset(scope, properties) {
  clearCaches();

  var totalReset   = 0;
  var totalSkipped = 0;
  var totalRenamed = 0;

  var hasInstanceProps = !!(
    properties.size || properties.fills || properties.strokes ||
    properties.cornerRadius || properties.effects || properties.opacity ||
    properties.textStyle || properties.textFill || properties.textStroke || properties.textContent
  );

  var layerNameOpts = null;
  if (properties.layerName) {
    layerNameOpts = {
      includeComponents: !!properties.layerNameIncludeComponents,
      includeInstances:  !!properties.layerNameIncludeInstances,
    };
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  if (scope === 'selection') {
    var selection = figma.currentPage.selection;
    if (!selection || selection.length === 0) {
      figma.ui.postMessage({ type: 'error', message: 'Nothing selected. Select at least one layer.' });
      return;
    }

    var instances = [];
    if (hasInstanceProps) {
      instances = collectFromSelection(selection);
      if (instances.length === 0 && !layerNameOpts) {
        figma.ui.postMessage({ type: 'error', message: 'No instances found in selection.' });
        return;
      }
    }

    if (instances.length > 0) {
      if (properties.textStyle || properties.textContent) {
        await preloadFonts(instances);
      }
      var r = await processInstances(instances, 'Selection', properties);
      totalReset   += r.reset;
      totalSkipped += r.skipped;
    }

    if (layerNameOpts) {
      for (var si = 0; si < selection.length; si++) {
        totalRenamed += await resetNamesInSubtree(selection[si], layerNameOpts);
      }
    }

    var notifyMsg = buildNotifyMessage(totalReset, totalRenamed);
    if (notifyMsg) figma.notify(notifyMsg + ' in selection');
    figma.ui.postMessage({ type: 'done', count: totalReset, renamed: totalRenamed, skipped: totalSkipped, pages: 1, scope: 'selection' });
    return;
  }

  // ── This Page / All Pages ──────────────────────────────────────────────────
  var pages = scope === 'all'
    ? figma.root.children.slice()
    : [figma.currentPage];

  if (scope === 'all' && pages.length > 1) {
    try { await figma.loadAllPagesAsync(); } catch (e) {}
  }

  var multiPage = pages.length > 1;

  for (var pi = 0; pi < pages.length; pi++) {
    var page     = pages[pi];
    var topLevel = page.children;

    for (var ci = 0; ci < topLevel.length; ci++) {
      var frame = topLevel[ci];

      var instances = hasInstanceProps ? collectFromFrame(frame) : [];
      if (instances.length === 0 && !layerNameOpts) continue;

      var label = multiPage ? page.name + ' / ' + frame.name : frame.name;

      try {
        if (instances.length > 0) {
          if (properties.textStyle || properties.textContent) {
            await preloadFonts(instances);
          }
          var r = await processInstances(instances, label, properties);
          totalReset   += r.reset;
          totalSkipped += r.skipped;
        }

        if (layerNameOpts) {
          totalRenamed += await resetNamesInSubtree(frame, layerNameOpts);
        }
      } catch (e) {
        if (instances.length > 0) totalSkipped += instances.length;
      }
    }
  }

  var notifyMsg = buildNotifyMessage(totalReset, totalRenamed);
  if (notifyMsg) figma.notify(notifyMsg);
  figma.ui.postMessage({ type: 'done', count: totalReset, renamed: totalRenamed, skipped: totalSkipped, pages: pages.length, scope: scope });
}

function buildNotifyMessage(reset, renamed) {
  var parts = [];
  if (reset   > 0) parts.push(reset   + ' instance' + (reset   !== 1 ? 's' : '') + ' reset');
  if (renamed > 0) parts.push(renamed + ' layer'    + (renamed !== 1 ? 's' : '') + ' renamed');
  return parts.join(' · ');
}

// ─────────────────────────────────────────────────────────────────────────────

function collectFromFrame(frame) {
  var instances = [];
  if (frame.removed) return instances;
  if (frame.type === 'INSTANCE') {
    instances.push(frame);
  }
  if ('findAll' in frame) {
    var nested = frame.findAll(function(n) { return n.type === 'INSTANCE'; });
    for (var i = 0; i < nested.length; i++) {
      instances.push(nested[i]);
    }
  }
  return instances;
}

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

async function preloadFonts(instances) {
  var fontMap   = {};
  var seenMains = {};

  for (var i = 0; i < instances.length; i++) {
    var inst = instances[i];
    if (inst.removed) continue;

    var instTexts = inst.findAll(function(n) { return n.type === 'TEXT'; });
    for (var ti = 0; ti < instTexts.length; ti++) {
      collectFontsFromNode(instTexts[ti], fontMap);
    }

    var main = await getMainComponentCached(inst);
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

// Uses getStyledTextSegments (O(segments)) instead of iterating per-character.
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

// Processes instances in batches concurrently to improve speed.
async function processInstances(instances, label, properties) {
  var reset   = 0;
  var skipped = 0;
  var total   = instances.length;
  var batchSize = 20;

  for (var i = 0; i < total; i += batchSize) {
    figma.ui.postMessage({ type: 'progress', page: label, current: Math.min(i + batchSize, total), total: total });
    
    var batch = instances.slice(i, i + batchSize);
    var results = await Promise.all(batch.map(async function(inst) {
      try {
        if (await resetInstance(inst, properties)) return true;
        return false;
      } catch (e) { return false; }
    }));

    for (var j = 0; j < results.length; j++) {
      if (results[j]) reset++;
      else skipped++;
    }
  }

  return { reset: reset, skipped: skipped };
}

// ─────────────────────────────────────────────────────────────────────────────

async function resetInstance(instance, properties) {
  if (instance.removed) return false;
  var main = await getMainComponentCached(instance);
  if (!main) return false;

  // Fast-path: if all supported properties are selected, use native reset overrides
  var allProps = properties.size && properties.fills && properties.strokes &&
                 properties.cornerRadius && properties.effects && properties.opacity &&
                 properties.textStyle && properties.textFill && properties.textStroke && properties.textContent;
  
  if (allProps) {
    try {
      instance.resetOverrides();
      return true;
    } catch (e) {}
  }

  if (properties.size) {
    if (instance.width !== main.width || instance.height !== main.height) {
      try { instance.resize(main.width, main.height); } catch (e) {}
    }
  }

  var overriddenIds = null;
  if (instance.overrides) {
    overriddenIds = new Set();
    for (var i = 0; i < instance.overrides.length; i++) {
      overriddenIds.add(instance.overrides[i].id);
    }
    overriddenIds.add(instance.id); // ensure root is checked
  }

  await walkTree(instance, main, properties, overriddenIds);
  return true;
}

async function walkTree(node, mainNode, properties, overriddenIds) {
  if (!node || !mainNode || node.removed) return;

  var isOverridden = !overriddenIds || overriddenIds.has(node.id);

  if (isOverridden) {
    if (node.type === 'TEXT' && mainNode.type === 'TEXT') {
      await resetTextNode(node, mainNode, properties);
    } else {
      resetLayerNode(node, mainNode, properties);
    }
  }

  if ('children' in node && 'children' in mainNode) {
    var len = Math.min(node.children.length, mainNode.children.length);
    for (var i = 0; i < len; i++) {
      await walkTree(node.children[i], mainNode.children[i], properties, overriddenIds);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function resetLayerNode(node, mainNode, props) {
  if (props.fills && 'fills' in node && !isMixed(mainNode.fills) && !isMixed(node.fills)) {
    try {
      if (JSON.stringify(node.fills) !== JSON.stringify(mainNode.fills)) {
        node.fills = deepClone(mainNode.fills);
      }
    } catch (e) {}
  }
  if (props.strokes && 'strokes' in node && !isMixed(mainNode.strokes) && !isMixed(node.strokes)) {
    try {
      if (JSON.stringify(node.strokes) !== JSON.stringify(mainNode.strokes)) {
        node.strokes = deepClone(mainNode.strokes);
      }
    } catch (e) {}
  }
  if (props.effects && 'effects' in node && !isMixed(mainNode.effects) && !isMixed(node.effects)) {
    try {
      if (JSON.stringify(node.effects) !== JSON.stringify(mainNode.effects)) {
        node.effects = deepClone(mainNode.effects);
      }
    } catch (e) {}
  }
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
  if (props.textFill && !isMixed(mainNode.fills) && !isMixed(node.fills)) {
    try {
      if (JSON.stringify(node.fills) !== JSON.stringify(mainNode.fills)) {
        node.fills = deepClone(mainNode.fills);
      }
    } catch (e) {}
  }
  if (props.textStroke && !isMixed(mainNode.strokes) && !isMixed(node.strokes)) {
    try {
      if (JSON.stringify(node.strokes) !== JSON.stringify(mainNode.strokes)) {
        node.strokes = deepClone(mainNode.strokes);
      }
    } catch (e) {}
  }
  if (props.textContent && node.characters !== mainNode.characters) {
    try {
      node.characters = mainNode.characters;
    } catch (e) {
      try {
        await loadAllFonts(node);
        node.characters = mainNode.characters;
      } catch (e2) {}
    }
  }
}

async function resetTextStyle(node, mainNode) {
  try {
    var mainStyleId = mainNode.textStyleId;
    if (mainStyleId && !isMixed(mainStyleId)) {
      if (node.textStyleId !== mainStyleId) node.textStyleId = mainStyleId;
      return;
    }

    if (!isMixed(mainNode.fontName) && mainNode.fontName) {
      await ensureFont(mainNode.fontName);
    }

    // Scalars: plain !== is sufficient.
    if (!isMixed(mainNode.fontSize)       && node.fontSize       !== mainNode.fontSize)       node.fontSize       = mainNode.fontSize;
    if (!isMixed(mainNode.textCase)       && node.textCase       !== mainNode.textCase)       node.textCase       = mainNode.textCase;
    if (!isMixed(mainNode.textDecoration) && node.textDecoration !== mainNode.textDecoration) node.textDecoration = mainNode.textDecoration;
    if (mainNode.paragraphSpacing !== undefined && node.paragraphSpacing !== mainNode.paragraphSpacing) node.paragraphSpacing = mainNode.paragraphSpacing;

    // Objects: stringify comparison to avoid writing equal structs.
    if (!isMixed(mainNode.fontName)      && JSON.stringify(node.fontName)      !== JSON.stringify(mainNode.fontName))      node.fontName      = mainNode.fontName;
    if (!isMixed(mainNode.lineHeight)    && JSON.stringify(node.lineHeight)    !== JSON.stringify(mainNode.lineHeight))    node.lineHeight    = mainNode.lineHeight;
    if (!isMixed(mainNode.letterSpacing) && JSON.stringify(node.letterSpacing) !== JSON.stringify(mainNode.letterSpacing)) node.letterSpacing = mainNode.letterSpacing;
  } catch (e) {}
}

async function loadAllFonts(textNode) {
  var fontMap = {};
  collectFontsFromNode(textNode, fontMap);
  var fonts = [];
  for (var key in fontMap) { fonts.push(fontMap[key]); }
  await Promise.all(fonts.map(function(f) { return ensureFont(f); }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer Name Reset

var NODE_DEFAULT_NAMES = {
  FRAME:           'Frame',
  GROUP:           'Group',
  SECTION:         'Section',
  COMPONENT:       'Component',
  COMPONENT_SET:   'Component Set',
  INSTANCE:        'Instance',
  TEXT:            'Text',
  RECTANGLE:       'Rectangle',
  ELLIPSE:         'Ellipse',
  POLYGON:         'Polygon',
  STAR:            'Star',
  LINE:            'Line',
  VECTOR:          'Vector',
  BOOLEAN_OPERATION: null,  // resolved from node.booleanOperation
  SLICE:           'Slice',
  CONNECTOR:       'Connector',
  SHAPE_WITH_TEXT: 'Shape',
  STICKY:          'Sticky',
  STAMP:           'Stamp',
  WIDGET:          'Widget',
  EMBED:           'Embed',
  LINK_UNFURL:     'Link',
  MEDIA:           'Media',
  HIGHLIGHT:       'Highlight',
  WASHI_TAPE:      'Washi Tape',
  CODE_BLOCK:      'Code Block',
  TABLE:           'Table',
  TABLE_CELL:      'Cell',
};

var BOOLEAN_OP_NAMES = {
  UNION:     'Union',
  SUBTRACT:  'Subtract',
  INTERSECT: 'Intersect',
  EXCLUDE:   'Exclude',
};

function defaultNameForNode(node) {
  if (node.type === 'BOOLEAN_OPERATION') {
    return BOOLEAN_OP_NAMES[node.booleanOperation] || 'Boolean';
  }
  return NODE_DEFAULT_NAMES[node.type] || node.type;
}

async function targetNameForNode(node) {
  if (node.type === 'INSTANCE') {
    var main = await node.getMainComponentAsync();
    return (main && main.name) ? main.name : defaultNameForNode(node);
  }
  return defaultNameForNode(node);
}

async function renameNode(node) {
  var target = await targetNameForNode(node);
  if (!target || node.name === target) return 0;
  try { node.name = target; return 1; } catch (e) { return 0; }
}

// Iterative DFS walk — avoids call-stack limits on deeply nested files.
// Key rules:
//   INSTANCE       → renamed if includeInstances; children never touched
//                    (descending would create unwanted name overrides)
//   COMPONENT /
//   COMPONENT_SET  → skip entire subtree if !includeComponents
//   Everything else → rename and recurse normally
async function resetNamesInSubtree(root, opts) {
  var renamed = 0;
  var stack = [root];

  while (stack.length > 0) {
    var node = stack.pop();
    if (!node || node.removed) continue;

    if (node.type === 'INSTANCE') {
      if (opts.includeInstances) renamed += await renameNode(node);
      continue; // never descend into instance children
    }

    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      if (!opts.includeComponents) continue; // skip whole subtree
      renamed += await renameNode(node);
      // fall through to push children
    } else {
      renamed += await renameNode(node);
      // fall through to push children
    }

    if ('children' in node) {
      var children = node.children;
      for (var i = 0; i < children.length; i++) {
        stack.push(children[i]);
      }
    }
  }

  return renamed;
}

// ─────────────────────────────────────────────────────────────────────────────

function deepClone(value) {
  try {
    return structuredClone(value);
  } catch (e) {
    return JSON.parse(JSON.stringify(value));
  }
}
