// ── Shared Game Engine ──

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
let gameMode = 'tower'; // 'tower' | 'bike'
let state = 'title';    // title | playing | dead
let score = 0;
let particles = [];
let screenShake = 0;
let invulnTimer = 0; // shared invulnerability timer (frames)

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
let touchLeft = false, touchRight = false, touchJump = false;

document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (state === 'title') {
        if (e.code === 'Digit1' || e.code === 'Numpad1') { gameMode = 'tower'; startGame(); }
        else if (e.code === 'Digit2' || e.code === 'Numpad2') { gameMode = 'bike'; startGame(); }
    } else if (state === 'dead') {
        if (e.code === 'Enter' || e.code === 'Space') startGame();
        else if (e.code === 'Escape') showModeSelect();
    }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
        const rect = canvas.getBoundingClientRect();
        const x = t.clientX - rect.left;
        const y = t.clientY - rect.top;
        if (state === 'title') {
            if (y < rect.height / 2) { gameMode = 'tower'; } else { gameMode = 'bike'; }
            startGame(); return;
        }
        if (state === 'dead') { startGame(); return; }
        if (x < rect.width / 3) touchLeft = true;
        else if (x > rect.width * 2 / 3) touchRight = true;
        else touchJump = true;
    }
});
canvas.addEventListener('touchend', e => {
    e.preventDefault();
    touchLeft = false; touchRight = false; touchJump = false;
});
canvas.addEventListener('click', () => {
    if (state === 'dead') startGame();
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
function jumpPressed() {
    return keys['ArrowUp'] || keys['KeyW'] || keys['Space'] || touchJump;
}

// ── Color palette (8-bit style) ──
const PAL = {
    bg1: '#0a0a2e', bg2: '#0f0f3a', bg3: '#161650',
    wall1: '#7bc8f0', wall2: '#8ed4f8', wallDk: '#5aaadd',
    wallHi: '#a8e0ff', chain: '#ffffff', chainShadow: '#d0e8f4',
    platform: '#6a8a5a', platformHi: '#8ab87a', platformDk: '#4a6a3a',
    fishBody: '#4488cc', fishFin: '#3366aa', fishTail: '#3366aa',
    fishEye: '#ffffff', fishPupil: '#111111', fishBelly: '#88ccee',
    choco: '#5c3317', chocoHi: '#7a4a2a', chocoWrap: '#cc2244', chocoWrapHi: '#ee4466',
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

// ── Drawing primitives (pixel art) ──
function drawRect(x, y, w, h, color) {
    bctx.fillStyle = color;
    bctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function drawPixel(x, y, color) {
    bctx.fillStyle = color;
    bctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

// ── Draw chocolate bar (shared by both modes) ──
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

// ── Draw fish (shared by both modes) ──
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
function blitToScreen() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0, W, H, 0, 0, canvas.width, canvas.height);
}

// ── Mode select ──
function showModeSelect() {
    state = 'title';
    overlay.innerHTML = `
        <h1>SELECT MODE</h1>
        <p style="color:#ff6644;font-size:16px;">[1] TOWER ASCENT</p>
        <p style="font-size:11px;color:#888;">Climb the endless tower</p>
        <p style="color:#44bbff;font-size:16px;margin-top:10px;">[2] BIKE DASH</p>
        <p style="font-size:11px;color:#888;">Ride &amp; dodge cars and fish</p>
        <p class="blink" style="margin-top:16px;">Press 1 or 2 to start</p>
        <p style="margin-top:10px;font-size:11px;color:#555;">Arrow keys / WASD to move</p>
    `;
    overlay.classList.remove('hidden');
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

    if (gameMode === 'tower') {
        startTowerMode();
    } else {
        startBikeMode();
    }
}

// ── Main game loop ──
function gameLoop() {
    if (gameMode === 'bike' && state === 'playing') {
        updateBike();
        renderBike();
    } else if (gameMode === 'bike' && (state === 'dead' || state === 'title')) {
        renderBike();
    } else {
        updateTower();
        renderTower();
    }
    requestAnimationFrame(gameLoop);
}

gameLoop();
