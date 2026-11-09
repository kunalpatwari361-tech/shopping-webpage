/* ============================================================
   PAWAN MODE — product illustrations (inline SVG, 200 × 200)
   Each drawing takes a main colour (c) and an accent colour (a).
   ============================================================ */
(function () {
  'use strict';

  function shade(hex, amt) {
    let c = String(hex).replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const n = parseInt(c, 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r);
    g = Math.round((t - g) * p + g);
    b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function rgba(hex, alpha) {
    let c = String(hex).replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const n = parseInt(c, 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  const DRAW = {
    jacket(c, a) {
      const d = shade(c, -0.35), l = shade(c, 0.14);
      return `
        <path d="M68 38 L100 50 L132 38 L166 58 L180 142 L156 148 L150 98 L150 172 L50 172 L50 98 L44 148 L20 142 L34 58 Z" fill="${c}"/>
        <path d="M34 58 L20 142 L44 148 L50 98 Z" fill="${d}" opacity=".55"/>
        <path d="M166 58 L180 142 L156 148 L150 98 Z" fill="${d}" opacity=".55"/>
        <path d="M68 38 L86 86 L100 50 Z" fill="${l}"/>
        <path d="M132 38 L114 86 L100 50 Z" fill="${l}"/>
        <path d="M100 52 L100 170" stroke="${a}" stroke-width="4"/>
        <rect x="95" y="60" width="10" height="12" rx="2" fill="${a}"/>
        <rect x="60" y="122" width="26" height="5" rx="2" fill="${d}"/>
        <rect x="114" y="122" width="26" height="5" rx="2" fill="${d}"/>
        <rect x="50" y="163" width="100" height="9" fill="${d}"/>
        <rect x="20" y="138" width="24" height="7" transform="rotate(4 32 141)" fill="${a}" opacity=".85"/>
        <rect x="156" y="138" width="24" height="7" transform="rotate(-4 168 141)" fill="${a}" opacity=".85"/>`;
    },

    tee(c, a) {
      const d = shade(c, -0.3);
      return `
        <path d="M70 36 Q100 54 130 36 L172 58 L158 92 L140 84 L140 170 L60 170 L60 84 L42 92 L28 58 Z" fill="${c}"/>
        <path d="M60 84 L42 92 L28 58 L46 50 Z" fill="${d}" opacity=".35"/>
        <path d="M140 84 L158 92 L172 58 L154 50 Z" fill="${d}" opacity=".35"/>
        <path d="M70 36 Q100 54 130 36 L124 33 Q100 47 76 33 Z" fill="${d}"/>
        <circle cx="100" cy="114" r="25" fill="${a}"/>
        <g fill="${c}"><rect x="72" y="116" width="56" height="3"/><rect x="72" y="123" width="56" height="4"/><rect x="72" y="131" width="56" height="5"/></g>
        <rect x="60" y="164" width="80" height="6" fill="${d}" opacity=".6"/>`;
    },

    hoodie(c, a) {
      const d = shade(c, -0.3), dd = shade(c, -0.55);
      return `
        <path d="M64 52 L136 52 L170 72 L184 150 L162 156 L150 104 L150 172 L50 172 L50 104 L38 156 L16 150 L30 72 Z" fill="${c}"/>
        <path d="M30 72 L16 150 L38 156 L50 104 Z" fill="${d}" opacity=".5"/>
        <path d="M170 72 L184 150 L162 156 L150 104 Z" fill="${d}" opacity=".5"/>
        <path d="M66 54 Q100 4 134 54 Q100 78 66 54 Z" fill="${d}"/>
        <path d="M80 54 Q100 22 120 54 Q100 66 80 54 Z" fill="${dd}"/>
        <path d="M70 128 H130 L122 160 H78 Z" fill="${d}" opacity=".7"/>
        <path d="M92 64 L90 98 M108 64 L110 98" stroke="${a}" stroke-width="3" stroke-linecap="round"/>
        <circle cx="90" cy="100" r="3.5" fill="${a}"/><circle cx="110" cy="100" r="3.5" fill="${a}"/>
        <rect x="50" y="163" width="100" height="9" fill="${d}"/>`;
    },

    sneaker(c, a) {
      const d = shade(c, -0.28), l = shade(c, 0.3);
      return `
        <path d="M18 140 H182 Q190 140 190 148 V152 Q190 162 180 162 H26 Q12 162 12 150 Q12 140 18 140 Z" fill="#ece6da"/>
        <path d="M14 156 H189" stroke="#2a2a2a" stroke-width="6" stroke-linecap="round"/>
        <path d="M22 142 L28 104 Q36 94 56 98 L84 72 Q92 66 104 70 L116 76 L122 100 Q152 104 172 118 Q186 128 182 142 Z" fill="${c}" stroke="${d}" stroke-width="2"/>
        <path d="M28 104 Q36 94 56 98 L60 142 H22 Z" fill="${d}" opacity=".55"/>
        <path d="M84 72 Q92 66 104 70 L116 76 L104 82 Q94 80 88 84 Z" fill="${d}"/>
        <path d="M70 130 L104 108 L98 120 L134 102 L100 136 L106 122 Z" fill="${a}"/>
        <g stroke="${d}" stroke-width="3.5" stroke-linecap="round"><path d="M106 84 L119 80"/><path d="M112 92 L126 88"/><path d="M118 100 L133 96"/></g>
        <path d="M150 118 Q170 120 180 132" stroke="${l}" stroke-width="3" fill="none" opacity=".6"/>`;
    },

    controller(c, a) {
      const d = shade(c, -0.32), l = shade(c, 0.18);
      return `
        <path d="M52 64 Q100 52 148 64 Q176 70 186 116 Q194 152 172 158 Q156 162 144 140 L130 122 H70 L56 140 Q44 162 28 158 Q6 152 14 116 Q24 70 52 64 Z" fill="${c}" stroke="${d}" stroke-width="2"/>
        <path d="M56 70 Q100 60 144 70 L142 78 Q100 68 58 78 Z" fill="${l}" opacity=".55"/>
        <g fill="${d}"><rect x="44" y="80" width="11" height="31" rx="2"/><rect x="34" y="90" width="31" height="11" rx="2"/></g>
        <circle cx="150" cy="80" r="6.5" fill="#2ad8ff"/><circle cx="150" cy="108" r="6.5" fill="#ff2a3d"/>
        <circle cx="136" cy="94" r="6.5" fill="#ffc61a"/><circle cx="164" cy="94" r="6.5" fill="#72d572"/>
        <circle cx="78" cy="108" r="12" fill="${d}"/><circle cx="78" cy="108" r="6.5" fill="${l}"/>
        <circle cx="122" cy="108" r="12" fill="${d}"/><circle cx="122" cy="108" r="6.5" fill="${l}"/>
        <rect x="86" y="78" width="28" height="8" rx="4" fill="${a}"/>`;
    },

    headset(c, a) {
      const d = shade(c, -0.38);
      return `
        <path d="M42 112 Q42 32 100 32 Q158 32 158 112" fill="none" stroke="${d}" stroke-width="15" stroke-linecap="round"/>
        <path d="M42 112 Q42 32 100 32 Q158 32 158 112" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/>
        <rect x="24" y="94" width="42" height="66" rx="17" fill="${c}"/>
        <rect x="134" y="94" width="42" height="66" rx="17" fill="${c}"/>
        <rect x="52" y="102" width="15" height="50" rx="7" fill="${d}"/>
        <rect x="133" y="102" width="15" height="50" rx="7" fill="${d}"/>
        <rect x="31" y="112" width="7" height="30" rx="3.5" fill="${a}" opacity=".9"/>
        <rect x="162" y="112" width="7" height="30" rx="3.5" fill="${a}" opacity=".9"/>
        <path d="M40 152 Q50 182 84 177" fill="none" stroke="${d}" stroke-width="5" stroke-linecap="round"/>
        <circle cx="88" cy="177" r="6.5" fill="${a}"/>`;
    },

    shades(c, a, uid) {
      const g = 'lens' + uid;
      return `
        <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="#7a2cff"/><stop offset="1" stop-color="#16082a"/></linearGradient></defs>
        <path d="M24 78 Q22 70 32 70 L84 70 Q94 70 92 82 Q88 126 58 128 Q28 128 24 92 Z" fill="url(#${g})" stroke="${c}" stroke-width="4.5"/>
        <path d="M176 78 Q178 70 168 70 L116 70 Q106 70 108 82 Q112 126 142 128 Q172 128 176 92 Z" fill="url(#${g})" stroke="${c}" stroke-width="4.5"/>
        <path d="M90 78 Q100 68 110 78" fill="none" stroke="${c}" stroke-width="4.5"/>
        <path d="M84 70 Q100 61 116 70" fill="none" stroke="${c}" stroke-width="3"/>
        <path d="M24 75 L6 68" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
        <path d="M176 75 L194 68" stroke="${c}" stroke-width="5" stroke-linecap="round"/>
        <path d="M36 82 L58 82 L40 106 Z" fill="#fff" opacity=".35"/>
        <path d="M128 82 L150 82 L132 106 Z" fill="#fff" opacity=".35"/>`;
    },

    watch(c, a) {
      const d = shade(c, -0.3), ad = shade(a, -0.3);
      return `
        <rect x="76" y="12" width="48" height="176" rx="12" fill="${c}"/>
        <g stroke="${d}" stroke-width="2.5"><path d="M80 28 H120"/><path d="M80 40 H120"/><path d="M80 160 H120"/><path d="M80 172 H120"/></g>
        <rect x="148" y="93" width="11" height="14" rx="3" fill="${ad}"/>
        <circle cx="100" cy="100" r="50" fill="${a}"/>
        <circle cx="100" cy="100" r="50" fill="none" stroke="${ad}" stroke-width="3"/>
        <circle cx="100" cy="100" r="40" fill="#111018"/>
        <g stroke="${a}" stroke-width="3" stroke-linecap="round"><path d="M100 64 V71"/><path d="M136 100 H129"/><path d="M100 136 V129"/><path d="M64 100 H71"/></g>
        <path d="M100 100 L100 78" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>
        <path d="M100 100 L121 92" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
        <path class="hand-s" d="M100 108 L100 66" stroke="#ff2a3d" stroke-width="1.6" stroke-linecap="round"/>
        <circle cx="100" cy="100" r="4" fill="${a}"/>`;
    },

    cap(c, a) {
      const d = shade(c, -0.32);
      return `
        <path d="M34 124 Q30 54 100 50 Q166 50 164 124 Z" fill="${c}"/>
        <path d="M100 50 Q84 80 82 124" stroke="${d}" stroke-width="2" fill="none"/>
        <path d="M100 50 Q122 80 128 124" stroke="${d}" stroke-width="2" fill="none"/>
        <path d="M122 116 L186 124 Q198 130 190 140 Q170 150 118 138 Z" fill="${d}"/>
        <rect x="32" y="117" width="134" height="11" rx="4" fill="${d}"/>
        <circle cx="100" cy="50" r="5.5" fill="${d}"/>
        <text x="113" y="106" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="32" fill="${a}">M</text>`;
    },

    backpack(c, a) {
      const d = shade(c, -0.3), l = shade(c, 0.18);
      return `
        <path d="M80 42 Q80 20 100 20 Q120 20 120 42" fill="none" stroke="${d}" stroke-width="8"/>
        <rect x="38" y="88" width="11" height="58" rx="5" fill="${d}"/>
        <rect x="151" y="88" width="11" height="58" rx="5" fill="${d}"/>
        <rect x="46" y="38" width="108" height="142" rx="30" fill="${c}"/>
        <path d="M46 68 Q46 38 76 38 H124 Q154 38 154 68 Z" fill="${l}" opacity=".4"/>
        <path d="M58 72 Q100 56 142 72" stroke="${a}" stroke-width="3.5" fill="none"/>
        <rect x="62" y="104" width="76" height="60" rx="14" fill="${d}"/>
        <path d="M70 119 H130" stroke="${a}" stroke-width="3.5" stroke-linecap="round"/>
        <rect x="94" y="114" width="12" height="9" rx="2" fill="${a}"/>`;
    },

    car(c, a) {
      return `
        <ellipse cx="100" cy="154" rx="88" ry="7" fill="#000" opacity=".35"/>
        <path d="M14 132 L22 112 Q28 102 44 100 L70 97 L94 76 Q100 71 112 71 L140 71 Q151 71 158 79 L174 98 Q190 101 192 118 L192 132 Q192 138 186 138 L20 138 Q14 138 14 132 Z" fill="${c}"/>
        <path d="M78 97 L98 80 L120 80 L120 97 Z" fill="#9fd8ff" opacity=".9"/>
        <path d="M126 80 L142 80 Q148 80 152 86 L160 97 L126 97 Z" fill="#9fd8ff" opacity=".9"/>
        <path d="M18 119 H190" stroke="${a}" stroke-width="5"/>
        <rect x="181" y="105" width="11" height="7" rx="2" fill="#fff6c2"/>
        <rect x="14" y="108" width="9" height="7" rx="2" fill="#ff2a3d"/>
        <g class="wheel"><circle cx="56" cy="138" r="18" fill="#111"/><circle cx="56" cy="138" r="8" fill="#c9c9c9"/><path d="M56 130 V146 M48 138 H64" stroke="#555" stroke-width="2.5"/></g>
        <g class="wheel"><circle cx="152" cy="138" r="18" fill="#111"/><circle cx="152" cy="138" r="8" fill="#c9c9c9"/><path d="M152 130 V146 M144 138 H160" stroke="#555" stroke-width="2.5"/></g>`;
    },

    all(c, a) {
      return `
        <rect x="38" y="38" width="56" height="56" rx="14" fill="${c}"/>
        <rect x="106" y="38" width="56" height="56" rx="14" fill="${a}"/>
        <rect x="38" y="106" width="56" height="56" rx="14" fill="${a}"/>
        <rect x="106" y="106" width="56" height="56" rx="14" fill="${c}"/>`;
    }
  };

  /* ---------- Racing maps: top-down track on a city map tile ----------
     c = kerb colour, a = centre-line colour. Two cars lap the track
     (they stay parked at the start for "reduce motion" users). */
  const still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const TRACKS = {
    circuit: { dur: 7, d: 'M50 40 H130 Q165 40 165 75 V90 Q165 110 145 110 H115 Q100 110 100 125 V140 Q100 165 75 165 H55 Q35 165 35 145 V60 Q35 40 50 40 Z' },
    tri: { dur: 7, d: 'M100 32 Q120 32 132 52 L166 120 Q176 142 156 158 Q140 170 120 160 L100 148 L80 160 Q60 170 44 158 Q24 142 34 120 L68 52 Q80 32 100 32 Z' },
    sprint: { dur: 5, end: [166, 32], d: 'M34 166 V150 Q34 120 70 120 H110 Q140 120 140 92 Q140 64 112 64 H80 Q52 64 52 46 Q52 32 70 32 H166' },
    ring: { dur: 6, d: 'M100 30 A70 70 0 0 1 170 100 A70 70 0 0 1 100 170 Q80 170 80 150 Q80 130 60 130 Q30 130 30 100 A70 70 0 0 1 100 30 Z' },
    touge: { dur: 6, end: [160, 30], d: 'M40 168 V130 Q40 115 55 115 H145 Q160 115 160 100 Q160 85 145 85 H55 Q40 85 40 70 Q40 55 55 55 H145 Q160 55 160 40 V30' },
    city: { dur: 9, d: 'M36 40 H100 V70 H164 V130 H130 V164 H60 V130 H36 Z' }
  };
  function flag(x, y) {
    return `<g transform="translate(${x - 7} ${y - 7})"><rect width="14" height="14" rx="2" fill="#fff" stroke="#05050a" stroke-width="1.5"/><rect width="7" height="7" fill="#111"/><rect x="7" y="7" width="7" height="7" fill="#111"/></g>`;
  }
  function trackArt(t, c, a) {
    const [sx, sy] = t.d.match(/-?\d+(\.\d+)?/g).slice(0, 2).map(Number);
    const road = (stroke, width, extra = '') => `<path d="${t.d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
    const racer = (fill, delay, speed) => {
      const body = `<path d="M7 0 L-6 -5 L-3 0 L-6 5 Z" fill="${fill}" stroke="#05050a" stroke-width="1.2"/>`;
      if (still) return '';
      return `<g>${body}<animateMotion dur="${(t.dur * speed).toFixed(2)}s" begin="${delay}s" repeatCount="indefinite" rotate="auto" path="${t.d}"/></g>`;
    };
    return `
      <rect x="10" y="10" width="180" height="180" rx="26" fill="#0f1b26" stroke="rgba(255,255,255,.14)" stroke-width="2"/>
      <path d="M118 190 Q130 160 160 156 Q180 153 190 138 V164 Q190 190 164 190 Z" fill="#17405e"/>
      <rect x="140" y="20" width="36" height="24" rx="6" fill="#173a26"/>
      <g stroke="#1b2c3c" stroke-width="5"><path d="M10 72 H190 M10 128 H190 M72 10 V190 M128 10 V190"/></g>
      ${road(c, 28, 'stroke-opacity=".2"')}
      ${road(c, 18)}
      ${road('#23232e', 12)}
      ${road(a, 1.6, 'stroke-dasharray="5 6" opacity=".9"')}
      ${flag(sx, sy)}
      ${t.end ? flag(t.end[0], t.end[1]) : ''}
      ${still ? `<circle cx="${sx}" cy="${sy}" r="4" fill="${a}" stroke="#05050a" stroke-width="1.2"/>` : ''}
      ${racer('#fff', '0', 1)}
      ${racer(a, `-${(t.dur * 0.38).toFixed(2)}`, 1.08)}`;
  }
  Object.keys(TRACKS).forEach((k) => { DRAW['track-' + k] = (c, a) => trackArt(TRACKS[k], c, a); });

  let uid = 0;
  window.PM_ART = {
    shade,
    rgba,
    inner(type, c, a) {
      uid += 1;
      return (DRAW[type] || DRAW.all)(c || '#ffc61a', a || '#ff2d6f', uid);
    },
    svg(type, c, a, cls) {
      return `<svg class="${cls || 'art'}" viewBox="0 0 200 200" aria-hidden="true" focusable="false">${this.inner(type, c, a)}</svg>`;
    }
  };
})();
