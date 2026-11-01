window.__ModuleLoader__.load({
  id: '@local/glass-liquid',
  factory(require) {
    var React = require('react');
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;

    var BUILD = 'v1.0.0';
    var STORE_KEY = 'dsh.glass-liquid.v4';
    var GAP = 48;

    /**
     * Defaults extracted from glass-kit's documented parameter table.
     *
     * Glass side: the palette and the 56px grid come from the design tokens in
     * the source document. Particle side: every number below is the tuned value
     * the document settles on (gap 56 / sub 3 -> 18.7px spacing, radius 150,
     * push 2.5, return 0.055, damping 0.92, dotSize 1.6, baseAlpha 0.5).
     */
    var DEFAULTS = {
      accent: '#8f7bff',
      accent2: '#5fd4e6',
      accent3: '#ff9fb8',
      glow: 0.3,
      grid: 0.1,
      specular: 0.18,
      orbSpeed: 26,
      surface: 0,
      titlebar: true,
      sub: 3,
      dotSize: 1,
      dotAlpha: 0.45,
      radius: 150,
      push: 2.5,
      damping: 0.98,
      pointer: true,
    };

    // ── helpers ──────────────────────────────────────────────────────────────

    function clamp(v, lo, hi) {
      return v < lo ? lo : v > hi ? hi : v;
    }

    function clamp01(v) {
      return clamp(Number(v) || 0, 0, 1);
    }

    function hexToRgb(hex, fallback) {
      var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
      if (!m) return fallback || [124, 92, 255];
      var raw = m[1];
      if (raw.length === 3) raw = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
      var n = parseInt(raw, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function rgba(rgb, alpha) {
      return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
    }

    /** Accept #rgb, #rrggbb, rgb() and rgba(); return rgba() with the new alpha. */
    function withAlpha(color, alpha) {
      var raw = String(color == null ? '' : color).trim();
      if (!raw) return null;
      var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
      if (m) {
        var rgb = hexToRgb(raw, null);
        return rgb ? rgba(rgb, alpha) : null;
      }
      m = /^rgba?\(([^)]+)\)$/i.exec(raw);
      if (m) {
        var parts = m[1].split(',').map(function (v) {
          return parseFloat(v);
        });
        if (parts.length >= 3) return rgba([parts[0], parts[1], parts[2]], alpha);
      }
      return null;
    }

    /**
     * Blend two RGB colours. The Windows title bar overlay is a native surface:
     * it takes an opaque colour, so tinting it has to be a blend, not an alpha.
     */
    /** Read a token value as an [r,g,b] triple (hex or rgb()/rgba()). */
    function colourOf(value) {
      var raw = String(value == null ? '' : value).trim();
      if (!raw) return null;
      if (/^#/.test(raw)) return hexToRgb(raw, null);
      var m = /^rgba?\(([^)]+)\)$/i.exec(raw);
      if (!m) return null;
      var parts = m[1].split(',').map(function (v) {
        return parseFloat(v);
      });
      return parts.length >= 3 ? [parts[0], parts[1], parts[2]] : null;
    }

    function blendRgb(base, tint, amount) {
      var t = clamp(Number(amount) || 0, 0, 1);
      return [
        Math.round(base[0] * (1 - t) + tint[0] * t),
        Math.round(base[1] * (1 - t) + tint[1] * t),
        Math.round(base[2] * (1 - t) + tint[2] * t),
      ];
    }

    /**
     * The layer's background stack, as data.
     *
     * Rendering and sampling share this spec, so the colour reported to the
     * native Windows caption is literally the colour the page has at that point
     * instead of an unrelated approximation.
     *
     * CSS paints the FIRST listed image on top, so composition runs from the last
     * entry upward.
     */
    function layerSpec(c) {
      var themed = themedAccents(c);
      var a1 = themed.a1;
      var a2 = themed.a2;
      var a3 = themed.a3;
      var f = themeFactors();
      var g = clamp01(c.glow) * f.glow;
      return [
        { kind: 'linear', stops: [{ p: 0, c: a1, a: 0.12 * g }, { p: 0.55, c: a2, a: 0.1 * g }, { p: 1, c: a3, a: 0.08 * g }] },
        { kind: 'radial', cx: 0.04, cy: 0, vmax: 110, fade: 0.7, c: a1, a: 0.3 * g },
        { kind: 'radial', cx: 1, cy: 0.04, vmax: 105, fade: 0.7, c: a2, a: 0.24 * g },
        { kind: 'radial', cx: 1, cy: 1, vmax: 110, fade: 0.7, c: a3, a: 0.2 * g },
        { kind: 'radial', cx: 0, cy: 1, vmax: 105, fade: 0.7, c: a1, a: 0.22 * g },
        { kind: 'radial', cx: 0.5, cy: 0.5, vmax: 120, fade: 0.72, c: a2, a: 0.16 * g },
      ];
    }

    function specToCss(spec) {
      return spec
        .map(function (layer) {
          if (layer.kind === 'linear') {
            return (
              'linear-gradient(135deg,' +
              layer.stops
                .map(function (s) {
                  return rgba(s.c, s.a) + ' ' + Math.round(s.p * 100) + '%';
                })
                .join(',') +
              ')'
            );
          }
          return (
            'radial-gradient(' +
            layer.vmax +
            'vmax ' +
            layer.vmax +
            'vmax at ' +
            layer.cx * 100 +
            '% ' +
            layer.cy * 100 +
            '%,' +
            rgba(layer.c, layer.a) +
            ' 0%,transparent ' +
            layer.fade * 100 +
            '%)'
          );
        })
        .join(',');
    }

    /** Sample the stack at one point and composite it over `base`. */
    function sampleStack(spec, w, h, x, y, base) {
      var vmax = Math.max(w, h) || 1;
      var out = [base[0], base[1], base[2]];
      for (var i = spec.length - 1; i >= 0; i -= 1) {
        var layer = spec[i];
        var color = null;
        var alpha = 0;

        if (layer.kind === 'linear') {
          var t = clamp((x / w + y / h) / 2, 0, 1);
          var stops = layer.stops;
          for (var s = 0; s < stops.length - 1; s += 1) {
            if (t >= stops[s].p && t <= stops[s + 1].p) {
              var span = stops[s + 1].p - stops[s].p || 1;
              var k = (t - stops[s].p) / span;
              color = [
                stops[s].c[0] + (stops[s + 1].c[0] - stops[s].c[0]) * k,
                stops[s].c[1] + (stops[s + 1].c[1] - stops[s].c[1]) * k,
                stops[s].c[2] + (stops[s + 1].c[2] - stops[s].c[2]) * k,
              ];
              alpha = stops[s].a + (stops[s + 1].a - stops[s].a) * k;
              break;
            }
          }
        } else {
          var dx = x - layer.cx * w;
          var dy = y - layer.cy * h;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var reach = (layer.vmax / 100) * vmax * layer.fade;
          var f = reach > 0 ? clamp(dist / reach, 0, 1) : 1;
          color = layer.c;
          alpha = layer.a * (1 - f);
        }

        if (!color || alpha <= 0) continue;
        out[0] = color[0] * alpha + out[0] * (1 - alpha);
        out[1] = color[1] * alpha + out[1] * (1 - alpha);
        out[2] = color[2] * alpha + out[2] * (1 - alpha);
      }
      return [Math.round(out[0]), Math.round(out[1]), Math.round(out[2])];
    }

    /** Blend a colour toward a target (0 = unchanged, 1 = target). */
    function mixRgb(from, to, amount) {
      var t = clamp(Number(amount) || 0, 0, 1);
      return [
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t),
      ];
    }

    /**
     * How the glass composition adapts to the active theme.
     *
     * A tint that reads as depth on a dark surface reads as haze on a light one,
     * so light themes get a softer wash, deeper pigment (the same hue darkened so
     * it survives on white) and slightly stronger dots (thin light dots vanish).
     * Cached briefly: this is read once per layer build and per particle repaint.
     */
    var themeFactorCache = { at: 0, light: false };

    function factorCache() {
      var now = Date.now();
      if (now - themeFactorCache.at > 500) {
        themeFactorCache.light = isLightTheme();
        themeFactorCache.at = now;
      }
      return themeFactorCache.light;
    }

    function themeFactors() {
      return factorCache()
        ? {
            // Light surface: the wash is lifted toward white so it reads as
            // frosted colour rather than grey haze, the lattice flips to dark
            // tinted lines (white lines vanish on white), and the dots keep a
            // deepened pigment so they survive against the bright background.
            glow: 0.75,
            grid: 1,
            specular: 0.6,
            dot: 1.15,
            dotSize: 1.05,
            washLift: 0.16,
            dotShade: 0.42,
            gridShade: 0.55,
          }
        : { glow: 1, grid: 1, specular: 1, dot: 1, dotSize: 1, washLift: 0, dotShade: 0, gridShade: 0 };
    }

    /** Wash colours: the broad gradient, orbs and grid tints. */
    function themedAccents(c) {
      var f = themeFactors();
      var white = [255, 255, 255];
      return {
        a1: mixRgb(hexToRgb(c.accent, [124, 92, 255]), white, f.washLift),
        a2: mixRgb(hexToRgb(c.accent2, [34, 211, 238]), white, f.washLift),
        a3: mixRgb(hexToRgb(c.accent3, [255, 92, 138]), white, f.washLift),
      };
    }

    /** Particle colours: small marks need real contrast, so they go the other way. */
    function dotAccents(c) {
      var f = themeFactors();
      var black = [0, 0, 0];
      return {
        a1: mixRgb(hexToRgb(c.accent, [124, 92, 255]), black, f.dotShade),
        a2: mixRgb(hexToRgb(c.accent2, [34, 211, 238]), black, f.dotShade),
      };
    }

    /** Lattice colour: white on dark surfaces, accent-tinted dark on light ones. */
    function gridColour(c) {
      var f = themeFactors();
      if (f.gridShade <= 0) return [255, 255, 255];
      return mixRgb(hexToRgb(c.accent, [124, 92, 255]), [0, 0, 0], f.gridShade);
    }

    /** True when the shell's base surface is light, so the tint can be softened. */
    function isLightTheme() {
      var base = colourOf(readToken('--dsw-alias-bg-base'));
      if (!base) return false;
      return (base[0] * 299 + base[1] * 587 + base[2] * 114) / 1000 > 140;
    }

    // ── store ────────────────────────────────────────────────────────────────

    function createStore(seed) {
      var value = {};
      var key;
      for (key in DEFAULTS) {
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) value[key] = DEFAULTS[key];
      }
      if (seed && typeof seed === 'object') {
        for (key in value) {
          if (Object.prototype.hasOwnProperty.call(seed, key) && typeof seed[key] === typeof value[key]) {
            value[key] = seed[key];
          }
        }
      }
      try {
        var raw = window.localStorage.getItem(STORE_KEY);
        if (raw) {
          var saved = JSON.parse(raw);
          if (saved && typeof saved === 'object') {
            for (key in value) {
              if (typeof saved[key] === typeof value[key]) value[key] = saved[key];
            }
          }
        }
      } catch (error) {
        /* storage unavailable: defaults stand */
      }

      var listeners = [];
      var api = {
        get: function () {
          return value;
        },
        set: function (patch) {
          var next = {};
          var k;
          for (k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) next[k] = value[k];
          }
          for (k in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k];
          }
          value = next;
          try {
            window.localStorage.setItem(STORE_KEY, JSON.stringify(value));
          } catch (error) {
            /* not fatal */
          }
          for (var i = 0; i < listeners.length; i += 1) {
            try {
              listeners[i]();
            } catch (error) {
              /* a dead listener must not break the rest */
            }
          }
        },
        reset: function () {
          var patch = {};
          for (var k in DEFAULTS) {
            if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) patch[k] = DEFAULTS[k];
          }
          api.set(patch);
        },
        forget: function () {
          try {
            window.localStorage.removeItem(STORE_KEY);
          } catch (error) {
            /* not fatal */
          }
        },
        subscribe: function (fn) {
          listeners.push(fn);
          return function () {
            var i = listeners.indexOf(fn);
            if (i >= 0) listeners.splice(i, 1);
          };
        },
      };
      return api;
    }

    function useStore(store) {
      var pair = useState(store.get());
      var setValue = pair[1];
      useEffect(
        function () {
          return store.subscribe(function () {
            setValue(store.get());
          });
        },
        [store],
      );
      return pair[0];
    }

    // ── particle field (physics from the source document) ────────────────────

    function makeVignette(w, h) {
      var cx = w * 0.5;
      var cy = h * 0.3;
      var ax = w * 0.95;
      var ay = h * 0.8;
      return function (x, y) {
        var nx = (x - cx) / ax;
        var ny = (y - cy) / ay;
        var r = Math.sqrt(nx * nx + ny * ny);
        if (r <= 0.3) return 1;
        if (r >= 0.95) return 0.5;
        return 1 - ((r - 0.3) / (0.95 - 0.3)) * 0.5;
      };
    }

    /**
     * Lattice on the 56px grid.
     *
     * Documented behaviour, all preserved: push force decays linearly inside
     * `radius`, spring return to the base point, damping normalised by the frame
     * interval, sleep after three quiet frames, snap sub-pixel residue back to
     * the base, eight alpha buckets per frame, and a 3px dead zone before
     * displacement brightens a dot.
     */
    function startParticles(canvas, store) {
      var c2d = null;
      try {
        c2d = canvas.getContext('2d');
      } catch (error) {
        return null;
      }
      if (!c2d) return null;

      var LEVELS = 8;
      var QUIET_FRAMES = 3;
      var QUIET_EPS = 0.06;
      var SNAP_EPS = 0.5;
      var LIT_DEAD = 3;
      var LIT_RANGE = 21;
      var RETURN = 0.055;

      var width = 0;
      var height = 0;
      var points = [];
      var fill = null;
      var frame = 0;
      var lastTs = 0;
      var quiet = 0;
      var disposed = false;
      var pointer = { x: -1e6, y: -1e6 };
      var resizeTimer = 0;

      var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
      var reduced = !!(mq && mq.matches);

      function cfg() {
        return store.get();
      }

      function rebuildFill() {
        if (!width) return;
        var c = cfg();
        var dots = dotAccents(c);
        fill = c2d.createLinearGradient(0, 0, width, 0);
        fill.addColorStop(0, rgba(dots.a1, 1));
        fill.addColorStop(1, rgba(dots.a2, 1));
      }

      var retryTimer = 0;
      var retryCount = 0;

      function clearRetry() {
        if (retryTimer) window.clearTimeout(retryTimer);
        retryTimer = 0;
      }

      /**
       * The window is created hidden and shown once the app is ready, so the very
       * first measurement can be 0x0. Rather than giving up (which left the
       * particle field missing until the next resize), retry briefly.
       */
      function retryLater() {
        if (disposed || retryTimer) return;
        if (retryCount > 40) return;
        retryCount += 1;
        retryTimer = window.setTimeout(function () {
          retryTimer = 0;
          build();
        }, 250);
      }

      function build() {
        var rect = canvas.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        if (width < 2 || height < 2) {
          retryLater();
          return;
        }
        clearRetry();
        retryCount = 0;
        var dpr = clamp(window.devicePixelRatio || 1, 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        c2d.setTransform(dpr, 0, 0, dpr, 0, 0);

        var sub = clamp(Math.round(cfg().sub), 1, 8);
        // Dense lattices draw in fewer alpha batches: the loop cost dominates long
        // before the quantisation difference is visible.
        LEVELS = sub >= 6 ? 4 : 8;
        var step = GAP / sub;
        var vis = makeVignette(width, height);
        points = [];
        for (var y = step; y < height; y += step) {
          for (var x = step; x < width; x += step) {
            points.push({ x: x, y: y, bx: x, by: y, vx: 0, vy: 0, vis: vis(x, y), level: 0 });
          }
        }
        rebuildFill();
        paint();
      }

      function paint() {
        if (!width || disposed) return;
        c2d.clearRect(0, 0, width, height);
        if (!fill) return;
        c2d.fillStyle = fill;
        var c = cfg();
        var f = themeFactors();
        var dot = c.dotSize * f.dotSize;
        var base = clamp01(c.dotAlpha) * f.dot;
        var total = points.length;
        var i;
        for (i = 0; i < total; i += 1) {
          var pt = points[i];
          var dx = pt.x - pt.bx;
          var dy = pt.y - pt.by;
          var disp = Math.sqrt(dx * dx + dy * dy);
          var boost = disp > LIT_DEAD ? Math.min((disp - LIT_DEAD) / LIT_RANGE, 1) : 0;
          var a = clamp(pt.vis * base * (1 + 1.15 * boost), 0, 1);
          pt.level = Math.min(LEVELS - 1, (a * LEVELS) | 0);
        }
        for (var level = 0; level < LEVELS; level += 1) {
          c2d.globalAlpha = (level + 0.5) / LEVELS;
          c2d.beginPath();
          var drew = false;
          for (i = 0; i < total; i += 1) {
            var q = points[i];
            if (q.level === level) {
              c2d.rect(q.x - dot, q.y - dot, dot * 2, dot * 2);
              drew = true;
            }
          }
          if (drew) c2d.fill();
        }
        c2d.globalAlpha = 1;
      }

      function step(ts) {
        frame = 0;
        if (disposed) return;
        var dt = lastTs ? clamp(ts - lastTs, 0, 64) : 16.67;
        lastTs = ts;
        var f = clamp(dt / 16.67, 0.5, 3);
        var c = cfg();
        var radius = c.radius;
        var r2 = radius * radius;
        var damp = Math.pow(c.damping, f);
        var total = points.length;
        var maxOffset = 0;

        for (var i = 0; i < total; i += 1) {
          var pt = points[i];
          var ox = pointer.x - pt.x;
          var oy = pointer.y - pt.y;
          var d2 = ox * ox + oy * oy;
          if (d2 < r2) {
            var d = Math.sqrt(d2) || 1;
            var force = (1 - d / radius) * c.push * f;
            pt.vx -= (ox / d) * force;
            pt.vy -= (oy / d) * force;
          }
          pt.vx += (pt.bx - pt.x) * RETURN * f;
          pt.vy += (pt.by - pt.y) * RETURN * f;
          pt.vx *= damp;
          pt.vy *= damp;
          pt.x += pt.vx * f;
          pt.y += pt.vy * f;
          var off = Math.abs(pt.x - pt.bx) + Math.abs(pt.y - pt.by);
          if (off > maxOffset) maxOffset = off;
        }

        paint();

        if (maxOffset < QUIET_EPS) quiet += 1;
        else quiet = 0;

        if (quiet >= QUIET_FRAMES) {
          quiet = 0;
          if (maxOffset < SNAP_EPS) {
            for (var j = 0; j < total; j += 1) {
              var s = points[j];
              s.x = s.bx;
              s.y = s.by;
              s.vx = 0;
              s.vy = 0;
            }
            paint();
          }
          lastTs = 0;
          return;
        }
        schedule();
      }

      function schedule() {
        if (disposed || reduced || frame) return;
        if (document.hidden) return;
        lastTs = 0;
        frame = window.requestAnimationFrame(step);
      }

      function onMove(ev) {
        if (reduced) return;
        var rect = canvas.getBoundingClientRect();
        pointer.x = ev.clientX - rect.left;
        pointer.y = ev.clientY - rect.top;
        schedule();
      }

      function onLeave() {
        pointer.x = -1e6;
        pointer.y = -1e6;
        schedule();
      }

      function onResize() {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () {
          if (!disposed) build();
        }, 160);
      }

      function onVisibility() {
        if (document.hidden) {
          if (frame) window.cancelAnimationFrame(frame);
          frame = 0;
        } else {
          schedule();
        }
      }

      function onMotion() {
        reduced = !!(mq && mq.matches);
        if (reduced) {
          if (frame) window.cancelAnimationFrame(frame);
          frame = 0;
          for (var i = 0; i < points.length; i += 1) {
            var p = points[i];
            p.x = p.bx;
            p.y = p.by;
            p.vx = 0;
            p.vy = 0;
          }
          paint();
        }
      }

      var offStore = store.subscribe(function () {
        build();
      });

      function onLoadRetry() {
        build();
      }
      var layoutObserver = null;
      if (typeof window.ResizeObserver === 'function') {
        try {
          layoutObserver = new window.ResizeObserver(function () {
            build();
          });
          layoutObserver.observe(canvas);
        } catch (error) {
          layoutObserver = null;
        }
      }

      build();
      window.addEventListener('load', onLoadRetry);
      window.addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', onVisibility);
      if (mq) {
        if (mq.addEventListener) mq.addEventListener('change', onMotion);
        else if (mq.addListener) mq.addListener(onMotion);
      }
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onMove, { passive: true });
      document.addEventListener('pointerleave', onLeave, { passive: true });

      return function () {
        disposed = true;
        offStore();
        clearRetry();
        if (layoutObserver) {
          try {
            layoutObserver.disconnect();
          } catch (error) {
            /* already gone */
          }
          layoutObserver = null;
        }
        window.removeEventListener('load', onLoadRetry);
        if (frame) window.cancelAnimationFrame(frame);
        window.clearTimeout(resizeTimer);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerdown', onMove);
        document.removeEventListener('pointerleave', onLeave);
        if (mq) {
          if (mq.removeEventListener) mq.removeEventListener('change', onMotion);
          else if (mq.removeListener) mq.removeListener(onMotion);
        }
      };
    }

    // ── glass layer (plain DOM: no React surface to depend on) ───────────────

    function buildLayer(store) {
      var root = document.createElement('div');
      root.className = 'gl-layer';
      root.setAttribute('aria-hidden', 'true');

      var orbs = [];
      var i;
      for (i = 1; i <= 3; i += 1) {
        var orb = document.createElement('i');
        orb.className = 'gl-orb gl-orb-' + i;
        root.appendChild(orb);
        orbs.push(orb);
      }

      var grid = document.createElement('i');
      grid.className = 'gl-grid';
      root.appendChild(grid);

      var spec = document.createElement('i');
      spec.className = 'gl-specular';
      root.appendChild(spec);

      var canvas = document.createElement('canvas');
      canvas.className = 'gl-canvas';
      root.appendChild(canvas);

      function paint() {
        var c = store.get();
        var f = themeFactors();
        var themed = themedAccents(c);
        var a1 = themed.a1;
        var a2 = themed.a2;
        var a3 = themed.a3;
        var g = clamp01(c.glow) * f.glow;

        root.style.background = specToCss(layerSpec(c));

        orbs[0].style.background =
          'radial-gradient(circle at 50% 50%,' + rgba(a1, 0.5 * g) + ' 0%,' + rgba(a1, 0.16 * g) + ' 42%,transparent 72%)';
        orbs[1].style.background =
          'radial-gradient(circle at 50% 50%,' + rgba(a2, 0.42 * g) + ' 0%,' + rgba(a2, 0.13 * g) + ' 44%,transparent 74%)';
        orbs[2].style.background =
          'radial-gradient(circle at 50% 50%,' + rgba(a3, 0.32 * g) + ' 0%,' + rgba(a3, 0.1 * g) + ' 46%,transparent 76%)';
        for (i = 0; i < 3; i += 1) orbs[i].style.opacity = String(clamp01(g * 0.85 + 0.15));

        // dark surfaces: faint white lattice; light surfaces: faint dark lattice.
        var lineAlpha = (f.gridShade > 0 ? 0.1 : 0.16) * clamp01(c.grid) * f.grid;
        var lattice = rgba(gridColour(c), lineAlpha);
        grid.style.backgroundImage =
          'linear-gradient(to right,' +
          lattice +
          ' 1px,transparent 1px),linear-gradient(to bottom,' +
          lattice +
          ' 1px,transparent 1px)';

        root.style.setProperty('--gl-spec', String(0.1 * clamp01(c.specular) * f.specular));
        root.style.setProperty('--gl-speed', c.orbSpeed + 's');
      }

      paint();
      var offStore = store.subscribe(paint);

      function onMove(ev) {
        if (!root.style) return;
        var w = window.innerWidth || 1;
        var hh = window.innerHeight || 1;
        root.style.setProperty('--mx', clamp(ev.clientX / w, 0, 1) * 100 + '%');
        root.style.setProperty('--my', clamp(ev.clientY / hh, 0, 1) * 100 + '%');
      }
      window.addEventListener('pointermove', onMove, { passive: true });

      var particles = startParticles(canvas, store);

      return {
        el: root,
        destroy: function () {
          offStore();
          window.removeEventListener('pointermove', onMove);
          if (particles) particles();
        },
      };
    }

    // ── styles ───────────────────────────────────────────────────────────────

    var CSS = [
      // A click-through varnish above the app. No `backdrop-filter` anywhere:
      // on a layer above content it blurs the application instead of frosting a
      // background.
      '.gl-host{position:fixed;inset:0;z-index:2147481000;pointer-events:none;overflow:hidden}',
      '.gl-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;',
      '--mx:50%;--my:10%;--gl-spec:0.03;--gl-speed:26s}',
      '.gl-orb{position:absolute;width:60vmax;height:60vmax;border-radius:50%;filter:none;',
      'animation:gl-drift var(--gl-speed,26s) ease-in-out infinite alternate;will-change:transform}',
      '.gl-orb-1{left:-18vmax;top:-24vmax}',
      '.gl-orb-2{right:-16vmax;top:-8vmax;animation-duration:calc(var(--gl-speed,26s)*1.37);animation-delay:-7s}',
      '.gl-orb-3{left:8vmax;bottom:-26vmax;width:52vmax;height:52vmax;',
      'animation-duration:calc(var(--gl-speed,26s)*1.71);animation-delay:-14s}',
      '@keyframes gl-drift{0%{transform:translate3d(0,0,0) scale(1)}',
      '50%{transform:translate3d(3vmax,2vmax,0) scale(1.05)}',
      '100%{transform:translate3d(-2vmax,3vmax,0) scale(0.97)}}',
      '@media (prefers-reduced-motion:reduce){.gl-orb{animation:none}}',
      '.gl-grid{position:absolute;inset:0;background-size:48px 48px}',
      '.gl-specular{position:absolute;inset:0;',
      'background:radial-gradient(46vmax 46vmax at var(--mx) var(--my),',
      'rgba(255,255,255,var(--gl-spec)) 0%,transparent 60%)}',
      '.gl-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}',

      // ── settings page ────────────────────────────────────────────────────────
      // Matches the shell's own settings sections (plugin inventory / plugin
      // manager): 760px measure, 14px group cadence, 14px/500 titles, 12–13px
      // tertiary descriptions, and hairline separators on the row list.
      '.gl-settings{display:flex;flex-direction:column;gap:14px;width:100%;',
      'max-width:760px;color:var(--dsw-alias-label-primary)}',
      '.gl-lead{margin:0;font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-tertiary);text-wrap:pretty}',

      '.gl-preview{border-radius:var(--dsw-radius-md);overflow:hidden;',
      'border:.5px solid var(--dsw-alias-border-l2)}',
      '.gl-preview-canvas{height:64px;background-color:var(--dsw-alias-bg-base)}',
      '.gl-preview-meta{display:flex;justify-content:space-between;gap:10px;',
      'padding:8px 12px;font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-tertiary);',
      'border-top:.5px solid var(--dsw-alias-border-l2)}',

      // Groups: 10px internal cadence, separated by a hairline above each section.
      '.gl-card{display:flex;flex-direction:column;gap:10px}',
      '.gl-card+.gl-card{border-top:.5px solid var(--dsw-alias-border-l2);padding-top:14px}',
      '.gl-card-head{display:flex;flex-direction:column;gap:2px}',
      '.gl-card-title{margin:0;font-size:14px;font-weight:500;line-height:22px;',
      'color:var(--dsw-alias-label-primary)}',
      '.gl-card-hint{margin:0;font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-tertiary);text-wrap:pretty}',

      // Rows: the same list treatment the shell uses for settings entries.
      '.gl-card-rows{display:flex;flex-direction:column}',
      '.gl-row{display:flex;flex-direction:column;gap:8px;padding:12px 2px;',
      'border-bottom:.5px solid var(--dsw-alias-border-l2)}',
      '.gl-row:last-child{border-bottom:0}',
      '.gl-row-inline{flex-direction:row;align-items:center;justify-content:space-between;gap:16px}',
      '.gl-row-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}',
      '.gl-label{font-size:14px;font-weight:500;line-height:20px;',
      'color:var(--dsw-alias-label-primary)}',
      '.gl-value{font-variant-numeric:tabular-nums;font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-tertiary);flex:none}',

      '.gl-range{width:100%;height:24px;margin:0;cursor:pointer;',
      'accent-color:var(--dsw-alias-brand-primary)}',
      '.gl-range:focus-visible,.gl-color:focus-visible,.gl-btn:focus-visible{',
      'outline:var(--dsw-focus-ring-width) solid',
      'var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));',
      'outline-offset:2px}',

      // Colour fields share one row; they wrap only when the panel is narrow.
      '.gl-row-colors{gap:10px}',
      '.gl-colors{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap}',
      '.gl-color-field{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.gl-color-label{font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-tertiary)}',
      '.gl-color-hex{font:12px/18px ui-monospace,SFMono-Regular,monospace;',
      'color:var(--dsw-alias-label-tertiary)}',
      '.gl-color-row{display:flex;align-items:center;gap:10px}',
      '.gl-color{width:48px;height:28px;padding:0;flex:none;cursor:pointer;',
      'border:.5px solid var(--dsw-alias-border-l3);',
      'border-radius:var(--dsw-radius-sm);background:transparent}',
      '.gl-hex{font:12px/18px ui-monospace,SFMono-Regular,monospace;',
      'color:var(--dsw-alias-label-tertiary)}',

      // 36x24 press target around the shell's 36x20 track: same look, more room.
      '.gl-switch{box-sizing:border-box;display:inline-flex;align-items:center;',
      'justify-content:center;flex:0 0 auto;width:36px;height:24px;padding:0;',
      'border:0;border-radius:999px;background:0 0;cursor:pointer}',
      '.gl-switch:disabled{cursor:default;opacity:.5}',
      '.gl-switch:focus-visible{',
      'outline:var(--dsw-focus-ring-width) solid',
      'var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));',
      'outline-offset:2px}',
      '.gl-track{position:relative;display:block;width:36px;height:20px;',
      'border-radius:999px;background:var(--dsw-alias-border-l3);',
      'transition:background-color .12s ease}',
      '.gl-switch[aria-checked="true"] .gl-track{',
      'background:var(--dsw-alias-brand-primary)}',
      '.gl-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;',
      'border-radius:50%;background:var(--dsw-alias-label-primary-foreground);',
      'transition:transform .12s ease}',
      '.gl-switch[aria-checked="false"] .gl-knob{background:var(--dsw-alias-switch-thumb)}',
      '.gl-switch[aria-checked="true"] .gl-knob{transform:translate(16px)}',


      'color:var(--dsw-alias-label-secondary);',
      'border:.5px solid var(--dsw-alias-border-l4);',
      'border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);',
      'transition:background-color .12s ease}',

      '.gl-foot{display:flex;align-items:center;gap:12px;',
      'border-top:.5px solid var(--dsw-alias-border-l2);padding-top:14px}',
      '.gl-btn{height:28px;padding:0 10px;cursor:pointer;font:inherit;font-size:12.5px;',
      'color:var(--dsw-alias-label-secondary);',
      'border:.5px solid var(--dsw-alias-border-l4);',
      'border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);',
      'transition:background-color .12s ease}',
      '.gl-btn:hover{background:var(--dsw-alias-bg-layer-3)}',
      '.gl-toast{flex:1;min-width:0;font-size:12px;line-height:18px;',
      'color:var(--dsw-alias-label-tertiary)}',
      '.gl-build{font:12px/18px ui-monospace,SFMono-Regular,monospace;',
      'color:var(--dsw-alias-label-tertiary)}',

      '@media (prefers-reduced-motion:reduce){',
      '.gl-switch,.gl-knob,.gl-btn{transition:none}}',

    ].join('');

    // ── settings ─────────────────────────────────────────────────────────────

    var GROUPS = [
      {
        title: '液态玻璃',
        hint: '整体色调与网格纹理。改动实时生效。',
        items: [
          { key: 'accent', label: '主色', type: 'color' },
          { key: 'accent2', label: '辅助色', type: 'color' },
          { key: 'accent3', label: '第三色', type: 'color' },
          { key: 'glow', label: '氛围强度', type: 'range', min: 0, max: 1, step: 0.05, decimals: 2 },
          { key: 'grid', label: '网格纹理', type: 'range', min: 0, max: 1, step: 0.05, decimals: 2 },
          { key: 'specular', label: '指针追光', type: 'range', min: 0, max: 1, step: 0.05, decimals: 2 },
          { key: 'orbSpeed', label: '光球周期', type: 'range', min: 8, max: 60, step: 2, unit: 's' },
        ],
      },
      {
        title: '标题栏',
        hint: '开启后页面内那条标题栏底色跟随玻璃。右上角的 ─ □ ✕ 由 Windows 原生绘制，插件无法改变其颜色。',
        items: [
          { key: 'titlebar', label: '同步标题栏配色', type: 'switch' },
        ],
      },
      {
        title: '面板半透明',
        hint: '把界面表面的主题 token 调成半透明。0 = 保持宿主原样。',
        items: [{ key: 'surface', label: '表面透明度', type: 'range', min: 0, max: 0.7, step: 0.05, decimals: 2 }],
      },
      {
        title: '粒子波动',
        hint: '网格交点上的点阵：指针靠近时被推开、变亮，移开后弹回。',
        items: [
          { key: 'sub', label: '密度', type: 'range', min: 1, max: 8, step: 1, unit: 'x' },
          { key: 'dotSize', label: '点大小', type: 'range', min: 0.6, max: 3, step: 0.1, decimals: 1, unit: 'px' },
          { key: 'dotAlpha', label: '不透明度', type: 'range', min: 0.05, max: 1, step: 0.05, decimals: 2 },
          { key: 'radius', label: '拨动半径', type: 'range', min: 60, max: 320, step: 10, unit: 'px' },
          { key: 'push', label: '推力', type: 'range', min: 0, max: 6, step: 0.5, decimals: 1 },
          { key: 'damping', label: '阻尼', type: 'range', min: 0.8, max: 0.98, step: 0.01, decimals: 2 },
          { key: 'pointer', label: '响应指针', type: 'switch' },
        ],
      },
    ];

    function formatValue(item, value) {
      if (item.type === 'switch') return value ? '开' : '关';
      if (item.type === 'color') return String(value);
      var n = Number(value);
      return (item.decimals ? n.toFixed(item.decimals) : String(n)) + (item.unit || '');
    }

    function valueText(item, value) {
      if (item.type === 'switch') return value ? '已开启' : '已关闭';
      return formatValue(item, value);
    }

    /** Live preview: the same gradient stack the real layer paints. */
    function Preview(props) {
      var cfg = props.cfg;
      var style = {};
      try {
        style.background = specToCss(layerSpec(cfg));
      } catch (error) {
        style.background = 'transparent';
      }
      return h(
        'div',
        { className: 'gl-preview' },
        h('div', { className: 'gl-preview-canvas', style: style, 'aria-hidden': 'true' }),
        h(
          'div',
          { className: 'gl-preview-meta' },
          h('span', null, '预览'),
          h('span', null, '氛围 ' + Number(cfg.glow).toFixed(2) + ' · 粒子 ' + Number(cfg.dotAlpha).toFixed(2)),
        ),
      );
    }

    function Settings(props) {
      var store = props.store;
      var cfg = useStore(store);
      var noteState = useState('');
      var note = noteState[0];
      var setNote = noteState[1];

      useEffect(
        function () {
          if (!note) return undefined;
          var timer = window.setTimeout(function () {
            setNote('');
          }, 1800);
          return function () {
            window.clearTimeout(timer);
          };
        },
        [note],
      );

      function change(key, value) {
        var patch = {};
        patch[key] = value;
        store.set(patch);
      }

      function renderControl(item, value, id) {
        if (item.type === 'color') {
          return h(
            'div',
            { className: 'gl-color-row' },
            h('input', {
              id: id,
              className: 'gl-color',
              type: 'color',
              value: value,
              'aria-label': item.label + '，当前 ' + value,
              onChange: function (e) {
                change(item.key, e.target.value);
              },
            }),
          );
        }

        if (item.type === 'switch') {
          return h(
            'button',
            {
              id: id,
              type: 'button',
              role: 'switch',
              'aria-checked': value ? 'true' : 'false',
              'aria-label': item.label,
              className: 'gl-switch',
              onClick: function () {
                change(item.key, !value);
              },
            },
            h(
              'span',
              { className: 'gl-track', 'aria-hidden': 'true' },
              h('i', { className: 'gl-knob' }),
            ),
          );
        }

        return h('input', {
          id: id,
          className: 'gl-range',
          type: 'range',
          min: item.min,
          max: item.max,
          step: item.step,
          value: value,
          'aria-label': item.label,
          'aria-valuetext': valueText(item, value),
          onChange: function (e) {
            var next = Number(e.target.value);
            change(item.key, item.decimals ? next : Math.round(next));
          },
        });
      }

      var cards = GROUPS.map(function (group) {
        // Colours are compact controls, so they sit together on one row instead
        // of each taking a full-width slider row.
        var colourItems = group.items.filter(function (item) {
          return item.type === 'color';
        });
        var plainItems = group.items.filter(function (item) {
          return item.type !== 'color';
        });

        var colourRow =
          colourItems.length > 0
            ? h(
                'div',
                { className: 'gl-row gl-row-colors' },
                h(
                  'div',
                  { className: 'gl-colors', role: 'group', 'aria-label': '配色' },
                  colourItems.map(function (item) {
                    var id = 'gl-' + item.key;
                    var value = cfg[item.key];
                    return h(
                      'div',
                      { className: 'gl-color-field', key: item.key },
                      h('label', { className: 'gl-color-label', htmlFor: id }, item.label),
                      h('input', {
                        id: id,
                        className: 'gl-color',
                        type: 'color',
                        value: value,
                        'aria-label': item.label + '，当前 ' + value,
                        onChange: function (e) {
                          change(item.key, e.target.value);
                        },
                      }),
                      h('span', { className: 'gl-color-hex' }, String(value).toUpperCase()),
                    );
                  }),
                ),
              )
            : null;

        var rows = plainItems.map(function (item) {
          var value = cfg[item.key];
          var id = 'gl-' + item.key;
          var control = renderControl(item, value, id);
          var isInline = item.type === 'switch';

          return h(
            'div',
            { className: 'gl-row' + (isInline ? ' gl-row-inline' : ''), key: item.key },
            isInline
              ? [
                  h('label', { className: 'gl-label', htmlFor: id, key: 'l' }, item.label),
                  control,
                ]
              : [
                  h(
                    'div',
                    { className: 'gl-row-head', key: 'h' },
                    h('label', { className: 'gl-label', htmlFor: id }, item.label),
                    h('span', { className: 'gl-value' }, formatValue(item, value)),
                  ),
                  control,
                ],
          );
        });

        var titleId = 'gl-group-' + group.title;

        return h(
          'section',
          { className: 'gl-card', key: group.title, 'aria-labelledby': titleId },
          h(
            'div',
            { className: 'gl-card-head' },
            h('h3', { className: 'gl-card-title', id: titleId }, group.title),
            group.hint ? h('p', { className: 'gl-card-hint' }, group.hint) : null,
          ),
          h('div', { className: 'gl-card-rows' }, colourRow ? [colourRow].concat(rows) : rows),
        );
      });

      return h(
        'div',
        { className: 'gl-settings' },
        h(
          'p',
          { className: 'gl-lead' },
          '液态玻璃层覆盖整个界面，点击穿透、不影响操作。以下改动实时生效并保存在本机。',
        ),
        h(Preview, { cfg: cfg }),
        cards,
        h(
          'div',
          { className: 'gl-foot' },
          h(
            'button',
            {
              type: 'button',
              className: 'gl-btn',
              onClick: function () {
                store.reset();
                setNote('已恢复默认');
              },
            },
            '恢复默认',
          ),
          h('span', { className: 'gl-toast', role: 'status', 'aria-live': 'polite' }, note),
          h('span', { className: 'gl-build' }, BUILD),
        ),
      );
    }


    // ── plugin ───────────────────────────────────────────────────────────────

    function installStyles(ctx, provided) {
      ctx.effect(
        function () {
          var remove = null;
          var el = null;
          if (provided && typeof provided.insert === 'function') {
            remove = provided.insert(CSS);
          } else {
            el = document.createElement('style');
            el.setAttribute('data-dsh-plugin', '@local/glass-liquid');
            el.textContent = CSS;
            document.head.appendChild(el);
          }
          return function () {
            if (remove) remove();
            if (el && el.parentNode) el.parentNode.removeChild(el);
          };
        },
        'glass-liquid: styles',
      );
    }

    /**
     * Surface translucency through the supported theme API.
     *
     * `theme.overrideTokens(source, tokens)` stacks a token layer over the active
     * theme: the base theme is untouched, layers compose in order, and removing
     * the layer restores what it covered. That is the documented way for a plugin
     * to restyle shell surfaces — no DOM rewriting.
     *
     * Values come from the LIVE computed tokens, not from `getTheme().active
     * .tokens`: the built-in palettes live in CSS, so their JS definition carries
     * no values and reading it silently disabled every override.
     */
    /**
     * The desktop preload re-reads its caption probe only when a mutation it
     * observes fires (<body> `style`, <html> `lang`, <head> children). Writing one
     * custom property to the body's inline style is a benign way to trigger that
     * read after the tokens have changed.
     */
    var CAPTION_SYNC_PROP = '--gl-caption-sync';

    /** What the caption bridge last wrote, surfaced by the Settings report. */
    var CAPTION_WRITTEN = { bg: '', fg: '', at: 0 };

    function nudgeCaptionSync() {
      try {
        var body = document.body;
        if (!body || !body.style) return;
        body.style.setProperty(CAPTION_SYNC_PROP, String(Date.now()));
      } catch (error) {
        /* cosmetic only */
      }
    }

    function clearCaptionSync() {
      try {
        var body = document.body;
        if (body && body.style) body.style.removeProperty(CAPTION_SYNC_PROP);
      } catch (error) {
        /* nothing to clear */
      }
    }

    /**
     * Live token value.
     *
     * The shell declares its design tokens on a wrapper element inside the app,
     * not on <html>/<body>, so those two resolve to an empty string. Probe the
     * body, then walk down the first few levels until a node actually resolves
     * the property — otherwise every colour calculation silently falls back to a
     * hard-coded value and light themes break.
     */
    function readToken(name) {
      function resolve(node) {
        if (!node) return '';
        try {
          return window.getComputedStyle(node).getPropertyValue(name).trim();
        } catch (error) {
          return '';
        }
      }

      var direct = resolve(document.body);
      if (direct) return direct;
      direct = resolve(document.documentElement);
      if (direct) return direct;

      var queue = [];
      try {
        var kids = document.body ? document.body.children : [];
        for (var i = 0; i < kids.length && i < 4; i += 1) queue.push({ node: kids[i], depth: 0 });
      } catch (error) {
        queue = [];
      }
      while (queue.length) {
        var item = queue.shift();
        var found = resolve(item.node);
        if (found) return found;
        if (item.depth < 3 && item.node && item.node.children) {
          for (var j = 0; j < item.node.children.length && j < 4; j += 1) {
            queue.push({ node: item.node.children[j], depth: item.depth + 1 });
          }
        }
      }
      return '';
    }

    var SURFACE_TOKENS = [
      '--dsw-alias-bg-base',
      '--dsw-alias-bg-layer-1',
      '--dsw-alias-bg-layer-2',
      '--dsw-alias-bg-overlay',
    ];

    function installSurfaceTokens(ctx, store) {
      var theme = null;
      try {
        theme = ctx.get ? ctx.get('theme') : null;
      } catch (error) {
        theme = null;
      }
      if (!theme || typeof theme.overrideTokens !== 'function' || typeof theme.getTheme !== 'function') {
        return false;
      }

      ctx.effect(
        function () {
          var disposeLayer = null;

          var pendingFrame = 0;
          var lastSignature = null;

          function applyNow() {
            var surface = clamp(Number(store.get().surface) || 0, 0, 0.7);
            var tokens = {};
            var any = false;

            if (surface > 0) {
              var alpha = 1 - surface;
              for (var i = 0; i < SURFACE_TOKENS.length; i += 1) {
                var name = SURFACE_TOKENS[i];
                var value = withAlpha(readToken(name), alpha);
                if (!value) continue;
                tokens[name] = { light: value, dark: value };
                any = true;
              }
            }

            // Rebuilding the token layer restyles the whole shell, so it only
            // happens when the colours actually changed.
            var signature = surface + '|' + JSON.stringify(tokens);
            if (signature === lastSignature) return;
            lastSignature = signature;

            try {
              if (any) {
                var next = theme.overrideTokens('@local/glass-liquid', tokens);
                if (disposeLayer) disposeLayer();
                disposeLayer = typeof next === 'function' ? next : null;
              } else if (disposeLayer) {
                disposeLayer();
                disposeLayer = null;
              }
            } catch (error) {
              /* cosmetic only */
            }
          }

          /**
           * A slider fires dozens of input events per drag. Applying each one
           * rebuilt the token layer and forced a full style recalculation, which
           * could lock the renderer up, so updates collapse into the next frame.
           */
          function apply() {
            if (pendingFrame) return;
            pendingFrame = window.requestAnimationFrame(function () {
              pendingFrame = 0;
              applyNow();
            });
          }

          applyNow();
          var offStore = store.subscribe(apply);
          var off = null;
          if (typeof ctx.on === 'function') {
            try {
              off = ctx.on('theme/change', apply);
            } catch (error) {
              off = null;
            }
          }

          return function () {
            if (off) off();
            if (offStore) offStore();
            if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
            pendingFrame = 0;
            if (disposeLayer) disposeLayer();
            disposeLayer = null;
          };
        },
        'glass-liquid: surface tokens',
      );

      return true;
    }

    /**
     * Native caption bridge.
     *
     * On Windows the desktop shell paints the window buttons itself and keeps the
     * caption in sync by reading two tokens through a hidden probe:
     *
     *   - background : `--dsw-specific-sidebar-fill`
     *   - icon colour: `--dsw-alias-label-primary`
     *     (preload `syncWindowsAppearance()`, IPC `dsh-desktop:windows-appearance`,
     *      main process `mainWindow.setTitleBarOverlay({ color, symbolColor })`)
     *
     * That probe is a child of `<body>`, and the sync only re-reads when it sees a
     * mutation on `<body>`'s `style` attribute. Writing the two tokens on `<body>`
     * therefore does both jobs at once: the probe inherits them, and the write is
     * the mutation that makes the shell push the new colours to the native layer.
     *
     * This is the only channel the platform exposes for those buttons — their
     * shape, count and position stay owned by Windows.
     */
    function installCaptionBridge(ctx, store) {
      ctx.effect(
        function () {
          var saved = {};

          function writeVar(name, value) {
            var body = document.body;
            if (!body || !body.style) return;
            if (!Object.prototype.hasOwnProperty.call(saved, name)) {
              saved[name] = body.style.getPropertyValue(name) || '';
            }
            body.style.setProperty(name, value);
          }

          function restoreVar(name) {
            var body = document.body;
            if (!body || !body.style) return;
            var previous = saved[name];
            if (previous) body.style.setProperty(name, previous);
            else body.style.removeProperty(name);
            delete saved[name];
          }

          var lastCaptionKey = null;

          function apply() {
            var cfg = store.get();
            // Only the title-bar switch and the accent colours feed the caption;
            // skipping unrelated updates avoids waking the preload on every drag.
            var captionKey = [cfg.titlebar, cfg.accent, cfg.accent2, cfg.accent3].join('|');
            if (captionKey === lastCaptionKey) return;
            lastCaptionKey = captionKey;

            if (cfg.titlebar === false) {
              restoreVar('--dsw-specific-sidebar-fill');
              return;
            }

            var base = colourOf(readToken('--dsw-alias-bg-base')) || [27, 27, 27];
            var vw = window.innerWidth || 1280;
            var vh = window.innerHeight || 800;
            // Same gradient stack the layer paints, sampled where the caption sits.
            var caption = rgba(sampleStack(layerSpec(cfg), vw, vh, vw / 2, 6, base), 1);
            writeVar('--dsw-specific-sidebar-fill', caption);
            CAPTION_WRITTEN.bg = caption;
            CAPTION_WRITTEN.at = Date.now();

            // Only the in-page title bar strip is ours to colour. The native
            // ─ □ ✕ buttons are drawn by the Windows shell and cannot be reached
            // from a plugin (see README), so `--dsw-alias-label-primary` is left
            // alone — writing it would tint the whole UI's text for no gain.

            nudgeCaptionSync();
          }

          apply();

          var offStore = store.subscribe(apply);
          var off = null;
          if (typeof ctx.on === 'function') {
            try {
              off = ctx.on('theme/change', apply);
            } catch (error) {
              off = null;
            }
          }

          // The preload installs its probe on document ready; re-apply afterwards so
          // the first caption paint is not missed.
          var t1 = window.setTimeout(apply, 300);
          var t2 = window.setTimeout(apply, 1200);

          var resizeTimer = 0;
          function onResize() {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(apply, 180);
          }
          window.addEventListener('resize', onResize);

          // The shell re-applies its own tokens whenever it re-renders, which can
          // silently overwrite the two caption variables. Re-assert on a slow
          // heartbeat so the native caption converges instead of flickering once.
          var heartbeat = window.setInterval(apply, 2500);

          return function () {
            if (off) off();
            if (offStore) offStore();
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            window.removeEventListener('resize', onResize);
            window.clearTimeout(resizeTimer);
            if (heartbeat) window.clearInterval(heartbeat);
            restoreVar('--dsw-specific-sidebar-fill');
            clearCaptionSync();
          };
        },
        'glass-liquid: caption bridge',
      );
    }

    /**
     * Mount the layer and keep it mounted.
     *
     * A dynamic Client module can run before the document is ready, and the shell
     * can replace the container's children later; the periodic parent check
     * covers both, so the layer cannot silently fail to appear.
     */
    function installLayer(ctx, store) {
      ctx.effect(
        function () {
          var host = null;
          var layer = null;
          var disposed = false;
          var timer = 0;

          function parent() {
            return document.body || document.documentElement;
          }

          function attached(p) {
            if (!host || !p) return false;
            try {
              if (typeof p.contains === 'function') return p.contains(host);
            } catch (error) {
              /* fall through */
            }
            return host.parentNode === p;
          }

          function mount() {
            if (disposed) return;
            var p = parent();
            if (!p) return;
            if (attached(p)) return;

            if (layer) {
              layer.destroy();
              layer = null;
            }
            if (host && host.parentNode) host.parentNode.removeChild(host);

            host = document.createElement('div');
            host.className = 'gl-host';
            host.setAttribute('aria-hidden', 'true');
            host.setAttribute('data-dsh-plugin', '@local/glass-liquid');

            layer = buildLayer(store);
            if (layer && layer.el) host.appendChild(layer.el);
            p.appendChild(host);
          }

          mount();
          timer = window.setInterval(mount, 500);

          return function () {
            disposed = true;
            if (timer) window.clearInterval(timer);
            if (layer) layer.destroy();
            layer = null;
            if (host && host.parentNode) host.parentNode.removeChild(host);
            host = null;
          };
        },
        'glass-liquid: layer',
      );
    }

    function apply(ctx, config) {
      if (!ctx || !ctx.slots) return;

      var store = createStore(config);
      var provided = null;
      try {
        provided = ctx.get ? ctx.get('styles') : null;
      } catch (error) {
        provided = null;
      }

      installStyles(ctx, provided);
      installSurfaceTokens(ctx, store);
      installCaptionBridge(ctx, store);
      installLayer(ctx, store);

      // Disabling the plugin forgets the tuned values, so re-enabling it starts
      // from the default 淡雅 appearance instead of silently restoring old knobs.
      ctx.effect(
        function () {
          return function () {
            store.forget();
          };
        },
        'glass-liquid: forget settings',
      );

      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register(
          { name: 'settings.section', id: 'glass-liquid', order: 70, label: '液态玻璃' },
          function GlassSettings() {
            return h(Settings, { store: store });
          },
        );
      });
    }

    return {
      inject: ['slots'],
      apply: apply,
    };
  },
});
