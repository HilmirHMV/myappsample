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
let gameTime = 0;

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

function enableMobile() {
    if (!isMobile) isMobile = true;
}

// D-pad layout (in game coords, bottom-right corner)
const DPAD = {
    cx: W - 28,
    cy: H - 28,
    btnSize: 18,
    gap: 1,
};
DPAD.up    = { x: DPAD.cx - 9, y: DPAD.cy - 28, w: 18, h: 18 };
DPAD.down  = { x: DPAD.cx - 9, y: DPAD.cy + 10, w: 18, h: 18 };
DPAD.left  = { x: DPAD.cx - 28, y: DPAD.cy - 9, w: 18, h: 18 };
DPAD.right = { x: DPAD.cx + 10, y: DPAD.cy - 9, w: 18, h: 18 };

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
        if (pointInRect(gx, gy, DPAD.up))    { dpadUp = true; continue; }
        if (pointInRect(gx, gy, DPAD.down))  { dpadDown = true; continue; }
        if (pointInRect(gx, gy, DPAD.left))  { dpadLeft = true; continue; }
        if (pointInRect(gx, gy, DPAD.right)) { dpadRight = true; continue; }
        touchActive = true;
        touchGameX = gx;
        touchGameY = gy;
    }
}

document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (state === 'title' || state === 'dead') startGame();
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

document.addEventListener('touchstart', handleTouchStart, { passive: false });
document.addEventListener('touchmove', handleTouchMove, { passive: false });
document.addEventListener('touchend', handleTouchEnd, { passive: false });
document.addEventListener('touchcancel', handleTouchEnd, { passive: false });
document.addEventListener('click', () => {
    if (state === 'title' || state === 'dead') startGame();
});

// ── Helpers ──
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ── Audio system (8-bit style) ──
let audioCtx = null;

function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

function playTone(freq, duration, type, vol, ramp) {
    const ac = ensureAudio();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    if (ramp) osc.frequency.linearRampToValueAtTime(ramp, ac.currentTime + duration);
    gain.gain.setValueAtTime(vol || 0.15, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0, ac.currentTime + duration);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration);
}

const SFX = {
    pickup() {
        playTone(600, 0.06, 'square', 0.12);
        setTimeout(() => playTone(900, 0.08, 'square', 0.12), 60);
        setTimeout(() => playTone(1200, 0.1, 'square', 0.1), 130);
    },
    hit() {
        playTone(200, 0.15, 'sawtooth', 0.18, 50);
        setTimeout(() => playTone(80, 0.2, 'square', 0.15), 80);
    },
    death() {
        playTone(400, 0.12, 'square', 0.18, 100);
        setTimeout(() => playTone(200, 0.15, 'square', 0.15, 60), 120);
        setTimeout(() => playTone(100, 0.25, 'sawtooth', 0.12, 40), 260);
    },
    levelUp() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((n, i) => setTimeout(() => playTone(n, 0.12, 'square', 0.1), i * 100));
    },
    laneSwitch() {
        playTone(440, 0.04, 'square', 0.06);
    },
    destroy() {
        playTone(300, 0.08, 'sawtooth', 0.1, 100);
        setTimeout(() => playTone(500, 0.06, 'square', 0.08), 50);
    },
    start() {
        const notes = [262, 330, 392, 523];
        notes.forEach((n, i) => setTimeout(() => playTone(n, 0.1, 'square', 0.08), i * 80));
    },
    nearMiss() {
        playTone(800, 0.05, 'triangle', 0.08);
        setTimeout(() => playTone(1000, 0.05, 'triangle', 0.06), 40);
    },
    combo() {
        playTone(1200, 0.08, 'square', 0.1);
        setTimeout(() => playTone(1400, 0.06, 'square', 0.08), 60);
        setTimeout(() => playTone(1600, 0.08, 'square', 0.1), 110);
    }
};

// ── Background music ──
let musicPlaying = false;
let musicOscillators = [];
let musicInterval = null;

function startMusic() {
    if (musicPlaying) return;
    musicPlaying = true;
    const ac = ensureAudio();

    const bassGain = ac.createGain();
    bassGain.gain.value = 0.04;
    bassGain.connect(ac.destination);

    const bassNotes = [131, 131, 165, 165, 175, 175, 131, 131];
    let step = 0;
    const bpm = 140;
    const stepTime = 60 / bpm / 2;

    musicInterval = setInterval(() => {
        if (state !== 'playing') return;
        const ac2 = ensureAudio();
        const now = ac2.currentTime;

        const bassOsc = ac2.createOscillator();
        const bg = ac2.createGain();
        bassOsc.type = 'square';
        bassOsc.frequency.value = bassNotes[step % bassNotes.length];
        bg.gain.setValueAtTime(0.04, now);
        bg.gain.linearRampToValueAtTime(0, now + stepTime * 0.8);
        bassOsc.connect(bg);
        bg.connect(ac2.destination);
        bassOsc.start(now);
        bassOsc.stop(now + stepTime * 0.9);

        if (step % 4 === 0) {
            const melNotes = [523, 587, 659, 784, 659, 587, 523, 440];
            const melOsc = ac2.createOscillator();
            const mg = ac2.createGain();
            melOsc.type = 'triangle';
            melOsc.frequency.value = melNotes[Math.floor(step / 4) % melNotes.length];
            mg.gain.setValueAtTime(0.025, now);
            mg.gain.linearRampToValueAtTime(0, now + stepTime * 3);
            melOsc.connect(mg);
            mg.connect(ac2.destination);
            melOsc.start(now);
            melOsc.stop(now + stepTime * 3.5);
        }

        step++;
    }, stepTime * 1000);
}

function stopMusic() {
    musicPlaying = false;
    if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
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

// ── Floating text system ──
let floatingTexts = [];

function spawnFloatingText(x, y, text, color) {
    floatingTexts.push({ x, y, text, color, life: 50, maxLife: 50 });
}

function updateFloatingTexts() {
    floatingTexts = floatingTexts.filter(ft => {
        ft.y -= 0.5;
        ft.life--;
        return ft.life > 0;
    });
}

function drawFloatingTexts() {
    for (const ft of floatingTexts) {
        bctx.globalAlpha = ft.life / ft.maxLife;
        bctx.fillStyle = ft.color;
        bctx.font = '8px monospace';
        bctx.textAlign = 'center';
        bctx.fillText(ft.text, ft.x, ft.y);
    }
    bctx.globalAlpha = 1;
    bctx.textAlign = 'left';
}

// ── Weather particle system ──
let weatherParticles = [];

function spawnWeatherParticle(type) {
    switch (type) {
        case 'rain':
            weatherParticles.push({
                x: Math.random() * W, y: -4,
                vx: -0.5, vy: 4 + Math.random() * 2,
                size: 1, color: '#aaccee', life: 80
            });
            break;
        case 'snow':
            weatherParticles.push({
                x: Math.random() * W, y: -4,
                vx: (Math.random() - 0.5) * 0.5,
                vy: 0.5 + Math.random() * 0.5,
                size: 1 + (Math.random() > 0.7 ? 1 : 0),
                color: '#ffffff', life: 300
            });
            break;
        case 'leaves':
            const leafColors = ['#cc5533', '#dd7744', '#aa4422', '#bbaa44'];
            weatherParticles.push({
                x: Math.random() * W, y: -4,
                vx: (Math.random() - 0.3) * 1.5,
                vy: 1 + Math.random() * 0.8,
                size: 2, color: leafColors[Math.floor(Math.random() * leafColors.length)],
                life: 200, wobble: Math.random() * 6.28
            });
            break;
        case 'dust':
            weatherParticles.push({
                x: Math.random() * W, y: -4,
                vx: (Math.random() - 0.5) * 0.8,
                vy: 0.8 + Math.random() * 0.5,
                size: 1, color: '#ccaa77', life: 150
            });
            break;
    }
}

function updateWeather(type, rate) {
    if (Math.random() < rate) spawnWeatherParticle(type);
    weatherParticles = weatherParticles.filter(wp => {
        wp.x += wp.vx;
        wp.y += wp.vy;
        if (wp.wobble !== undefined) {
            wp.wobble += 0.08;
            wp.x += Math.sin(wp.wobble) * 0.3;
        }
        wp.life--;
        return wp.life > 0 && wp.y < H + 10;
    });
}

function drawWeather() {
    for (const wp of weatherParticles) {
        bctx.globalAlpha = Math.min(1, wp.life / 30);
        drawRect(wp.x, wp.y, wp.size, wp.size, wp.color);
    }
    bctx.globalAlpha = 1;
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

// ── Speed lines ──
function drawSpeedLines(speed, invuln) {
    if (speed < 1.8 && !invuln) return;
    const intensity = invuln ? 0.25 : clamp((speed - 1.8) / 2, 0, 0.15);
    const lineCount = invuln ? 8 : Math.floor(speed * 2);
    bctx.globalAlpha = intensity;
    for (let i = 0; i < lineCount; i++) {
        const x = (gameTime * 7 + i * 37) % W;
        const len = 8 + (i * 5) % 12;
        const col = invuln ? '#ffee44' : '#ffffff';
        drawRect(x, (gameTime * 3 + i * 41) % H, 1, len, col);
    }
    bctx.globalAlpha = 1;
}

// ── Draw chocolate bar ──
function drawChocolate(c, camY) {
    if (c.collected) return;
    const sy = c.y - camY;
    const bob = Math.sin(c.animTimer * 0.08) * 2;
    const x = Math.round(c.x);
    const y = Math.round(sy + bob);

    // Glow effect
    bctx.globalAlpha = 0.3 + Math.sin(c.animTimer * 0.1) * 0.15;
    drawRect(x - 2, y - 2, 14, 12, '#ffcc00');
    bctx.globalAlpha = 1;

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

// ── Roadside scenery system ──
let sceneryLeft = [];
let sceneryRight = [];

function initScenery() {
    sceneryLeft = [];
    sceneryRight = [];
    for (let y = -20; y < H + 40; y += 25 + Math.random() * 20) {
        sceneryLeft.push(makeSceneryItem(y, 'left'));
        sceneryRight.push(makeSceneryItem(y, 'right'));
    }
}

function makeSceneryItem(y, side) {
    const types = ['tree', 'lamppost', 'bush', 'flower'];
    const weights = [3, 2, 3, 4];
    let total = weights.reduce((a, b) => a + b);
    let r = Math.random() * total;
    let type = types[0];
    for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) { type = types[i]; break; }
    }
    const x = side === 'left' ? 2 + Math.random() * 22 : W - 26 + Math.random() * 22;
    return { x, y, type, variant: Math.floor(Math.random() * 3) };
}

function updateScenery(scrollDelta) {
    const shift = scrollDelta * 0.8;
    for (const s of sceneryLeft) s.y += shift;
    for (const s of sceneryRight) s.y += shift;
    sceneryLeft = sceneryLeft.filter(s => s.y < H + 30);
    sceneryRight = sceneryRight.filter(s => s.y < H + 30);
    while (sceneryLeft.length < 12) sceneryLeft.unshift(makeSceneryItem(-10 - Math.random() * 20, 'left'));
    while (sceneryRight.length < 12) sceneryRight.unshift(makeSceneryItem(-10 - Math.random() * 20, 'right'));
}

function drawSceneryItem(s, theme) {
    const x = Math.round(s.x);
    const y = Math.round(s.y);
    switch (s.type) {
        case 'tree':
            drawRect(x + 2, y + 5, 2, 5, '#553311');
            drawRect(x, y, 6, 5, theme.grassDark);
            drawRect(x + 1, y - 2, 4, 3, theme.grass);
            drawPixel(x + 2, y - 3, theme.grassLight);
            break;
        case 'lamppost':
            drawRect(x + 2, y, 1, 10, '#777777');
            drawRect(x + 1, y, 3, 1, '#999999');
            drawPixel(x + 2, y - 1, '#ffee88');
            if (gameTime % 4 < 2) drawPixel(x + 2, y + 1, '#ffee44');
            break;
        case 'bush':
            drawRect(x, y + 2, 5, 3, theme.grassDark);
            drawRect(x + 1, y + 1, 3, 2, theme.grass);
            if (s.variant === 0) drawPixel(x + 2, y + 1, '#ff6666');
            break;
        case 'flower':
            drawPixel(x + 1, y + 2, theme.grassDark);
            drawPixel(x + 1, y + 1, s.variant === 0 ? '#ff6688' : s.variant === 1 ? '#ffdd44' : '#aa88ff');
            drawPixel(x + 1, y, s.variant === 0 ? '#ffaacc' : s.variant === 1 ? '#ffee88' : '#ccaaff');
            break;
    }
}

function drawAllScenery(theme) {
    for (const s of sceneryLeft) drawSceneryItem(s, theme);
    for (const s of sceneryRight) drawSceneryItem(s, theme);
}

// ── Draw on-screen d-pad (mobile only) ──
function drawDpad() {
    if (!isMobile) return;

    bctx.globalAlpha = 0.35;

    function drawBtn(r, active, arrowDir) {
        const col = active ? '#ffffff' : '#aaaaaa';
        drawRect(r.x, r.y, r.w, r.h, '#222222');
        drawRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, active ? '#555555' : '#333333');

        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        bctx.fillStyle = col;
        if (arrowDir === 'up') {
            drawRect(cx - 1, cy - 4, 2, 1, col);
            drawRect(cx - 2, cy - 3, 4, 1, col);
            drawRect(cx - 3, cy - 2, 6, 1, col);
            drawRect(cx - 4, cy - 1, 8, 1, col);
        } else if (arrowDir === 'down') {
            drawRect(cx - 4, cy - 1, 8, 1, col);
            drawRect(cx - 3, cy, 6, 1, col);
            drawRect(cx - 2, cy + 1, 4, 1, col);
            drawRect(cx - 1, cy + 2, 2, 1, col);
        } else if (arrowDir === 'left') {
            drawRect(cx - 4, cy - 1, 1, 2, col);
            drawRect(cx - 3, cy - 2, 1, 4, col);
            drawRect(cx - 2, cy - 3, 1, 6, col);
            drawRect(cx - 1, cy - 4, 1, 8, col);
        } else if (arrowDir === 'right') {
            drawRect(cx + 3, cy - 1, 1, 2, col);
            drawRect(cx + 2, cy - 2, 1, 4, col);
            drawRect(cx + 1, cy - 3, 1, 6, col);
            drawRect(cx, cy - 4, 1, 8, col);
        }
    }

    drawBtn(DPAD.up, dpadUp, 'up');
    drawBtn(DPAD.down, dpadDown, 'down');
    drawBtn(DPAD.left, dpadLeft, 'left');
    drawBtn(DPAD.right, dpadRight, 'right');

    drawRect(DPAD.cx - 5, DPAD.cy - 5, 10, 10, '#222222');

    bctx.globalAlpha = 1;
}

function blitToScreen() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0, W, H, 0, 0, canvas.width, canvas.height);
}

// ── Title screen (canvas-rendered) ──
let titleScroll = 0;

function renderTitleScreen() {
    bctx.clearRect(0, 0, W, H);
    titleScroll += 1.5;

    // Road background
    bctx.fillStyle = '#88bbdd';
    bctx.fillRect(0, 0, W, H);
    bctx.fillStyle = '#44aa44';
    bctx.fillRect(0, 0, 32, H);
    bctx.fillRect(W - 32, 0, 32, H);
    bctx.fillStyle = '#555555';
    bctx.fillRect(32, 0, W - 64, H);
    drawRect(32, 0, 2, H, '#888888');
    drawRect(W - 34, 0, 2, H, '#888888');

    const dashLen = 12, gapLen = 10, totalDash = dashLen + gapLen;
    const dashOff = (titleScroll * 1.5) % totalDash;
    for (let li = 1; li < 4; li++) {
        const lx = 32 + (W - 64) * li / 4;
        for (let dy = -dashLen + dashOff; dy < H + dashLen; dy += totalDash) {
            drawRect(lx - 1, dy, 2, dashLen, '#cccccc');
        }
    }

    // Scrolling scenery on title
    const grassScroll = (titleScroll * 0.6) % 8;
    for (let gy = -8; gy < H; gy += 8) {
        const ry = gy + grassScroll;
        drawPixel(8, ry, '#3d9a3d');
        drawPixel(20, ry + 3, '#55bb55');
        drawPixel(W - 12, ry + 1, '#3d9a3d');
        drawPixel(W - 24, ry + 5, '#55bb55');
    }

    // Title text with shadow
    bctx.textAlign = 'center';
    bctx.font = '8px monospace';

    // BIKE DASH title
    bctx.fillStyle = '#000000';
    bctx.fillText('BIKE DASH', W / 2 + 1, 61);
    bctx.fillStyle = '#44bbff';
    bctx.fillText('BIKE DASH', W / 2, 60);

    // Animated underline
    const lineW = 50 + Math.sin(gameTime * 0.08) * 5;
    drawRect(W / 2 - lineW / 2, 64, lineW, 1, '#44bbff');

    // Subtitle
    bctx.fillStyle = '#aaaaaa';
    bctx.fillText('Ride & dodge!', W / 2, 78);

    // Animated biker on title
    const titleBikeY = H / 2 + 10;
    const titleBikeX = W / 2 - 5;
    const frame = Math.floor(gameTime / 6) % 2;

    // Bicycle wheels
    drawRect(titleBikeX + 1, titleBikeY + 11, 3, 3, '#444');
    drawPixel(titleBikeX + 2, titleBikeY + 12, '#888');
    drawRect(titleBikeX + 7, titleBikeY + 11, 3, 3, '#444');
    drawPixel(titleBikeX + 8, titleBikeY + 12, '#888');
    drawRect(titleBikeX + 3, titleBikeY + 10, 5, 1, '#777');
    drawRect(titleBikeX + 4, titleBikeY + 9, 1, 2, '#777');
    drawRect(titleBikeX + 6, titleBikeY + 9, 1, 2, '#777');
    drawRect(titleBikeX + 3, titleBikeY + 9, 3, 1, '#444');
    drawRect(titleBikeX + 7, titleBikeY + 8, 2, 1, '#888');

    // Legs (animated pedaling)
    if (frame === 0) {
        drawRect(titleBikeX + 3, titleBikeY + 8, 2, 2, PAL.pants);
        drawRect(titleBikeX + 6, titleBikeY + 7, 2, 2, PAL.pants);
        drawRect(titleBikeX + 3, titleBikeY + 10, 2, 1, PAL.shoe);
        drawRect(titleBikeX + 6, titleBikeY + 9, 2, 1, PAL.shoe);
    } else {
        drawRect(titleBikeX + 3, titleBikeY + 7, 2, 2, PAL.pants);
        drawRect(titleBikeX + 6, titleBikeY + 8, 2, 2, PAL.pants);
        drawRect(titleBikeX + 3, titleBikeY + 9, 2, 1, PAL.shoe);
        drawRect(titleBikeX + 6, titleBikeY + 10, 2, 1, PAL.shoe);
    }
    drawRect(titleBikeX + 3, titleBikeY + 4, 5, 4, PAL.shirt);
    drawPixel(titleBikeX + 4, titleBikeY + 4, PAL.shirtHi);
    drawRect(titleBikeX + 7, titleBikeY + 5, 2, 2, PAL.skin);
    drawPixel(titleBikeX + 2, titleBikeY + 5, PAL.skin);
    drawRect(titleBikeX + 3, titleBikeY + 1, 5, 3, PAL.skin);
    drawRect(titleBikeX + 3, titleBikeY, 5, 2, PAL.hair);
    drawRect(titleBikeX + 2, titleBikeY, 6, 1, PAL.hair);
    drawPixel(titleBikeX + 4, titleBikeY, PAL.hairHi);
    drawPixel(titleBikeX + 5, titleBikeY + 2, PAL.black);
    drawPixel(titleBikeX + 7, titleBikeY + 2, PAL.black);

    // Controls info
    const blink = Math.sin(gameTime * 0.1) > 0;
    if (blink) {
        bctx.fillStyle = '#ffffff';
        bctx.fillText('PRESS ANY KEY', W / 2, H / 2 + 50);
    }

    bctx.fillStyle = '#666666';
    bctx.fillText('Arrows / WASD to move', W / 2, H - 40);
    bctx.fillText('Collect chocolate!', W / 2, H - 28);

    // High score
    const hs = parseInt(localStorage.getItem('bikeHighScore') || '0');
    if (hs > 0) {
        bctx.fillStyle = '#ffcc00';
        bctx.fillText('BEST: ' + hs, W / 2, H - 12);
    }

    bctx.textAlign = 'left';
    blitToScreen();
}

// ── Start / Reset ──
function startGame() {
    ensureAudio();
    SFX.start();
    startMusic();
    state = 'playing';
    overlay.classList.add('hidden');
    seededRandom(Date.now() & 0xffffff);
    particles = [];
    floatingTexts = [];
    weatherParticles = [];
    score = 0;
    screenShake = 0;
    invulnTimer = 0;
    initScenery();
    startBikeMode();
}

// ── Main game loop (started after all scripts load) ──
function gameLoop() {
    gameTime++;
    if (state === 'title') {
        renderTitleScreen();
    } else {
        if (state === 'playing') {
            updateBike();
        }
        renderBike();
    }
    requestAnimationFrame(gameLoop);
}
