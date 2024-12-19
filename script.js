
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');


const toggleButton = document.getElementById('toggle-button');
const gridContent = document.querySelector('.grid');

toggleButton.addEventListener('click', () => {
  gridContent.classList.toggle('hidden');
  const path = toggleButton.querySelector('path');
  if (gridContent.classList.contains('hidden')) {
    path.setAttribute('d', 'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z');
  } else {
    path.setAttribute('d', 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z');
  }
});

let width, height, cols, rows;
let cellSize = 4; // Even smaller cells
let grid;
let cellAge;
let cellRadius;
let wobblePhase;
let growthFactor;
let mouseX = 0;
let mouseY = 0;

function easeInCubic(t) {
  return t * t * t;
}

function setup() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  width = canvas.width;
  height = canvas.height;
  cols = Math.floor(width / cellSize);
  rows = Math.floor(height / cellSize);
  
  // Initialize with more live cells
  grid = new Array(cols).fill(null)
    .map(() => new Array(rows).fill(null).map(() => Math.random() > 0.7));
    
  cellAge = new Array(cols).fill(null)
    .map(() => new Array(rows).fill(0));
    
  cellRadius = new Array(cols).fill(null)
    .map(() => new Array(rows).fill(0));
    
  wobblePhase = new Array(cols).fill(null)
    .map(() => new Array(rows).fill(0).map(() => Math.random() * Math.PI * 2));
    
  growthFactor = new Array(cols).fill(null)
    .map(() => new Array(rows).fill(0));
}

function draw() {
  ctx.fillStyle = 'rgb(79, 3, 249)';
  ctx.fillRect(0, 0, width, height);
  
  ctx.fillStyle = 'rgb(200, 200, 100)';
  ctx.strokeStyle = 'rgba(200, 200, 100, 0.3)';
  ctx.lineWidth = 2;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let baseRadius = cellRadius[i][j];
      if (baseRadius > 0) {
        let wobble = Math.sin(wobblePhase[i][j]) * 0.3;
        let r = Math.max(0, baseRadius + wobble);
        ctx.beginPath();
        ctx.arc(
          i * cellSize + cellSize,
          j * cellSize + cellSize,
          r,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();
      }
    }
  }
}

function countNeighbors(x, y) {
  let sum = 0;
  for (let i = -1; i < 2; i++) {
    for (let j = -1; j < 2; j++) {
      if (i === 0 && j === 0) continue;
      let col = (x + i + cols) % cols;
      let row = (y + j + rows) % rows;
      sum += grid[col][row] ? 1 : 0;
    }
  }
  return sum;
}

function update() {
  let next = new Array(cols).fill(null)
    .map(() => new Array(rows).fill(false));
  
  let mouseGridX = Math.floor(mouseX / cellSize);
  let mouseGridY = Math.floor(mouseY / cellSize);
  
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let neighbors = countNeighbors(i, j);
      let state = grid[i][j];
      
      if ((state && (neighbors === 2 || neighbors === 3) && cellAge[i][j] < 30) || 
          (!state && (neighbors === 3 || (neighbors > 0 && Math.random() < 0.0001)))) {
        next[i][j] = true;
        cellAge[i][j] = state ? cellAge[i][j] + 1 : 0;
        growthFactor[i][j] = Math.min(growthFactor[i][j] + 0.5, 1);
        cellRadius[i][j] = cellSize * 1.0 * growthFactor[i][j];
      } else {
        next[i][j] = false;
        cellAge[i][j] = 0;
        growthFactor[i][j] = Math.max(growthFactor[i][j] - 0.5, 0);
        cellRadius[i][j] = cellSize * 1.0 * growthFactor[i][j];
      }
      wobblePhase[i][j] += (Math.random() * 0.4 - 0.2);
    }
  }
  
  grid = next;
}

let lastTime = 0;
const frameDelay = 16.7; // milliseconds between frames (60fps)

function animate(currentTime) {
  if (currentTime - lastTime > frameDelay) {
    draw();
    update();
    lastTime = currentTime;
  }
  requestAnimationFrame(animate);
}

function activateCell(x, y) {
  const gridX = Math.floor(x / cellSize);
  const gridY = Math.floor(y / cellSize);
  
  if (gridX >= 0 && gridX < cols && gridY >= 0 && gridY < rows) {
    grid[gridX][gridY] = true;
    let next = grid;
    next[gridX][gridY] = true;
    grid = next;
    
    // Activate some neighboring cells for more interesting patterns
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const newX = (gridX + i + cols) % cols;
        const newY = (gridY + j + rows) % rows;
        if (Math.random() > 0.5) {
          grid[newX][newY] = true;
        }
      }
    }
  }
}

let lastMouseX = 0;
let lastMouseY = 0;

document.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
  
  if (mouseX !== lastMouseX || mouseY !== lastMouseY) {
    activateCell(mouseX, mouseY);
    lastMouseX = mouseX;
    lastMouseY = mouseY;
  }
});

window.addEventListener('resize', setup);
setup();
animate();
