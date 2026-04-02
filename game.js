// ── Bike Dash ── Game Engine ──

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('ui-overlay');

// ── Constants ──
const SCALE = 3;
const W = 192;
const H = 256;
const TILE = 8;
const COLS = W / TILE;

canvas.width = W * SCALE;
canvas.height = H * SCALE;
ctx.imageSmoothingEnabled = false;

// ── Off-screen buffer (native res) ──
const buf = document.createElement('canvas');
buf.width = W; buf.height = H;
const bctx = buf.getContext('2d');
bctx.imageSmoothingEnabled = false;

// ── Game state ──
let state = 'title'; // title | playing | dead
let score = 0;
let particles = [];
let screenShake = 0;
let invulnTimer = 0;

// ── Seeded RNG ──
const seededRandom = (function() {
    let seed = 42;
    return function(s) {
        if (s !== undefined) seed = s;
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return (seed >>> 0) / 0xffffffff;
    };
})();

// ── Input ──
const keys = {};
let touchActive = false;
let touchGameX = 0;
let touchGameY = 0;

// ── D-pad state (on-screen arrows for mobile) ──
let dpadUp = false, dpadDown = false, dpadLeft = false, dpadRight = false;
let isMobile = false;

// Detect mobile on first touch
function enableMobile() {
    if (!isMobile) isMobile = true;
}

// D-pad layout (in game coords, bottom-right corner)
const DPAD = {
    cx: W - 22,      // center x
    cy: H - 22,      // center y
    btnSize: 12,      // button size
    gap: 1,           // gap between buttons
};
// Computed button rects (set once)
DPAD.up    = { x: DPAD.cx - 6, y: DPAD.cy - 19, w: 12, h: 12 };
DPAD.down  = { x: DPAD.cx - 6, y: DPAD.cy + 7,  w: 12, h: 12 };
DPAD.left  = { x: DPAD.cx - 19, y: DPAD.cy - 6, w: 12, h: 12 };
DPAD.right = { x: DPAD.cx + 7,  y: DPAD.cy - 6, w: 12, h: 12 };

function pointInRect(px, py, r) {
    return px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;
}

function updateDpadFromTouches(e) {
    dpadUp = false; dpadDown = false; dpadLeft = false; dpadRight = false;
    touchActive = false;
    const rect = canvas.getBoundingClientRect();
    for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        const gx = ((t.clientX - rect.left) / rect.width) * W;
        const gy = ((t.clientY - rect.top) / rect.height) * H;

        // Check if touch is on any d-pad button
        if (pointInRect(gx, gy, DPAD.up))    { dpadUp = true; continue; }
        if (pointInRect(gx, gy, DPAD.down))  { dpadDown = true; continue; }
        if (pointInRect(gx, gy, DPAD.left))  { dpadLeft = true; continue; }
        if (pointInRect(gx, gy, DPAD.right)) { dpadRight = true; continue; }

        // Not on d-pad — use as direct touch position
        touchActive = true;
        touchGameX = gx;
        touchGameY = gy;
    }
}

document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (state === 'title' || state === 'dead') {
        startGame();
    }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

function handleTouchStart(e) {
    e.preventDefault();
    enableMobile();
    if (state === 'title' || state === 'dead') { startGame(); return; }
    updateDpadFromTouches(e);
}
function handleTouchMove(e) {
    e.preventDefault();
    updateDpadFromTouches(e);
}
function handleTouchEnd(e) {
    e.preventDefault();
    if (e.touches.length === 0) {
        touchActive = false;
        dpadUp = false; dpadDown = false; dpadLeft = false; dpadRight = false;
    } else {
        updateDpadFromTouches(e);
    }
}

// Use { passive: false } for Safari compatibility
document.addEventListener('touchstart', handleTouchStart, { passive: false });
document.addEventListener('touchmove', handleTouchMove, { passive: false });
document.addEventListener('touchend', handleTouchEnd, { passive: false });
document.addEventListener('touchcancel', handleTouchEnd, { passive: false });
document.addEventListener('click', () => {
    if (state === 'title' || state === 'dead') startGame();
});

// ── Helpers ──
function rng(min, max) { return min + seededRandom() * (max - min); }
function rngInt(min, max) { return Math.floor(rng(min, max + 1)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function inputDir() {
    let dx = 0;
    if (keys['ArrowLeft'] || keys['KeyA'] || touchLeft) dx -= 1;
    if (keys['ArrowRight'] || keys['KeyD'] || touchRight) dx += 1;
    return dx;
}

// ── Color palette (8-bit style) ──
const PAL = {
    fishBody: '#4488cc', fishFin: '#3366aa', fishTail: '#3366aa',
    fishEye: '#ffffff', fishPupil: '#111111', fishBelly: '#88ccee',
    choco: '#5c3317', chocoHi: '#7a4a2a',
    hair: '#dd3322', hairHi: '#ff5544',
    skin: '#ffcc99', skinDk: '#dd9966',
    shirt: '#2a2a3a', shirtHi: '#3a3a4e',
    pants: '#1a1a28', pantsDk: '#111120',
    shoe: '#eeeeee', shoeDk: '#bbbbbb',
    white: '#ffffff', black: '#000000',
    red: '#ff4444', green: '#44ff44'
};

// ── Particle system ──
function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y, vx: (Math.random() - 0.5) * speed,
            vy: (Math.random() - 0.8) * speed,
            life: 20 + Math.random() * 20, maxLife: 40,
            color, size: 1 + Math.random() * 2
        });
    }
}

function updateParticles() {
    particles = particles.filter(pt => {
        pt.x += pt.vx; pt.y += pt.vy;
        pt.vy += 0.08; pt.life--;
        return pt.life > 0;
    });
}

function decayScreenShake() {
    if (screenShake > 0) screenShake *= 0.85;
    if (screenShake < 0.5) screenShake = 0;
}

// ── Drawing primitives ──
function drawRect(x, y, w, h, color) {
    bctx.fillStyle = color;
    bctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function drawPixel(x, y, color) {
    bctx.fillStyle = color;
    bctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

// ── Draw chocolate bar ──
function drawChocolate(c, camY) {
    if (c.collected) return;
    const sy = c.y - camY;
    const bob = Math.sin(c.animTimer * 0.08) * 2;
    const x = Math.round(c.x);
    const y = Math.round(sy + bob);

    drawRect(x, y, 10, 8, '#3a1a08');
    drawRect(x + 1, y + 1, 8, 6, '#5c3317');
    drawRect(x + 1, y + 1, 2, 3, '#6b3d20');
    drawRect(x + 4, y + 1, 2, 3, '#6b3d20');
    drawRect(x + 7, y + 1, 2, 3, '#6b3d20');
    drawRect(x + 1, y + 4, 2, 3, '#5c3317');
    drawRect(x + 4, y + 4, 2, 3, '#5c3317');
    drawRect(x + 7, y + 4, 2, 3, '#5c3317');
    drawRect(x + 3, y + 1, 1, 6, '#2e0e04');
    drawRect(x + 6, y + 1, 1, 6, '#2e0e04');
    drawRect(x + 1, y + 4, 8, 1, '#2e0e04');
    drawPixel(x + 1, y + 1, '#8a5a36');
    drawPixel(x + 2, y + 1, '#8a5a36');
    drawPixel(x + 4, y + 1, '#8a5a36');
    drawPixel(x + 5, y + 1, '#8a5a36');
    drawPixel(x + 7, y + 1, '#8a5a36');
    drawPixel(x + 8, y + 1, '#8a5a36');
    drawPixel(x + 1, y + 6, '#3a1a08');
    drawPixel(x + 4, y + 6, '#3a1a08');
    drawPixel(x + 7, y + 6, '#3a1a08');
    const glint = Math.floor(c.animTimer * 0.1) % 3;
    drawPixel(x + 1 + glint * 3, y + 1, '#aa7a56');
}

// ── Draw fish ──
function drawFish(x, y, facingRight, tailWag) {
    if (facingRight) {
        drawRect(x + 2, y, 6, 6, PAL.fishBody);
        drawRect(x + 1, y + 1, 8, 4, PAL.fishBody);
        drawRect(x + 2, y + 3, 6, 2, PAL.fishBelly);
        drawRect(x + 1, y + 4, 8, 1, PAL.fishBelly);
        drawRect(x - 1, y + 1 + tailWag, 2, 3, PAL.fishTail);
        drawPixel(x - 2, y + 2 + tailWag, PAL.fishTail);
        drawPixel(x + 5, y - 1, PAL.fishFin);
        drawPixel(x + 6, y - 1, PAL.fishFin);
        drawPixel(x + 7, y + 2, PAL.fishEye);
        drawPixel(x + 8, y + 2, PAL.fishPupil);
        drawPixel(x + 9, y + 3, PAL.fishBody);
    } else {
        drawRect(x + 2, y, 6, 6, PAL.fishBody);
        drawRect(x + 1, y + 1, 8, 4, PAL.fishBody);
        drawRect(x + 2, y + 3, 6, 2, PAL.fishBelly);
        drawRect(x + 1, y + 4, 8, 1, PAL.fishBelly);
        drawRect(x + 9, y + 1 + tailWag, 2, 3, PAL.fishTail);
        drawPixel(x + 11, y + 2 + tailWag, PAL.fishTail);
        drawPixel(x + 3, y - 1, PAL.fishFin);
        drawPixel(x + 4, y - 1, PAL.fishFin);
        drawPixel(x + 2, y + 2, PAL.fishEye);
        drawPixel(x + 1, y + 2, PAL.fishPupil);
        drawPixel(x, y + 3, PAL.fishBody);
    }
}

function darkenColor(hex) {
    const r = Math.max(0, parseInt(hex.slice(1,3), 16) - 40);
    const g = Math.max(0, parseInt(hex.slice(3,5), 16) - 40);
    const b = Math.max(0, parseInt(hex.slice(5,7), 16) - 40);
    return '#' + r.toString(16).padStart(2,'0') + g.toString(16).padStart(2,'0') + b.toString(16).padStart(2,'0');
}
function lightenColor(hex) {
    const r = Math.min(255, parseInt(hex.slice(1,3), 16) + 40);
    const g = Math.min(255, parseInt(hex.slice(3,5), 16) + 40);
    const b = Math.min(255, parseInt(hex.slice(5,7), 16) + 40);
    return '#' + r.toString(16).padStart(2,'0') + g.toString(16).padStart(2,'0') + b.toString(16).padStart(2,'0');
}

// ── Blit to main canvas ──
// ── Draw on-screen d-pad (mobile only) ──
function drawDpad() {
    if (!isMobile) return;

    bctx.globalAlpha = 0.35;

    // Draw button helper
    function drawBtn(r, active, arrowDir) {
        const col = active ? '#ffffff' : '#aaaaaa';
        drawRect(r.x, r.y, r.w, r.h, '#222222');
        drawRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, active ? '#555555' : '#333333');

        // Arrow glyph
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        bctx.fillStyle = col;
        if (arrowDir === 'up') {
            // Triangle pointing up
            drawRect(cx - 1, cy - 2, 2, 1, col);
            drawRect(cx - 2, cy - 1, 4, 1, col);
            drawRect(cx - 3, cy, 6, 1, col);
        } else if (arrowDir === 'down') {
            drawRect(cx - 3, cy - 1, 6, 1, col);
            drawRect(cx - 2, cy, 4, 1, col);
            drawRect(cx - 1, cy + 1, 2, 1, col);
        } else if (arrowDir === 'left') {
            drawRect(cx - 2, cy - 1, 1, 2, col);
            drawRect(cx - 1, cy - 2, 1, 4, col);
            drawRect(cx, cy - 3, 1, 6, col);
        } else if (arrowDir === 'right') {
            drawRect(cx + 1, cy - 1, 1, 2, col);
            drawRect(cx, cy - 2, 1, 4, col);
            drawRect(cx - 1, cy - 3, 1, 6, col);
        }
    }

    drawBtn(DPAD.up, dpadUp, 'up');
    drawBtn(DPAD.down, dpadDown, 'down');
    drawBtn(DPAD.left, dpadLeft, 'left');
    drawBtn(DPAD.right, dpadRight, 'right');

    // Center decoration
    drawRect(DPAD.cx - 4, DPAD.cy - 4, 8, 8, '#222222');

    bctx.globalAlpha = 1;
}

function blitToScreen() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0, W, H, 0, 0, canvas.width, canvas.height);
}

// ── Start / Reset ──
function startGame() {
    state = 'playing';
    overlay.classList.add('hidden');
    seededRandom(Date.now() & 0xffffff);
    particles = [];
    score = 0;
    screenShake = 0;
    invulnTimer = 0;
    startBikeMode();
}

// ── Main game loop (started after all scripts load) ──
function gameLoop() {
    if (state === 'playing') {
        updateBike();
    }
    renderBike();
    requestAnimationFrame(gameLoop);
}
