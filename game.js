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
let gameMode = 'tower'; // 'tower' | 'bike'
let state = 'title'; // title | modeselect | playing | dead
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
let towerLevel = 0;
let levelFlash = 0;

// ── Level color themes ── each level shifts the tower's look ──
const LEVEL_THEMES = [
    { bg: '#0a0a2e', wall1: '#7bc8f0', wall2: '#8ed4f8', wallDk: '#5aaadd', wallHi: '#a8e0ff', chain: '#ffffff', chainSh: '#d0e8f4', platCol: '#6a8a5a', platHi: '#8ab87a', platDk: '#4a6a3a', name: 'ICE TOWER' },
    { bg: '#1a0a2e', wall1: '#c88af0', wall2: '#d8a4f8', wallDk: '#a06add', wallHi: '#e8c0ff', chain: '#ffe8ff', chainSh: '#d8b0e8', platCol: '#8a6a8a', platHi: '#b88ab8', platDk: '#6a4a6a', name: 'PURPLE SPIRE' },
    { bg: '#2e1a0a', wall1: '#f0b868', wall2: '#f8cc88', wallDk: '#d09040', wallHi: '#ffe0a8', chain: '#ffffff', chainSh: '#f0d8b0', platCol: '#8a7a5a', platHi: '#b8a87a', platDk: '#6a5a3a', name: 'GOLDEN KEEP' },
    { bg: '#0a2e1a', wall1: '#68d888', wall2: '#88e8a8', wallDk: '#40b060', wallHi: '#a8ffc8', chain: '#e8ffe8', chainSh: '#b0e8c0', platCol: '#5a8a6a', platHi: '#7ab88a', platDk: '#3a6a4a', name: 'EMERALD SHAFT' },
    { bg: '#2e0a0a', wall1: '#f07868', wall2: '#f89888', wallDk: '#d05040', wallHi: '#ffc0a8', chain: '#ffe8e0', chainSh: '#e8c0b0', platCol: '#8a5a5a', platHi: '#b87a7a', platDk: '#6a3a3a', name: 'CRIMSON PILLAR' },
    { bg: '#0a1a2e', wall1: '#68a8f0', wall2: '#88c0f8', wallDk: '#4080d0', wallHi: '#a8d8ff', chain: '#e0f0ff', chainSh: '#b0d0e8', platCol: '#5a6a8a', platHi: '#7a8ab8', platDk: '#3a4a6a', name: 'AZURE ASCENT' },
    { bg: '#2e2e0a', wall1: '#e0e068', wall2: '#e8e888', wallDk: '#c0c040', wallHi: '#ffffa8', chain: '#fffff0', chainSh: '#e8e8b0', platCol: '#7a8a5a', platHi: '#a8b87a', platDk: '#5a6a3a', name: 'SOLAR PINNACLE' },
];

function getCurrentTheme() {
    return LEVEL_THEMES[towerLevel % LEVEL_THEMES.length];
}

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
    alive: true, deathTimer: 0,
    hasDoubleJump: true, usedWallJump: false,
    jumpHeld: false
};

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
    // Only handle dead state clicks; title needs mode selection via keys
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

        // Occasional fish hazard with varied movement patterns
        if (seededRandom() < 0.12 && platforms.length > 5) {
            const sx = rngInt(3, COLS - 4) * TILE;
            const sy = nextPlatformY + 2;
            const patterns = ['sine', 'circle', 'dash', 'zigzag', 'figure8'];
            const pattern = patterns[Math.floor(seededRandom() * patterns.length)];
            hazards.push({
                x: sx, y: sy, w: 10, h: 6,
                originX: sx, originY: sy,
                pattern,
                speed: rng(0.3, 0.8),
                range: rng(20, 50),
                timer: rng(0, 100),
                dashDir: seededRandom() < 0.5 ? 1 : -1,
                dashCooldown: 0,
                prevX: sx
            });
        }
    }
}

function cleanupBelow(bottomY) {
    platforms = platforms.filter(p => p.y < bottomY + H);
    coins = coins.filter(c => c.y < bottomY + H);
    hazards = hazards.filter(h => h.y < bottomY + H);
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

// ── Bike mode state ──
let bike = {
    x: W / 2 - 5, y: H - 40, lane: 1,
    w: 10, h: 14, alive: true, deathTimer: 0,
    tilt: 0, pedalFrame: 0, pedalTimer: 0
};
let bikeSpeed = 1.0;
let bikeScroll = 0;
let bikeObstacles = [];
let bikeFish = [];
let bikeChocolates = [];
let bikeNextSpawn = 0;
let bikeFishTimer = 0;
let bikeChocoTimer = 0;
let bikeHighScore = parseInt(localStorage.getItem('bikeHighScore') || '0');
let bikeLanes = []; // lane x-centers calculated from road width

// ── Start / Reset ──
function startGame() {
    state = 'playing';
    overlay.classList.add('hidden');
    seededRandom(Date.now() & 0xffffff);
    particles = [];
    score = 0;
    screenShake = 0;

    if (gameMode === 'tower') {
        startTowerMode();
    } else {
        startBikeMode();
    }
}

function startTowerMode() {
    platforms = [];
    hazards = [];
    coins = [];
    towerLevel = 0;
    levelFlash = 0;
    nextPlatformY = H - TILE * 3;

    floorHeight = H - TILE;
    platforms.push({ x: 0, y: floorHeight, w: W, h: TILE, type: 'static', moveSpeed: 0, moveRange: 0, originX: 0 });
    generatePlatformsUpTo(-H * 2);

    player.x = W / 2 - 4;
    player.y = floorHeight - player.h;
    player.vx = 0; player.vy = 0;
    player.grounded = false; player.wallSliding = false;
    player.alive = true; player.deathTimer = 0;
    player.facing = 1; player.coyoteTimer = 0; player.jumpBufferTimer = 0;
    player.hasDoubleJump = true; player.usedWallJump = false;

    camera.y = player.y - H / 2;
    deathY = camera.y + H + 40;
}

function startBikeMode() {
    // 4 lanes on the road
    const roadLeft = 32;
    const roadRight = W - 32;
    const roadW = roadRight - roadLeft;
    const laneW = roadW / 4;
    bikeLanes = [];
    for (let i = 0; i < 4; i++) {
        bikeLanes.push(roadLeft + laneW * i + laneW / 2);
    }

    bike.lane = 1;
    bike.x = bikeLanes[1] - 5;
    bike.y = H - 40;
    bike.alive = true;
    bike.deathTimer = 0;
    bike.tilt = 0;
    bike.pedalFrame = 0;
    bike.pedalTimer = 0;
    bikeSpeed = 1.0;
    bikeScroll = 0;
    bikeObstacles = [];
    bikeFish = [];
    bikeChocolates = [];
    bikeNextSpawn = 60;
    bikeFishTimer = 120;
    bikeChocoTimer = 80;
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
    const theme = getCurrentTheme();

    // Dark gradient sky (themed)
    bctx.fillStyle = theme.bg;
    bctx.fillRect(0, 0, W, H);

    // Themed walls on sides
    const wallW = 12;
    const tileH = 8;
    const tileW = 6;
    const offsetY = (camY * 0.3) % tileH;

    for (let side = 0; side < 2; side++) {
        const baseX = side === 0 ? 0 : W - wallW;

        // Fill wall with themed base
        bctx.fillStyle = theme.wall1;
        bctx.fillRect(baseX, 0, wallW, H);

        // Tile pattern for texture
        for (let row = -1; row < H / tileH + 2; row++) {
            const ty = row * tileH + offsetY;
            const stagger = (row % 2) * 3;
            for (let col = 0; col < Math.ceil(wallW / tileW) + 1; col++) {
                const tx = baseX + col * tileW + stagger;
                const c = (row + col) % 3 === 0 ? theme.wall2 : theme.wall1;
                drawRect(tx, ty, tileW - 1, tileH - 1, c);
                drawRect(tx, ty, tileW - 1, 1, theme.wallHi);
                drawRect(tx, ty + tileH - 2, tileW - 1, 1, theme.wallDk);
            }
        }
    }

    // Chain-link inverted S decorations (themed color)
    const chainPatternH = 20;
    const chainOffsetY = ((camY * 0.3) % chainPatternH + chainPatternH) % chainPatternH;
    // Temporarily override chain colors to theme
    const origChain = PAL.chain;
    const origChainShadow = PAL.chainShadow;
    PAL.chain = theme.chain;
    PAL.chainShadow = theme.chainSh;

    for (let row = -2; row < H / chainPatternH + 2; row++) {
        const cy = row * chainPatternH + chainOffsetY;
        drawChainS(2, cy, false);
        drawChainS(W - 10, cy, true);
    }

    PAL.chain = origChain;
    PAL.chainShadow = origChainShadow;

    // Subtle tower interior gradient
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
    const theme = getCurrentTheme();
    for (let i = 0; i < tiles; i++) {
        const tx = p.x + i * TILE;
        drawRect(tx, sy, TILE, TILE, theme.platCol);
        drawRect(tx, sy, TILE, 1, theme.platHi);
        drawRect(tx, sy + TILE - 1, TILE, 1, theme.platDk);
        if (i === 0) drawRect(tx, sy, 1, TILE, theme.platDk);
        if (i === tiles - 1) drawRect(tx + TILE - 1, sy, 1, TILE, theme.platDk);
        drawPixel(tx + 2, sy + 3, theme.platDk);
        drawPixel(tx + 5, sy + 5, theme.platDk);
    }
}

// ── Draw chocolate bar ──
function drawCoin(c, camY) {
    if (c.collected) return;
    const sy = c.y - camY;
    const bob = Math.sin(c.animTimer * 0.08) * 2;
    const x = Math.round(c.x);
    const y = Math.round(sy + bob);

    // Bare chocolate bar — rich brown with segments and glossy sheen
    // Outer edge (slightly darker border, gives shape)
    drawRect(x, y, 10, 8, '#3a1a08');

    // Main chocolate body
    drawRect(x + 1, y + 1, 8, 6, '#5c3317');

    // 2x3 segment grid (3 columns, 2 rows)
    // Row 1 segments
    drawRect(x + 1, y + 1, 2, 3, '#6b3d20');
    drawRect(x + 4, y + 1, 2, 3, '#6b3d20');
    drawRect(x + 7, y + 1, 2, 3, '#6b3d20');
    // Row 2 segments (slightly darker = depth)
    drawRect(x + 1, y + 4, 2, 3, '#5c3317');
    drawRect(x + 4, y + 4, 2, 3, '#5c3317');
    drawRect(x + 7, y + 4, 2, 3, '#5c3317');

    // Groove lines between segments (deep dark)
    drawRect(x + 3, y + 1, 1, 6, '#2e0e04');   // vertical groove 1
    drawRect(x + 6, y + 1, 1, 6, '#2e0e04');   // vertical groove 2
    drawRect(x + 1, y + 4, 8, 1, '#2e0e04');   // horizontal groove

    // Top specular highlight (glossy chocolate sheen)
    drawPixel(x + 1, y + 1, '#8a5a36');
    drawPixel(x + 2, y + 1, '#8a5a36');
    drawPixel(x + 4, y + 1, '#8a5a36');
    drawPixel(x + 5, y + 1, '#8a5a36');
    drawPixel(x + 7, y + 1, '#8a5a36');
    drawPixel(x + 8, y + 1, '#8a5a36');

    // Bottom edge shadow on each segment
    drawPixel(x + 1, y + 6, '#3a1a08');
    drawPixel(x + 4, y + 6, '#3a1a08');
    drawPixel(x + 7, y + 6, '#3a1a08');

    // Subtle animated glint
    const glint = Math.floor(c.animTimer * 0.1) % 3;
    drawPixel(x + 1 + glint * 3, y + 1, '#aa7a56');
}

// ── Draw hazard (fish) ──
function drawHazard(h, camY) {
    const sy = h.y - camY;
    const x = Math.round(h.x);
    const y = Math.round(sy);
    // Determine facing direction from actual movement delta
    const facingRight = h.x >= h.prevX;
    // Tail wag animation (faster during dash)
    const wagSpeed = h.pattern === 'dash' && h.dashCooldown > 0 ? 8 : 3;
    const tailWag = Math.sin(h.timer * wagSpeed) > 0 ? 1 : 0;

    if (facingRight) {
        // Fish facing right
        drawRect(x + 2, y, 6, 6, PAL.fishBody);
        drawRect(x + 1, y + 1, 8, 4, PAL.fishBody);
        // Belly
        drawRect(x + 2, y + 3, 6, 2, PAL.fishBelly);
        drawRect(x + 1, y + 4, 8, 1, PAL.fishBelly);
        // Tail fin (left side)
        drawRect(x - 1, y + 1 + tailWag, 2, 3, PAL.fishTail);
        drawPixel(x - 2, y + 2 + tailWag, PAL.fishTail);
        // Dorsal fin
        drawPixel(x + 5, y - 1, PAL.fishFin);
        drawPixel(x + 6, y - 1, PAL.fishFin);
        // Eye
        drawPixel(x + 7, y + 2, PAL.fishEye);
        drawPixel(x + 8, y + 2, PAL.fishPupil);
        // Mouth
        drawPixel(x + 9, y + 3, PAL.fishBody);
    } else {
        // Fish facing left (mirrored)
        drawRect(x + 2, y, 6, 6, PAL.fishBody);
        drawRect(x + 1, y + 1, 8, 4, PAL.fishBody);
        // Belly
        drawRect(x + 2, y + 3, 6, 2, PAL.fishBelly);
        drawRect(x + 1, y + 4, 8, 1, PAL.fishBelly);
        // Tail fin (right side)
        drawRect(x + 9, y + 1 + tailWag, 2, 3, PAL.fishTail);
        drawPixel(x + 11, y + 2 + tailWag, PAL.fishTail);
        // Dorsal fin
        drawPixel(x + 3, y - 1, PAL.fishFin);
        drawPixel(x + 4, y - 1, PAL.fishFin);
        // Eye
        drawPixel(x + 2, y + 2, PAL.fishEye);
        drawPixel(x + 1, y + 2, PAL.fishPupil);
        // Mouth
        drawPixel(x, y + 3, PAL.fishBody);
    }
}

// ── Draw HUD ──
function drawHUD() {
    const theme = getCurrentTheme();
    // Score
    bctx.fillStyle = '#fff';
    bctx.font = '8px monospace';
    bctx.textAlign = 'left';
    bctx.fillText('HEIGHT: ' + score, 14, 10);
    bctx.textAlign = 'right';
    bctx.fillText('BEST: ' + highScore, W - 14, 10);
    bctx.textAlign = 'left';

    // Level name
    bctx.fillStyle = theme.wallHi;
    bctx.textAlign = 'center';
    bctx.fillText('LV' + (towerLevel + 1) + ' ' + theme.name, W / 2, 10);
    bctx.textAlign = 'left';

    // Level progress meter (fills toward next level-up)
    const meterH = 40;
    drawRect(W - 8, 16, 4, meterH, '#222');
    const progressInLevel = (score % 500) / 500;
    const fillH = Math.floor(progressInLevel * meterH);
    drawRect(W - 8, 16 + meterH - fillH, 4, fillH, theme.wallHi);

    // Level-up flash overlay
    if (levelFlash > 0) {
        const alpha = levelFlash / 30;
        bctx.fillStyle = 'rgba(255,255,255,' + (alpha * 0.5) + ')';
        bctx.fillRect(0, 0, W, H);
    }
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
                <p style="font-size:11px;color:#555;margin-top:8px">ESC for mode select</p>
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

    // Track fresh jump presses (must release and re-press for double jump)
    const jp = jumpPressed();
    const freshJumpPress = jp && !p.jumpHeld;
    p.jumpHeld = jp;

    // Jump buffering
    if (freshJumpPress) {
        p.jumpBufferTimer = JUMP_BUFFER;
    } else if (!jp) {
        p.jumpBufferTimer = Math.max(0, p.jumpBufferTimer - 1);
    }

    // Coyote time
    if (p.grounded) {
        p.coyoteTimer = COYOTE_TIME;
    } else {
        p.coyoteTimer = Math.max(0, p.coyoteTimer - 1);
    }

    // Jump (ground / coyote)
    if (p.jumpBufferTimer > 0 && p.coyoteTimer > 0) {
        p.vy = JUMP_FORCE;
        p.coyoteTimer = 0;
        p.jumpBufferTimer = 0;
        p.grounded = false;
        p.hasDoubleJump = true;
        p.usedWallJump = false;
        spawnParticles(p.x + 4, p.y + p.h, '#fff', 4, 2);
    }
    // Wall jump (once per airborne period)
    else if (p.jumpBufferTimer > 0 && p.wallSliding && !p.grounded && !p.usedWallJump) {
        p.vy = WALL_JUMP_FORCE_Y;
        p.vx = -p.wallDir * WALL_JUMP_FORCE_X;
        p.facing = -p.wallDir;
        p.jumpBufferTimer = 0;
        p.wallSliding = false;
        p.usedWallJump = true;
        p.hasDoubleJump = true;
        spawnParticles(p.x + (p.wallDir > 0 ? 8 : 0), p.y + 4, '#ddd', 5, 2);
    }
    // Double jump (requires fresh press while airborne)
    else if (p.jumpBufferTimer > 0 && !p.grounded && p.hasDoubleJump && p.coyoteTimer <= 0) {
        p.vy = JUMP_FORCE * 0.85;
        p.jumpBufferTimer = 0;
        p.hasDoubleJump = false;
        spawnParticles(p.x + 4, p.y + p.h, '#aaf', 6, 2.5);
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
            p.hasDoubleJump = true;
            p.usedWallJump = false;

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

    // Update & collide hazards (swimming fish with varied patterns)
    for (const h of hazards) {
        h.prevX = h.x;
        h.timer += 0.02;
        const t = h.timer * h.speed;

        switch (h.pattern) {
            case 'sine':
                // Classic back-and-forth swim
                h.x = h.originX + Math.sin(t) * h.range;
                h.y = h.originY + Math.sin(t * 2.5) * 4;
                break;
            case 'circle':
                // Swim in a circle/oval
                h.x = h.originX + Math.cos(t) * h.range * 0.7;
                h.y = h.originY + Math.sin(t) * 15;
                break;
            case 'dash':
                // Slow drift then sudden dash in one direction, reverse
                h.dashCooldown -= 0.02;
                if (h.dashCooldown <= 0) {
                    h.x += h.dashDir * 0.3;
                    // Dash when timer triggers
                    if (Math.sin(t * 1.5) > 0.95) {
                        h.dashCooldown = 1.5;
                        h.dashDir *= -1;
                    }
                } else {
                    h.x += h.dashDir * 2.5; // fast dash
                }
                h.y = h.originY + Math.sin(t * 1.8) * 3;
                break;
            case 'zigzag':
                // Sharp diagonal zigzag movement
                const zigPhase = (t * 0.8) % (Math.PI * 2);
                const zigX = zigPhase < Math.PI
                    ? lerp(-h.range, h.range, zigPhase / Math.PI)
                    : lerp(h.range, -h.range, (zigPhase - Math.PI) / Math.PI);
                h.x = h.originX + zigX;
                h.y = h.originY + Math.abs(Math.sin(zigPhase)) * 12 - 6;
                break;
            case 'figure8':
                // Figure-8 / lemniscate pattern
                h.x = h.originX + Math.sin(t) * h.range * 0.8;
                h.y = h.originY + Math.sin(t * 2) * 10;
                break;
        }

        h.x = clamp(h.x, 14, W - 14 - h.w);
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

    // Level-up check: every 500 points advances the tower theme
    const newLevel = Math.floor(score / 500);
    if (newLevel > towerLevel) {
        towerLevel = newLevel;
        levelFlash = 30; // flash frames
        screenShake = 4;
        spawnParticles(W / 2, p.y, '#fff', 20, 5);
        spawnParticles(W / 2, p.y, getCurrentTheme().wall1, 15, 4);
    }

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
    if (levelFlash > 0) levelFlash--;

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

// ══════════════════════════════════════════════
// ── BIKE DASH MODE ──
// ══════════════════════════════════════════════

const ROAD_LEFT = 32;
const ROAD_RIGHT = W - 32;

function spawnCarObstacle() {
    // Pick a lane that doesn't overlap with nearby cars
    const occupiedLanes = new Set();
    for (const ob of bikeObstacles) {
        // Only check cars near the spawn zone (top or bottom)
        if (ob.y < 40 || ob.y > H - 40) {
            occupiedLanes.add(ob.lane);
        }
    }
    const freeLanes = [0, 1, 2, 3].filter(l => !occupiedLanes.has(l));
    if (freeLanes.length === 0) return; // skip spawn if all lanes busy
    const lane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
    const lx = bikeLanes[lane];
    const carColors = ['#cc3333', '#3366cc', '#33aa33', '#cccc33', '#cc66cc', '#ff8833', '#eeeeee'];
    const color = carColors[Math.floor(Math.random() * carColors.length)];
    const goingUp = Math.random() < 0.3;
    bikeObstacles.push({
        x: lx - 6, y: goingUp ? H + 20 : -24,
        w: 12, h: 20,
        vy: goingUp ? -0.8 * bikeSpeed : 1.5 * bikeSpeed,
        color,
        type: 'car',
        lane,
        laneChangeTimer: 0
    });
}

function spawnBikeFish() {
    // Fish swim horizontally across the road
    const fromLeft = Math.random() < 0.5;
    const fy = 20 + Math.random() * (H - 60);
    const patterns = ['straight', 'wave', 'dive'];
    const pat = patterns[Math.floor(Math.random() * patterns.length)];
    bikeFish.push({
        x: fromLeft ? -12 : W + 12,
        y: fy, w: 10, h: 6,
        vx: (fromLeft ? 1 : -1) * (0.6 + Math.random() * 0.8),
        pattern: pat,
        originY: fy,
        timer: 0
    });
}

function spawnBikeChocolate() {
    const lane = Math.floor(Math.random() * 4);
    const lx = bikeLanes[lane];
    bikeChocolates.push({
        x: lx - 5, y: -12,
        w: 10, h: 8,
        vy: 1.2 * bikeSpeed,
        collected: false,
        animTimer: 0
    });
}

function updateBike() {
    if (state !== 'playing') return;
    const b = bike;

    if (!b.alive) {
        b.deathTimer++;
        if (b.deathTimer > 60) {
            state = 'dead';
            if (score > bikeHighScore) { bikeHighScore = score; localStorage.setItem('bikeHighScore', bikeHighScore); }
            overlay.innerHTML = `
                <h1 style="color:#ff4444">WIPEOUT!</h1>
                <p>Distance: ${score}</p>
                <p>Best: ${bikeHighScore}</p>
                <p class="blink" style="margin-top:16px">Press ENTER or tap to retry</p>
                <p style="font-size:11px;color:#555;margin-top:8px">ESC for mode select</p>
            `;
            overlay.classList.remove('hidden');
        }
        return;
    }

    // Input: lane switching (left/right)
    const dir = inputDir();
    if (dir < 0 && !b._movedLeft) {
        b.lane = Math.max(0, b.lane - 1);
        b._movedLeft = true;
    } else if (dir >= 0) { b._movedLeft = false; }
    if (dir > 0 && !b._movedRight) {
        b.lane = Math.min(3, b.lane + 1);
        b._movedRight = true;
    } else if (dir <= 0) { b._movedRight = false; }

    // Input: vertical movement (up/down)
    const goUp = keys['ArrowUp'] || keys['KeyW'];
    const goDown = keys['ArrowDown'] || keys['KeyS'];
    if (goUp) b.y -= 1.5;
    if (goDown) b.y += 1.5;
    // Clamp vertical position
    b.y = clamp(b.y, 16, H - 20);

    // Smooth horizontal movement to target lane
    const targetX = bikeLanes[b.lane] - 5;
    b.x = lerp(b.x, targetX, 0.18);
    b.tilt = (targetX - b.x) * 0.3;

    // Pedal animation
    b.pedalTimer++;
    if (b.pedalTimer > Math.max(3, 10 - bikeSpeed * 2)) {
        b.pedalTimer = 0;
        b.pedalFrame = 1 - b.pedalFrame;
    }

    // Score & speed increase
    bikeScroll += bikeSpeed;
    score = Math.floor(bikeScroll / 8);
    bikeSpeed = 1.0 + score / 300; // gradually accelerate

    // Spawn obstacles
    bikeNextSpawn--;
    if (bikeNextSpawn <= 0) {
        spawnCarObstacle();
        bikeNextSpawn = Math.max(25, 80 - score / 5);
        // Sometimes spawn two cars at once at higher speeds
        if (score > 100 && Math.random() < 0.3) spawnCarObstacle();
    }

    // Spawn fish
    bikeFishTimer--;
    if (bikeFishTimer <= 0) {
        spawnBikeFish();
        bikeFishTimer = Math.max(40, 120 - score / 4);
    }

    // Spawn chocolates
    bikeChocoTimer--;
    if (bikeChocoTimer <= 0) {
        spawnBikeChocolate();
        bikeChocoTimer = Math.max(50, 100 - score / 6);
    }

    // Update cars (with lane-change avoidance)
    for (const ob of bikeObstacles) {
        ob.y += ob.vy;
        ob.laneChangeTimer = Math.max(0, (ob.laneChangeTimer || 0) - 1);

        // Check if another car is ahead in the same lane
        let blocked = false;
        for (const other of bikeObstacles) {
            if (other === ob || other.lane !== ob.lane) continue;
            const dy = other.y - ob.y;
            // "ahead" depends on direction
            if (ob.vy > 0 && dy > 0 && dy < 40) blocked = true;
            if (ob.vy < 0 && dy < 0 && dy > -40) blocked = true;
        }

        if (blocked && ob.laneChangeTimer <= 0) {
            // Try to change lane to avoid
            const tryLanes = [];
            if (ob.lane > 0) tryLanes.push(ob.lane - 1);
            if (ob.lane < 3) tryLanes.push(ob.lane + 1);
            // Pick a free adjacent lane
            for (const nl of tryLanes) {
                let laneFree = true;
                for (const other of bikeObstacles) {
                    if (other === ob || other.lane !== nl) continue;
                    if (Math.abs(other.y - ob.y) < 30) { laneFree = false; break; }
                }
                if (laneFree) {
                    ob.lane = nl;
                    ob.laneChangeTimer = 60; // cooldown
                    break;
                }
            }
        }

        // Smooth horizontal slide to lane position
        const targetX = bikeLanes[ob.lane] - 6;
        ob.x = lerp(ob.x, targetX, 0.08);
    }
    bikeObstacles = bikeObstacles.filter(ob => ob.y > -40 && ob.y < H + 40);

    // Update fish
    for (const f of bikeFish) {
        f.timer += 0.05;
        f.x += f.vx * bikeSpeed;
        switch (f.pattern) {
            case 'wave':
                f.y = f.originY + Math.sin(f.timer * 3) * 15;
                break;
            case 'dive':
                f.y = f.originY + Math.sin(f.timer * 1.5) * 30;
                break;
            default:
                break;
        }
    }
    bikeFish = bikeFish.filter(f => f.x > -20 && f.x < W + 20);

    // Update chocolates
    for (const ch of bikeChocolates) {
        ch.y += ch.vy;
        ch.animTimer++;
    }
    bikeChocolates = bikeChocolates.filter(ch => ch.y < H + 20);

    // Collision with bike
    const bHit = { x: b.x + 1, y: b.y + 2, w: b.w - 2, h: b.h - 2 };

    // Car collision
    for (const ob of bikeObstacles) {
        if (aabb(bHit, ob)) {
            b.alive = false; b.deathTimer = 0;
            screenShake = 10;
            spawnParticles(b.x + 5, b.y + 7, PAL.red, 15, 4);
            spawnParticles(b.x + 5, b.y + 7, '#888', 10, 3);
            return;
        }
    }
    // Fish collision
    for (const f of bikeFish) {
        if (aabb(bHit, f)) {
            b.alive = false; b.deathTimer = 0;
            screenShake = 8;
            spawnParticles(b.x + 5, b.y + 7, PAL.fishBody, 12, 4);
            return;
        }
    }
    // Chocolate collection
    for (const ch of bikeChocolates) {
        if (!ch.collected && aabb(bHit, ch)) {
            ch.collected = true;
            score += 15;
            spawnParticles(ch.x + 5, ch.y + 4, '#5c3317', 8, 3);
        }
    }

    // Particles
    particles = particles.filter(pt => {
        pt.x += pt.vx; pt.y += pt.vy;
        pt.vy += 0.08; pt.life--;
        return pt.life > 0;
    });
    if (screenShake > 0) screenShake *= 0.85;
    if (screenShake < 0.5) screenShake = 0;
}

// ── Bike mode drawing ──

function drawBikeRoad() {
    // Sky
    bctx.fillStyle = '#88bbdd';
    bctx.fillRect(0, 0, W, H);

    // Grass sides
    bctx.fillStyle = '#44aa44';
    bctx.fillRect(0, 0, ROAD_LEFT, H);
    bctx.fillRect(ROAD_RIGHT, 0, W - ROAD_RIGHT, H);

    // Grass texture
    const grassScroll = (bikeScroll * 0.6) % 8;
    for (let gy = -8; gy < H; gy += 8) {
        const ry = gy + grassScroll;
        drawPixel(5, ry, '#3d9a3d');
        drawPixel(18, ry + 3, '#55bb55');
        drawPixel(W - 10, ry + 1, '#3d9a3d');
        drawPixel(W - 22, ry + 5, '#55bb55');
    }

    // Road surface
    bctx.fillStyle = '#555555';
    bctx.fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, H);

    // Road edges (curb)
    drawRect(ROAD_LEFT, 0, 2, H, '#888888');
    drawRect(ROAD_RIGHT - 2, 0, 2, H, '#888888');

    // Lane dashes (scrolling)
    const dashLen = 12;
    const gapLen = 10;
    const totalDash = dashLen + gapLen;
    const dashOffset = (bikeScroll * 1.5) % totalDash;
    bctx.fillStyle = '#cccccc';
    for (let li = 1; li < 4; li++) {
        const lx = ROAD_LEFT + (ROAD_RIGHT - ROAD_LEFT) * li / 4;
        for (let dy = -dashLen + dashOffset; dy < H + dashLen; dy += totalDash) {
            drawRect(lx - 1, dy, 2, dashLen, '#cccccc');
        }
    }
}

function drawBikeCar(ob) {
    const x = Math.round(ob.x);
    const y = Math.round(ob.y);
    // Car body
    drawRect(x, y + 4, 12, 12, ob.color);
    // Roof
    drawRect(x + 2, y + 6, 8, 6, darkenColor(ob.color));
    // Windshield
    drawRect(x + 2, y + 4, 8, 3, '#88ccff');
    drawPixel(x + 3, y + 4, '#aaddff');
    // Rear window
    drawRect(x + 2, y + 14, 8, 2, '#6699bb');
    // Wheels
    drawRect(x - 1, y + 5, 2, 4, '#222');
    drawRect(x - 1, y + 13, 2, 4, '#222');
    drawRect(x + 11, y + 5, 2, 4, '#222');
    drawRect(x + 11, y + 13, 2, 4, '#222');
    // Headlights
    drawPixel(x + 2, y + 3, '#ffee88');
    drawPixel(x + 9, y + 3, '#ffee88');
    // Taillights
    drawPixel(x + 2, y + 16, '#ff4444');
    drawPixel(x + 9, y + 16, '#ff4444');
    // Top highlight
    drawRect(x + 1, y + 4, 10, 1, lightenColor(ob.color));
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

function drawBikeFish(f) {
    const x = Math.round(f.x);
    const y = Math.round(f.y);
    const facingRight = f.vx > 0;

    if (facingRight) {
        drawRect(x + 2, y, 6, 6, PAL.fishBody);
        drawRect(x + 1, y + 1, 8, 4, PAL.fishBody);
        drawRect(x + 2, y + 3, 6, 2, PAL.fishBelly);
        drawRect(x - 1, y + 1, 2, 3, PAL.fishTail);
        drawPixel(x + 5, y - 1, PAL.fishFin);
        drawPixel(x + 7, y + 2, PAL.fishEye);
        drawPixel(x + 8, y + 2, PAL.fishPupil);
    } else {
        drawRect(x + 2, y, 6, 6, PAL.fishBody);
        drawRect(x + 1, y + 1, 8, 4, PAL.fishBody);
        drawRect(x + 2, y + 3, 6, 2, PAL.fishBelly);
        drawRect(x + 9, y + 1, 2, 3, PAL.fishTail);
        drawPixel(x + 4, y - 1, PAL.fishFin);
        drawPixel(x + 2, y + 2, PAL.fishEye);
        drawPixel(x + 1, y + 2, PAL.fishPupil);
    }
}

function drawBiker(bx, by) {
    const x = Math.round(bx);
    const y = Math.round(by);
    const frame = bike.pedalFrame;

    // ── Bicycle frame ──
    // Wheels
    drawRect(x + 1, y + 11, 3, 3, '#444');
    drawPixel(x + 2, y + 12, '#888');
    drawRect(x + 7, y + 11, 3, 3, '#444');
    drawPixel(x + 8, y + 12, '#888');
    // Frame (triangle)
    drawRect(x + 3, y + 10, 5, 1, '#777');
    drawRect(x + 4, y + 9, 1, 2, '#777');
    drawRect(x + 6, y + 9, 1, 2, '#777');
    // Seat
    drawRect(x + 3, y + 9, 3, 1, '#444');
    // Handlebars
    drawRect(x + 7, y + 8, 2, 1, '#888');

    // ── Rider (same protagonist) ──
    // Legs on pedals
    if (frame === 0) {
        drawRect(x + 3, y + 8, 2, 2, PAL.pants); // left leg
        drawRect(x + 6, y + 7, 2, 2, PAL.pants); // right leg
        drawRect(x + 3, y + 10, 2, 1, PAL.shoe);
        drawRect(x + 6, y + 9, 2, 1, PAL.shoe);
    } else {
        drawRect(x + 3, y + 7, 2, 2, PAL.pants);
        drawRect(x + 6, y + 8, 2, 2, PAL.pants);
        drawRect(x + 3, y + 9, 2, 1, PAL.shoe);
        drawRect(x + 6, y + 10, 2, 1, PAL.shoe);
    }
    // Torso
    drawRect(x + 3, y + 4, 5, 4, PAL.shirt);
    drawPixel(x + 4, y + 4, PAL.shirtHi);
    // Arms reaching to handlebars
    drawRect(x + 7, y + 5, 2, 2, PAL.skin);
    drawPixel(x + 2, y + 5, PAL.skin);
    // Head
    drawRect(x + 3, y + 1, 5, 3, PAL.skin);
    // Hair
    drawRect(x + 3, y, 5, 2, PAL.hair);
    drawRect(x + 2, y, 6, 1, PAL.hair);
    drawPixel(x + 4, y, PAL.hairHi);
    drawPixel(x + 6, y, PAL.hairHi);
    // Wind-blown hair strands
    drawPixel(x + 2, y - 1, PAL.hair);
    drawPixel(x + 3, y - 1, PAL.hairHi);
    // Eyes
    drawPixel(x + 5, y + 2, PAL.black);
    drawPixel(x + 7, y + 2, PAL.black);
}

function renderBike() {
    bctx.clearRect(0, 0, W, H);

    const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    bctx.save();
    bctx.translate(shakeX, shakeY);

    // Road
    drawBikeRoad();

    // Chocolates
    for (const ch of bikeChocolates) {
        if (!ch.collected) drawCoin(ch, 0); // reuse chocolate drawing (no camera offset)
    }

    // Cars
    for (const ob of bikeObstacles) drawBikeCar(ob);

    // Fish
    for (const f of bikeFish) drawBikeFish(f);

    // Particles
    for (const pt of particles) {
        bctx.globalAlpha = pt.life / pt.maxLife;
        drawRect(pt.x, pt.y, pt.size, pt.size, pt.color);
    }
    bctx.globalAlpha = 1;

    // Biker
    if (bike.alive) {
        drawBiker(bike.x, bike.y);
    } else if (bike.deathTimer < 30) {
        if (bike.deathTimer % 4 < 2) drawBiker(bike.x, bike.y);
    }

    // HUD
    bctx.fillStyle = '#fff';
    bctx.font = '8px monospace';
    bctx.textAlign = 'left';
    bctx.fillText('DIST: ' + score, 4, 10);
    bctx.textAlign = 'right';
    bctx.fillText('BEST: ' + bikeHighScore, W - 4, 10);
    bctx.textAlign = 'left';

    // Speed indicator
    const spdW = 30;
    drawRect(4, 14, spdW, 4, '#333');
    const spdFill = clamp((bikeSpeed - 1) / 3, 0, 1);
    const spdColor = spdFill < 0.5 ? '#44ff44' : spdFill < 0.8 ? '#ffcc00' : '#ff4444';
    drawRect(4, 14, Math.floor(spdFill * spdW), 4, spdColor);

    bctx.restore();

    // Blit
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0, W, H, 0, 0, canvas.width, canvas.height);
}

// ══════════════════════════════════════════════
// ── MAIN GAME LOOP (dispatches by mode) ──
// ══════════════════════════════════════════════

function gameLoop() {
    if (gameMode === 'bike' && state === 'playing') {
        updateBike();
        renderBike();
    } else if (gameMode === 'bike' && (state === 'dead' || state === 'title')) {
        renderBike(); // keep last frame visible behind overlay
    } else {
        update();
        render();
    }
    requestAnimationFrame(gameLoop);
}

gameLoop();
