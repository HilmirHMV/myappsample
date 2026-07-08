/**
 * Tests for power-ups, missions, boss levels, wave pacing,
 * progression unlocks, and pause (bike.js + game.js)
 */
const { setupGameEnvironment } = require('./setup');

beforeAll(() => {
  setupGameEnvironment();
});

beforeEach(() => {
  state = 'playing';
  startBikeMode();
  score = 0;
  invulnTimer = 0;
  hitStop = 0;
});

// ── Missions ──

describe('missions', () => {
  test('startBikeMode assigns a mission', () => {
    expect(mission).not.toBeNull();
    expect(mission.progress).toBe(0);
    expect(mission.done).toBe(false);
    expect(mission.n).toBeGreaterThan(0);
  });

  test('pickMission returns a valid mission type', () => {
    for (let i = 0; i < 20; i++) {
      const m = pickMission();
      expect(['nearmiss', 'choco', 'destroy']).toContain(m.type);
      expect(m.text.length).toBeGreaterThan(0);
    }
  });

  test('missionProgress only counts matching type', () => {
    mission = { type: 'choco', n: 2, text: 'x', progress: 0, done: false };
    missionProgress('nearmiss');
    expect(mission.progress).toBe(0);
    missionProgress('choco');
    expect(mission.progress).toBe(1);
  });

  test('completing a mission awards bonus points once', () => {
    mission = { type: 'destroy', n: 1, text: 'x', progress: 0, done: false };
    const before = score;
    missionProgress('destroy');
    expect(mission.done).toBe(true);
    expect(score).toBe(before + MISSION_REWARD);
    missionProgress('destroy'); // already done — no double reward
    expect(score).toBe(before + MISSION_REWARD);
  });
});

// ── Boss levels ──

describe('boss levels', () => {
  test('every 5th level is a boss level', () => {
    expect(isBossLevel(5)).toBe(true);
    expect(isBossLevel(10)).toBe(true);
    expect(isBossLevel(1)).toBe(false);
    expect(isBossLevel(4)).toBe(false);
    expect(isBossLevel(6)).toBe(false);
  });

  test('level 1 has no boss', () => {
    expect(boss).toBeNull();
  });

  test('boss spawns with full HP on boss levels', () => {
    level = 5;
    startLevel();
    expect(boss).not.toBeNull();
    expect(boss.hp).toBe(BOSS_HP);
  });

  test('level does not complete while boss is alive', () => {
    level = 5;
    startLevel();
    levelScroll = levelDistance(5) * SCORE_DIVISOR + 100;
    updateBike();
    expect(levelComplete).toBe(false);
    expect(level).toBe(5);
  });
});

// ── Power-ups ──

describe('power-ups', () => {
  test('spawnBikePickup creates a valid pickup', () => {
    bikePickups = [];
    spawnBikePickup();
    expect(bikePickups.length).toBe(1);
    expect(PICKUP_TYPES).toContain(bikePickups[0].type);
    expect(bikePickups[0].collected).toBe(false);
  });

  test('shield pickup grants a shield', () => {
    bikeShield = false;
    applyPickup({ x: 50, y: 50, w: 10, h: 10, type: 'shield' }, bike);
    expect(bikeShield).toBe(true);
  });

  test('bell shockwave clears all fish and cars', () => {
    bikeFish = [
      { x: 50, y: 50, w: 10, h: 6, timer: 0 },
      { x: 80, y: 80, w: 10, h: 6, timer: 0 },
    ];
    bikeObstacles = [
      { x: 60, y: 60, w: 12, h: 20, color: '#cc3333' },
    ];
    applyPickup({ x: 50, y: 50, w: 10, h: 10, type: 'bell' }, bike);
    expect(bikeFish.length).toBe(0);
    expect(bikeObstacles.length).toBe(0);
  });

  test('bell shockwave counts cars toward destroy missions', () => {
    mission = { type: 'destroy', n: 2, text: 'x', progress: 0, done: false };
    bikeObstacles = [
      { x: 60, y: 60, w: 12, h: 20, color: '#cc3333' },
      { x: 90, y: 90, w: 12, h: 20, color: '#3366cc' },
    ];
    applyPickup({ x: 50, y: 50, w: 10, h: 10, type: 'bell' }, bike);
    expect(mission.done).toBe(true);
  });

  test('magnet pickup starts the magnet timer', () => {
    magnetTimer = 0;
    applyPickup({ x: 50, y: 50, w: 10, h: 10, type: 'magnet' }, bike);
    expect(magnetTimer).toBe(MAGNET_DURATION);
  });

  test('magnetPull moves items toward the biker within range', () => {
    const item = { x: bike.x + 30, y: bike.y, w: 10, h: 8 };
    const beforeX = item.x;
    magnetPull(item, bike);
    expect(item.x).toBeLessThan(beforeX);
  });

  test('magnetPull ignores items out of range', () => {
    const item = { x: bike.x + MAGNET_RANGE + 50, y: bike.y, w: 10, h: 8 };
    const beforeX = item.x;
    magnetPull(item, bike);
    expect(item.x).toBe(beforeX);
  });

  test('shieldAbsorb consumes shield and grants mercy invulnerability', () => {
    bikeShield = true;
    const ob = { destroyed: false };
    shieldAbsorb(ob, bike);
    expect(bikeShield).toBe(false);
    expect(ob.destroyed).toBe(true);
    expect(invulnTimer).toBe(SHIELD_MERCY_FRAMES);
  });
});

// ── Death & slow motion ──

describe('death', () => {
  test('killBiker sets slow-motion hit stop', () => {
    killBiker(bike, '#ff0000');
    expect(bike.alive).toBe(false);
    expect(hitStop).toBe(30);
  });
});

// ── Wave pacing ──

describe('wave pacing', () => {
  test('start of cycle is not calm', () => {
    waveTimer = 0;
    expect(inCalmWindow()).toBe(false);
    waveTimer = WAVE_CYCLE - WAVE_CALM - 1;
    expect(inCalmWindow()).toBe(false);
  });

  test('end of cycle is calm', () => {
    waveTimer = WAVE_CYCLE - WAVE_CALM;
    expect(inCalmWindow()).toBe(true);
    waveTimer = WAVE_CYCLE - 1;
    expect(inCalmWindow()).toBe(true);
  });

  test('calm resets on next cycle', () => {
    waveTimer = WAVE_CYCLE;
    expect(inCalmWindow()).toBe(false);
  });
});

// ── Progression unlocks ──

describe('progression', () => {
  test('currentFrame returns the best unlocked frame', () => {
    totalDistance = 0;
    expect(currentFrame().name).toBe('CLASSIC');
    totalDistance = 1500;
    expect(currentFrame().name).toBe('RED ROCKET');
    totalDistance = 99999;
    expect(currentFrame().name).toBe('NEON NIGHT');
  });

  test('newUnlocks finds thresholds crossed by a run', () => {
    expect(newUnlocks(500, 900).length).toBe(0);
    expect(newUnlocks(500, 1200).map(u => u.name)).toEqual(['RED ROCKET']);
    expect(newUnlocks(900, 6000).map(u => u.name)).toEqual(['RED ROCKET', 'BLUE BLAZE', 'GOLD GLIDER']);
  });

  test('unlock thresholds are strictly increasing', () => {
    for (let i = 1; i < FRAME_UNLOCKS.length; i++) {
      expect(FRAME_UNLOCKS[i].dist).toBeGreaterThan(FRAME_UNLOCKS[i - 1].dist);
    }
  });
});

// ── Pause ──

describe('pause', () => {
  test('togglePause pauses and resumes play', () => {
    state = 'playing';
    togglePause();
    expect(state).toBe('paused');
    togglePause();
    expect(state).toBe('playing');
  });

  test('togglePause does nothing on title or dead', () => {
    state = 'title';
    togglePause();
    expect(state).toBe('title');
    state = 'dead';
    togglePause();
    expect(state).toBe('dead');
  });

  test('updateBike does nothing while paused', () => {
    state = 'paused';
    const scrollBefore = bikeScroll;
    updateBike();
    expect(bikeScroll).toBe(scrollBefore);
  });
});
