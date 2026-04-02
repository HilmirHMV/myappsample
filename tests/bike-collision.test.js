/**
 * Tests for collision detection and game state transitions (bike.js)
 */
const { setupGameEnvironment } = require('./setup');

beforeAll(() => {
  setupGameEnvironment();
});

beforeEach(() => {
  // Reset game state before each test
  state = 'playing';
  particles = [];
  screenShake = 0;
  invulnTimer = 0;
  score = 0;
  startBikeMode();
});

// ── Collision with cars ──

describe('car collision', () => {
  test('kills the biker on collision without invulnerability', () => {
    // Place a car directly on the biker
    bikeObstacles.push({
      x: bike.x, y: bike.y, w: 12, h: 20,
      vy: 1, color: '#cc3333', type: 'car', lane: bike.lane, laneChangeTimer: 0
    });

    updateBike();
    expect(bike.alive).toBe(false);
  });

  test('does not kill biker when invulnerable', () => {
    invulnTimer = 100;

    bikeObstacles.push({
      x: bike.x, y: bike.y, w: 12, h: 20,
      vy: 1, color: '#cc3333', type: 'car', lane: bike.lane, laneChangeTimer: 0
    });

    updateBike();
    expect(bike.alive).toBe(true);
  });

  test('destroys the car when biker is invulnerable', () => {
    invulnTimer = 100;

    bikeObstacles.push({
      x: bike.x, y: bike.y, w: 12, h: 20,
      vy: 1, color: '#cc3333', type: 'car', lane: bike.lane, laneChangeTimer: 0
    });

    updateBike();
    // Destroyed cars are filtered out
    const remaining = bikeObstacles.filter(ob => !ob.destroyed);
    expect(remaining.length).toBe(0);
  });

  test('spawns particles on death', () => {
    bikeObstacles.push({
      x: bike.x, y: bike.y, w: 12, h: 20,
      vy: 1, color: '#cc3333', type: 'car', lane: bike.lane, laneChangeTimer: 0
    });

    updateBike();
    expect(particles.length).toBeGreaterThan(0);
  });

  test('triggers screen shake on death', () => {
    bikeObstacles.push({
      x: bike.x, y: bike.y, w: 12, h: 20,
      vy: 1, color: '#cc3333', type: 'car', lane: bike.lane, laneChangeTimer: 0
    });

    updateBike();
    expect(screenShake).toBe(10);
  });

  test('no collision when car is far away', () => {
    bikeObstacles.push({
      x: bike.x + 100, y: bike.y + 100, w: 12, h: 20,
      vy: 1, color: '#cc3333', type: 'car', lane: 3, laneChangeTimer: 0
    });

    updateBike();
    expect(bike.alive).toBe(true);
  });
});

// ── Collision with fish ──

describe('fish collision', () => {
  test('kills the biker on collision without invulnerability', () => {
    bikeFish.push({
      x: bike.x, y: bike.y, w: 10, h: 6,
      vx: 1, pattern: 'straight', originY: bike.y, timer: 0
    });

    updateBike();
    expect(bike.alive).toBe(false);
  });

  test('does not kill biker when invulnerable', () => {
    invulnTimer = 100;

    bikeFish.push({
      x: bike.x, y: bike.y, w: 10, h: 6,
      vx: 1, pattern: 'straight', originY: bike.y, timer: 0
    });

    updateBike();
    expect(bike.alive).toBe(true);
  });

  test('destroys the fish when biker is invulnerable', () => {
    invulnTimer = 100;

    bikeFish.push({
      x: bike.x, y: bike.y, w: 10, h: 6,
      vx: 1, pattern: 'straight', originY: bike.y, timer: 0
    });

    updateBike();
    const remaining = bikeFish.filter(f => !f.destroyed);
    expect(remaining.length).toBe(0);
  });
});

// ── Chocolate collection ──

describe('chocolate collection', () => {
  test('collecting chocolate grants invulnerability', () => {
    bikeChocolates.push({
      x: bike.x, y: bike.y, w: 10, h: 8,
      vy: 1, collected: false, animTimer: 0
    });

    updateBike();
    expect(invulnTimer).toBe(180);
  });

  test('chocolate is marked as collected after pickup', () => {
    bikeChocolates.push({
      x: bike.x, y: bike.y, w: 10, h: 8,
      vy: 1, collected: false, animTimer: 0
    });

    updateBike();
    const collected = bikeChocolates.filter(ch => ch.collected);
    expect(collected.length).toBe(1);
  });

  test('already-collected chocolate cannot be picked up again', () => {
    bikeChocolates.push({
      x: bike.x, y: bike.y, w: 10, h: 8,
      vy: 1, collected: true, animTimer: 0
    });

    updateBike();
    // invulnTimer should remain 0 (not granted again)
    expect(invulnTimer).toBe(0);
  });

  test('spawns particles on chocolate pickup', () => {
    bikeChocolates.push({
      x: bike.x, y: bike.y, w: 10, h: 8,
      vy: 1, collected: false, animTimer: 0
    });

    updateBike();
    expect(particles.length).toBeGreaterThan(0);
  });
});

// ── Hit box shrinkage ──

describe('hit box', () => {
  test('biker hit box is smaller than visual bounds (1px inset)', () => {
    // The hit box is { x: b.x+1, y: b.y+2, w: b.w-2, h: b.h-2 }
    // So a car placed just at the visual edge but outside the hit box should not collide
    const justOutside = {
      x: bike.x + bike.w, // right at the visual right edge
      y: bike.y, w: 12, h: 20,
      vy: 1, color: '#cc3333', type: 'car', lane: 3, laneChangeTimer: 0
    };
    bikeObstacles.push(justOutside);

    updateBike();
    expect(bike.alive).toBe(true);
  });
});

// ── Death state transition ──

describe('death state transition', () => {
  test('transitions to dead state after 60-frame death timer', () => {
    bike.alive = false;
    bike.deathTimer = 0;

    // Run 61 updates (deathTimer increments each frame)
    for (let i = 0; i < 61; i++) {
      updateBike();
    }

    expect(state).toBe('dead');
  });

  test('saves high score on death if score is higher', () => {
    score = 999;
    bike.alive = false;
    bike.deathTimer = 60;

    updateBike();

    expect(localStorage.setItem).toHaveBeenCalledWith('bikeHighScore', 999);
  });
});

// ── Invulnerability timer ──

describe('invulnerability', () => {
  test('invulnTimer decrements each frame', () => {
    invulnTimer = 10;
    updateBike();
    // Timer decrements at end of update
    expect(invulnTimer).toBeLessThan(10);
  });

  test('invulnTimer does not go below 0', () => {
    invulnTimer = 0;
    updateBike();
    expect(invulnTimer).toBe(0);
  });

  test('bike speed is boosted during invulnerability', () => {
    invulnTimer = 0;
    const normalSpeed = levelBaseSpeed() + score / 500;

    invulnTimer = 100;
    updateBike();
    // bikeSpeed should be baseSpeed + 2.5 during invuln
    expect(bikeSpeed).toBeCloseTo(normalSpeed + 2.5, 0);
  });
});
