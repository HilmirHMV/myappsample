// ── Tower Ascent ── 8-bit procedural platformer ──

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('ui-overlay');

// ── Constants ──
const SCALE = 3;
const W = 192;               // native resolution width
const H = 256;               // native resolution height
const TILE = 8;
const COLS = W / TILE;        // 24
const GRAVITY = 0.22;
const JUMP_FORCE = -4.2;
const MOVE_SPEED = 1.4;
const WALL_JUMP_FORCE_X = 2.8;
const WALL_JUMP_FORCE_Y = -3.8;
const COYOTE_TIME = 6;
const JUMP_BUFFER = 6;

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
let camera = { y: 0 };
let score = 0;
let highScore = parseInt(localStorage.getItem('towerHighScore') || '0');
let particles = [];
let screenShake = 0;
let platforms = [];
let hazards = [];
let coins = [];
let deathY = 0;
let floorHeight = 0;

// ── Procedural generation ──
let nextPlatformY = 0;
const PLATFORM_GAP_MIN = 28;
const PLATFORM_GAP_MAX = 48;
const seededRandom = (function() {
    let seed = 42;
    return function(s) {
        if (s !== undefined) seed = s;
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return (seed >>> 0) / 0xffffffff;
    };
})();

// ── Player ──
const player = {
    x: W / 2 - 4, y: 0, vx: 0, vy: 0,
    w: 8, h: 12,
    grounded: false, wallSliding: false, wallDir: 0,
    coyoteTimer: 0, jumpBufferTimer: 0,
    facing: 1, animFrame: 0, animTimer: 0,
    alive: true, deathTimer: 0
};

// ── Input ──
const keys = {};
let touchLeft = false, touchRight = false, touchJump = false;

document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Enter' || e.code === 'Space') {
        if (state === 'title' || state === 'dead') startGame();
    }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
        const rect = canvas.getBoundingClientRect();
        const x = t.clientX - rect.left;
        if (state === 'title' || state === 'dead') { startGame(); return; }
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

// ── Color palette (8-bit style) ──
const PAL = {
    bg1: '#0a0a2e', bg2: '#0f0f3a', bg3: '#161650',
    brick1: '#4a3a2a', brick2: '#5c4a38', brick3: '#3a2a1a',
    brickHi: '#6e5a46',
    platform: '#6a8a5a', platformHi: '#8ab87a', platformDk: '#4a6a3a',
    spike: '#cc3333',
    coin: '#ffcc00', coinHi: '#ffee66',
    hair: '#dd3322', hairHi: '#ff5544',
    skin: '#ffcc99', skinDk: '#dd9966',
    shirt: '#2a2a3a', shirtHi: '#3a3a4e',
    pants: '#1a1a28', pantsDk: '#111120',
    shoe: '#eeeeee', shoeDk: '#bbbbbb',
    white: '#ffffff', black: '#000000',
    red: '#ff4444', green: '#44ff44'
};

// ── Platform generation ──
function generatePlatformsUpTo(targetY) {
    while (nextPlatformY > targetY - H) {
        const gap = rng(PLATFORM_GAP_MIN, PLATFORM_GAP_MAX);
        nextPlatformY -= gap;

        const pw = rngInt(4, 8) * TILE;
        const px = rngInt(1, COLS - pw / TILE - 1) * TILE;

        const type = seededRandom() < 0.15 ? 'moving' : 'static';
        const plat = {
            x: px, y: nextPlatformY, w: pw, h: TILE,
            type,
            moveSpeed: type === 'moving' ? rng(0.3, 0.8) * (seededRandom() < 0.5 ? 1 : -1) : 0,
            moveRange: type === 'moving' ? rng(20, 50) : 0,
            originX: px
        };
        platforms.push(plat);

        // Occasional coin above platform
        if (seededRandom() < 0.4) {
            coins.push({
                x: px + pw / 2 - 3, y: nextPlatformY - 14,
                w: 6, h: 6, collected: false, animTimer: Math.random() * 100
            });
        }

        // Occasional spike hazard
        if (seededRandom() < 0.12 && platforms.length > 5) {
            const sx = rngInt(1, COLS - 2) * TILE;
            hazards.push({ x: sx, y: nextPlatformY + 2, w: TILE, h: 6 });
        }
    }
}

function cleanupBelow(bottomY) {
    platforms = platforms.filter(p => p.y < bottomY + H);
    coins = coins.filter(c => c.y < bottomY + H);
    hazards = hazards.filter(h => h.y < bottomY + H);
}

// ── Start / Reset ──
function startGame() {
    state = 'playing';
    overlay.classList.add('hidden');
    seededRandom(Date.now() & 0xffffff);
    platforms = [];
    hazards = [];
    coins = [];
    particles = [];
    score = 0;
    screenShake = 0;
    nextPlatformY = H - TILE * 3;

    // Ground floor
    floorHeight = H - TILE;
    platforms.push({ x: 0, y: floorHeight, w: W, h: TILE, type: 'static', moveSpeed: 0, moveRange: 0, originX: 0 });

    // Starting platforms
    generatePlatformsUpTo(-H * 2);

    player.x = W / 2 - 4;
    player.y = floorHeight - player.h;
    player.vx = 0; player.vy = 0;
    player.grounded = false; player.wallSliding = false;
    player.alive = true; player.deathTimer = 0;
    player.facing = 1; player.coyoteTimer = 0; player.jumpBufferTimer = 0;

    camera.y = player.y - H / 2;
    deathY = camera.y + H + 40;
}

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

// ── Drawing primitives (pixel art) ──
function drawRect(x, y, w, h, color) {
    bctx.fillStyle = color;
    bctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function drawPixel(x, y, color) {
    bctx.fillStyle = color;
    bctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

// ── Draw character (8-bit pixel art) ──
function drawPlayer(px, py) {
    const f = player.facing;
    const frame = player.animFrame;
    const x = Math.round(px);
    const y = Math.round(py);

    // Hair (red, messy top)
    drawRect(x + 1, y, 6, 3, PAL.hair);
    drawRect(x, y + 1, 8, 2, PAL.hair);
    // Hair highlight
    drawPixel(x + 2, y, PAL.hairHi);
    drawPixel(x + 4, y, PAL.hairHi);
    // Hair strands on sides
    drawPixel(f > 0 ? x + 7 : x, y + 1, PAL.hair);

    // Face / skin
    drawRect(x + 1, y + 3, 6, 3, PAL.skin);
    // Eyes
    const eyeX = f > 0 ? x + 4 : x + 2;
    drawPixel(eyeX, y + 4, PAL.black);
    drawPixel(eyeX + 2, y + 4, PAL.black);

    // Shirt (dark casual)
    drawRect(x + 1, y + 6, 6, 3, PAL.shirt);
    drawRect(x, y + 7, 8, 2, PAL.shirt);
    // Shirt highlight
    drawPixel(x + 2, y + 6, PAL.shirtHi);

    // Arms
    if (frame === 1) {
        drawRect(x - 1, y + 7, 1, 2, PAL.skin);
        drawRect(x + 8, y + 6, 1, 2, PAL.skin);
    } else {
        drawRect(x - 1, y + 7, 1, 2, PAL.skin);
        drawRect(x + 8, y + 7, 1, 2, PAL.skin);
    }

    // Pants (dark)
    drawRect(x + 1, y + 9, 3, 2, PAL.pants);
    drawRect(x + 4, y + 9, 3, 2, PAL.pants);

    // Legs walking animation
    if (frame === 1 && player.grounded) {
        drawRect(x + 1, y + 9, 3, 2, PAL.pants);
        drawRect(x + 5, y + 9, 2, 1, PAL.pants);
    }

    // White tennis shoes
    if (frame === 0 || !player.grounded) {
        drawRect(x + 1, y + 11, 3, 1, PAL.shoe);
        drawRect(x + 4, y + 11, 3, 1, PAL.shoe);
        // Shoe detail
        drawPixel(x + 1, y + 11, PAL.shoeDk);
        drawPixel(x + 4, y + 11, PAL.shoeDk);
    } else {
        // Walking frame
        drawRect(x, y + 11, 3, 1, PAL.shoe);
        drawRect(x + 5, y + 11, 3, 1, PAL.shoe);
        drawPixel(x, y + 11, PAL.shoeDk);
        drawPixel(x + 5, y + 11, PAL.shoeDk);
    }

    // Wall slide effect
    if (player.wallSliding) {
        spawnParticles(player.wallDir > 0 ? px + 8 : px, py + 6, '#aaa', 1, 1);
    }
}

// ── Draw tower background ──
function drawBackground(camY) {
    // Dark gradient sky
    bctx.fillStyle = PAL.bg1;
    bctx.fillRect(0, 0, W, H);

    // Parallax brick walls on sides
    const wallW = 12;
    const brickH = 8;
    const brickW = 6;
    const offsetY = (camY * 0.3) % brickH;

    for (let side = 0; side < 2; side++) {
        const baseX = side === 0 ? 0 : W - wallW;
        for (let row = -1; row < H / brickH + 1; row++) {
            const by = row * brickH + offsetY;
            const stagger = (row % 2) * 3;
            for (let col = 0; col < Math.ceil(wallW / brickW) + 1; col++) {
                const bx = baseX + col * brickW + stagger;
                const c = (row + col) % 3 === 0 ? PAL.brick2 : PAL.brick1;
                drawRect(bx, by, brickW - 1, brickH - 1, c);
                // Brick highlight (top edge)
                drawRect(bx, by, brickW - 1, 1, PAL.brickHi);
            }
        }
    }

    // Background details - distant windows
    const winOffsetY = (camY * 0.15) % 40;
    for (let wy = -1; wy < H / 40 + 1; wy++) {
        const winY = wy * 40 + winOffsetY;
        // Left wall window
        drawRect(3, winY + 10, 4, 6, '#1a1a3a');
        drawPixel(4, winY + 11, '#334');
        // Right wall window
        drawRect(W - 8, winY + 25, 4, 6, '#1a1a3a');
        drawPixel(W - 7, winY + 26, '#334');
    }

    // Subtle tower interior gradient
    const grad = bctx.createLinearGradient(wallW, 0, W - wallW, 0);
    grad.addColorStop(0, 'rgba(10,10,30,0.3)');
    grad.addColorStop(0.5, 'rgba(10,10,30,0)');
    grad.addColorStop(1, 'rgba(10,10,30,0.3)');
    bctx.fillStyle = grad;
    bctx.fillRect(wallW, 0, W - wallW * 2, H);
}

// ── Draw platform ──
function drawPlatform(p, camY) {
    const sy = p.y - camY;
    const tiles = p.w / TILE;
    for (let i = 0; i < tiles; i++) {
        const tx = p.x + i * TILE;
        drawRect(tx, sy, TILE, TILE, PAL.platform);
        // Top highlight
        drawRect(tx, sy, TILE, 1, PAL.platformHi);
        // Bottom shadow
        drawRect(tx, sy + TILE - 1, TILE, 1, PAL.platformDk);
        // Side edges
        if (i === 0) drawRect(tx, sy, 1, TILE, PAL.platformDk);
        if (i === tiles - 1) drawRect(tx + TILE - 1, sy, 1, TILE, PAL.platformDk);
        // Interior pixel detail
        drawPixel(tx + 2, sy + 3, PAL.platformDk);
        drawPixel(tx + 5, sy + 5, PAL.platformDk);
    }
}

// ── Draw coin ──
function drawCoin(c, camY) {
    if (c.collected) return;
    const sy = c.y - camY;
    const bob = Math.sin(c.animTimer * 0.08) * 2;
    drawRect(c.x + 1, sy + bob, 4, 6, PAL.coin);
    drawRect(c.x, sy + bob + 1, 6, 4, PAL.coin);
    drawPixel(c.x + 1, sy + bob + 1, PAL.coinHi);
    drawPixel(c.x + 2, sy + bob, PAL.coinHi);
}

// ── Draw hazard (spike) ──
function drawHazard(h, camY) {
    const sy = h.y - camY;
    // Triangle spike
    bctx.fillStyle = PAL.spike;
    bctx.beginPath();
    bctx.moveTo(h.x, sy + h.h);
    bctx.lineTo(h.x + h.w / 2, sy);
    bctx.lineTo(h.x + h.w, sy + h.h);
    bctx.fill();
}

// ── Draw HUD ──
function drawHUD() {
    // Score
    bctx.fillStyle = '#fff';
    bctx.font = '8px monospace';
    bctx.textAlign = 'left';
    bctx.fillText('HEIGHT: ' + score, 14, 10);
    bctx.textAlign = 'right';
    bctx.fillText('BEST: ' + highScore, W - 14, 10);
    bctx.textAlign = 'left';

    // Height meter bar
    const meterH = 40;
    drawRect(W - 8, 16, 4, meterH, '#222');
    const fill = clamp(score / 500, 0, 1);
    const fillH = Math.floor(fill * meterH);
    drawRect(W - 8, 16 + meterH - fillH, 4, fillH, PAL.green);
}

// ── Physics / Update ──
function inputDir() {
    let dx = 0;
    if (keys['ArrowLeft'] || keys['KeyA'] || touchLeft) dx -= 1;
    if (keys['ArrowRight'] || keys['KeyD'] || touchRight) dx += 1;
    return dx;
}
function jumpPressed() {
    return keys['ArrowUp'] || keys['KeyW'] || keys['Space'] || touchJump;
}

function update() {
    if (state !== 'playing') return;

    const p = player;
    if (!p.alive) {
        p.deathTimer++;
        if (p.deathTimer > 60) {
            state = 'dead';
            overlay.innerHTML = `
                <h1 style="color:#ff4444">GAME OVER</h1>
                <p>Height: ${score}</p>
                <p>Best: ${highScore}</p>
                <p class="blink" style="margin-top:16px">Press ENTER or tap to retry</p>
            `;
            overlay.classList.remove('hidden');
        }
        return;
    }

    // Input
    const dir = inputDir();
    p.vx = dir * MOVE_SPEED;
    if (dir !== 0) p.facing = dir;

    // Animation
    if (dir !== 0 && p.grounded) {
        p.animTimer++;
        if (p.animTimer > 8) { p.animTimer = 0; p.animFrame = 1 - p.animFrame; }
    } else {
        p.animFrame = 0; p.animTimer = 0;
    }

    // Jump buffering
    if (jumpPressed()) {
        p.jumpBufferTimer = JUMP_BUFFER;
    } else {
        p.jumpBufferTimer = Math.max(0, p.jumpBufferTimer - 1);
    }

    // Coyote time
    if (p.grounded) {
        p.coyoteTimer = COYOTE_TIME;
    } else {
        p.coyoteTimer = Math.max(0, p.coyoteTimer - 1);
    }

    // Jump
    if (p.jumpBufferTimer > 0 && p.coyoteTimer > 0) {
        p.vy = JUMP_FORCE;
        p.coyoteTimer = 0;
        p.jumpBufferTimer = 0;
        p.grounded = false;
        spawnParticles(p.x + 4, p.y + p.h, '#fff', 4, 2);
    }

    // Wall jump
    if (p.jumpBufferTimer > 0 && p.wallSliding && !p.grounded) {
        p.vy = WALL_JUMP_FORCE_Y;
        p.vx = -p.wallDir * WALL_JUMP_FORCE_X;
        p.facing = -p.wallDir;
        p.jumpBufferTimer = 0;
        p.wallSliding = false;
        spawnParticles(p.x + (p.wallDir > 0 ? 8 : 0), p.y + 4, '#ddd', 5, 2);
    }

    // Variable jump height
    if (!jumpPressed() && p.vy < -1) {
        p.vy *= 0.85;
    }

    // Gravity
    p.vy += GRAVITY;
    if (p.wallSliding && p.vy > 0.8) p.vy = 0.8; // Slow wall slide

    // Move X
    p.x += p.vx;

    // Wall collision (tower sides)
    const wallLeft = 12;
    const wallRight = W - 12 - p.w;
    p.wallSliding = false;
    p.wallDir = 0;
    if (p.x < wallLeft) {
        p.x = wallLeft;
        if (!p.grounded && p.vy > 0 && dir < 0) {
            p.wallSliding = true; p.wallDir = -1;
        }
    }
    if (p.x > wallRight) {
        p.x = wallRight;
        if (!p.grounded && p.vy > 0 && dir > 0) {
            p.wallSliding = true; p.wallDir = 1;
        }
    }

    // Move Y
    p.y += p.vy;
    p.grounded = false;

    // Platform collision
    for (const plat of platforms) {
        // Update moving platforms
        if (plat.type === 'moving') {
            plat.x = plat.originX + Math.sin(Date.now() * 0.002 * Math.abs(plat.moveSpeed)) * plat.moveRange;
            plat.x = clamp(plat.x, 12, W - 12 - plat.w);
        }

        // Only check collision from above
        if (p.vy >= 0 &&
            p.x + p.w > plat.x && p.x < plat.x + plat.w &&
            p.y + p.h > plat.y && p.y + p.h < plat.y + plat.h + p.vy + 2) {
            p.y = plat.y - p.h;
            p.vy = 0;
            p.grounded = true;

            // Ride moving platform
            if (plat.type === 'moving') {
                const prevX = plat.x;
                const newX = plat.originX + Math.sin((Date.now() + 16) * 0.002 * Math.abs(plat.moveSpeed)) * plat.moveRange;
                p.x += (newX - prevX) * 0.5;
            }
        }
    }

    // Coin collection
    for (const c of coins) {
        if (!c.collected && aabb(p, c)) {
            c.collected = true;
            score += 25;
            spawnParticles(c.x + 3, c.y + 3, PAL.coin, 8, 3);
        }
    }

    // Hazard collision
    for (const h of hazards) {
        if (aabb(p, h)) {
            killPlayer();
            return;
        }
    }

    // Camera follows player upward
    const targetCamY = p.y - H * 0.4;
    if (targetCamY < camera.y) {
        camera.y = lerp(camera.y, targetCamY, 0.1);
    }

    // Score = height climbed
    const heightScore = Math.max(0, Math.floor((floorHeight - p.y) / 4));
    if (heightScore > score) score = heightScore;
    if (score > highScore) { highScore = score; localStorage.setItem('towerHighScore', highScore); }

    // Death from falling below camera
    deathY = camera.y + H + 20;
    if (p.y > deathY) {
        killPlayer();
    }

    // Generate more platforms
    generatePlatformsUpTo(camera.y - H);
    cleanupBelow(camera.y + H * 2);

    // Update particles
    particles = particles.filter(pt => {
        pt.x += pt.vx; pt.y += pt.vy;
        pt.vy += 0.08;
        pt.life--;
        return pt.life > 0;
    });

    // Screen shake decay
    if (screenShake > 0) screenShake *= 0.85;
    if (screenShake < 0.5) screenShake = 0;

    // Coin animation
    for (const c of coins) c.animTimer++;
}

function killPlayer() {
    player.alive = false;
    player.deathTimer = 0;
    screenShake = 8;
    spawnParticles(player.x + 4, player.y + 6, PAL.red, 15, 4);
    spawnParticles(player.x + 4, player.y + 6, PAL.hair, 8, 3);
}

// ── Render ──
function render() {
    bctx.clearRect(0, 0, W, H);

    const camY = camera.y + (screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0);

    // Background
    drawBackground(camY);

    // Platforms
    for (const p of platforms) drawPlatform(p, camY);

    // Hazards
    for (const h of hazards) drawHazard(h, camY);

    // Coins
    for (const c of coins) drawCoin(c, camY);

    // Particles
    for (const pt of particles) {
        const alpha = pt.life / pt.maxLife;
        bctx.globalAlpha = alpha;
        drawRect(pt.x, pt.y - camY, pt.size, pt.size, pt.color);
    }
    bctx.globalAlpha = 1;

    // Player
    if (player.alive) {
        drawPlayer(player.x, player.y - camY);
    } else if (player.deathTimer < 30) {
        // Death flash
        if (player.deathTimer % 4 < 2) {
            drawPlayer(player.x, player.y - camY);
        }
    }

    // HUD
    if (state === 'playing') drawHUD();

    // Death line indicator (subtle)
    if (state === 'playing') {
        const dly = deathY - camY;
        if (dly < H + 10 && dly > H - 30) {
            bctx.fillStyle = 'rgba(255,50,50,0.15)';
            bctx.fillRect(0, dly, W, H - dly + 10);
        }
    }

    // Blit to main canvas (scaled up)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0, W, H, 0, 0, canvas.width, canvas.height);
}

// ── Game loop ──
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();
