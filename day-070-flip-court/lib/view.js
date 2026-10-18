import { WORLD } from './config.js';

const INK = '#183d34';
const PAPER = '#fff8e7';
const OWNER_COLORS = ['#386b5b', '#efa866', '#84c3ad'];
const FONT = 'system-ui, -apple-system, sans-serif';

export function createRenderer(canvas) {
  let context;
  try {
    context = canvas.getContext('2d');
  } catch {
    return null;
  }
  if (!context) return null;

  function roundedBox(x, y, width, height, radius) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
  }

  function ownerMark(owner, x, y, radius) {
    context.beginPath();
    if (owner === 1) {
      context.arc(x, y, radius, 0, Math.PI * 2);
    } else {
      context.moveTo(x, y - radius - 1);
      context.lineTo(x + radius + 1, y);
      context.lineTo(x, y + radius + 1);
      context.lineTo(x - radius - 1, y);
      context.closePath();
    }
    context.fill();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  function drawCourt(board) {
    context.fillStyle = '#184e42';
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    context.strokeStyle = '#e8f2cf55';
    context.lineWidth = 2;
    roundedBox(21, 21, WORLD.width - 42, WORLD.height - 42, 15);
    context.stroke();
    context.fillStyle = '#103d33';
    roundedBox(WORLD.gridX - 4, WORLD.gridY - 4, WORLD.gridSize + 8, WORLD.gridSize + 8, 6);
    context.fill();
    for (let cell = 0; cell < board.length; cell += 1) {
      const owner = board[cell];
      const x = WORLD.gridX + (cell % WORLD.rows) * WORLD.cellSize;
      const y = WORLD.gridY + Math.floor(cell / WORLD.rows) * WORLD.cellSize;
      context.fillStyle = OWNER_COLORS[owner];
      roundedBox(x + 2, y + 2, WORLD.cellSize - 4, WORLD.cellSize - 4, 4);
      context.fill();
      if (owner !== 0) {
        context.fillStyle = INK;
        ownerMark(owner, x + WORLD.cellSize / 2, y + WORLD.cellSize / 2, 8);
      }
    }
    context.strokeStyle = '#f7f6dc55';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(WORLD.gridX, WORLD.gridY + WORLD.gridSize / 2);
    context.lineTo(WORLD.gridX + WORLD.gridSize, WORLD.gridY + WORLD.gridSize / 2);
    context.stroke();
    context.fillStyle = '#e4efdb';
    context.font = `700 15px ${FONT}`;
    context.textBaseline = 'middle';
    context.fillText('CPU', WORLD.gridX, 94);
    context.fillText('YOU', WORLD.gridX, 671);
    context.strokeStyle = '#e8f2cf44';
    context.setLineDash([4, 6]);
    for (const y of [103, 657]) {
      context.beginPath();
      context.moveTo(WORLD.gridX, y);
      context.lineTo(WORLD.gridX + WORLD.gridSize, y);
      context.stroke();
    }
    context.setLineDash([]);
  }

  function drawLanding(landing, elapsedMs, reducedMotion) {
    if (!landing) return;
    const age = Math.max(0, elapsedMs - landing.atMs);
    context.save();
    context.globalAlpha = reducedMotion ? 1 : Math.max(.72, 1 - age / 2400);
    for (const cell of [...landing.flipped, landing.cell]) {
      const x = WORLD.gridX + (cell % WORLD.rows) * WORLD.cellSize;
      const y = WORLD.gridY + Math.floor(cell / WORLD.rows) * WORLD.cellSize;
      const isLanding = cell === landing.cell;
      context.strokeStyle = PAPER;
      context.lineWidth = isLanding ? 5 : 3;
      context.setLineDash(isLanding ? [] : [7, 5]);
      roundedBox(x + 8, y + 8, WORLD.cellSize - 16, WORLD.cellSize - 16, 7);
      context.stroke();
    }
    context.setLineDash([]);
    context.restore();
    if (!reducedMotion && age < 480) {
      const x = WORLD.gridX + (landing.cell % WORLD.rows + .5) * WORLD.cellSize;
      const y = WORLD.gridY + (Math.floor(landing.cell / WORLD.rows) + .5) * WORLD.cellSize;
      context.save();
      context.globalAlpha = .5 * (1 - age / 480);
      context.strokeStyle = PAPER;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(x, y, 15 + age / 15, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
    const badgeX = WORLD.gridX + WORLD.gridSize - 174;
    context.fillStyle = PAPER;
    roundedBox(badgeX, 80, 174, 27, 13.5);
    context.fill();
    context.fillStyle = INK;
    ownerMark(landing.owner, badgeX + 17, 93.5, 5);
    context.font = `700 14px ${FONT}`;
    context.fillText(`${landing.changed.length}マス変化`, badgeX + 31, 94);
  }

  function drawPaddle(x, y, owner) {
    context.fillStyle = '#072e2966';
    roundedBox(x - WORLD.paddleWidth / 2, y - 5, WORLD.paddleWidth, 19, 9.5);
    context.fill();
    context.fillStyle = OWNER_COLORS[owner];
    roundedBox(x - WORLD.paddleWidth / 2, y - 10, WORLD.paddleWidth, 18, 9);
    context.fill();
    context.strokeStyle = '#f5f3d877';
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = INK;
    ownerMark(owner, x, y - 1, 4);
  }

  function drawBall(ball) {
    if (!ball) return;
    if (!ball.landed) {
      context.save();
      context.strokeStyle = PAPER;
      context.fillStyle = '#fff8e71f';
      context.lineWidth = 2.5;
      context.setLineDash([5, 5]);
      context.beginPath();
      context.arc(ball.targetX, ball.targetY, 19, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(ball.targetX - 5, ball.targetY);
      context.lineTo(ball.targetX + 5, ball.targetY);
      context.moveTo(ball.targetX, ball.targetY - 5);
      context.lineTo(ball.targetX, ball.targetY + 5);
      context.stroke();
      context.restore();
    }
    context.fillStyle = '#082e295c';
    context.beginPath();
    context.ellipse(ball.x, ball.y + 3, WORLD.ballRadius + 2, 5, 0, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(ball.x, ball.y - ball.z, WORLD.ballRadius, 0, Math.PI * 2);
    context.fillStyle = PAPER;
    context.fill();
    context.strokeStyle = INK;
    context.lineWidth = 2.5;
    context.stroke();
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(ball.x - 3, ball.y - ball.z - 3, 2.5, 0, Math.PI * 2);
    context.fill();
  }

  function render(match, { reducedMotion = false } = {}) {
    context.setTransform(canvas.width / WORLD.width, 0, 0, canvas.height / WORLD.height, 0, 0);
    context.clearRect(0, 0, WORLD.width, WORLD.height);
    drawCourt(match.board);
    drawLanding(match.lastLanding, match.elapsedMs, reducedMotion);
    drawPaddle(match.cpuX, WORLD.cpuY, 2);
    drawPaddle(match.playerX, WORLD.playerY, 1);
    drawBall(match.ball);
  }

  return { resize, render };
}
