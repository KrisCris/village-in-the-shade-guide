/**
 * Draw the app icon and write every size the site and the PWA manifest use.
 *
 *   node tools/build-app-icons.mjs
 *
 * The art follows the game's cover: a yellow warning sign overgrown by a vine,
 * standing over a green mountain village at dusk, with a crescent moon for the
 * curfew and the night. The detailed scene is for app icons (home screen and
 * install dialogs); the simple version keeps the sign readable at
 * browser-tab and header sizes. "rounded" icons carry their own corner radius;
 * full-bleed icons are for platforms that apply their own mask (Android
 * maskable icons, iOS home screen). Keep the sign inside the central 80% so
 * maskable crops never cut it.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const tile = (rounded, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
${rounded ? '<clipPath id="tile"><rect width="512" height="512" rx="116"/></clipPath>' : ''}
${defs}
</defs>
<g${rounded ? ' clip-path="url(#tile)"' : ''}>
${body}
</g>
</svg>`;

/** Ivy-like leaf pointing along +x from its stalk; the vein follows the midline. */
const leaf = (x, y, angle, size = 1, fill = 'url(#leaf)', vein = true) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${size})"><path d="M0 0 C6 -18 26 -24 40 -14 C44 -4 34 8 22 10 C12 12 4 8 0 0Z" fill="${fill}"/>${vein ? '<path d="M2 0 C14 -4 26 -8 38 -13" fill="none" stroke="#2c5e2a" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>' : ''}</g>`;

/** Japanese cedar silhouette: stacked tiers. */
const cedar = (x, y, h, fill) => {
  const w = h * 0.36;
  const tiers = [0, 0.3, 0.55].map((t) => {
    const top = y - h + t * h, base = top + h * 0.5, half = w * (0.55 + t * 0.6);
    return `M${x} ${top.toFixed(1)} L${(x + half).toFixed(1)} ${base.toFixed(1)} L${(x - half).toFixed(1)} ${base.toFixed(1)}Z`;
  }).join(' ');
  return `<path d="${tiers}" fill="${fill}"/>`;
};

/** Thatched farmhouse with a steep hipped roof and lit windows. */
const house = (x, y, s = 1, lit = 2) => {
  const roof = `M${x - 26 * s} ${y} L${x - 12 * s} ${y - 22 * s} L${x + 12 * s} ${y - 22 * s} L${x + 26 * s} ${y}Z`;
  const windows = Array.from({ length: lit }, (_, i) => {
    const wx = x - 13 * s + i * 15 * s;
    return `<circle cx="${wx + 4.5 * s}" cy="${y + 8 * s}" r="${11 * s}" fill="#ffc45c" opacity=".35" filter="url(#soft)"/><rect x="${wx}" y="${y + 4 * s}" width="${9 * s}" height="${8 * s}" rx="1" fill="#ffd57a"/>`;
  }).join('');
  return `<rect x="${x - 19 * s}" y="${y - 1}" width="${38 * s}" height="${18 * s}" fill="#22342a"/><path d="${roof}" fill="#3d3f2c"/><path d="M${x - 12 * s} ${y - 22 * s} L${x + 12 * s} ${y - 22 * s}" stroke="#57583d" stroke-width="${3 * s}"/>${windows}`;
};

/** Grass tuft: a fan of tapered blades. */
const tuft = (x, y, h, fill, lean = 0) => {
  const blades = [-3, -1.5, 0, 1.5, 3].map((i) => {
    const tipX = x + i * h * 0.16 + lean, tipY = y - h * (1 - Math.abs(i) * 0.12);
    return `M${x + i * 2.5 - 2} ${y} Q${x + i * h * 0.05 + lean * 0.4} ${y - h * 0.5} ${tipX.toFixed(1)} ${tipY.toFixed(1)} Q${x + i * h * 0.07 + lean * 0.4 + 3} ${y - h * 0.45} ${x + i * 2.5 + 2} ${y}Z`;
  }).join(' ');
  return `<path d="${blades}" fill="${fill}"/>`;
};

const detailedDefs = `
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#11252f"/><stop offset=".24" stop-color="#21444a"/><stop offset=".4" stop-color="#4a7a6c"/><stop offset=".51" stop-color="#c2b47c"/><stop offset=".58" stop-color="#f3cf88"/>
</linearGradient>
<linearGradient id="far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b8a7c"/><stop offset="1" stop-color="#9ab595"/></linearGradient>
<linearGradient id="mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b7e61"/><stop offset="1" stop-color="#365f49"/></linearGradient>
<linearGradient id="near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f7552"/><stop offset="1" stop-color="#28513d"/></linearGradient>
<linearGradient id="front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#21452f"/><stop offset="1" stop-color="#132c20"/></linearGradient>
<linearGradient id="sign" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset=".55" stop-color="#f4c235"/><stop offset="1" stop-color="#e09a22"/></linearGradient>
<linearGradient id="post" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a957f"/><stop offset=".5" stop-color="#77725f"/><stop offset="1" stop-color="#4f4b3e"/></linearGradient>
<linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9bd16b"/><stop offset="1" stop-color="#3f8a3a"/></linearGradient>
<linearGradient id="leafDark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6fae4e"/><stop offset="1" stop-color="#2d6a2e"/></linearGradient>
<linearGradient id="path" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8b886" stop-opacity=".2"/><stop offset="1" stop-color="#d7c48e" stop-opacity=".75"/></linearGradient>
<radialGradient id="moonGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff3cf" stop-opacity=".55"/><stop offset="1" stop-color="#fff3cf" stop-opacity="0"/></radialGradient>
<radialGradient id="dusk" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".85"/><stop offset=".6" stop-color="#ffd27e" stop-opacity=".25"/><stop offset="1" stop-color="#ffd27e" stop-opacity="0"/></radialGradient>
<radialGradient id="vignette" cx=".5" cy=".46" r=".72"><stop offset=".62" stop-color="#08140f" stop-opacity="0"/><stop offset="1" stop-color="#08140f" stop-opacity=".5"/></radialGradient>
<mask id="crescent"><rect width="512" height="512" fill="#fff"/><circle cx="391" cy="92" r="27" fill="#000"/></mask>
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="haze" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.4"/></filter>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>`;

function detailedArt() {
  const stars = [[54, 62, 1.6], [98, 108, 1.2], [136, 40, 2], [190, 78, 1.3], [232, 30, 1.5], [286, 64, 1.2], [318, 26, 1.8], [448, 54, 1.3], [470, 132, 1.6], [430, 170, 1.1], [30, 150, 1.2], [168, 136, 1]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#f8efd4" opacity="${(0.55 + r / 5).toFixed(2)}"/>`).join('');
  const sparkle = (x, y, s) => `<path d="M${x} ${y - s} L${x + s * 0.22} ${y - s * 0.22} L${x + s} ${y} L${x + s * 0.22} ${y + s * 0.22} L${x} ${y + s} L${x - s * 0.22} ${y + s * 0.22} L${x - s} ${y} L${x - s * 0.22} ${y - s * 0.22}Z" fill="#fff6dc"/>`;
  const ridgeCedars = [[300, 258, 30], [318, 252, 36], [336, 249, 28], [352, 247, 34], [372, 247, 30], [392, 248, 38], [470, 266, 32], [488, 263, 40], [504, 260, 30], [10, 290, 34], [28, 284, 28], [44, 279, 36]]
    .map(([x, y, h]) => cedar(x, y, h, '#2c5541')).join('');
  const farCedars = [[150, 222, 16], [162, 220, 20], [174, 217, 15], [232, 186, 14], [244, 184, 18]].map(([x, y, h]) => cedar(x, y, h, '#4f7f6c')).join('');
  const terraces = [0, 1, 2, 3].map((i) => {
    const y = 360 + i * 15;
    return `<path d="M-10 ${y + 6} C40 ${y - 6} 100 ${y - 8} ${150 - i * 6} ${y + 4}" fill="none" stroke="#cfe2ad" stroke-width="2.4" opacity="${(0.5 - i * 0.08).toFixed(2)}" stroke-linecap="round"/>`;
  }).join('');
  const fireflies = [[96, 404, 3.2], [150, 438, 2.4], [356, 392, 3], [410, 430, 2.6], [446, 372, 2.2], [70, 352, 2], [318, 450, 2.2], [196, 386, 1.8]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r * 3}" fill="#ffe27a" opacity=".45" filter="url(#glow)"/><circle cx="${x}" cy="${y}" r="${r * 0.7}" fill="#fff6c4"/>`).join('');
  return `
<rect width="512" height="512" fill="url(#sky)"/>
${stars}${sparkle(136, 40, 6)}${sparkle(448, 54, 5)}
<circle cx="374" cy="106" r="74" fill="url(#moonGlow)"/>
<circle cx="374" cy="106" r="30" fill="#f8efd2" mask="url(#crescent)"/>
<path d="M462 172 C400 208 310 218 236 200 C170 184 90 168 -10 178" fill="none" stroke="#162625" stroke-width="1.6" opacity=".6"/>
<path d="M496 172 C430 222 330 234 240 214 C170 198 80 190 -10 204" fill="none" stroke="#162625" stroke-width="1.3" opacity=".45"/>
<circle cx="256" cy="282" r="230" fill="url(#dusk)"/>
<path d="M0 246 C30 236 52 214 84 206 C110 200 128 222 150 218 C178 212 196 182 228 178 C262 174 280 204 310 206 C340 208 358 186 392 184 C428 182 452 210 480 212 C496 213 506 206 512 204 V512 H0Z" fill="url(#far)" opacity=".92"/>
${farCedars}
<ellipse cx="256" cy="258" rx="320" ry="20" fill="#fbe8b6" opacity=".38" filter="url(#haze)"/>
<path d="M0 292 C40 276 76 262 118 266 C160 270 186 290 222 288 C262 286 288 258 330 252 C372 246 410 266 446 268 C478 270 498 260 512 256 V512 H0Z" fill="url(#mid)"/>
${ridgeCedars}
${house(76, 300, 0.95)}${house(126, 292, 0.8, 1)}${house(420, 278, 0.9)}
<ellipse cx="256" cy="318" rx="300" ry="14" fill="#f6e2ad" opacity=".22" filter="url(#haze)"/>
<path d="M0 350 C70 322 132 306 196 316 C246 324 286 350 344 344 C408 338 456 316 512 322 V512 H0Z" fill="url(#near)"/>
${terraces}
<path d="M396 342 C420 338 446 330 476 330" fill="none" stroke="#cfe2ad" stroke-width="2.2" opacity=".35" stroke-linecap="round"/>
<rect x="476" y="150" width="7" height="200" fill="#3b3428"/><rect x="456" y="168" width="46" height="5" rx="1" fill="#3b3428"/><rect x="460" y="164" width="4" height="5" fill="#8c8a78"/><rect x="494" y="164" width="4" height="5" fill="#8c8a78"/>
${house(424, 344, 1.05)}
<path d="M226 512 C232 476 286 462 276 436 C270 420 250 412 252 392 L264 392 C266 410 292 418 292 438 C294 466 262 482 282 512Z" fill="url(#path)"/>
<path d="M0 426 C90 402 170 398 256 408 C340 418 430 410 512 394 V512 H0Z" fill="url(#front)"/>
<g transform="rotate(-6 256 470)">
<ellipse cx="262" cy="470" rx="40" ry="8" fill="#0b1a12" opacity=".45" filter="url(#soft)"/>
<rect x="246" y="330" width="20" height="150" rx="3" fill="url(#post)"/>
<rect x="246" y="352" width="20" height="4" fill="#3f3b31" opacity=".5"/><rect x="246" y="430" width="20" height="4" fill="#3f3b31" opacity=".5"/>
<path d="M262 120 L398 252 L262 386 L126 252Z" fill="#06120c" opacity=".45" filter="url(#shadow)"/>
<path d="M256 108 L390 242 L256 376 L122 242Z" fill="url(#sign)" stroke="#2a271c" stroke-width="14" stroke-linejoin="round"/>
<path d="M141 242 L256 127 L371 242" fill="none" stroke="#fff6bf" stroke-width="3" stroke-linejoin="round" opacity=".55"/>
<path d="M256 134 L364 242 L256 350 L148 242Z" fill="none" stroke="#2a271c" stroke-width="3" stroke-linejoin="round" opacity=".4"/>
<ellipse cx="318" cy="292" rx="18" ry="9" transform="rotate(-45 318 292)" fill="#c98a1e" opacity=".3"/>
<ellipse cx="206" cy="210" rx="9" ry="5" transform="rotate(-45 206 210)" fill="#c98a1e" opacity=".25"/>
<circle cx="256" cy="150" r="5" fill="#7b7055"/><circle cx="255" cy="149" r="2" fill="#d9cfa9"/>
<rect x="241" y="170" width="30" height="100" rx="15" fill="#2a271c"/>
<rect x="247" y="178" width="5" height="70" rx="2.5" fill="#5a5238" opacity=".7"/>
<circle cx="256" cy="302" r="17" fill="#2a271c"/>
<circle cx="251" cy="297" r="4" fill="#5a5238" opacity=".7"/>
<path d="M262 486 C230 466 292 452 262 432 C236 414 288 400 262 380 C244 366 272 352 258 338" fill="none" stroke="#2f6c2f" stroke-width="10" stroke-linecap="round"/>
<path d="M262 486 C230 466 292 452 262 432 C236 414 288 400 262 380 C244 366 272 352 258 338" fill="none" stroke="#6aa94a" stroke-width="3" stroke-linecap="round" opacity=".6"/>
${leaf(258, 476, 200, 1.05, 'url(#leafDark)')}${leaf(272, 452, -20, 1.1)}${leaf(250, 424, 210, 0.95, 'url(#leafDark)')}${leaf(276, 400, -30, 1)}${leaf(246, 374, 195, 0.85)}${leaf(268, 354, -55, 0.75, 'url(#leafDark)')}${leaf(264, 462, 150, 0.6)}${leaf(262, 412, 20, 0.55, 'url(#leafDark)')}
<path d="M258 340 C236 336 214 340 200 326 C184 310 168 300 158 282 C150 266 156 252 168 246 C176 242 186 246 186 254" fill="none" stroke="#2f6c2f" stroke-width="8" stroke-linecap="round"/>
<path d="M158 282 C150 266 156 252 168 246" fill="none" stroke="#6aa94a" stroke-width="2.5" stroke-linecap="round" opacity=".6"/>
${leaf(230, 340, 160, 0.9)}${leaf(198, 324, 30, 0.95, 'url(#leafDark)')}${leaf(166, 294, 150, 1)}${leaf(160, 264, 205, 0.8, 'url(#leafDark)')}${leaf(180, 304, 45, 0.65)}${leaf(212, 334, 210, 0.55, 'url(#leafDark)')}
<path d="M186 254 C192 246 202 248 200 256 C198 262 190 260 192 254" fill="none" stroke="#6aa94a" stroke-width="2" stroke-linecap="round"/>
<path d="M280 448 C292 446 298 438 294 432 C290 428 284 432 288 436" fill="none" stroke="#6aa94a" stroke-width="2" stroke-linecap="round"/>
<circle cx="170" cy="244" r="4.5" fill="#f6f1e2"/><circle cx="170" cy="244" r="1.8" fill="#f2c94c"/>
</g>
<path d="M200 476 C202 462 204 452 210 440" fill="none" stroke="#5f9e47" stroke-width="3" stroke-linecap="round"/>
${leaf(209, 444, -70, 0.55)}${leaf(206, 452, 200, 0.6, 'url(#leafDark)')}${leaf(204, 462, -20, 0.55)}
${tuft(30, 512, 46, '#0f241a', 4)}${tuft(64, 512, 32, '#163323', -3)}${tuft(470, 512, 50, '#0f241a', -5)}${tuft(500, 512, 36, '#163323', 3)}${tuft(232, 484, 22, '#1d3f2b', -2)}${tuft(292, 482, 20, '#1d3f2b', 3)}
${fireflies}
<rect width="512" height="512" fill="url(#vignette)"/>`;
}

const simpleDefs = `
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c3739"/><stop offset=".3" stop-color="#3c6f65"/><stop offset=".45" stop-color="#a5c08a"/><stop offset=".55" stop-color="#f0d68c"/></linearGradient>
<mask id="crescent"><rect width="512" height="512" fill="#fff"/><circle cx="388" cy="118" r="27" fill="#000"/></mask>`;

function simpleArt() {
  return `
<rect width="512" height="512" fill="url(#sky)"/>
<circle cx="372" cy="132" r="30" fill="#f6eccd" mask="url(#crescent)"/>
<path d="M0 300 C60 252 120 236 176 262 C214 280 236 300 262 296 C300 290 330 238 392 230 C440 224 480 248 512 268 V512 H0Z" fill="#5d9070"/>
<path d="M0 352 C70 318 132 300 196 314 C246 326 286 352 344 344 C408 336 456 312 512 318 V512 H0Z" fill="#3b6b4f"/>
<path d="M0 420 C90 392 180 388 256 400 C340 412 430 404 512 388 V512 H0Z" fill="#244a37"/>
<rect x="246" y="330" width="20" height="190" rx="3" fill="#6b6655"/>
<path d="M262 512 C230 488 292 470 262 446 C234 424 290 408 262 386" fill="none" stroke="#3f7d3a" stroke-width="12" stroke-linecap="round"/>
${leaf(262, 482, 195, 1.5, '#5f9e47', false)}${leaf(268, 452, -25, 1.5, '#76b257', false)}${leaf(256, 420, 205, 1.4, '#5f9e47', false)}
<path d="M256 112 L386 242 L256 372 L126 242Z" fill="#f2c230" stroke="#2c2a1e" stroke-width="16" stroke-linejoin="round"/>
<rect x="241" y="172" width="30" height="98" rx="15" fill="#2c2a1e"/>
<circle cx="256" cy="302" r="17" fill="#2c2a1e"/>`;
}

const detailed = (rounded) => tile(rounded, detailedArt(), detailedDefs);
const simple = (rounded) => tile(rounded, simpleArt(), simpleDefs);

const out = 'public/app';
await mkdir(out, { recursive: true });
await writeFile('public/favicon.svg', simple(true));
const png = (svg, size, file) => sharp(Buffer.from(svg), { density: Math.max(72, Math.ceil(72 * size / 512) * 2) })
  .resize(size, size).png({ compressionLevel: 9 }).toFile(`${out}/${file}`);
await Promise.all([
  png(simple(true), 32, 'favicon-32.png'),
  png(detailed(true), 96, 'icon-96.png'),
  png(detailed(true), 192, 'icon-192.png'),
  png(detailed(true), 512, 'icon-512.png'),
  png(detailed(false), 192, 'maskable-192.png'),
  png(detailed(false), 512, 'maskable-512.png'),
  png(detailed(false), 180, 'apple-touch-icon.png'),
]);
