// ── Bike Dash Mode ──

const ROAD_LEFT = 32;
const ROAD_RIGHT = W - 32;

// ── Bike state ──
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
let bikeLanes = [];

// ── Start bike mode ──
function startBikeMode() {
    const roadW = ROAD_RIGHT - ROAD_LEFT;
    const laneW = roadW / 4;
    bikeLanes = [];
    for (let i = 0; i < 4; i++) {
        bikeLanes.push(ROAD_LEFT + laneW * i + laneW / 2);
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

// ── Spawners ──
function spawnCarObstacle() {
    const occupiedLanes = new Set();
    for (const ob of bikeObstacles) {
        if (ob.y < 40 || ob.y > H - 40) {
            occupiedLanes.add(ob.lane);
        }
    }
    const freeLanes = [0, 1, 2, 3].filter(l => !occupiedLanes.has(l));
    if (freeLanes.length === 0) return;
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

// ── Bike update ──
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

    // Input: vertical movement (up/down, keyboard + touch)
    const goUp = keys['ArrowUp'] || keys['KeyW'] || touchUp;
    const goDown = keys['ArrowDown'] || keys['KeyS'] || touchDown;
    if (goUp) b.y -= 2.5;
    if (goDown) b.y += 2.5;
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
    bikeSpeed = 1.0 + score / 300;

    // Spawn obstacles
    bikeNextSpawn--;
    if (bikeNextSpawn <= 0) {
        spawnCarObstacle();
        bikeNextSpawn = Math.max(25, 80 - score / 5);
        if (score > 100 && Math.random() < 0.3) spawnCarObstacle();
    }

    bikeFishTimer--;
    if (bikeFishTimer <= 0) {
        spawnBikeFish();
        bikeFishTimer = Math.max(40, 120 - score / 4);
    }

    bikeChocoTimer--;
    if (bikeChocoTimer <= 0) {
        spawnBikeChocolate();
        bikeChocoTimer = Math.max(80, 200 - score / 6);
    }

    // Update cars (with lane-change avoidance)
    for (const ob of bikeObstacles) {
        ob.y += ob.vy;
        ob.laneChangeTimer = Math.max(0, (ob.laneChangeTimer || 0) - 1);

        let blocked = false;
        for (const other of bikeObstacles) {
            if (other === ob || other.lane !== ob.lane) continue;
            const dy = other.y - ob.y;
            if (ob.vy > 0 && dy > 0 && dy < 40) blocked = true;
            if (ob.vy < 0 && dy < 0 && dy > -40) blocked = true;
        }

        if (blocked && ob.laneChangeTimer <= 0) {
            const tryLanes = [];
            if (ob.lane > 0) tryLanes.push(ob.lane - 1);
            if (ob.lane < 3) tryLanes.push(ob.lane + 1);
            for (const nl of tryLanes) {
                let laneFree = true;
                for (const other of bikeObstacles) {
                    if (other === ob || other.lane !== nl) continue;
                    if (Math.abs(other.y - ob.y) < 30) { laneFree = false; break; }
                }
                if (laneFree) {
                    ob.lane = nl;
                    ob.laneChangeTimer = 60;
                    break;
                }
            }
        }

        const tgtX = bikeLanes[ob.lane] - 6;
        ob.x = lerp(ob.x, tgtX, 0.08);
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
        }
    }
    bikeFish = bikeFish.filter(f => f.x > -20 && f.x < W + 20);

    // Update chocolates
    for (const ch of bikeChocolates) {
        ch.y += ch.vy;
        ch.animTimer++;
    }
    bikeChocolates = bikeChocolates.filter(ch => ch.y < H + 20);

    if (invulnTimer > 0) invulnTimer--;

    // Collision
    const bHit = { x: b.x + 1, y: b.y + 2, w: b.w - 2, h: b.h - 2 };

    for (const ob of bikeObstacles) {
        if (aabb(bHit, ob)) {
            if (invulnTimer > 0) {
                ob.destroyed = true;
                spawnParticles(ob.x + 6, ob.y + 10, ob.color, 12, 4);
                spawnParticles(ob.x + 6, ob.y + 10, '#ffcc00', 6, 3);
                score += 30;
                screenShake = 4;
            } else {
                b.alive = false; b.deathTimer = 0;
                screenShake = 10;
                spawnParticles(b.x + 5, b.y + 7, PAL.red, 15, 4);
                spawnParticles(b.x + 5, b.y + 7, '#888', 10, 3);
                return;
            }
        }
    }
    bikeObstacles = bikeObstacles.filter(ob => !ob.destroyed);

    for (const f of bikeFish) {
        if (aabb(bHit, f)) {
            if (invulnTimer > 0) {
                f.destroyed = true;
                spawnParticles(f.x + 5, f.y + 3, PAL.fishBody, 10, 4);
                spawnParticles(f.x + 5, f.y + 3, '#ffcc00', 6, 3);
                score += 20;
                screenShake = 3;
            } else {
                b.alive = false; b.deathTimer = 0;
                screenShake = 8;
                spawnParticles(b.x + 5, b.y + 7, PAL.fishBody, 12, 4);
                return;
            }
        }
    }
    bikeFish = bikeFish.filter(f => !f.destroyed);

    for (const ch of bikeChocolates) {
        if (!ch.collected && aabb(bHit, ch)) {
            ch.collected = true;
            invulnTimer = 180;
            screenShake = 3;
            spawnParticles(ch.x + 5, ch.y + 4, '#ffcc00', 12, 4);
            spawnParticles(ch.x + 5, ch.y + 4, PAL.choco, 8, 3);
        }
    }

    updateParticles();
    decayScreenShake();
}

// ── Bike drawing ──

function drawBikeRoad() {
    bctx.fillStyle = '#88bbdd';
    bctx.fillRect(0, 0, W, H);

    bctx.fillStyle = '#44aa44';
    bctx.fillRect(0, 0, ROAD_LEFT, H);
    bctx.fillRect(ROAD_RIGHT, 0, W - ROAD_RIGHT, H);

    const grassScroll = (bikeScroll * 0.6) % 8;
    for (let gy = -8; gy < H; gy += 8) {
        const ry = gy + grassScroll;
        drawPixel(5, ry, '#3d9a3d');
        drawPixel(18, ry + 3, '#55bb55');
        drawPixel(W - 10, ry + 1, '#3d9a3d');
        drawPixel(W - 22, ry + 5, '#55bb55');
    }

    bctx.fillStyle = '#555555';
    bctx.fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, H);

    drawRect(ROAD_LEFT, 0, 2, H, '#888888');
    drawRect(ROAD_RIGHT - 2, 0, 2, H, '#888888');

    const dashLen = 12;
    const gapLen = 10;
    const totalDash = dashLen + gapLen;
    const dashOffset = (bikeScroll * 1.5) % totalDash;
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
    drawRect(x, y + 4, 12, 12, ob.color);
    drawRect(x + 2, y + 6, 8, 6, darkenColor(ob.color));
    drawRect(x + 2, y + 4, 8, 3, '#88ccff');
    drawPixel(x + 3, y + 4, '#aaddff');
    drawRect(x + 2, y + 14, 8, 2, '#6699bb');
    drawRect(x - 1, y + 5, 2, 4, '#222');
    drawRect(x - 1, y + 13, 2, 4, '#222');
    drawRect(x + 11, y + 5, 2, 4, '#222');
    drawRect(x + 11, y + 13, 2, 4, '#222');
    drawPixel(x + 2, y + 3, '#ffee88');
    drawPixel(x + 9, y + 3, '#ffee88');
    drawPixel(x + 2, y + 16, '#ff4444');
    drawPixel(x + 9, y + 16, '#ff4444');
    drawRect(x + 1, y + 4, 10, 1, lightenColor(ob.color));
}

function drawBikeFishSprite(f) {
    const x = Math.round(f.x);
    const y = Math.round(f.y);
    const facingRight = f.vx > 0;
    const tailWag = Math.sin(f.timer * 3) > 0 ? 1 : 0;
    drawFish(x, y, facingRight, tailWag);
}

function drawBiker(bx, by) {
    const x = Math.round(bx);
    const y = Math.round(by);
    const frame = bike.pedalFrame;

    // Invulnerability aura
    if (invulnTimer > 0) {
        const pulse = Math.sin(invulnTimer * 0.3) * 0.3 + 0.5;
        bctx.globalAlpha = pulse * (invulnTimer > 30 ? 1 : invulnTimer / 30);
        drawRect(x - 2, y - 2, 14, 18, '#ffcc00');
        bctx.globalAlpha = 1;
        if (invulnTimer % 3 === 0) {
            spawnParticles(bx + Math.random() * 10, by + Math.random() * 14, '#ffee44', 1, 1.5);
        }
    }

    // Bicycle
    drawRect(x + 1, y + 11, 3, 3, '#444');
    drawPixel(x + 2, y + 12, '#888');
    drawRect(x + 7, y + 11, 3, 3, '#444');
    drawPixel(x + 8, y + 12, '#888');
    drawRect(x + 3, y + 10, 5, 1, '#777');
    drawRect(x + 4, y + 9, 1, 2, '#777');
    drawRect(x + 6, y + 9, 1, 2, '#777');
    drawRect(x + 3, y + 9, 3, 1, '#444');
    drawRect(x + 7, y + 8, 2, 1, '#888');

    // Legs
    if (frame === 0) {
        drawRect(x + 3, y + 8, 2, 2, PAL.pants);
        drawRect(x + 6, y + 7, 2, 2, PAL.pants);
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
    // Arms
    drawRect(x + 7, y + 5, 2, 2, PAL.skin);
    drawPixel(x + 2, y + 5, PAL.skin);
    // Head
    drawRect(x + 3, y + 1, 5, 3, PAL.skin);
    // Hair
    drawRect(x + 3, y, 5, 2, PAL.hair);
    drawRect(x + 2, y, 6, 1, PAL.hair);
    drawPixel(x + 4, y, PAL.hairHi);
    drawPixel(x + 6, y, PAL.hairHi);
    drawPixel(x + 2, y - 1, PAL.hair);
    drawPixel(x + 3, y - 1, PAL.hairHi);
    // Eyes
    drawPixel(x + 5, y + 2, PAL.black);
    drawPixel(x + 7, y + 2, PAL.black);
}

// ── Bike render ──
function renderBike() {
    bctx.clearRect(0, 0, W, H);

    const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    bctx.save();
    bctx.translate(shakeX, shakeY);

    drawBikeRoad();

    for (const ch of bikeChocolates) {
        if (!ch.collected) drawChocolate(ch, 0);
    }

    for (const ob of bikeObstacles) drawBikeCar(ob);
    for (const f of bikeFish) drawBikeFishSprite(f);

    for (const pt of particles) {
        bctx.globalAlpha = pt.life / pt.maxLife;
        drawRect(pt.x, pt.y, pt.size, pt.size, pt.color);
    }
    bctx.globalAlpha = 1;

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

    const spdW = 30;
    drawRect(4, 14, spdW, 4, '#333');
    const spdFill = clamp((bikeSpeed - 1) / 3, 0, 1);
    const spdColor = spdFill < 0.5 ? '#44ff44' : spdFill < 0.8 ? '#ffcc00' : '#ff4444';
    drawRect(4, 14, Math.floor(spdFill * spdW), 4, spdColor);

    bctx.restore();

    blitToScreen();
}
