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

// ── Near-miss system ──
let nearMissCombo = 0;
let nearMissTimer = 0;
const NEAR_MISS_DIST = 6;
const NEAR_MISS_DECAY = 60;

// ── Level system ──
let level = 1;
let levelScroll = 0;
let levelComplete = false;
let levelCompleteTimer = 0;
let levelFlash = 0;
const LEVEL_TRANSITION_TIME = 90;

function levelDistance(lvl) {
    return 150 + lvl * 50;
}

function levelCarSpawnRate() {
    return Math.max(18, 80 - level * 7);
}
function levelFishSpawnRate() {
    return Math.max(30, 120 - level * 10);
}
function levelChocoSpawnRate() {
    return Math.max(100, 200 + level * 15);
}
function levelBaseSpeed() {
    return 1.0 + level * 0.15;
}

const ROAD_THEMES = [
    { road: '#555555', grass: '#44aa44', grassDark: '#3d9a3d', grassLight: '#55bb55', sky: '#88bbdd', edge: '#888888', dash: '#cccccc', weather: null, name: 'Suburbia' },
    { road: '#444455', grass: '#338833', grassDark: '#2d7a2d', grassLight: '#44aa44', sky: '#667799', edge: '#777788', dash: '#aaaacc', weather: 'rain', name: 'Downpour' },
    { road: '#665544', grass: '#aa8833', grassDark: '#997722', grassLight: '#bbaa44', sky: '#dd9955', edge: '#887766', dash: '#ddccaa', weather: 'dust', name: 'Desert' },
    { road: '#333344', grass: '#225533', grassDark: '#1a4428', grassLight: '#336644', sky: '#223355', edge: '#555566', dash: '#8888aa', weather: null, name: 'Midnight' },
    { road: '#554444', grass: '#cc5533', grassDark: '#aa4422', grassLight: '#dd7744', sky: '#cc7744', edge: '#776655', dash: '#ddbbaa', weather: 'leaves', name: 'Autumn' },
    { road: '#3a3a4a', grass: '#4488aa', grassDark: '#337799', grassLight: '#55aacc', sky: '#445577', edge: '#6677aa', dash: '#aabbdd', weather: 'snow', name: 'Frost' },
];

function currentTheme() {
    return ROAD_THEMES[(level - 1) % ROAD_THEMES.length];
}

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
    level = 1;
    levelScroll = 0;
    levelComplete = false;
    levelCompleteTimer = 0;
    levelFlash = 0;
    nearMissCombo = 0;
    nearMissTimer = 0;
}

// ── Spawners ──
function spawnCarObstacle() {
    const occupiedLanes = new Set();
    for (const ob of bikeObstacles) {
        if (ob.y < 40 || ob.y > H - 40) occupiedLanes.add(ob.lane);
    }
    const freeLanes = [0, 1, 2, 3].filter(l => !occupiedLanes.has(l));
    if (freeLanes.length === 0) return;
    const lane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
    const lx = bikeLanes[lane];
    const carColors = ['#cc3333', '#3366cc', '#33aa33', '#cccc33', '#cc66cc', '#ff8833', '#eeeeee'];
    const color = carColors[Math.floor(Math.random() * carColors.length)];
    const goingUp = Math.random() < 0.3;

    // Higher levels: trucks (wider, slower)
    const isTruck = level >= 4 && Math.random() < 0.2;
    bikeObstacles.push({
        x: lx - (isTruck ? 7 : 6), y: goingUp ? H + 20 : -24,
        w: isTruck ? 14 : 12, h: isTruck ? 24 : 20,
        vy: goingUp ? -0.8 * bikeSpeed : (isTruck ? 1.2 : 1.5) * bikeSpeed,
        color, type: isTruck ? 'truck' : 'car',
        lane, laneChangeTimer: 0,
        nearMissed: false
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
        pattern: pat, originY: fy, timer: 0,
        nearMissed: false
    });
}

function spawnBikeChocolate() {
    const lane = Math.floor(Math.random() * 4);
    const lx = bikeLanes[lane];
    bikeChocolates.push({
        x: lx - 5, y: -12,
        w: 10, h: 8,
        vy: 1.2 * bikeSpeed,
        collected: false, animTimer: 0
    });
}

// ── Near-miss detection ──
function checkNearMiss(b) {
    const bCx = b.x + b.w / 2;
    const bCy = b.y + b.h / 2;

    for (const ob of bikeObstacles) {
        if (ob.nearMissed || invulnTimer > 0) continue;
        const oCx = ob.x + ob.w / 2;
        const oCy = ob.y + ob.h / 2;
        const dx = Math.abs(bCx - oCx);
        const dy = Math.abs(bCy - oCy);
        const close = dx < ob.w / 2 + NEAR_MISS_DIST && dy < ob.h / 2 + NEAR_MISS_DIST;
        const hit = aabb(b, ob);
        if (close && !hit) {
            ob.nearMissed = true;
            nearMissCombo++;
            nearMissTimer = NEAR_MISS_DECAY;
            const bonus = 5 * nearMissCombo;
            score += bonus;
            if (nearMissCombo >= 3) {
                SFX.combo();
                spawnFloatingText(bCx, b.y - 8, 'COMBO x' + nearMissCombo + '!', '#ff44ff');
            } else {
                SFX.nearMiss();
                spawnFloatingText(bCx, b.y - 8, 'CLOSE! +' + bonus, '#44ffff');
            }
            spawnParticles(bCx, bCy, '#44ffff', 3, 1.5);
        }
    }

    for (const f of bikeFish) {
        if (f.nearMissed || invulnTimer > 0) continue;
        const fCx = f.x + f.w / 2;
        const fCy = f.y + f.h / 2;
        const dx = Math.abs(bCx - fCx);
        const dy = Math.abs(bCy - fCy);
        const close = dx < f.w / 2 + NEAR_MISS_DIST && dy < f.h / 2 + NEAR_MISS_DIST;
        const hit = aabb(b, f);
        if (close && !hit) {
            f.nearMissed = true;
            nearMissCombo++;
            nearMissTimer = NEAR_MISS_DECAY;
            const bonus = 5 * nearMissCombo;
            score += bonus;
            SFX.nearMiss();
            spawnFloatingText(bCx, b.y - 8, 'CLOSE! +' + bonus, '#44ffff');
            spawnParticles(bCx, bCy, '#44ffff', 3, 1.5);
        }
    }
}

// ── Bike update ──
function updateBike() {
    if (state !== 'playing') return;
    const b = bike;

    if (!b.alive) {
        b.deathTimer++;
        if (b.deathTimer > 60) {
            state = 'dead';
            stopMusic();
            if (score > bikeHighScore) { bikeHighScore = score; localStorage.setItem('bikeHighScore', bikeHighScore); }
            overlay.innerHTML = `
                <h1 style="color:#ff4444">WIPEOUT!</h1>
                <p>Level: ${level} | Distance: ${score}</p>
                <p>Best: ${bikeHighScore}</p>
                <p class="blink" style="margin-top:16px">Press ENTER or tap to retry</p>
                <p style="font-size:11px;color:#555;margin-top:8px">ESC for mode select</p>
            `;
            overlay.classList.remove('hidden');
        }
        return;
    }

    // Input: combine keyboard + dpad
    let moveLeft = keys['ArrowLeft'] || keys['KeyA'] || dpadLeft;
    let moveRight = keys['ArrowRight'] || keys['KeyD'] || dpadRight;
    let moveUp = keys['ArrowUp'] || keys['KeyW'] || dpadUp;
    let moveDown = keys['ArrowDown'] || keys['KeyS'] || dpadDown;

    const dir = (moveLeft ? -1 : 0) + (moveRight ? 1 : 0);
    if (dir < 0 && !b._movedLeft) {
        const prev = b.lane;
        b.lane = Math.max(0, b.lane - 1);
        if (b.lane !== prev) SFX.laneSwitch();
        b._movedLeft = true;
    } else if (!moveLeft) { b._movedLeft = false; }
    if (dir > 0 && !b._movedRight) {
        const prev = b.lane;
        b.lane = Math.min(3, b.lane + 1);
        if (b.lane !== prev) SFX.laneSwitch();
        b._movedRight = true;
    } else if (!moveRight) { b._movedRight = false; }

    if (moveUp) b.y -= 2.5;
    if (moveDown) b.y += 2.5;

    if (touchActive) {
        const bikerCenterX = b.x + b.w / 2;
        const bikerCenterY = b.y + b.h / 2;
        const dx = touchGameX - bikerCenterX;
        const dy = touchGameY - bikerCenterY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 3) {
            const moveSpeed = Math.min(dist * 0.15, 3.5);
            b.x += (dx / dist) * moveSpeed;
            b.y += (dy / dist) * moveSpeed;
        }
        let closestLane = 0;
        let closestDist = Infinity;
        for (let i = 0; i < bikeLanes.length; i++) {
            const ld = Math.abs((b.x + b.w / 2) - bikeLanes[i]);
            if (ld < closestDist) { closestDist = ld; closestLane = i; }
        }
        b.lane = closestLane;
    }

    b.y = clamp(b.y, 16, H - 20);
    b.x = clamp(b.x, ROAD_LEFT + 2, ROAD_RIGHT - b.w - 2);

    if (!touchActive) {
        const targetX = bikeLanes[b.lane] - 5;
        b.x = lerp(b.x, targetX, 0.18);
    }
    b.tilt = (bikeLanes[b.lane] - b.x - b.w / 2) * 0.3;

    b.pedalTimer++;
    if (b.pedalTimer > Math.max(3, 10 - bikeSpeed * 2)) {
        b.pedalTimer = 0;
        b.pedalFrame = 1 - b.pedalFrame;
    }

    // Level transition
    if (levelComplete) {
        levelCompleteTimer--;
        levelFlash = Math.max(0, levelFlash - 1);
        bikeScroll += 0.3;
        score = Math.floor(bikeScroll / 8);
        bikeObstacles = bikeObstacles.filter(ob => { ob.y += ob.vy; return ob.y > -40 && ob.y < H + 40; });
        bikeFish = bikeFish.filter(f => { f.x += f.vx; return f.x > -20 && f.x < W + 20; });
        bikeChocolates = [];
        updateScenery(0.3);
        if (levelCompleteTimer <= 0) {
            levelComplete = false;
            levelScroll = 0;
        }
        updateParticles();
        updateFloatingTexts();
        decayScreenShake();
        return;
    }

    // Score & speed
    const baseSpeed = levelBaseSpeed() + score / 500;
    bikeSpeed = invulnTimer > 0 ? baseSpeed + 2.5 : baseSpeed;
    bikeScroll += bikeSpeed;
    levelScroll += bikeSpeed;
    score = Math.floor(bikeScroll / 8);

    // Update scenery parallax
    updateScenery(bikeSpeed);

    // Weather
    const theme = currentTheme();
    if (theme.weather) updateWeather(theme.weather, theme.weather === 'rain' ? 0.4 : 0.15);

    // Near-miss combo decay
    if (nearMissTimer > 0) {
        nearMissTimer--;
        if (nearMissTimer <= 0) nearMissCombo = 0;
    }

    // Biker trail when invulnerable or fast
    if (invulnTimer > 0 && gameTime % 2 === 0) {
        spawnParticles(b.x + 5, b.y + 14, '#ffee44', 1, 0.8);
    } else if (bikeSpeed > 2.5 && gameTime % 3 === 0) {
        spawnParticles(b.x + 5, b.y + 14, '#888888', 1, 0.5);
    }

    // Level completion
    const needed = levelDistance(level);
    if (levelScroll / 8 >= needed) {
        level++;
        levelComplete = true;
        levelCompleteTimer = LEVEL_TRANSITION_TIME;
        levelFlash = 20;
        screenShake = 3;
        SFX.levelUp();
        spawnFloatingText(W / 2, H / 2 - 30, 'LEVEL ' + (level - 1) + ' CLEAR!', '#ffcc00');
        for (let i = 0; i < 8; i++) {
            spawnParticles(W / 2 + (Math.random() - 0.5) * 100, H / 2 + (Math.random() - 0.5) * 60, '#ffcc00', 4, 3);
            spawnParticles(W / 2 + (Math.random() - 0.5) * 100, H / 2 + (Math.random() - 0.5) * 60, '#44ff44', 3, 2);
        }
    }

    // Spawn obstacles
    bikeNextSpawn--;
    if (bikeNextSpawn <= 0) {
        spawnCarObstacle();
        bikeNextSpawn = levelCarSpawnRate();
        if (level >= 3 && Math.random() < 0.3) spawnCarObstacle();
    }

    bikeFishTimer--;
    if (bikeFishTimer <= 0) {
        spawnBikeFish();
        bikeFishTimer = levelFishSpawnRate();
    }

    bikeChocoTimer--;
    if (bikeChocoTimer <= 0) {
        spawnBikeChocolate();
        bikeChocoTimer = levelChocoSpawnRate();
    }

    // Update cars
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

        const tgtX = bikeLanes[ob.lane] - (ob.type === 'truck' ? 7 : 6);
        ob.x = lerp(ob.x, tgtX, 0.08);
    }
    bikeObstacles = bikeObstacles.filter(ob => ob.y > -40 && ob.y < H + 40);

    // Update fish
    for (const f of bikeFish) {
        f.timer += 0.05;
        f.x += f.vx * bikeSpeed;
        switch (f.pattern) {
            case 'wave': f.y = f.originY + Math.sin(f.timer * 3) * 15; break;
            case 'dive': f.y = f.originY + Math.sin(f.timer * 1.5) * 30; break;
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

    // Near-miss check (before collision, so we detect near misses on the same frame)
    const bNear = { x: b.x + 1, y: b.y + 2, w: b.w - 2, h: b.h - 2 };
    checkNearMiss(bNear);

    // Collision
    const bHit = { x: b.x + 1, y: b.y + 2, w: b.w - 2, h: b.h - 2 };

    for (const ob of bikeObstacles) {
        if (aabb(bHit, ob)) {
            if (invulnTimer > 0) {
                ob.destroyed = true;
                spawnParticles(ob.x + 6, ob.y + 10, ob.color, 12, 4);
                spawnParticles(ob.x + 6, ob.y + 10, '#ffcc00', 6, 3);
                screenShake = 4;
                SFX.destroy();
            } else {
                b.alive = false; b.deathTimer = 0;
                screenShake = 10;
                spawnParticles(b.x + 5, b.y + 7, PAL.red, 15, 4);
                spawnParticles(b.x + 5, b.y + 7, '#888', 10, 3);
                SFX.death();
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
                screenShake = 3;
                SFX.destroy();
            } else {
                b.alive = false; b.deathTimer = 0;
                screenShake = 8;
                spawnParticles(b.x + 5, b.y + 7, PAL.fishBody, 12, 4);
                SFX.death();
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
            SFX.pickup();
            spawnFloatingText(ch.x + 5, ch.y - 4, 'SUPER SPEED!', '#ffcc00');
        }
    }

    updateParticles();
    updateFloatingTexts();
    decayScreenShake();
}

// ── Bike drawing ──

function drawBikeRoad() {
    const t = currentTheme();

    bctx.fillStyle = t.sky;
    bctx.fillRect(0, 0, W, H);

    bctx.fillStyle = t.grass;
    bctx.fillRect(0, 0, ROAD_LEFT, H);
    bctx.fillRect(ROAD_RIGHT, 0, W - ROAD_RIGHT, H);

    const grassScroll = (bikeScroll * 0.6) % 8;
    for (let gy = -8; gy < H; gy += 8) {
        const ry = gy + grassScroll;
        drawPixel(5, ry, t.grassDark);
        drawPixel(18, ry + 3, t.grassLight);
        drawPixel(12, ry + 5, t.grassDark);
        drawPixel(W - 10, ry + 1, t.grassDark);
        drawPixel(W - 22, ry + 5, t.grassLight);
        drawPixel(W - 16, ry + 3, t.grassDark);
    }

    // Draw scenery behind road
    drawAllScenery(t);

    bctx.fillStyle = t.road;
    bctx.fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, H);

    drawRect(ROAD_LEFT, 0, 2, H, t.edge);
    drawRect(ROAD_RIGHT - 2, 0, 2, H, t.edge);

    const dashLen = 12;
    const gapLen = 10;
    const totalDash = dashLen + gapLen;
    const dashOffset = (bikeScroll * 1.5) % totalDash;
    for (let li = 1; li < 4; li++) {
        const lx = ROAD_LEFT + (ROAD_RIGHT - ROAD_LEFT) * li / 4;
        for (let dy = -dashLen + dashOffset; dy < H + dashLen; dy += totalDash) {
            drawRect(lx - 1, dy, 2, dashLen, t.dash);
        }
    }
}

function drawBikeCar(ob) {
    const x = Math.round(ob.x);
    const y = Math.round(ob.y);

    if (ob.type === 'truck') {
        drawRect(x, y + 2, 14, 18, ob.color);
        drawRect(x + 2, y + 4, 10, 8, darkenColor(ob.color));
        drawRect(x + 2, y + 2, 10, 3, '#88ccff');
        drawPixel(x + 3, y + 2, '#aaddff');
        drawRect(x + 2, y + 18, 10, 2, '#6699bb');
        drawRect(x - 1, y + 3, 2, 5, '#222');
        drawRect(x - 1, y + 16, 2, 5, '#222');
        drawRect(x + 13, y + 3, 2, 5, '#222');
        drawRect(x + 13, y + 16, 2, 5, '#222');
        drawPixel(x + 2, y + 1, '#ffee88');
        drawPixel(x + 11, y + 1, '#ffee88');
        drawPixel(x + 2, y + 20, '#ff4444');
        drawPixel(x + 11, y + 20, '#ff4444');
        drawRect(x + 1, y + 2, 12, 1, lightenColor(ob.color));
    } else {
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

    // Headlight glow for cars coming toward player
    if (ob.vy > 0) {
        bctx.globalAlpha = 0.15;
        drawRect(x + 1, y + ob.h, 3, 4, '#ffee88');
        drawRect(x + ob.w - 4, y + ob.h, 3, 4, '#ffee88');
        bctx.globalAlpha = 1;
    }
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
    drawRect(x + 3, y + 4, 5, 4, PAL.shirt);
    drawPixel(x + 4, y + 4, PAL.shirtHi);
    drawRect(x + 7, y + 5, 2, 2, PAL.skin);
    drawPixel(x + 2, y + 5, PAL.skin);
    drawRect(x + 3, y + 1, 5, 3, PAL.skin);
    drawRect(x + 3, y, 5, 2, PAL.hair);
    drawRect(x + 2, y, 6, 1, PAL.hair);
    drawPixel(x + 4, y, PAL.hairHi);
    drawPixel(x + 6, y, PAL.hairHi);
    drawPixel(x + 2, y - 1, PAL.hair);
    drawPixel(x + 3, y - 1, PAL.hairHi);

    // Hair blowing at high speed
    if (bikeSpeed > 2) {
        drawPixel(x + 1, y - 1, PAL.hair);
        if (bikeSpeed > 3) drawPixel(x, y - 1, PAL.hairHi);
    }

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

    // Speed lines behind everything
    drawSpeedLines(bikeSpeed, invulnTimer > 0);

    for (const ch of bikeChocolates) {
        if (!ch.collected) drawChocolate(ch, 0);
    }

    for (const ob of bikeObstacles) drawBikeCar(ob);
    for (const f of bikeFish) drawBikeFishSprite(f);

    // Weather on top of road
    drawWeather();

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

    // Floating texts
    drawFloatingTexts();

    // Level flash overlay
    if (levelFlash > 0) {
        bctx.globalAlpha = levelFlash / 30;
        bctx.fillStyle = '#ffffff';
        bctx.fillRect(0, 0, W, H);
        bctx.globalAlpha = 1;
    }

    // HUD background strip
    bctx.globalAlpha = 0.5;
    drawRect(0, 0, W, 20, '#000000');
    bctx.globalAlpha = 1;

    bctx.fillStyle = '#fff';
    bctx.font = '8px monospace';
    bctx.textAlign = 'left';
    bctx.fillText('LVL ' + level, 4, 10);
    bctx.textAlign = 'center';
    bctx.fillText('DIST: ' + score, W / 2, 10);
    bctx.textAlign = 'right';
    bctx.fillText('BEST: ' + bikeHighScore, W - 4, 10);
    bctx.textAlign = 'left';

    // Level progress bar
    const barW = 40;
    drawRect(4, 14, barW, 4, '#222');
    drawRect(4, 14, barW, 1, '#444');
    const needed = levelDistance(level);
    const lvlFill = clamp((levelScroll / 8) / needed, 0, 1);
    const lvlColor = lvlFill < 0.5 ? '#44bbff' : lvlFill < 0.8 ? '#44ff44' : '#ffcc00';
    drawRect(4, 14, Math.floor(lvlFill * barW), 4, lvlColor);

    // Theme name on level start
    if (levelScroll / 8 < 30) {
        const t = currentTheme();
        bctx.globalAlpha = clamp(1 - (levelScroll / 8) / 30, 0, 1);
        bctx.fillStyle = '#ffffff';
        bctx.textAlign = 'center';
        bctx.fillText(t.name, W / 2, 30);
        bctx.textAlign = 'left';
        bctx.globalAlpha = 1;
    }

    // Near-miss combo
    if (nearMissCombo >= 2 && nearMissTimer > 0) {
        bctx.fillStyle = '#44ffff';
        bctx.textAlign = 'right';
        bctx.fillText('x' + nearMissCombo, W - 4, 28);
        bctx.textAlign = 'left';
    }

    // Level complete banner
    if (levelComplete) {
        const bannerY = H / 2 - 16;
        bctx.globalAlpha = 0.8;
        drawRect(0, bannerY, W, 32, '#000000');
        bctx.globalAlpha = 1;
        bctx.fillStyle = '#ffcc00';
        bctx.font = '8px monospace';
        bctx.textAlign = 'center';
        bctx.fillText('LEVEL ' + (level - 1) + ' COMPLETE!', W / 2, bannerY + 12);
        bctx.fillStyle = '#aaaaaa';
        bctx.fillText('Level ' + level + ': ' + currentTheme().name, W / 2, bannerY + 24);
        bctx.textAlign = 'left';
    }

    bctx.restore();

    drawDpad();
    blitToScreen();
}
