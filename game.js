// ── Bike Dash ── Game Engine ──

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('ui-overlay');

// ── Constants ──
const W = 192;
const H = 256;
const TILE = 8;
const COLS = W / TILE;

// Size the canvas to an INTEGER multiple of the native resolution in real
// device pixels, so every game pixel maps to a whole number of screen
// pixels — fractional scaling is what makes pixel art look blurry.
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const availW = Math.max(1, window.innerWidth - 8) * dpr;
    const availH = Math.max(1, window.innerHeight - 8) * dpr;
    const scale = Math.max(1, Math.floor(Math.min(availW / W, availH / H)));
    canvas.width = W * scale;
    canvas.height = H * scale;
    canvas.style.width = (W * scale / dpr) + 'px';
    canvas.style.height = (H * scale / dpr) + 'px';
    ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 100));
resizeCanvas();

// ── Off-screen buffer (native res) ──
const buf = document.createElement('canvas');
buf.width = W; buf.height = H;
const bctx = buf.getContext('2d');
bctx.imageSmoothingEnabled = false;

// ── Game state ──
let state = 'title'; // title | playing | paused | dead
let gameMode = '2d'; // '2d' classic | '3d' webgl runner
let menuSelection = 0; // 0 = 2D, 1 = 3D
let score = 0;
let particles = [];
let screenShake = 0;
let invulnTimer = 0;
let gameTime = 0;
let hitStop = 0; // slow-motion frames after a fatal collision

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

// ── Pause ──
const PAUSE_BTN = { x: W - 18, y: 24, w: 16, h: 16 };

function togglePause() {
    if (state === 'playing') state = 'paused';
    else if (state === 'paused') state = 'playing';
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') state = 'paused';
});
window.addEventListener('blur', () => {
    if (state === 'playing') state = 'paused';
});

// ── Haptics (Android; iOS Safari has no vibration API) ──
function vibrate(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}

function touchToGame(t) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: ((t.clientX - rect.left) / rect.width) * W,
        y: ((t.clientY - rect.top) / rect.height) * H
    };
}

document.addEventListener('keydown', e => {
    keys[e.code] = true;
    unlockAudio();
    if (e.code === 'KeyP' || e.code === 'Escape') {
        togglePause();
        return;
    }
    if (state === 'paused') return;
    // Buffer 3D jumps at the event level so a quick tap between
    // animation frames still registers
    if (state === 'playing' && gameMode === '3d' &&
        (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') &&
        typeof g3QueueJump === 'function') {
        g3QueueJump();
    }
    if (state === 'title') {
        // Menu: arrows choose mode, Enter/Space start
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code)) {
            menuSelection = 1 - menuSelection;
            gameMode = menuSelection === 1 ? '3d' : '2d';
            SFX.laneSwitch();
        } else if (e.code === 'Enter' || e.code === 'Space') {
            startGame();
        }
        return;
    }
    if (state === 'dead') {
        if (e.code === 'KeyM') { backToMenu(); return; }
        startGame();
    }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// Menu panel hit areas (game coords, drawn in renderTitleScreen)
const MENU_PANEL_2D = { x: 16, y: 118, w: 160, h: 42 };
const MENU_PANEL_3D = { x: 16, y: 168, w: 160, h: 42 };

function handleTouchStart(e) {
    e.preventDefault();
    enableMobile();
    unlockAudio();

    // 3D mode has its own touch scheme (left/right steer, middle jump,
    // top strip pauses)
    if (gameMode === '3d' && (state === 'playing' || state === 'paused')) {
        const t = e.changedTouches[0];
        if (t.clientY < 60) { togglePause(); return; }
        if (state === 'paused') return;
        g3Touch(t.clientX);
        return;
    }

    // Pause button check (playing or paused, 2D)
    if (state === 'playing' || state === 'paused') {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const g = touchToGame(e.changedTouches[i]);
            if (pointInRect(g.x, g.y, PAUSE_BTN)) { togglePause(); return; }
        }
    }
    if (state === 'paused') return;
    if (state === 'title') {
        // Tap a panel to pick that mode; tap elsewhere starts the selection
        const g = touchToGame(e.changedTouches[0]);
        if (pointInRect(g.x, g.y, MENU_PANEL_2D)) { menuSelection = 0; gameMode = '2d'; }
        else if (pointInRect(g.x, g.y, MENU_PANEL_3D)) { menuSelection = 1; gameMode = '3d'; }
        startGame();
        return;
    }
    if (state === 'dead') { startGame(); return; }
    updateDpadFromTouches(e);
}
function handleTouchMove(e) {
    e.preventDefault();
    updateDpadFromTouches(e);
}
function handleTouchEnd(e) {
    e.preventDefault();
    unlockAudio();
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
document.addEventListener('click', e => {
    unlockAudio();
    if (state === 'paused') return;
    if (state === 'title') {
        const g = touchToGame(e);
        if (pointInRect(g.x, g.y, MENU_PANEL_2D)) { menuSelection = 0; gameMode = '2d'; }
        else if (pointInRect(g.x, g.y, MENU_PANEL_3D)) { menuSelection = 1; gameMode = '3d'; }
        startGame();
        return;
    }
    if (state === 'dead') startGame();
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
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null; // audio unsupported (or test environment)
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') audioCtx.resume();
    return audioCtx;
}

// iOS unlock: Web Audio is muted by the ringer silent switch unless an
// <audio> element is playing, which flips the audio session to "playback".
// A looping silent WAV keeps that session active. Must start inside a
// user gesture.
let audioUnlocked = false;
const SILENT_WAV = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';

function unlockAudio() {
    ensureAudio();
    if (audioUnlocked) return;
    try {
        const el = document.createElement('audio');
        el.setAttribute('playsinline', '');
        el.src = SILENT_WAV;
        el.loop = true;
        const p = el.play();
        if (p && p.then) {
            p.then(() => { audioUnlocked = true; }).catch(() => {});
        } else {
            audioUnlocked = true;
        }
    } catch (e) {
        // media playback unsupported (test environment) — ignore
    }
}

function playTone(freq, duration, type, vol, ramp) {
    const ac = ensureAudio();
    if (!ac) return;
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
    },
    shield() {
        playTone(330, 0.1, 'triangle', 0.12);
        setTimeout(() => playTone(494, 0.12, 'triangle', 0.12), 90);
    },
    shieldBreak() {
        playTone(494, 0.08, 'square', 0.15, 330);
        setTimeout(() => playTone(247, 0.15, 'sawtooth', 0.12), 80);
    },
    bell() {
        playTone(1319, 0.15, 'triangle', 0.14);
        setTimeout(() => playTone(1047, 0.2, 'triangle', 0.1), 120);
    },
    magnet() {
        playTone(200, 0.15, 'sine', 0.12, 600);
    },
    mission() {
        const notes = [659, 784, 988, 1319];
        notes.forEach((n, i) => setTimeout(() => playTone(n, 0.08, 'square', 0.1), i * 70));
    },
    unlock() {
        const notes = [523, 659, 784, 1047, 1319];
        notes.forEach((n, i) => setTimeout(() => playTone(n, 0.1, 'triangle', 0.12), i * 90));
    },
    bossHit() {
        playTone(150, 0.1, 'sawtooth', 0.15, 80);
    },
    bossDown() {
        playTone(400, 0.1, 'sawtooth', 0.15, 100);
        setTimeout(() => playTone(300, 0.12, 'sawtooth', 0.13, 80), 100);
        setTimeout(() => playTone(200, 0.2, 'sawtooth', 0.12, 50), 220);
        setTimeout(() => playTone(1047, 0.3, 'square', 0.1), 450);
    },
    splash() {
        playTone(900, 0.08, 'triangle', 0.06, 300);
        setTimeout(() => playTone(500, 0.1, 'triangle', 0.05, 200), 50);
    },
    boostTick() {
        playTone(1100, 0.05, 'square', 0.09);
    },
    shockwave() {
        playTone(1400, 0.25, 'sawtooth', 0.1, 200);
        setTimeout(() => playTone(700, 0.15, 'square', 0.08, 150), 60);
    }
};

// ── Background music ──
let musicPlaying = false;
let musicOscillators = [];
let musicInterval = null;

function startMusic() {
    if (musicPlaying) return;
    if (!ensureAudio()) return;
    musicPlaying = true;

    const bassNotes = [131, 131, 165, 165, 175, 175, 131, 131];
    const melNotes = [523, 587, 659, 784, 659, 587, 523, 440];
    const boostArp = [1047, 1319, 1568, 2093, 1568, 1319]; // C6-E6-G6-C7 sparkle
    let step = 0;

    function playStep() {
        if (!musicPlaying) return;

        // Boost mode: double-time, octave-up bass, denser melody, arpeggio
        // (each mode has its own boost timer)
        const boostTimer = (gameMode === '3d' && typeof g3Invuln !== 'undefined') ? g3Invuln : invulnTimer;
        const boost = state === 'playing' && boostTimer > 0;
        const bpm = boost ? 210 : 140;
        const stepTime = 60 / bpm / 2;

        if (state === 'playing') {
            const ac = ensureAudio();
            if (ac) {
                const now = ac.currentTime;

                const bassOsc = ac.createOscillator();
                const bg = ac.createGain();
                bassOsc.type = 'square';
                const bassFreq = bassNotes[step % bassNotes.length];
                bassOsc.frequency.value = boost ? bassFreq * 2 : bassFreq;
                bg.gain.setValueAtTime(boost ? 0.05 : 0.04, now);
                bg.gain.linearRampToValueAtTime(0, now + stepTime * 0.8);
                bassOsc.connect(bg);
                bg.connect(ac.destination);
                bassOsc.start(now);
                bassOsc.stop(now + stepTime * 0.9);

                const melEvery = boost ? 2 : 4;
                if (step % melEvery === 0) {
                    const melOsc = ac.createOscillator();
                    const mg = ac.createGain();
                    melOsc.type = boost ? 'square' : 'triangle';
                    melOsc.frequency.value = melNotes[Math.floor(step / melEvery) % melNotes.length];
                    mg.gain.setValueAtTime(boost ? 0.035 : 0.025, now);
                    mg.gain.linearRampToValueAtTime(0, now + stepTime * 3);
                    melOsc.connect(mg);
                    mg.connect(ac.destination);
                    melOsc.start(now);
                    melOsc.stop(now + stepTime * 3.5);
                }

                if (boost) {
                    const arpOsc = ac.createOscillator();
                    const ag = ac.createGain();
                    arpOsc.type = 'triangle';
                    arpOsc.frequency.value = boostArp[step % boostArp.length];
                    ag.gain.setValueAtTime(0.02, now);
                    ag.gain.linearRampToValueAtTime(0, now + stepTime * 0.6);
                    arpOsc.connect(ag);
                    ag.connect(ac.destination);
                    arpOsc.start(now);
                    arpOsc.stop(now + stepTime * 0.7);
                }
            }
        }

        step++;
        musicInterval = setTimeout(playStep, stepTime * 1000);
    }
    playStep();
}

function stopMusic() {
    musicPlaying = false;
    if (musicInterval) { clearTimeout(musicInterval); musicInterval = null; }
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
        drawPixelText(ft.text, ft.x, ft.y - 4, ft.color, 'center');
    }
    bctx.globalAlpha = 1;
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

// ── Bitmap pixel font (3x5) ──
// Canvas fillText is always anti-aliased, which reads as blur on pixel
// art. This font draws glyphs as raw pixels so text stays crisp.
const FONT = {
    'A': ['010','101','111','101','101'],
    'B': ['110','101','110','101','110'],
    'C': ['011','100','100','100','011'],
    'D': ['110','101','101','101','110'],
    'E': ['111','100','110','100','111'],
    'F': ['111','100','110','100','100'],
    'G': ['011','100','101','101','011'],
    'H': ['101','101','111','101','101'],
    'I': ['111','010','010','010','111'],
    'J': ['011','001','001','101','010'],
    'K': ['101','110','100','110','101'],
    'L': ['100','100','100','100','111'],
    'M': ['101','111','111','101','101'],
    'N': ['110','101','101','101','101'],
    'O': ['010','101','101','101','010'],
    'P': ['110','101','110','100','100'],
    'Q': ['010','101','101','011','001'],
    'R': ['110','101','110','101','101'],
    'S': ['011','100','010','001','110'],
    'T': ['111','010','010','010','010'],
    'U': ['101','101','101','101','111'],
    'V': ['101','101','101','101','010'],
    'W': ['101','101','111','111','101'],
    'X': ['101','101','010','101','101'],
    'Y': ['101','101','010','010','010'],
    'Z': ['111','001','010','100','111'],
    '0': ['111','101','101','101','111'],
    '1': ['010','110','010','010','111'],
    '2': ['110','001','010','100','111'],
    '3': ['110','001','010','001','110'],
    '4': ['101','101','111','001','001'],
    '5': ['111','100','110','001','110'],
    '6': ['011','100','111','101','111'],
    '7': ['111','001','010','010','010'],
    '8': ['111','101','111','101','111'],
    '9': ['111','101','111','001','110'],
    ' ': ['000','000','000','000','000'],
    ':': ['000','010','000','010','000'],
    '!': ['010','010','010','000','010'],
    '?': ['110','001','010','000','010'],
    '+': ['000','010','111','010','000'],
    '-': ['000','000','111','000','000'],
    '.': ['000','000','000','000','010'],
    ',': ['000','000','000','010','100'],
    '/': ['001','001','010','100','100'],
    '~': ['000','011','110','000','000'],
    "'": ['010','010','000','000','000'],
    '=': ['000','111','000','111','000'],
    '(': ['001','010','010','010','001'],
    ')': ['100','010','010','010','100'],
    '✓': ['000','001','101','010','000'],
};

function pixelTextWidth(str, scale) {
    scale = scale || 1;
    return str.length * 4 * scale - scale;
}

function drawPixelText(text, x, y, color, align, scale) {
    scale = scale || 1;
    const str = String(text).toUpperCase();
    let px = Math.round(x);
    const w = pixelTextWidth(str, scale);
    if (align === 'center') px -= Math.floor(w / 2);
    else if (align === 'right') px -= w;
    const py = Math.round(y);
    bctx.fillStyle = color;
    for (let c = 0; c < str.length; c++) {
        const glyph = FONT[str[c]] || FONT['?'];
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 3; col++) {
                if (glyph[row][col] === '1') {
                    bctx.fillRect(px + col * scale, py + row * scale, scale, scale);
                }
            }
        }
        px += 4 * scale;
    }
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

    // BIKE DASH title with shadow (big pixel text)
    drawPixelText('BIKE DASH', W / 2 + 1, 53, '#000000', 'center', 2);
    drawPixelText('BIKE DASH', W / 2, 52, '#44bbff', 'center', 2);

    // Animated underline
    const lineW = 50 + Math.sin(gameTime * 0.08) * 5;
    drawRect(W / 2 - lineW / 2, 66, lineW, 1, '#44bbff');

    // Subtitle
    drawPixelText('RIDE + DODGE!', W / 2, 74, '#aaaaaa', 'center');

    // ── Mode selection panels ──
    const tf = currentFrame();
    const blink = Math.sin(gameTime * 0.12) > 0;

    function drawPanel(r, selected) {
        bctx.globalAlpha = 0.75;
        drawRect(r.x, r.y, r.w, r.h, '#000000');
        bctx.globalAlpha = 1;
        const border = selected ? (blink ? '#ffffff' : '#ffcc00') : '#555555';
        drawRect(r.x, r.y, r.w, 2, border);
        drawRect(r.x, r.y + r.h - 2, r.w, 2, border);
        drawRect(r.x, r.y, 2, r.h, border);
        drawRect(r.x + r.w - 2, r.y, 2, r.h, border);
    }

    // Panel 1: 2D classic (with mini biker in current unlock colors)
    drawPanel(MENU_PANEL_2D, menuSelection === 0);
    const bx = MENU_PANEL_2D.x + 14, by = MENU_PANEL_2D.y + 14;
    drawRect(bx + 1, by + 11, 3, 3, '#444');
    drawRect(bx + 7, by + 11, 3, 3, '#444');
    drawRect(bx + 3, by + 10, 5, 1, tf.color);
    drawRect(bx + 3, by + 9, 3, 1, tf.hi);
    drawRect(bx + 3, by + 4, 5, 4, tf.shirt);
    drawRect(bx + 3, by + 1, 5, 3, PAL.skin);
    drawRect(bx + 3, by, 5, 2, PAL.hair);
    drawPixel(bx + 5, by + 2, PAL.black);
    drawPixel(bx + 7, by + 2, PAL.black);
    drawPixelText('2D CLASSIC', MENU_PANEL_2D.x + 34, MENU_PANEL_2D.y + 10, menuSelection === 0 ? '#ffffff' : '#999999');
    drawPixelText('THE ORIGINAL', MENU_PANEL_2D.x + 34, MENU_PANEL_2D.y + 22, '#777777');

    // Panel 2: 3D dash (pseudo-3D road icon)
    drawPanel(MENU_PANEL_3D, menuSelection === 1);
    const rx = MENU_PANEL_3D.x + 8, ry = MENU_PANEL_3D.y + 8;
    // Perspective road: rows narrowing toward a horizon
    for (let i = 0; i < 12; i++) {
        const rowW = 4 + i * 1.6;
        drawRect(rx + 12 - rowW / 2, ry + 12 + i, rowW, 1, i % 3 === 0 ? '#666677' : '#555566');
    }
    drawRect(rx + 2, ry + 10, 20, 2, '#8888aa');
    drawRect(rx + 11, ry + 16, 2, 2, '#ffcc00');
    drawRect(rx + 10, ry + 20, 4, 3, '#dd3322');
    drawPixelText('3D DASH', MENU_PANEL_3D.x + 34, MENU_PANEL_3D.y + 10, menuSelection === 1 ? '#ffffff' : '#999999');
    drawPixelText('NEW! WEBGL', MENU_PANEL_3D.x + 34, MENU_PANEL_3D.y + 22, '#ffcc44');

    // Prompt
    if (blink) {
        drawPixelText('TAP OR ENTER TO START', W / 2, 224, '#ffffff', 'center');
    }
    drawPixelText('ARROWS: CHOOSE MODE', W / 2, H - 20, '#666666', 'center');

    // Current ride + best score
    drawPixelText('RIDE: ' + tf.name, W / 2, 92, tf.trail || '#999999', 'center');
    let hs = 0;
    try { hs = parseInt(localStorage.getItem('bikeHighScore') || '0'); } catch (e) {}
    if (hs > 0) {
        drawPixelText('BEST: ' + hs, W / 2, 102, '#ffcc00', 'center');
    }

    blitToScreen();
}

// ── Start / Reset ──
// Show the right canvas for the current mode ('menu' uses the 2D canvas)
function setCanvasMode(mode) {
    const c3d = document.getElementById('game3d');
    const h3d = document.getElementById('hud3d');
    if (mode === '3d') {
        canvas.classList.add('hidden');
        if (c3d) c3d.classList.remove('hidden');
        if (h3d) h3d.classList.remove('hidden');
    } else {
        canvas.classList.remove('hidden');
        if (c3d) c3d.classList.add('hidden');
        if (h3d) h3d.classList.add('hidden');
    }
}

function backToMenu() {
    state = 'title';
    stopMusic();
    overlay.classList.add('hidden');
    setCanvasMode('2d');
}

function startGame() {
    ensureAudio();
    if (gameMode === '3d') {
        if (!init3D()) {
            // WebGL unavailable — fall back to the 2D game
            gameMode = '2d';
        }
    }
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
    hitStop = 0;
    if (gameMode === '3d') {
        setCanvasMode('3d');
        resize3D();
        start3DMode();
    } else {
        setCanvasMode('2d');
        initScenery();
        startBikeMode();
    }
}

// ── Main game loop (started after all scripts load) ──
function gameLoop() {
    gameTime++;
    if (state === 'title') {
        renderTitleScreen();
    } else if (gameMode === '3d') {
        if (state === 'playing') {
            if (hitStop > 0) {
                hitStop--;
                if (hitStop % 3 === 0) update3D();
            } else {
                update3D();
            }
        }
        render3D();
        updateHUD3D();
    } else {
        if (state === 'playing') {
            if (hitStop > 0) {
                // Slow motion after fatal collision: update at 1/3 speed
                hitStop--;
                if (hitStop % 3 === 0) updateBike();
            } else {
                updateBike();
            }
        }
        renderBike();
    }
    requestAnimationFrame(gameLoop);
}
