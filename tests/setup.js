/**
 * Test setup: creates a minimal DOM environment and loads game scripts,
 * making all global functions available for testing.
 *
 * Converts top-level const/let to var so eval() places them in global scope.
 * Only loads scripts once across all test files (via a global flag).
 */
const fs = require('fs');
const path = require('path');

function createMockContext() {
  return {
    fillStyle: '',
    font: '',
    textAlign: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    fillText: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
  };
}

/**
 * Replace top-level const/let with var so they become global when eval'd.
 * Only replaces declarations at the start of a line (not inside functions/blocks).
 */
function makeGlobal(code) {
  return code
    .replace(/^const /gm, 'var ')
    .replace(/^let /gm, 'var ');
}

function setupGameEnvironment() {
  // Prevent double-loading across test files in the same worker
  if (global.__gameLoaded) return;
  global.__gameLoaded = true;

  const mockContext = createMockContext();

  // Mock getContext on ALL canvas elements (including dynamically created ones)
  HTMLCanvasElement.prototype.getContext = jest.fn(() => createMockContext());

  var canvas = document.createElement('canvas');
  canvas.id = 'game';
  canvas.getContext = jest.fn(() => mockContext);
  canvas.getBoundingClientRect = jest.fn(() => ({
    left: 0, top: 0, width: 576, height: 768,
  }));
  document.body.appendChild(canvas);

  // Create overlay element
  var overlay = document.createElement('div');
  overlay.id = 'ui-overlay';
  document.body.appendChild(overlay);

  // Mock localStorage
  const store = {};
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: jest.fn((key) => store[key] || null),
      setItem: jest.fn((key, val) => { store[key] = String(val); }),
      removeItem: jest.fn((key) => { delete store[key]; }),
    },
    writable: true,
  });

  // Mock requestAnimationFrame
  window.requestAnimationFrame = jest.fn();

  // Load and preprocess game scripts
  const gameCode = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf-8');
  const bikeCode = fs.readFileSync(path.join(__dirname, '..', 'bike.js'), 'utf-8');

  // Convert const/let to var at top level, then eval in global scope
  // Using indirect eval: (0, eval)(...) ensures global scope execution
  (0, eval)(makeGlobal(gameCode));
  (0, eval)(makeGlobal(bikeCode));
}

module.exports = { setupGameEnvironment };
