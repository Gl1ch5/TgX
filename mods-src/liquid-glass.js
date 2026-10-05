export default function (tx) {
  // Liquid Glass for TeleX.
  // The refraction / chromatic aberration / Fresnel / specular / rim / shadow maths is the fragment shader of
  // github.com/ybouane/liquidglass, evaluated on the CPU for the shape of a panel. The result (displacement maps +
  // two light layers) drives an SVG backdrop-filter, so the glass bends the LIVE page behind it while you scroll.
  //  - small panels (dock, pills, menus, dialogs) get one map of their own size;
  //  - big panels (post cards, settings groups) get a 9-slice: four corners and four edge strips are enough because
  //    inside the bevel the shader's field is flat. Only cards near the screen carry a filter.
  const SVGNS = 'http://www.w3.org/2000/svg';
  const TARGETS = {
    dock: '.tx-dock',
    bars: '.tx-glass, .tx-search-main, .tx-pill-tabs, .tx-side-btn, .tx-circle',
    menus: '.tx-ctx-reactions, .tx-ctx .tx-menu',
    dialogs: '.tx-dialog',
    cards: '.tx-bubble:not(.is-sticker), .tx-group',
  };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const supported = !!(window.CSS && CSS.supports && (CSS.supports('backdrop-filter', 'url(#a)') || CSS.supports('-webkit-backdrop-filter', 'url(#a)')));
  if (!supported) { tx.toast(tx.L({ ru: 'Этот браузер не поддерживает стекло', en: 'This browser does not support the glass effect', es: 'Este navegador no admite el efecto de cristal', pt: 'Este navegador não suporta o efeito de vidro', uk: 'Цей браузер не підтримує ефект скла' })); return; }

  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;pointer-events:none';
  const defs = document.createElementNS(SVGNS, 'defs');
  svg.append(defs);
  document.body.append(svg);

  const style = document.createElement('style');
  style.textContent = `
    .lg-on { background: transparent !important; border-color: transparent !important; }
    .lg-layer { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-sizing: border-box; z-index: -1; background-repeat: no-repeat; }
    .lg-layer.is-flat { background-size: 100% 100%; }
    .lg-layer.is-slice { border-style: solid; border-color: transparent; background: none !important; border-image-repeat: stretch; }
  `;
  document.head.append(style);

  const conf = () => {
    const c = tx.config;
    return {
      blurAmount: c.get('blurAmount'), refraction: c.get('refraction'), chromAberration: c.get('chromAberration'),
      edgeHighlight: c.get('edgeHighlight'), specular: c.get('specular'), fresnel: c.get('fresnel'),
      distortion: c.get('distortion'), zRadius: c.get('zRadius'), saturation: c.get('saturation'),
      tintStrength: c.get('tintStrength'), brightness: c.get('brightness'),
      shadowOpacity: c.get('shadowOpacity'), shadowSpread: c.get('shadowSpread'), shadowOffsetY: c.get('shadowOffsetY'),
      bevelMode: c.get('dome') ? 1 : 0,
    };
  };

  // ------------------------------------------------------------------ the shader, per pixel
  const rrSDF = (px, py, bx, by, r) => {
    const qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  };
  const bevel = (d, zR) => (d <= 0 ? 0 : d >= zR ? zR : Math.sqrt(d * (2 * zR - d)));
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const L1 = norm3(0.4, 0.7, 1), L2 = norm3(-0.3, -0.5, 1), L3 = norm3(0.1, 0.3, 1), L4 = norm3(0, 0.9, 0.4);
  const H1 = norm3(L1[0], L1[1], L1[2] + 1), H2 = norm3(L2[0], L2[1], L2[2] + 1), H4 = norm3(L4[0], L4[1], L4[2] + 1);

  /**
   * The field of a w×h css-px panel in device px: displacement per colour channel, additive light, Fresnel light.
   * slice=true: the field of a virtual panel used for 9-slicing (no centre lens, no medial-axis fade).
   */
  function field(w, h, radiusCss, cfg, D, slice) {
    const W = Math.max(2, Math.round(w * D)), H = Math.max(2, Math.round(h * D));
    const hx = W / 2, hy = H / 2;
    const r = Math.min(radiusCss * D, hx, hy);
    const zR = cfg.zRadius * D;
    const n = W * H;
    const disp = [new Float32Array(n * 2), new Float32Array(n * 2), new Float32Array(n * 2)]; // R, G, B: dx, dy
    const add = new Float32Array(n), fre = new Float32Array(n);
    const e = 2;
    const refrPow = 1 - 1 / 1.5;
    const maxD = slice ? 1e9 : Math.min(hx, hy);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const px = x + 0.5 - hx, py = y + 0.5 - hy;
        const sdf = rrSDF(px, py, hx, hy, r);
        if (sdf > 0) continue;
        const inside = -sdf;
        const edge = smooth(Math.min(maxD * 0.35, zR * 1.4), 0, inside);
        const dR = -rrSDF(px + e, py, hx, hy, r), dL = -rrSDF(px - e, py, hx, hy, r);
        const dU = -rrSDF(px, py + e, hx, hy, r), dD = -rrSDF(px, py - e, hx, hy, r);
        const hC = bevel(inside, zR);
        const ridge = slice ? 1 : smooth(maxD, maxD * 0.82, inside);
        const gx = ((bevel(dR, zR) - bevel(dL, zR)) / (2 * e)) * ridge, gy = ((bevel(dU, zR) - bevel(dD, zR)) / (2 * e)) * ridge;
        const N = norm3(-gx, -gy, 1);
        const depth = smooth(0, zR, inside);
        let rx, ry;
        if (cfg.bevelMode < 0.5) {
          const thickNorm = (hC * 2) / Math.max(zR * 2, 1);
          const k = refrPow * (2 + thickNorm * 0.5);
          rx = gx * k * cfg.refraction * 30; ry = gy * k * cfg.refraction * 30;
          if (!slice) { rx += (-px / Math.max(hx, 1)) * cfg.refraction * 4 * depth; ry += (-py / Math.max(hy, 1)) * cfg.refraction * 4 * depth; }
        } else if (!slice) {
          rx = -px * cfg.refraction * depth * 0.35; ry = -py * cfg.refraction * depth * 0.35;
        } else { rx = 0; ry = 0; }
        if (cfg.distortion > 0) {
          rx += (hash(px * 0.08, py * 0.08) - 0.5) * cfg.distortion * 4;
          ry += (hash(px * 0.08 + 37, py * 0.08 + 37) - 0.5) * cfg.distortion * 4;
        }
        const caS = cfg.chromAberration * 18 * (edge * 0.7 + 0.3) * 2;
        const cx = N[0] * caS, cy = N[1] * caS;
        const o = i * 2;
        const put = (m, ax, ay) => { m[o] = clamp(ax, 0.5 - (x + 0.5), W - 0.5 - (x + 0.5)); m[o + 1] = clamp(ay, 0.5 - (y + 0.5), H - 0.5 - (y + 0.5)); };
        put(disp[0], rx + cx, ry + cy); put(disp[1], rx, ry); put(disp[2], rx - cx, ry - cy);
        const f = Math.pow(1 - Math.abs(N[2]), 4) * cfg.fresnel;
        const sp1 = Math.pow(Math.max(dot(N, H1), 0), 90);
        const sp2 = Math.pow(Math.max(dot(N, H2), 0), 50) * 0.3;
        const spB = Math.pow(Math.max(dot(N, L3), 0), 6) * 0.1;
        const sp4 = Math.pow(Math.max(dot(N, H4), 0), 120) * 0.6;
        const totalSpec = (sp1 + sp2 + spB + sp4) * cfg.specular;
        let stroke = smooth(-2.5, -1.5, sdf) * (1 - smooth(-1, 0, sdf));
        stroke *= 0.4 + 0.6 * (0.5 + 0.5 * (-py / hy));
        const rim = edge * cfg.edgeHighlight * 0.22;
        const glow = smooth(5, 0, inside) * cfg.edgeHighlight * 0.15;
        const env = (N[1] * 0.5 + 0.5) * f * 0.08;
        add[i] = totalSpec + rim + glow + stroke * cfg.edgeHighlight * 0.55 + env + 0.03 * depth;
        fre[i] = f * 0.2;
      }
    }
    // The bevel normal flips sign on the medial axis; a tiny blur turns that seam into a ramp (no hairline).
    const rad = Math.max(1, Math.round(1.6 * D));
    const tmp = new Float32Array(n * 2);
    for (const m of disp) {
      for (let pass = 0; pass < 2; pass++) {
        const horizontal = pass === 0;
        tmp.set(m);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          let sx = 0, sy = 0, c = 0;
          for (let k = -rad; k <= rad; k++) {
            const xx = horizontal ? clamp(x + k, 0, W - 1) : x, yy = horizontal ? y : clamp(y + k, 0, H - 1);
            const j = (yy * W + xx) * 2; sx += tmp[j]; sy += tmp[j + 1]; c++;
          }
          const o = (y * W + x) * 2; m[o] = sx / c; m[o + 1] = sy / c;
        }
      }
    }
    return { W, H, disp, add, fre };
  }

  // ------------------------------------------------------------------ small encoders
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  /** PNG data URL of a region [x0,y0,x1,y1) where px(i) → [r,g,b,a]. */
  function png(W, region, px) {
    const [x0, y0, x1, y1] = region;
    const w = x1 - x0, h = y1 - y0;
    const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = px((y + y0) * W + (x + x0)); const o = (y * w + x) * 4;
      d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2]; d[o + 3] = v[3];
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
  const enc = (v, S) => clamp(Math.round((0.5 + v / S) * 255), 0, 255);

  /** One map of the panel's own size (small panels). */
  function buildFull(w, h, radius, cfg, D) {
    const f = field(w, h, radius, cfg, D, false);
    let maxAbs = 1e-6;
    for (const m of f.disp) for (let i = 0; i < m.length; i++) maxAbs = Math.max(maxAbs, Math.abs(m[i]));
    const S = maxAbs * 2;
    const all = [0, 0, f.W, f.H];
    return {
      maps: f.disp.map((m) => png(f.W, all, (i) => [enc(m[i * 2], S), enc(m[i * 2 + 1], S), 128, 255])),
      add: png(f.W, all, (i) => [255, 255, 255, clamp(Math.round(f.add[i] * 255), 0, 255)]),
      fres: png(f.W, all, (i) => [255, 255, 255, clamp(Math.round(f.fre[i] * 255), 0, 255)]),
      scale: S / D,
    };
  }

  /** 9-slice for big panels: corners + edge strips of the maps, border-image for the light. */
  const sliceCache = new Map();
  function buildSliced(radius, cfg, D, B) {
    const key = [radius, B, D, JSON.stringify(cfg)].join('|');
    if (sliceCache.has(key)) return sliceCache.get(key);
    const V = 2 * B + 4;
    const f = field(V, V, radius, cfg, D, true);
    const Bd = Math.round(B * D), W = f.W, H = f.H;
    const G = f.disp[1];
    const C = new Float32Array(G.length); // chroma vector: R = G + C, B = G - C
    for (let i = 0; i < G.length; i++) C[i] = f.disp[0][i] - G[i];
    let mg = 1e-6, mc = 1e-6;
    for (let i = 0; i < G.length; i++) { mg = Math.max(mg, Math.abs(G[i])); mc = Math.max(mc, Math.abs(C[i])); }
    const S = 2 * (mg + mc) + 1e-6;
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    const regions = {
      tl: [0, 0, Bd, Bd], tr: [W - Bd, 0, W, Bd], bl: [0, H - Bd, Bd, H], br: [W - Bd, H - Bd, W, H],
      top: [cx, 0, cx + 1, Bd], bottom: [cx, H - Bd, cx + 1, H], left: [0, cy, Bd, cy + 1], right: [W - Bd, cy, W, cy + 1],
    };
    const mapOf = (arr) => Object.fromEntries(Object.entries(regions).map(([k, rg]) => [k, png(W, rg, (i) => [enc(arr[i * 2], S), enc(arr[i * 2 + 1], S), 128, 255])]));
    const out = {
      m1: mapOf(G), m2: mapOf(C),
      add: png(W, [0, 0, W, H], (i) => [255, 255, 255, clamp(Math.round(f.add[i] * 255), 0, 255)]),
      fres: png(W, [0, 0, W, H], (i) => [255, 255, 255, clamp(Math.round(f.fre[i] * 255), 0, 255)]),
      scale: S / D, Bd,
    };
    sliceCache.set(key, out);
    return out;
  }

  // ------------------------------------------------------------------ SVG filters
  const colourTail = (cfg) => {
    const sat = Math.max(0, 1 + cfg.saturation), br = 1 + cfg.brightness, t = cfg.tintStrength;
    const tint = [1 - 0.08 * t, 1 - 0.05 * t, 1 + 0.05 * t];
    return `<feColorMatrix in="rgb" type="saturate" values="${sat}" result="sat"/>
      <feColorMatrix in="sat" type="matrix" values="${br * tint[0]} 0 0 0 0  0 ${br * tint[1]} 0 0 0  0 0 ${br * tint[2]} 0 0  0 0 0 1 0"/>`;
  };
  const CH = ['1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'];
  const displaceChain = (maps, scale) => ['R', 'G', 'B'].map((c, k) => `
      <feDisplacementMap in="src" in2="${maps[k]}" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d${c}"/>
      <feColorMatrix in="d${c}" type="matrix" values="${CH[k]}" result="c${c}"/>`).join('') + `
      <feBlend in="cR" in2="cG" mode="screen" result="rg"/>
      <feBlend in="rg" in2="cB" mode="screen" result="rgb"/>`;

  function makeFilter(id, w, h, cfg, built, sliced, B) {
    const f = document.createElementNS(SVGNS, 'filter');
    f.setAttribute('id', id);
    f.setAttribute('filterUnits', 'userSpaceOnUse');
    f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', String(w)); f.setAttribute('height', String(h));
    f.setAttribute('color-interpolation-filters', 'sRGB');
    const blur = `<feGaussianBlur in="SourceGraphic" stdDeviation="${sliced ? Math.max(cfg.blurAmount * 8, tx.config.get('cardBlur') * 0.45) : cfg.blurAmount * 8}" edgeMode="duplicate" result="src"/>`;
    if (!sliced) {
      f.innerHTML = blur + ['R', 'G', 'B'].map((c, k) => `<feImage href="${built.maps[k]}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m${c}"/>`).join('')
        + displaceChain(['mR', 'mG', 'mB'], built.scale.toFixed(3)) + colourTail(cfg);
    } else {
      const piece = (map, name, x, y, pw, ph) => `<feImage href="${map[name]}" x="${x}" y="${y}" width="${pw}" height="${ph}" preserveAspectRatio="none" result="${map.id}_${name}"/>`;
      const full = (map) => {
        const names = ['tl', 'tr', 'bl', 'br', 'top', 'bottom', 'left', 'right'];
        const geo = { tl: [0, 0, B, B], tr: [w - B, 0, B, B], bl: [0, h - B, B, B], br: [w - B, h - B, B, B], top: [B, 0, w - 2 * B, B], bottom: [B, h - B, w - 2 * B, B], left: [0, B, B, h - 2 * B], right: [w - B, B, B, h - 2 * B] };
        return `<feFlood flood-color="rgb(128,128,128)" flood-opacity="1" x="0" y="0" width="${w}" height="${h}" result="${map.id}_n"/>`
          + names.map((nm) => piece(map, nm, ...geo[nm])).join('')
          + `<feMerge result="${map.id}"><feMergeNode in="${map.id}_n"/>${names.map((nm) => `<feMergeNode in="${map.id}_${nm}"/>`).join('')}</feMerge>`;
      };
      const m1 = { ...built.m1, id: 'mA' }, m2 = { ...built.m2, id: 'mB' };
      f.innerHTML = blur + full(m1) + full(m2) + `
        <feColorMatrix in="mB" type="matrix" values="-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0" result="mBinv"/>
        <feComposite in="mA" in2="mB" operator="arithmetic" k1="0" k2="1" k3="1" k4="-0.5" result="mR0"/>
        <feColorMatrix in="mR0" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="mR"/>
        <feComposite in="mA" in2="mBinv" operator="arithmetic" k1="0" k2="1" k3="1" k4="-0.5" result="mB0"/>
        <feColorMatrix in="mB0" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1" result="mBc"/>`
        + displaceChain(['mR', 'mA', 'mBc'], built.scale.toFixed(3)) + colourTail(cfg);
    }
    return f;
  }

  // ------------------------------------------------------------------ one panel
  let seq = 0;
  const panels = new Map(); // el -> { id, filter, layers, ro, size, sliced, active }
  const visible = new IntersectionObserver((entries) => {
    for (const e of entries) { const p = panels.get(e.target); if (p && p.sliced) setActive(e.target, p, e.isIntersecting); }
  }, { rootMargin: '400px 0px' });

  function setActive(el, p, on) {
    if (p.active === on) return;
    p.active = on;
    if (on) {
      el.style.setProperty('backdrop-filter', `url(#${p.id})`, 'important');
      el.style.setProperty('-webkit-backdrop-filter', `url(#${p.id})`, 'important');
    } else {
      el.style.setProperty('backdrop-filter', 'none', 'important');
      el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    }
  }

  const waiting = new WeakSet();
  function waitForSize(el) {
    if (waiting.has(el) || !window.ResizeObserver) return;
    waiting.add(el);
    const ro = new ResizeObserver(() => {
      if (!el.isConnected) { ro.disconnect(); return; }
      if (el.offsetWidth >= 24 && el.offsetHeight >= 24) { ro.disconnect(); waiting.delete(el); if (!panels.has(el)) enqueue(el); }
    });
    ro.observe(el);
    onStopFns.push(() => ro.disconnect());
  }
  const onStopFns = [];

  function apply(el) {
    const rect = el.getBoundingClientRect();
    const w = Math.round(rect.width), h = Math.round(rect.height);
    if (w < 24 || h < 24 || w > 2400) { waitForSize(el); return; } // on a hidden screen: try again when it appears
    const base = conf();
    // a bevel deeper than half the panel never flattens (a hard seam on the axis): cap it like a real lens
    const cfg = { ...base, zRadius: Math.min(base.zRadius, Math.min(w, h) / 2) };
    const cs = getComputedStyle(el);
    let radius = parseFloat(el.dataset.lgRadius || cs.borderTopLeftRadius) || Math.min(w, h) / 2;
    if (/%/.test(cs.borderTopLeftRadius) && !el.dataset.lgRadius) radius = Math.min(w, h) / 2;
    el.dataset.lgRadius = String(radius);
    radius = Math.min(radius, w / 2, h / 2);
    const D = Math.min(3, window.devicePixelRatio || 1);
    const B = Math.ceil(Math.max(radius, base.zRadius * 0.9) + 6);
    const sliced = Math.min(w, h) > 2 * B + 8 && w * h > 90000;
    if (sliced) cfg.zRadius = base.zRadius;
    if (!sliced && h > 900) return;
    const built = sliced ? buildSliced(radius, cfg, D, B) : buildFull(w, h, radius, cfg, D);
    let p = panels.get(el);
    const id = p ? p.id : `lg-${++seq}`;
    const filter = makeFilter(id, w, h, cfg, built, sliced, B);
    if (p && p.filter) p.filter.remove();
    defs.append(filter);
    if (!p) {
      p = { id, layers: [], size: '', sliced, active: false };
      const add = document.createElement('i'); add.className = 'lg-layer';
      const fres = document.createElement('i'); fres.className = 'lg-layer';
      el.prepend(fres); el.prepend(add);
      p.layers = [add, fres];
      p.pos = el.style.position; p.bf = el.style.getPropertyValue('backdrop-filter'); p.sh = el.style.getPropertyValue('box-shadow');
      if (cs.position === 'static') el.style.position = 'relative';
      el.classList.add('lg-on');
      panels.set(el, p);
      let timer = 0;
      p.ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(() => apply(el), 200); });
      p.ro.observe(el);
    }
    p.filter = filter; p.size = `${w}x${h}`; p.sliced = sliced;
    // light layers: flat image for small panels, border-image 9-slice for big ones
    [[p.layers[0], built.add], [p.layers[1], built.fres]].forEach(([layer, url]) => {
      if (sliced) {
        layer.className = 'lg-layer is-slice';
        layer.style.cssText = `border-width:${B}px;border-image-source:url(${url});border-image-slice:${built.Bd} fill;border-image-width:${B}px;`;
      } else {
        layer.className = 'lg-layer is-flat';
        layer.style.cssText = `background-image:url(${url});`;
      }
    });
    const so = cfg.shadowOpacity;
    el.style.setProperty('box-shadow', `0 ${cfg.shadowOffsetY}px ${cfg.shadowSpread * 1.6}px rgba(0,0,0,${(so * 0.65).toFixed(3)}), 0 1px 2px rgba(0,0,0,${(so * 0.35).toFixed(3)})`, 'important');
    if (sliced) { p.active = null; visible.observe(el); const r2 = el.getBoundingClientRect(); setActive(el, p, r2.bottom > -400 && r2.top < innerHeight + 400); }
    else { p.active = null; setActive(el, p, true); }
  }

  function release(el) {
    const p = panels.get(el);
    if (!p) return;
    visible.unobserve(el);
    p.ro && p.ro.disconnect();
    p.layers.forEach((n) => n.remove());
    p.filter && p.filter.remove();
    el.classList.remove('lg-on');
    el.style.position = p.pos || '';
    for (const k of ['backdrop-filter', '-webkit-backdrop-filter', 'box-shadow']) el.style.removeProperty(k);
    if (p.bf) el.style.setProperty('backdrop-filter', p.bf);
    if (p.sh) el.style.setProperty('box-shadow', p.sh);
    delete el.dataset.lgRadius;
    panels.delete(el);
  }

  // Panels are built one per frame, so a screen full of cards never freezes the UI.
  const queue = [];
  let pumping = false;
  function enqueue(el) {
    if (!queue.includes(el)) queue.push(el);
    if (!pumping) { pumping = true; requestAnimationFrame(pump); }
  }
  function pump() {
    const el = queue.shift();
    if (el && el.isConnected) { try { apply(el); } catch (e) { console.error('LGERR', e && e.stack || e); } }
    if (queue.length) requestAnimationFrame(pump); else pumping = false;
  }
  for (const [k, sel] of Object.entries(TARGETS)) {
    tx.ui.watch(sel, (el) => { if (tx.config.get('t_' + k)) enqueue(el); });
  }

  // ------------------------------------------------------------------ the rest of the interface: skin tokens + accent
  const hexRgb = (hx) => { const n = parseInt(String(hx).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  function applySkin() {
    if (!tx.config.get('skin')) { tx.theme.setSkin({}, 'all'); document.documentElement.classList.remove('tx-skin'); return; }
    const acc = tx.config.get('accent') || '#0a84ff';
    const [r, g, b] = hexRgb(acc);
    tx.theme.setAccent(acc);
    const k = tx.config.get('cardTint') / 100, blur = tx.config.get('cardBlur'), rad = tx.config.get('radius');
    const filt = `blur(${blur}px) saturate(180%)`;
    const common = {
      '--sk-card-radius': rad + 'px', '--sk-bubble-radius': Math.round(rad * 0.75) + 'px', '--sk-menu-radius': Math.round(rad * 0.8) + 'px', '--sk-dialog-radius': rad + 'px',
      '--sk-card-filter': filt, '--sk-bar-filter': filt, '--sk-menu-filter': filt,
      '--sk-button-bg': `linear-gradient(180deg, rgba(${r},${g},${b},0.95), rgba(${r},${g},${b},0.78))`, '--sk-button-text': '#fff',
      '--sk-bubble-out': `linear-gradient(135deg, rgba(${r},${g},${b},0.92), rgba(${Math.round(r * 0.7)},${Math.round(g * 0.8)},${Math.min(255, Math.round(b * 1.05))},0.82))`,
      '--sk-chip-bg': `rgba(${r},${g},${b},0.2)`,
    };
    tx.theme.setSkin({
      ...common,
      '--sk-card-bg': `linear-gradient(145deg, rgba(255,255,255,${0.1 + k}), rgba(255,255,255,${0.03 + k * 0.4}))`, '--sk-card-border': 'rgba(255,255,255,0.20)', '--sk-card-shadow': '0 12px 32px rgba(0,0,0,0.38)',
      '--sk-bubble-in': `linear-gradient(145deg, rgba(255,255,255,${0.12 + k}), rgba(255,255,255,${0.04 + k * 0.4}))`,
      '--sk-bar-bg': 'rgba(255,255,255,0.07)', '--sk-bar-border': 'rgba(255,255,255,0.22)', '--sk-bar-shadow': '0 8px 28px rgba(0,0,0,0.4)',
      '--sk-menu-bg': 'rgba(40,42,52,0.55)', '--sk-menu-border': 'rgba(255,255,255,0.2)', '--sk-menu-shadow': '0 16px 44px rgba(0,0,0,0.5)', '--sk-dialog-bg': 'rgba(34,36,46,0.62)',
      '--sk-highlight': 'rgba(255,255,255,0.35)', '--sk-overlay': 'rgba(0,0,0,0.38)', '--sk-separator': 'rgba(255,255,255,0.12)',
    }, 'dark');
    tx.theme.setSkin({
      ...common,
      '--sk-card-bg': `linear-gradient(145deg, rgba(255,255,255,${0.5 + k}), rgba(255,255,255,${0.28 + k * 0.5}))`, '--sk-card-border': 'rgba(255,255,255,0.85)', '--sk-card-shadow': '0 12px 32px rgba(30,40,80,0.14)',
      '--sk-bubble-in': `linear-gradient(145deg, rgba(255,255,255,${0.62 + k * 0.5}), rgba(255,255,255,${0.38 + k * 0.4}))`,
      '--sk-bar-bg': 'rgba(255,255,255,0.35)', '--sk-bar-border': 'rgba(255,255,255,0.9)', '--sk-bar-shadow': '0 8px 28px rgba(30,40,80,0.16)',
      '--sk-menu-bg': 'rgba(255,255,255,0.6)', '--sk-menu-border': 'rgba(255,255,255,0.9)', '--sk-menu-shadow': '0 16px 44px rgba(30,40,80,0.2)', '--sk-dialog-bg': 'rgba(255,255,255,0.7)',
      '--sk-highlight': 'rgba(255,255,255,0.95)', '--sk-overlay': 'rgba(20,30,60,0.25)', '--sk-separator': 'rgba(20,30,60,0.1)',
    }, 'light');
  }
  applySkin();

  let again = 0;
  tx.config.on('*', () => {
    clearTimeout(again);
    applySkin();
    again = setTimeout(() => {
      sliceCache.clear();
      for (const [k, sel] of Object.entries(TARGETS)) {
        document.querySelectorAll(sel).forEach((el) => { if (tx.config.get('t_' + k)) enqueue(el); else release(el); });
      }
    }, 150);
  });
  // popups/menus come and go: drop panels whose element is gone
  const sweep = setInterval(() => { for (const el of [...panels.keys()]) if (!el.isConnected) release(el); }, 2000);
  tx.onStop(() => { onStopFns.forEach((fn) => fn()); clearInterval(sweep); clearTimeout(again); visible.disconnect(); for (const el of [...panels.keys()]) release(el); svg.remove(); style.remove(); });
}
