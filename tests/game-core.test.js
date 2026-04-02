/**
 * Tests for core game engine functions (game.js)
 */
const { setupGameEnvironment } = require('./setup');

beforeAll(() => {
  setupGameEnvironment();
});

// ── seededRandom ──

describe('seededRandom', () => {
  test('produces deterministic output for the same seed', () => {
    seededRandom(12345);
    const a1 = seededRandom();
    const a2 = seededRandom();
    const a3 = seededRandom();

    seededRandom(12345);
    expect(seededRandom()).toBe(a1);
    expect(seededRandom()).toBe(a2);
    expect(seededRandom()).toBe(a3);
  });

  test('returns values in [0, 1) range', () => {
    seededRandom(99);
    for (let i = 0; i < 100; i++) {
      const v = seededRandom();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('different seeds produce different sequences', () => {
    seededRandom(1);
    const seq1 = [seededRandom(), seededRandom(), seededRandom()];

    seededRandom(2);
    const seq2 = [seededRandom(), seededRandom(), seededRandom()];

    expect(seq1).not.toEqual(seq2);
  });
});

// ── Math helpers ──

describe('clamp', () => {
  test('clamps value below minimum', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  test('clamps value above maximum', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  test('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  test('handles edge values', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  test('returns a when t=0', () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  test('returns b when t=1', () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  test('returns midpoint when t=0.5', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  test('handles negative values', () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });
});

describe('aabb (axis-aligned bounding box collision)', () => {
  test('detects overlapping rectangles', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 5, y: 5, w: 10, h: 10 };
    expect(aabb(a, b)).toBe(true);
  });

  test('returns false for non-overlapping rectangles', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 20, y: 20, w: 10, h: 10 };
    expect(aabb(a, b)).toBe(false);
  });

  test('returns false for edge-touching rectangles (no overlap)', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 10, y: 0, w: 10, h: 10 };
    expect(aabb(a, b)).toBe(false);
  });

  test('detects full containment', () => {
    const a = { x: 0, y: 0, w: 20, h: 20 };
    const b = { x: 5, y: 5, w: 5, h: 5 };
    expect(aabb(a, b)).toBe(true);
  });

  test('handles single-pixel overlap', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 9, y: 9, w: 10, h: 10 };
    expect(aabb(a, b)).toBe(true);
  });
});

describe('pointInRect', () => {
  const r = { x: 10, y: 10, w: 20, h: 20 };

  test('returns true for point inside rect', () => {
    expect(pointInRect(15, 15, r)).toBe(true);
  });

  test('returns true for point on top-left corner', () => {
    expect(pointInRect(10, 10, r)).toBe(true);
  });

  test('returns false for point on bottom-right edge (exclusive)', () => {
    expect(pointInRect(30, 30, r)).toBe(false);
  });

  test('returns false for point outside rect', () => {
    expect(pointInRect(5, 5, r)).toBe(false);
  });
});

// ── Color utilities ──

describe('darkenColor', () => {
  test('darkens a hex color by 40', () => {
    expect(darkenColor('#ffffff')).toBe('#d7d7d7');
  });

  test('clamps at 0 (no negative values)', () => {
    expect(darkenColor('#101010')).toBe('#000000');
  });

  test('handles mid-range color', () => {
    const result = darkenColor('#884488');
    expect(result).toBe('#601c60');
  });
});

describe('lightenColor', () => {
  test('lightens a hex color by 40', () => {
    expect(lightenColor('#000000')).toBe('#282828');
  });

  test('clamps at 255', () => {
    expect(lightenColor('#f0f0f0')).toBe('#ffffff');
  });
});

// ── Particle system ──

describe('spawnParticles', () => {
  beforeEach(() => {
    particles = [];
  });

  test('creates the correct number of particles', () => {
    spawnParticles(50, 50, '#ff0000', 10, 3);
    expect(particles.length).toBe(10);
  });

  test('particles have correct position', () => {
    spawnParticles(100, 200, '#ff0000', 5, 3);
    particles.forEach(p => {
      expect(p.x).toBe(100);
      expect(p.y).toBe(200);
    });
  });

  test('particles have correct color', () => {
    spawnParticles(0, 0, '#44ff44', 3, 1);
    particles.forEach(p => {
      expect(p.color).toBe('#44ff44');
    });
  });

  test('particles have positive life', () => {
    spawnParticles(0, 0, '#fff', 10, 1);
    particles.forEach(p => {
      expect(p.life).toBeGreaterThan(0);
      expect(p.life).toBeLessThanOrEqual(40);
    });
  });

  test('particles accumulate across multiple spawns', () => {
    spawnParticles(0, 0, '#f00', 5, 1);
    spawnParticles(0, 0, '#0f0', 3, 1);
    expect(particles.length).toBe(8);
  });
});

describe('updateParticles', () => {
  beforeEach(() => {
    particles = [];
  });

  test('removes particles with life <= 0', () => {
    particles.push({
      x: 0, y: 0, vx: 0, vy: 0, life: 1, maxLife: 40, color: '#f00', size: 1
    });
    updateParticles(); // life goes from 1 to 0
    expect(particles.length).toBe(0);
  });

  test('keeps particles with remaining life', () => {
    particles.push({
      x: 0, y: 0, vx: 0, vy: 0, life: 30, maxLife: 40, color: '#f00', size: 1
    });
    updateParticles();
    expect(particles.length).toBe(1);
    expect(particles[0].life).toBe(29);
  });

  test('applies velocity to position', () => {
    particles.push({
      x: 10, y: 20, vx: 2, vy: -1, life: 30, maxLife: 40, color: '#f00', size: 1
    });
    updateParticles();
    expect(particles[0].x).toBe(12);
    expect(particles[0].y).toBe(19); // vy applied first, then gravity added to vy
  });

  test('applies gravity to vy', () => {
    particles.push({
      x: 0, y: 0, vx: 0, vy: 0, life: 30, maxLife: 40, color: '#f00', size: 1
    });
    updateParticles();
    expect(particles[0].vy).toBeCloseTo(0.08);
  });
});

// ── Screen shake ──

describe('decayScreenShake', () => {
  test('decays screen shake by factor of 0.85', () => {
    screenShake = 10;
    decayScreenShake();
    expect(screenShake).toBe(8.5);
  });

  test('snaps to 0 when below 0.5', () => {
    screenShake = 0.4;
    decayScreenShake();
    expect(screenShake).toBe(0);
  });

  test('does nothing when already 0', () => {
    screenShake = 0;
    decayScreenShake();
    expect(screenShake).toBe(0);
  });
});
