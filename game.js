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
                x: px + pw / 2 - 5, y: nextPlatformY - 16,
                w: 10, h: 8, collected: false, animTimer: Math.random() * 100
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

// ── Draw chain-link inverted S decoration ──
// Draws an inverted S shape made of solid chain links on the wall
function drawChainS(bx, by, flipped) {
    const c = PAL.chain;
    const s = PAL.chainShadow;
    // Each "link" is a 2x2 block with a shadow pixel
    // Inverted S shape (mirrored S): curves right at top, left at bottom
    //  Pattern (8 wide x 14 tall):
    //   ##__##    top-right curve
    //   ####      connects
    //   ##        left column
    //     ##      middle
    //       ##    right column
    //   ####      connects
    //   ##__##    bottom-left curve (inverted)

    const links = flipped ? [
        [0,0],[2,0],[4,0],         // top row
        [0,2],[2,2],               // second row curves left
        [0,4],                     // descend left
        [0,6],[2,6],               // cross middle
        [4,6],                     // go right
        [4,8],[2,8],               // curve back
        [0,10],[2,10],[4,10],      // bottom row
    ] : [
        [0,0],[2,0],[4,0],         // top row
        [4,2],[2,2],               // second row curves right
        [4,4],                     // descend right
        [4,6],[2,6],               // cross middle
        [0,6],                     // go left
        [0,8],[2,8],               // curve back
        [0,10],[2,10],[4,10],      // bottom row
    ];

    for (const [lx, ly] of links) {
        drawRect(bx + lx, by + ly, 2, 2, c);
        // Shadow on bottom-right of each link
        drawPixel(bx + lx + 1, by + ly + 1, s);
    }
}

// ── Draw tower background ──
function drawBackground(camY) {
    // Dark gradient sky
    bctx.fillStyle = PAL.bg1;
    bctx.fillRect(0, 0, W, H);

    // Light blue walls on sides
    const wallW = 12;
    const tileH = 8;
    const tileW = 6;
    const offsetY = (camY * 0.3) % tileH;

    for (let side = 0; side < 2; side++) {
        const baseX = side === 0 ? 0 : W - wallW;

        // Fill wall with light blue base
        bctx.fillStyle = PAL.wall1;
        bctx.fillRect(baseX, 0, wallW, H);

        // Tile pattern for texture
        for (let row = -1; row < H / tileH + 2; row++) {
            const ty = row * tileH + offsetY;
            const stagger = (row % 2) * 3;
            for (let col = 0; col < Math.ceil(wallW / tileW) + 1; col++) {
                const tx = baseX + col * tileW + stagger;
                const c = (row + col) % 3 === 0 ? PAL.wall2 : PAL.wall1;
                drawRect(tx, ty, tileW - 1, tileH - 1, c);
                // Light highlight on top edge
                drawRect(tx, ty, tileW - 1, 1, PAL.wallHi);
                // Subtle darker bottom edge
                drawRect(tx, ty + tileH - 2, tileW - 1, 1, PAL.wallDk);
            }
        }
    }

    // Chain-link inverted S decorations on walls (repeating pattern)
    const chainPatternH = 20;  // vertical repeat distance
    const chainOffsetY = ((camY * 0.3) % chainPatternH + chainPatternH) % chainPatternH;

    for (let row = -2; row < H / chainPatternH + 2; row++) {
        const cy = row * chainPatternH + chainOffsetY;
        // Left wall: chain S decoration centered
        drawChainS(2, cy, false);
        // Right wall: mirrored chain S decoration
        drawChainS(W - 10, cy, true);
    }

    // Subtle tower interior gradient (dark edges for depth)
    const grad = bctx.createLinearGradient(wallW, 0, W - wallW, 0);
    grad.addColorStop(0, 'rgba(10,10,30,0.25)');
    grad.addColorStop(0.5, 'rgba(10,10,30,0)');
    grad.addColorStop(1, 'rgba(10,10,30,0.25)');
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

// ── Draw chocolate bar ──
function drawCoin(c, camY) {
    if (c.collected) return;
    const sy = c.y - camY;
    const bob = Math.sin(c.animTimer * 0.08) * 2;
    const x = Math.round(c.x);
    const y = Math.round(sy + bob);

    // Gold foil wrapper (peeled back at top-right)
    // Back foil layer (gold, slightly visible behind bar)
    drawRect(x, y, 10, 8, '#c8a420');       // base gold foil
    drawRect(x, y, 10, 1, '#ddb830');       // foil top highlight
    drawRect(x, y + 7, 10, 1, '#a08018');   // foil bottom shadow
    drawPixel(x, y, '#ddb830');             // corner highlight
    drawPixel(x + 9, y + 7, '#8a6a10');     // corner shadow

    // Foil folded-back flap (top-right, peeled open to reveal chocolate)
    drawRect(x + 7, y - 1, 3, 2, '#ddb830');
    drawPixel(x + 7, y - 1, '#e8cc44');
    drawPixel(x + 9, y, '#c8a420');

    // Chocolate bar body (exposed from wrapper, rich brown)
    drawRect(x + 1, y + 1, 8, 6, '#5c3317');   // dark chocolate base
    drawRect(x + 1, y + 1, 8, 1, '#7a4a2a');   // top edge highlight (light catching)

    // Chocolate bar segments (2x2 grid of squares with grooves)
    // Top-left segment
    drawRect(x + 1, y + 1, 4, 3, '#6b3d20');
    drawPixel(x + 2, y + 2, '#7a4a2a');         // segment highlight
    // Top-right segment
    drawRect(x + 5, y + 1, 4, 3, '#6b3d20');
    drawPixel(x + 6, y + 2, '#7a4a2a');         // segment highlight
    // Bottom-left segment
    drawRect(x + 1, y + 4, 4, 3, '#5c3317');
    drawPixel(x + 2, y + 5, '#6b3d20');         // subtle highlight
    // Bottom-right segment
    drawRect(x + 5, y + 4, 4, 3, '#5c3317');
    drawPixel(x + 6, y + 5, '#6b3d20');         // subtle highlight

    // Segment divider grooves (darker lines between segments)
    drawRect(x + 5, y + 1, 1, 6, '#4a2510');    // vertical groove
    drawRect(x + 1, y + 4, 8, 1, '#4a2510');    // horizontal groove

    // Top specular highlights (glossy chocolate look)
    drawPixel(x + 2, y + 1, '#8a5a36');
    drawPixel(x + 3, y + 1, '#8a5a36');
    drawPixel(x + 6, y + 1, '#8a5a36');

    // Wrapper edge detail (gold foil border visible around chocolate)
    drawPixel(x, y + 1, '#ddb830');
    drawPixel(x, y + 6, '#c8a420');
    drawPixel(x + 9, y + 1, '#c8a420');
    drawPixel(x + 9, y + 6, '#a08018');

    // Tiny shimmer animation on foil
    const shimmer = Math.sin(c.animTimer * 0.15) > 0.5;
    if (shimmer) {
        drawPixel(x + 8, y - 1, '#ffe866');
    }
}

// ── Draw hazard (fish) ──
function drawHazard(h, camY) {
    const sy = h.y - camY;
    const x = Math.round(h.x);
    const y = Math.round(sy);
    // Fish body (oval-ish)
    drawRect(x + 2, y, 4, 6, PAL.fishBody);
    drawRect(x + 1, y + 1, 6, 4, PAL.fishBody);
    // Belly (lighter underside)
    drawRect(x + 2, y + 3, 4, 2, PAL.fishBelly);
    drawRect(x + 1, y + 4, 6, 1, PAL.fishBelly);
    // Tail fin (left side)
    drawRect(x - 1, y + 1, 2, 4, PAL.fishTail);
    drawPixel(x - 2, y + 2, PAL.fishTail);
    drawPixel(x - 2, y + 3, PAL.fishTail);
    // Dorsal fin (top)
    drawPixel(x + 4, y - 1, PAL.fishFin);
    drawPixel(x + 5, y - 1, PAL.fishFin);
    drawPixel(x + 5, y, PAL.fishFin);
    // Eye
    drawPixel(x + 5, y + 2, PAL.fishEye);
    drawPixel(x + 6, y + 2, PAL.fishPupil);
    // Mouth
    drawPixel(x + 7, y + 3, PAL.fishBody);
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
            spawnParticles(c.x + 3, c.y + 3, PAL.choco, 8, 3);
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
