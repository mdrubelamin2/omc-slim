(function () {
  'use strict';

  var TARGET_MIN = 24;
  var TARGET_MIN_COARSE = 44;
  var UI_TEXT_MIN = 11;
  var BODY_TEXT_MIN = 12;
  var INPUT_MIN = 16;
  var HIDDEN_TEXT_RATIO = 0.3;
  var HIDDEN_TEXT_MIN_CHARS = 150;
  var PAGE_TEXT_MIN_CHARS = 200;
  var OVERLAP_MIN_FRACTION = 0.1;
  var EDGE_TOLERANCE = 1;
  var LAYOUT_PROPS = ['top', 'left', 'right', 'bottom', 'width', 'height', 'margin', 'padding'];
  var EM_DASH_MIN_COUNT = 8;
  var EM_DASH_PER_CHARS = 500;
  var BUZZWORDS = [
    'empower your', 'unlock the', 'supercharge your', 'unleash the', 'leverage the power',
    'best-in-class', 'industry-leading', 'world-class', 'enterprise-grade', 'next-generation',
    'cutting-edge', 'transform your business', 'revolutionize', 'game-changer', 'mission-critical',
    'future-proof', 'seamless experience', 'seamlessly integrate', 'harness the power'
  ];
  var INTERACTIVE = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[tabindex]:not([tabindex="-1"])';

  function sel(el) {
    if (!el || !el.tagName) return '(unknown)';
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (typeof el.className === 'string' && el.className.trim()) {
      s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    }
    return s;
  }

  function srgbToLinear(c) {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function luminance(rgb) {
    return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
  }

  function parseColor(value) {
    if (!value) return null;
    var m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var parts = m[1].split(/[,\s/]+/).filter(function (p) { return p !== ''; }).map(Number);
    if (parts.length < 3 || parts.some(isNaN)) return null;
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  }

  function compositedBackground(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      var cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { indeterminate: true };
      var bg = parseColor(cs.backgroundColor);
      if (bg && bg[3] === 1) return { rgb: bg };
      if (bg && bg[3] > 0 && bg[3] < 1) return { indeterminate: true };
      node = node.parentElement;
    }
    return { rgb: [255, 255, 255, 1] };
  }

  function contrastRatio(a, b) {
    var la = luminance(a), lb = luminance(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  function visible(el) {
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function directText(el) {
    var out = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) out += el.childNodes[i].nodeValue;
    }
    return out.trim();
  }

  function isCoarsePointer() {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  }

  function readStyleRules() {
    var rules = [];
    var reachable = 0, blocked = 0;
    for (var i = 0; i < document.styleSheets.length; i++) {
      try {
        var list = document.styleSheets[i].cssRules;
        reachable++;
        for (var j = 0; j < list.length; j++) rules.push(list[j]);
      } catch (e) { blocked++; }
    }
    return { rules: rules, reachable: reachable, blocked: blocked };
  }

  function run() {
    var findings = [];
    var skipped = [];
    var ran = [];

    function fail(check, node, detail) {
      findings.push({ check: check, severity: 'fail', target: sel(node), detail: detail });
    }
    function advise(check, node, detail) {
      findings.push({ check: check, severity: 'advisory', target: sel(node), detail: detail });
    }
    function error(check, detail) {
      findings.push({ check: check, severity: 'error', target: 'document', detail: detail });
    }

    var errors = (window.__designAuditErrors || []).slice();
    ran.push('scriptError');
    if (errors.length) error('scriptError', errors.length + ' uncaught error(s): ' + errors[0]);

    var allText = (document.body ? document.body.innerText || '' : '').length;
    var hiddenChars = 0;
    var nodes = document.body ? Array.prototype.slice.call(document.body.querySelectorAll('*')) : [];
    for (var h = 0; h < nodes.length; h++) {
      if (!visible(nodes[h])) hiddenChars += (nodes[h].textContent || '').trim().length;
    }
    ran.push('contentHiddenAtRest');
    var totalChars = allText + hiddenChars;
    if (totalChars >= PAGE_TEXT_MIN_CHARS && hiddenChars >= HIDDEN_TEXT_MIN_CHARS &&
        hiddenChars / totalChars > HIDDEN_TEXT_RATIO) {
      error('contentHiddenAtRest', Math.round(100 * hiddenChars / totalChars) + '% of page text hidden at rest');
    }

    if (findings.some(function (f) { return f.severity === 'error'; })) {
      return { findings: findings, ran: ran, skipped: ['all-checks-after-error'], gated: true };
    }

    var els = nodes.filter(visible);
    var vw = window.innerWidth;
    var coarse = isCoarsePointer();
    var sheets = readStyleRules();
    if (sheets.blocked > 0) skipped.push('cssSourceRules(' + sheets.blocked + ' cross-origin sheet(s) unreadable)');

    ran.push('documentOverflowX');
    var de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + EDGE_TOLERANCE) {
      fail('documentOverflowX', de, de.scrollWidth + 'px content in ' + de.clientWidth + 'px viewport');
    }

    ran.push('viewportZoomDisabled');
    var meta = document.querySelector('meta[name=viewport]');
    if (meta && /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(meta.content || '')) {
      fail('viewportZoomDisabled', meta, meta.content);
    }

    ran.push('headingLevelSkipped');
    var headings = Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    var prevLevel = 0;
    for (var q = 0; q < headings.length; q++) {
      var level = Number(headings[q].tagName[1]);
      if (prevLevel && level > prevLevel + 1) {
        fail('headingLevelSkipped', headings[q], 'h' + prevLevel + ' followed by h' + level);
      }
      prevLevel = level;
    }

    ran.push('elementOverflowX');
    ran.push('clippedText');
    ran.push('targetSize');
    ran.push('tinyText');
    ran.push('inputFontSize');
    ran.push('contrast');
    ran.push('transitionAll');
    ran.push('layoutTransition');
    ran.push('easeInOnInteractive');
    ran.push('scaleZeroEntry');
    ran.push('fixedWidthTextContainer');
    ran.push('nonSemanticInteractive');
    ran.push('placeholderWithoutLabel');

    var contrastIndeterminate = 0;

    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      var cs = getComputedStyle(el);
      var fs = parseFloat(cs.fontSize) || 0;
      var text = directText(el);
      var tag = el.tagName.toLowerCase();

      if (el.scrollWidth > el.clientWidth + EDGE_TOLERANCE &&
          cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
        fail('elementOverflowX', el, el.scrollWidth + ' > ' + el.clientWidth);
      }

      if (el.scrollHeight > el.clientHeight + EDGE_TOLERANCE && text.length > 0 &&
          (cs.overflow === 'hidden' || cs.overflowY === 'hidden')) {
        fail('clippedText', el, 'content ' + el.scrollHeight + 'px in ' + el.clientHeight + 'px box');
      }

      if (el.matches(INTERACTIVE)) {
        var floor = coarse ? TARGET_MIN_COARSE : TARGET_MIN;
        if (r.width < floor || r.height < floor) {
          fail('targetSize', el, Math.round(r.width) + 'x' + Math.round(r.height) + ' below ' + floor);
        }
      }

      if (text.length > 1 && fs > 0) {
        var isUi = el.matches(INTERACTIVE) || ['label', 'th', 'td', 'nav', 'small'].indexOf(tag) >= 0;
        var min = isUi ? UI_TEXT_MIN : BODY_TEXT_MIN;
        if (fs < min && text.length > (isUi ? 1 : 20)) {
          fail('tinyText', el, fs + 'px below ' + min + 'px floor');
        }
      }

      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (fs > 0 && fs < INPUT_MIN) fail('inputFontSize', el, fs + 'px zooms the viewport on iOS');
        if (el.placeholder && !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
          fail('placeholderWithoutLabel', el, 'placeholder "' + el.placeholder + '" is the only label');
        }
      }

      if (text.length > 1 && fs > 0) {
        var fg = parseColor(cs.color);
        var bg = compositedBackground(el);
        if (fg && bg.rgb) {
          var ratio = contrastRatio(fg, bg.rgb);
          var large = fs >= 24 || (fs >= 18.66 && Number(cs.fontWeight) >= 700);
          var need = large ? 3 : 4.5;
          if (ratio < need) {
            fail('contrast', el, ratio.toFixed(2) + ':1 against required ' + need + ':1');
          }
        } else if (fg && bg.indeterminate) {
          contrastIndeterminate++;
        }
      }

      var durations = (cs.transitionDuration || '').split(',').map(function (d) { return parseFloat(d) || 0; });
      var animates = durations.some(function (d) { return d > 0; });

      if (animates && cs.transitionProperty === 'all') fail('transitionAll', el, 'transition-property: all');

      if (animates && cs.transitionProperty && cs.transitionProperty !== 'none' && cs.transitionProperty !== 'all') {
        var props = cs.transitionProperty.split(',').map(function (p) { return p.trim(); });
        for (var p = 0; p < props.length; p++) {
          if (LAYOUT_PROPS.indexOf(props[p].split('-')[0]) >= 0 && LAYOUT_PROPS.indexOf(props[p]) >= 0) {
            fail('layoutTransition', el, 'transitions ' + props[p]);
            break;
          }
        }
      }

      if (animates && el.matches(INTERACTIVE) && /^ease-in$|cubic-bezier\(0\.42,\s*0,\s*1,\s*1\)/.test(cs.transitionTimingFunction)) {
        fail('easeInOnInteractive', el, cs.transitionTimingFunction);
      }

      if (tag === 'div' || tag === 'span') {
        if (el.hasAttribute('onclick') && !el.getAttribute('role') && !el.hasAttribute('tabindex')) {
          fail('nonSemanticInteractive', el, tag + ' with a click handler is not a button or a link');
        }
      }

      if (text.length > 40 && cs.width && /px$/.test(cs.width)) {
        var declared = el.style.width || '';
        if (/^\d+px$/.test(declared)) {
          fail('fixedWidthTextContainer', el, 'width: ' + declared + ' will not hold a longer translation');
        }
      }
    }

    if (contrastIndeterminate > 0) {
      skipped.push('contrast(' + contrastIndeterminate + ' element(s) over a gradient, image or translucent layer)');
    }

    ran.push('scaleZeroEntry');
    for (var s = 0; s < sheets.rules.length; s++) {
      var rule = sheets.rules[s];
      if (rule.type === 7 && rule.cssText && /scale\(0\)|scale3d\(0/.test(rule.cssText)) {
        findings.push({ check: 'scaleZeroEntry', severity: 'fail', target: '@keyframes ' + rule.name, detail: 'enters from scale(0)' });
      }
      if (rule.type === 4 && /prefers-reduced-motion/.test(rule.conditionText || '')) {
        if (/animation\s*:\s*none|transition\s*:\s*none/.test(rule.cssText || '')) {
          findings.push({ check: 'reducedMotionDeletes', severity: 'fail', target: rule.conditionText, detail: 'removes motion instead of substituting; feedback is lost' });
        }
      }
    }
    ran.push('reducedMotionDeletes');

    ran.push('elementOverlap');
    var cand = els.filter(function (e) {
      return e.matches('a,button,input,select,textarea,h1,h2,h3,p,label,img');
    }).map(function (e) { return [e, e.getBoundingClientRect()]; })
      .filter(function (pair) { return pair[1].width > 4 && pair[1].height > 4; })
      .slice(0, 300);
    for (var a = 0; a < cand.length; a++) {
      for (var b = a + 1; b < cand.length; b++) {
        var ea = cand[a][0], eb = cand[b][0], ra = cand[a][1], rb = cand[b][1];
        if (ea.contains(eb) || eb.contains(ea)) continue;
        var ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        var iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ix > EDGE_TOLERANCE && iy > EDGE_TOLERANCE) {
          var frac = (ix * iy) / Math.min(ra.width * ra.height, rb.width * rb.height);
          if (frac > OVERLAP_MIN_FRACTION) {
            fail('elementOverlap', ea, 'overlaps ' + sel(eb) + ' by ' + Math.round(frac * 100) + '%');
          }
        }
      }
    }

    ran.push('fontNotLoaded');
    var probeEl = document.querySelector('h1, h2, p, body');
    if (probeEl && document.fonts && typeof document.fonts.check === 'function') {
      var stack = getComputedStyle(probeEl).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
      var generic = ['sans-serif', 'serif', 'monospace', 'system-ui', 'cursive', 'fantasy', 'ui-sans-serif', 'ui-serif', 'ui-monospace'];
      if (generic.indexOf(stack.toLowerCase()) < 0) {
        var spec = getComputedStyle(probeEl).fontWeight + ' ' + getComputedStyle(probeEl).fontSize + ' "' + stack + '"';
        if (!document.fonts.check(spec)) {
          fail('fontNotLoaded', probeEl, 'declares "' + stack + '" which is not loaded; a fallback is painting');
        }
      }
    } else {
      skipped.push('fontNotLoaded(no font access)');
    }

    ran.push('missingInteractionState');
    var interactives = els.filter(function (e) { return e.matches('a[href],button,[role=button]'); }).slice(0, 200);
    var hoverRules = sheets.rules.filter(function (rl) {
      return rl.type === 1 && rl.selectorText && /:hover|:focus-visible|:focus/.test(rl.selectorText);
    });
    if (sheets.reachable === 0 && sheets.blocked > 0) {
      skipped.push('missingInteractionState(no readable stylesheet)');
    } else if (interactives.length && hoverRules.length === 0) {
      fail('missingInteractionState', interactives[0], interactives.length + ' interactive element(s) and no hover or focus rule anywhere');
    }

    ran.push('hoverNotGated');
    var gatedHover = sheets.rules.some(function (rl) {
      return rl.type === 4 && /hover:\s*hover/.test(rl.conditionText || '');
    });
    if (hoverRules.length > 0 && !gatedHover) {
      advise('hoverNotGated', document.body, hoverRules.length + ' hover rule(s) outside @media (hover: hover)');
    }

    ran.push('noRealImages');
    var imgs = document.querySelectorAll('img, picture, video, [style*="background-image"]');
    var sections = document.querySelectorAll('section, article, main > div');
    if (sections.length >= 3 && imgs.length === 0) {
      advise('noRealImages', document.body, sections.length + ' sections and no image, picture or video');
    }

    ran.push('brokenImage');
    var allImgs = document.querySelectorAll('img');
    for (var im = 0; im < allImgs.length; im++) {
      var src = allImgs[im].getAttribute('src');
      if (!src || !src.trim() || src.trim() === '#') fail('brokenImage', allImgs[im], 'img with no usable src');
    }

    ran.push('uniformRadius');
    var radii = {};
    var boxed = els.filter(function (e) {
      var c = getComputedStyle(e);
      return parseFloat(c.borderRadius) > 0 && (c.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(c.borderTopWidth) > 0);
    });
    boxed.forEach(function (e) {
      var v = getComputedStyle(e).borderTopLeftRadius;
      radii[v] = (radii[v] || 0) + 1;
    });
    var radiusKeys = Object.keys(radii);
    if (boxed.length >= 6 && radiusKeys.length === 1) {
      advise('uniformRadius', document.body, boxed.length + ' surfaces all at ' + radiusKeys[0]);
    }

    ran.push('ghostCard');
    for (var g = 0; g < boxed.length; g++) {
      var gc = getComputedStyle(boxed[g]);
      var bw = parseFloat(gc.borderTopWidth) || 0;
      var bc = parseColor(gc.borderTopColor);
      var shadow = gc.boxShadow || 'none';
      var blurMatch = shadow.match(/(\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px/);
      var blur = blurMatch ? parseFloat(blurMatch[3]) : 0;
      if (bw > 0 && bw <= 1.5 && bc && bc[3] >= 0.28 && blur >= 16) {
        advise('ghostCard', boxed[g], bw + 'px opaque border under a ' + blur + 'px shadow declares elevation twice');
      }
    }

    ran.push('gradientText');
    for (var gt = 0; gt < els.length; gt++) {
      var gs = getComputedStyle(els[gt]);
      if ((gs.webkitBackgroundClip === 'text' || gs.backgroundClip === 'text') && /gradient/.test(gs.backgroundImage)) {
        advise('gradientText', els[gt], 'gradient-filled text');
      }
    }

    ran.push('emDashDensity');
    var body = document.body ? (document.body.innerText || '') : '';
    var dashes = (body.match(/—/g) || []).length;
    if (dashes >= EM_DASH_MIN_COUNT && body.length > 0 && dashes / (body.length / EM_DASH_PER_CHARS) >= 1) {
      advise('emDashDensity', document.body, dashes + ' em-dashes in ' + body.length + ' characters');
    }

    ran.push('marketingBuzzword');
    var lower = body.toLowerCase();
    for (var bw2 = 0; bw2 < BUZZWORDS.length; bw2++) {
      if (lower.indexOf(BUZZWORDS[bw2]) >= 0) {
        advise('marketingBuzzword', document.body, '"' + BUZZWORDS[bw2] + '"');
      }
    }

    return {
      findings: findings,
      ran: ran,
      skipped: skipped,
      gated: false,
      viewport: { width: vw, height: window.innerHeight, coarsePointer: coarse }
    };
  }

  try {
    return run();
  } catch (e) {
    return { findings: [{ check: 'probeCrashed', severity: 'error', target: 'probe', detail: String(e && e.message || e) }], ran: [], skipped: ['all'], gated: true };
  }
})()
