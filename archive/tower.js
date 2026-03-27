// ── Tower Ascent Mode ──

// ── Tower constants ──
const GRAVITY = 0.22;
const JUMP_FORCE = -4.2;
const MOVE_SPEED = 1.4;
const WALL_JUMP_FORCE_X = 2.8;
const WALL_JUMP_FORCE_Y = -3.8;
const COYOTE_TIME = 6;
const JUMP_BUFFER = 6;

// ── Tower state ──
let camera = { y: 0 };
let highScore = parseInt(localStorage.getItem('towerHighScore') || '0');
let platforms = [];
let hazards = [];
let coins = [];
let deathY = 0;
let floorHeight = 0;
let towerLevel = 0;
let levelFlash = 0;
let nextPlatformY = 0;
const PLATFORM_GAP_MIN = 28;
const PLATFORM_GAP_MAX = 48;

// ── Level color themes ──
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

        if (seededRandom() < 0.12) {
            coins.push({
                x: px + pw / 2 - 5, y: nextPlatformY - 16,
                w: 10, h: 8, collected: false, animTimer: Math.random() * 100
            });
        }

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

// ── Start tower mode ──
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

// ── Draw character (8-bit pixel art) ──
function drawPlayer(px, py) {
    const f = player.facing;
    const frame = player.animFrame;
    const x = Math.round(px);
    const y = Math.round(py);

    // Invulnerability aura glow
    if (invulnTimer > 0) {
        const pulse = Math.sin(invulnTimer * 0.3) * 0.3 + 0.5;
        // Outer glow ring
        bctx.globalAlpha = pulse * (invulnTimer > 30 ? 1 : invulnTimer / 30);
        drawRect(x - 2, y - 2, 12, 16, '#ffcc00');
        drawRect(x - 3, y, 14, 12, '#ffcc00');
        bctx.globalAlpha = 1;
        // Sparkle particles
        if (invulnTimer % 3 === 0) {
            spawnParticles(px + Math.random() * 8, py + Math.random() * 12, '#ffee44', 1, 1.5);
        }
    }

    drawRect(x + 1, y, 6, 3, PAL.hair);
    drawRect(x, y + 1, 8, 2, PAL.hair);
    drawPixel(x + 2, y, PAL.hairHi);
    drawPixel(x + 4, y, PAL.hairHi);
    drawPixel(f > 0 ? x + 7 : x, y + 1, PAL.hair);

    drawRect(x + 1, y + 3, 6, 3, PAL.skin);
    const eyeX = f > 0 ? x + 4 : x + 2;
    drawPixel(eyeX, y + 4, PAL.black);
    drawPixel(eyeX + 2, y + 4, PAL.black);

    drawRect(x + 1, y + 6, 6, 3, PAL.shirt);
    drawRect(x, y + 7, 8, 2, PAL.shirt);
    drawPixel(x + 2, y + 6, PAL.shirtHi);

    if (frame === 1) {
        drawRect(x - 1, y + 7, 1, 2, PAL.skin);
        drawRect(x + 8, y + 6, 1, 2, PAL.skin);
    } else {
        drawRect(x - 1, y + 7, 1, 2, PAL.skin);
        drawRect(x + 8, y + 7, 1, 2, PAL.skin);
    }

    drawRect(x + 1, y + 9, 3, 2, PAL.pants);
    drawRect(x + 4, y + 9, 3, 2, PAL.pants);

    if (frame === 1 && player.grounded) {
        drawRect(x + 1, y + 9, 3, 2, PAL.pants);
        drawRect(x + 5, y + 9, 2, 1, PAL.pants);
    }

    if (frame === 0 || !player.grounded) {
        drawRect(x + 1, y + 11, 3, 1, PAL.shoe);
        drawRect(x + 4, y + 11, 3, 1, PAL.shoe);
        drawPixel(x + 1, y + 11, PAL.shoeDk);
        drawPixel(x + 4, y + 11, PAL.shoeDk);
    } else {
        drawRect(x, y + 11, 3, 1, PAL.shoe);
        drawRect(x + 5, y + 11, 3, 1, PAL.shoe);
        drawPixel(x, y + 11, PAL.shoeDk);
        drawPixel(x + 5, y + 11, PAL.shoeDk);
    }

    if (player.wallSliding) {
        spawnParticles(player.wallDir > 0 ? px + 8 : px, py + 6, '#aaa', 1, 1);
    }
}

// ── Draw chain-link inverted S decoration ──
function drawChainS(bx, by, flipped) {
    const c = PAL.chain;
    const s = PAL.chainShadow;
    const links = flipped ? [
        [0,0],[2,0],[4,0],
        [0,2],[2,2],
        [0,4],
        [0,6],[2,6],
        [4,6],
        [4,8],[2,8],
        [0,10],[2,10],[4,10],
    ] : [
        [0,0],[2,0],[4,0],
        [4,2],[2,2],
        [4,4],
        [4,6],[2,6],
        [0,6],
        [0,8],[2,8],
        [0,10],[2,10],[4,10],
    ];
    for (const [lx, ly] of links) {
        drawRect(bx + lx, by + ly, 2, 2, c);
        drawPixel(bx + lx + 1, by + ly + 1, s);
    }
}

// ── Draw tower background ──
function drawBackground(camY) {
    const theme = getCurrentTheme();

    bctx.fillStyle = theme.bg;
    bctx.fillRect(0, 0, W, H);

    const wallW = 12;
    const tileH = 8;
    const tileW = 6;
    const offsetY = (camY * 0.3) % tileH;

    for (let side = 0; side < 2; side++) {
        const baseX = side === 0 ? 0 : W - wallW;

        bctx.fillStyle = theme.wall1;
        bctx.fillRect(baseX, 0, wallW, H);

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

    const chainPatternH = 20;
    const chainOffsetY = ((camY * 0.3) % chainPatternH + chainPatternH) % chainPatternH;
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

// ── Draw tower hazard (fish) ──
function drawHazard(h, camY) {
    const sy = h.y - camY;
    const x = Math.round(h.x);
    const y = Math.round(sy);
    const facingRight = h.x >= h.prevX;
    const wagSpeed = h.pattern === 'dash' && h.dashCooldown > 0 ? 8 : 3;
    const tailWag = Math.sin(h.timer * wagSpeed) > 0 ? 1 : 0;
    drawFish(x, y, facingRight, tailWag);
}

// ── Draw HUD ──
function drawTowerHUD() {
    const theme = getCurrentTheme();
    bctx.fillStyle = '#fff';
    bctx.font = '8px monospace';
    bctx.textAlign = 'left';
    bctx.fillText('HEIGHT: ' + score, 14, 10);
    bctx.textAlign = 'right';
    bctx.fillText('BEST: ' + highScore, W - 14, 10);
    bctx.textAlign = 'left';

    bctx.fillStyle = theme.wallHi;
    bctx.textAlign = 'center';
    bctx.fillText('LV' + (towerLevel + 1) + ' ' + theme.name, W / 2, 10);
    bctx.textAlign = 'left';

    const meterH = 40;
    drawRect(W - 8, 16, 4, meterH, '#222');
    const progressInLevel = (score % 500) / 500;
    const fillH = Math.floor(progressInLevel * meterH);
    drawRect(W - 8, 16 + meterH - fillH, 4, fillH, theme.wallHi);

    if (levelFlash > 0) {
        const alpha = levelFlash / 30;
        bctx.fillStyle = 'rgba(255,255,255,' + (alpha * 0.5) + ')';
        bctx.fillRect(0, 0, W, H);
    }
}

function killPlayer() {
    player.alive = false;
    player.deathTimer = 0;
    screenShake = 8;
    spawnParticles(player.x + 4, player.y + 6, PAL.red, 15, 4);
    spawnParticles(player.x + 4, player.y + 6, PAL.hair, 8, 3);
}

// ── Tower update ──
function updateTower() {
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

    const dir = inputDir();
    p.vx = dir * MOVE_SPEED;
    if (dir !== 0) p.facing = dir;

    if (dir !== 0 && p.grounded) {
        p.animTimer++;
        if (p.animTimer > 8) { p.animTimer = 0; p.animFrame = 1 - p.animFrame; }
    } else {
        p.animFrame = 0; p.animTimer = 0;
    }

    const jp = jumpPressed();
    const freshJumpPress = jp && !p.jumpHeld;
    p.jumpHeld = jp;

    if (freshJumpPress) {
        p.jumpBufferTimer = JUMP_BUFFER;
    } else if (!jp) {
        p.jumpBufferTimer = Math.max(0, p.jumpBufferTimer - 1);
    }

    if (p.grounded) {
        p.coyoteTimer = COYOTE_TIME;
    } else {
        p.coyoteTimer = Math.max(0, p.coyoteTimer - 1);
    }

    if (p.jumpBufferTimer > 0 && p.coyoteTimer > 0) {
        p.vy = JUMP_FORCE;
        p.coyoteTimer = 0;
        p.jumpBufferTimer = 0;
        p.grounded = false;
        p.hasDoubleJump = true;
        p.usedWallJump = false;
        spawnParticles(p.x + 4, p.y + p.h, '#fff', 4, 2);
    }
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
    else if (p.jumpBufferTimer > 0 && !p.grounded && p.hasDoubleJump && p.coyoteTimer <= 0) {
        p.vy = JUMP_FORCE * 0.85;
        p.jumpBufferTimer = 0;
        p.hasDoubleJump = false;
        spawnParticles(p.x + 4, p.y + p.h, '#aaf', 6, 2.5);
    }

    if (!jumpPressed() && p.vy < -1) {
        p.vy *= 0.85;
    }

    p.vy += GRAVITY;
    if (p.wallSliding && p.vy > 0.8) p.vy = 0.8;

    p.x += p.vx;

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

    p.y += p.vy;
    p.grounded = false;

    for (const plat of platforms) {
        if (plat.type === 'moving') {
            plat.x = plat.originX + Math.sin(Date.now() * 0.002 * Math.abs(plat.moveSpeed)) * plat.moveRange;
            plat.x = clamp(plat.x, 12, W - 12 - plat.w);
        }

        if (p.vy >= 0 &&
            p.x + p.w > plat.x && p.x < plat.x + plat.w &&
            p.y + p.h > plat.y && p.y + p.h < plat.y + plat.h + p.vy + 2) {
            p.y = plat.y - p.h;
            p.vy = 0;
            p.grounded = true;
            p.hasDoubleJump = true;
            p.usedWallJump = false;

            if (plat.type === 'moving') {
                const prevX = plat.x;
                const newX = plat.originX + Math.sin((Date.now() + 16) * 0.002 * Math.abs(plat.moveSpeed)) * plat.moveRange;
                p.x += (newX - prevX) * 0.5;
            }
        }
    }

    for (const c of coins) {
        if (!c.collected && aabb(p, c)) {
            c.collected = true;
            invulnTimer = 180; // 3 seconds at 60fps
            screenShake = 3;
            spawnParticles(c.x + 3, c.y + 3, '#ffcc00', 12, 4);
            spawnParticles(c.x + 3, c.y + 3, PAL.choco, 8, 3);
        }
    }

    if (invulnTimer > 0) invulnTimer--;

    for (const h of hazards) {
        h.prevX = h.x;
        h.timer += 0.02;
        const t = h.timer * h.speed;

        switch (h.pattern) {
            case 'sine':
                h.x = h.originX + Math.sin(t) * h.range;
                h.y = h.originY + Math.sin(t * 2.5) * 4;
                break;
            case 'circle':
                h.x = h.originX + Math.cos(t) * h.range * 0.7;
                h.y = h.originY + Math.sin(t) * 15;
                break;
            case 'dash':
                h.dashCooldown -= 0.02;
                if (h.dashCooldown <= 0) {
                    h.x += h.dashDir * 0.3;
                    if (Math.sin(t * 1.5) > 0.95) {
                        h.dashCooldown = 1.5;
                        h.dashDir *= -1;
                    }
                } else {
                    h.x += h.dashDir * 2.5;
                }
                h.y = h.originY + Math.sin(t * 1.8) * 3;
                break;
            case 'zigzag':
                const zigPhase = (t * 0.8) % (Math.PI * 2);
                const zigX = zigPhase < Math.PI
                    ? lerp(-h.range, h.range, zigPhase / Math.PI)
                    : lerp(h.range, -h.range, (zigPhase - Math.PI) / Math.PI);
                h.x = h.originX + zigX;
                h.y = h.originY + Math.abs(Math.sin(zigPhase)) * 12 - 6;
                break;
            case 'figure8':
                h.x = h.originX + Math.sin(t) * h.range * 0.8;
                h.y = h.originY + Math.sin(t * 2) * 10;
                break;
        }

        h.x = clamp(h.x, 14, W - 14 - h.w);
        if (aabb(p, h)) {
            if (invulnTimer > 0) {
                // Destroy fish on contact while invulnerable
                h.destroyed = true;
                spawnParticles(h.x + 5, h.y + 3, PAL.fishBody, 10, 4);
                spawnParticles(h.x + 5, h.y + 3, '#ffcc00', 6, 3);
                score += 50;
                screenShake = 3;
            } else {
                killPlayer();
                return;
            }
        }
    }
    hazards = hazards.filter(h => !h.destroyed);

    const targetCamY = p.y - H * 0.4;
    if (targetCamY < camera.y) {
        camera.y = lerp(camera.y, targetCamY, 0.1);
    }

    const heightScore = Math.max(0, Math.floor((floorHeight - p.y) / 4));
    if (heightScore > score) score = heightScore;
    if (score > highScore) { highScore = score; localStorage.setItem('towerHighScore', highScore); }

    const newLevel = Math.floor(score / 500);
    if (newLevel > towerLevel) {
        towerLevel = newLevel;
        levelFlash = 30;
        screenShake = 4;
        spawnParticles(W / 2, p.y, '#fff', 20, 5);
        spawnParticles(W / 2, p.y, getCurrentTheme().wall1, 15, 4);
    }

    deathY = camera.y + H + 20;
    if (p.y > deathY) {
        killPlayer();
    }

    generatePlatformsUpTo(camera.y - H);
    cleanupBelow(camera.y + H * 2);

    updateParticles();
    decayScreenShake();
    if (levelFlash > 0) levelFlash--;

    for (const c of coins) c.animTimer++;
}

// ── Tower render ──
function renderTower() {
    bctx.clearRect(0, 0, W, H);

    const camY = camera.y + (screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0);

    drawBackground(camY);
    for (const p of platforms) drawPlatform(p, camY);
    for (const h of hazards) drawHazard(h, camY);
    for (const c of coins) drawChocolate(c, camY);

    for (const pt of particles) {
        const alpha = pt.life / pt.maxLife;
        bctx.globalAlpha = alpha;
        drawRect(pt.x, pt.y - camY, pt.size, pt.size, pt.color);
    }
    bctx.globalAlpha = 1;

    if (player.alive) {
        drawPlayer(player.x, player.y - camY);
    } else if (player.deathTimer < 30) {
        if (player.deathTimer % 4 < 2) {
            drawPlayer(player.x, player.y - camY);
        }
    }

    if (state === 'playing') drawTowerHUD();

    if (state === 'playing') {
        const dly = deathY - camY;
        if (dly < H + 10 && dly > H - 30) {
            bctx.fillStyle = 'rgba(255,50,50,0.15)';
            bctx.fillRect(0, dly, W, H - dly + 10);
        }
    }

    blitToScreen();
}
