import { Game } from './game.js';

// Single entry point – create the game and expose it globally
// so HTML onclick handlers can reach it.
const game = new Game();
window.game = game;
