// Enhanced Carrom game (resume-ready)
// Features: physics collisions, pockets, queen scoring, local multiplayer, simple AI, power meter, touch support.

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const W = canvas.width, H = canvas.height;
const center = {x: W/2, y: H/2};
const pocketRadius = 28;
const strikerRadius = 16;
const coinRadius = 12;

let players = 2;
let targetScore = 10;

let scores = [0,0];
let currentPlayer = 0; // 0 -> P1, 1 -> P2
let shotReady = true;
let coinPocketed = false;
let gameOver = false;
let highScore = parseInt(localStorage.getItem('carromHigh')||'0');

document.getElementById('highScore').innerText = 'High Score: ' + highScore;

// Settings
let friction = 0.98;
let sfxvol = 0.6;
let colorBlind = false;

// Game objects
let striker = {x: center.x, y: H - 70, r: strikerRadius, vx:0, vy:0, mass:1, dragging:false, startX:0, startY:0};
let coins = [];
let pockets = [
  {x:40, y:40}, {x:W-40, y:40}, {x:40, y:H-40}, {x:W-40, y:H-40}
];

function seedCoins(){
  coins = [];
  // queen
  coins.push({x:center.x, y:center.y-20, r:coinRadius, color:'red', queen:true, vx:0, vy:0, mass:1});
  // surrounding coins
  const positions = [
    {x:center.x, y:center.y+10},
    {x:center.x-26, y:center.y+10},
    {x:center.x+26, y:center.y+10},
    {x:center.x-18, y:center.y+36},
    {x:center.x+18, y:center.y+36},
    {x:center.x-42, y:center.y-8},
    {x:center.x+42, y:center.y-8},
  ];
  for(let i=0;i<positions.length;i++){
    coins.push({...positions[i], r:coinRadius, color: i%2? 'black':'white', queen:false, vx:0, vy:0, mass:1});
  }
}

seedCoins();

// Utility
function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

// Collision resolution (elastic, mass based)
function resolveCollision(a,b){
  let dx = b.x - a.x, dy = b.y - a.y;
  let distAB = Math.hypot(dx,dy);
  if(distAB === 0) { distAB = 0.0001; dx = 1; dy = 0; }
  const nx = dx/distAB, ny = dy/distAB;
  const p = 2 * ((a.vx*nx + a.vy*ny) - (b.vx*nx + b.vy*ny)) / (a.mass + b.mass);
  a.vx = a.vx - p * b.mass * nx;
  a.vy = a.vy - p * b.mass * ny;
  b.vx = b.vx + p * a.mass * nx;
  b.vy = b.vy + p * a.mass * ny;
  // overlap correction
  const overlap = (a.r + b.r) - distAB;
  if(overlap > 0){
    a.x -= nx * overlap/2;
    a.y -= ny * overlap/2;
    b.x += nx * overlap/2;
    b.y += ny * overlap/2;
  }
}

// Physics update
function updatePhysics(){
  // striker
  if(!striker.dragging){
    striker.x += striker.vx;
    striker.y += striker.vy;
    striker.vx *= friction;
    striker.vy *= friction;
  }
  // coins
  for(let c of coins){
    c.x += c.vx;
    c.y += c.vy;
    c.vx *= friction;
    c.vy *= friction;
  }
  // collisions: striker <-> coins
  for(let c of coins){
    if(dist(striker,c) < striker.r + c.r){
      resolveCollision(striker, c);
    }
  }
  // coins <-> coins
  for(let i=0;i<coins.length;i++){
    for(let j=i+1;j<coins.length;j++){
      if(dist(coins[i], coins[j]) < coins[i].r + coins[j].r){
        resolveCollision(coins[i], coins[j]);
      }
    }
  }
  // boundaries
  if(striker.x - striker.r < 0 || striker.x + striker.r > W) striker.vx *= -1;
  if(striker.y - striker.r < 0 || striker.y + striker.r > H) striker.vy *= -1;
  for(let c of coins){
    if(c.x - c.r < 0 || c.x + c.r > W) c.vx *= -1;
    if(c.y - c.r < 0 || c.y + c.r > H) c.vy *= -1;
  }
  // pocketing
  for(let i=coins.length-1;i>=0;i--){
    const c = coins[i];
    for(let p of pockets){
      if(Math.hypot(c.x - p.x, c.y - p.y) < pocketRadius){
        // pocket coin
        if(c.queen) scores[currentPlayer] += 5;
        else scores[currentPlayer] += 1;
        coins.splice(i,1);
        coinPocketed = true;
        updateScoreUI();
        break;
      }
    }
  }
  // striker pocket - reset
  for(let p of pockets){
    if(Math.hypot(striker.x - p.x, striker.y - p.y) < pocketRadius){
      // foul: move striker back
      striker.x = center.x; striker.y = H - 70;
      striker.vx = 0; striker.vy = 0;
    }
  }
}

// Draw functions
function drawBoard(){
  // background
  ctx.clearRect(0,0,W,H);
  // board background
  const grd = ctx.createLinearGradient(0,0,W,H);
  grd.addColorStop(0, '#e6d6b3'); grd.addColorStop(1, '#d1b48c');
  ctx.fillStyle = grd;
  ctx.fillRect(0,0,W,H);
  // inner rim
  ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 14;
  ctx.strokeRect(0,0,W,H);
  // pockets
  for(let p of pockets){
    ctx.beginPath();
    ctx.fillStyle = '#000';
    ctx.arc(p.x, p.y, pocketRadius, 0, Math.PI*2);
    ctx.fill();
  }
  // center circle
  ctx.beginPath(); ctx.strokeStyle='#333'; ctx.lineWidth=2;
  ctx.arc(center.x, center.y, 48, 0, Math.PI*2); ctx.stroke();
}

function drawCoins(){
  for(let c of coins){
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI*2);
    ctx.fillStyle = c.color;
    ctx.fill();
    ctx.strokeStyle = '#222'; ctx.stroke();
    if(c.queen){
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r-4, 0, Math.PI*2);
      ctx.fillStyle = '#fff'; ctx.fill();
    }
  }
}

function drawStriker(){
  ctx.beginPath();
  ctx.arc(striker.x, striker.y, striker.r, 0, Math.PI*2);
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle='#444'; ctx.stroke();
}

// power meter
function setPowerMeter(pct){
  const meter = document.querySelector('.power');
  let fill = meter.querySelector('.fill');
  if(!fill){ fill = document.createElement('div'); fill.className='fill'; meter.appendChild(fill); }
  fill.style.width = (pct*100)+'%';
}

// UI updates
function updateScoreUI(){
  document.getElementById('scoreDisplay').innerText = 'P1: ' + scores[0] + ' | P2: ' + scores[1];
  document.getElementById('turnDisplay').innerText = 'Turn: Player ' + (currentPlayer+1);
  if(Math.max(scores[0], scores[1]) > highScore){
    highScore = Math.max(scores[0], scores[1]);
    localStorage.setItem('carromHigh', highScore);
    document.getElementById('highScore').innerText = 'High Score: ' + highScore;
  }
}

// Main loop
let last = performance.now();
function loop(now){
  if(gameOver){ return; }
  const dt = now - last; last = now;
  updatePhysics();
  drawBoard();
  drawCoins();
  drawStriker();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Input handling (mouse / touch)
function getRectPos(e){
  const rect = canvas.getBoundingClientRect();
  if(e.touches) {
    return {x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top};
  }
  return {x: e.clientX - rect.left, y: e.clientY - rect.top};
}

canvas.addEventListener('mousedown', (e)=>{
  const pos = getRectPos(e);
  if(Math.hypot(pos.x - striker.x, pos.y - striker.y) < striker.r){
    striker.dragging = true;
    striker.startX = pos.x; striker.startY = pos.y;
  }
});
canvas.addEventListener('mousemove', (e)=>{
  if(striker.dragging){
    const pos = getRectPos(e);
    striker.x = pos.x; striker.y = pos.y;
    // power display (based on drag distance)
    const dx = striker.x - striker.startX, dy = striker.y - striker.startY;
    let power = clamp(Math.hypot(dx,dy)/120, 0, 1);
    setPowerMeter(power);
  }
});
canvas.addEventListener('mouseup', (e)=>{
  if(striker.dragging){
    const pos = getRectPos(e);
    const dx = pos.x - striker.startX, dy = pos.y - striker.startY;
    // velocity opposite to drag
    striker.vx = -dx * 0.25;
    striker.vy = -dy * 0.25;
    striker.dragging = false;
    // reset power meter
    setPowerMeter(0);
    shotReady = false;
    strikerResetAfterShot();
    // if coin pocketed stays true, same player gets another shot
    setTimeout(()=>{
      if(!coinPocketed){
        currentPlayer = (currentPlayer+1) % players;
      }
      coinPocketed = false;
      updateScoreUI();
    }, 1200);
  }
});
canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); const pos = getRectPos(e); if(Math.hypot(pos.x - striker.x, pos.y - striker.y) < striker.r){ striker.dragging=true; striker.startX=pos.x; striker.startY=pos.y; }});
canvas.addEventListener('touchmove', (e)=>{ e.preventDefault(); if(striker.dragging){ const pos = getRectPos(e); striker.x=pos.x; striker.y=pos.y; setPowerMeter(clamp(Math.hypot(striker.x-striker.startX, striker.y-striker.startY)/120,0,1)); }});
canvas.addEventListener('touchend', (e)=>{ e.preventDefault(); if(striker.dragging){ const pos = getRectPos(e.changedTouches[0]); const dx = pos.x - striker.startX, dy = pos.y - striker.startY; striker.vx = -dx * 0.25; striker.vy = -dy * 0.25; striker.dragging=false; setPowerMeter(0); strikerResetAfterShot(); setTimeout(()=>{ if(!coinPocketed) currentPlayer=(currentPlayer+1)%players; coinPocketed=false; updateScoreUI(); },1200); }});

// striker reset when all velocities low
function strikerResetAfterShot(){
  const check = setInterval(()=>{
    const moving = Math.abs(striker.vx) > 0.3 || Math.abs(striker.vy) > 0.3 || coins.some(c=>Math.abs(c.vx)>0.3 || Math.abs(c.vy)>0.3);
    if(!moving){
      striker.x = center.x; striker.y = H - 70; striker.vx=0; striker.vy=0;
      clearInterval(check);
      shotReady = true;
      // check end conditions
      if(scores[0] >= targetScore || scores[1] >= targetScore || coins.length===0){
        endGame();
      }
    }
  }, 300);
}

// simple AI: aims at nearest coin with slight randomness
function aiShot(){
  if(players !== 1 || currentPlayer !== 1) return;
  if(!shotReady) return;
  if(coins.length===0) return;
  let target = coins.reduce((a,b)=> dist({x:W-70,y:H-70},a) < dist({x:W-70,y:H-70},b)?a:b );
  // aim from striker to target with random error
  const dx = target.x - striker.x, dy = target.y - striker.y;
  const angle = Math.atan2(dy,dx) + (Math.random()-0.5)*0.35;
  const power = 18 + Math.random()*6;
  striker.vx = Math.cos(angle) * power;
  striker.vy = Math.sin(angle) * power;
  shotReady = false;
  strikerResetAfterShot();
  setTimeout(()=>{ if(!coinPocketed) currentPlayer = (currentPlayer+1)%players; coinPocketed=false; updateScoreUI(); }, 1300);
}

// game controls
document.getElementById('startBtn').addEventListener('click', ()=>{
  players = parseInt(document.getElementById('playerSelect').value,10);
  targetScore = parseInt(document.getElementById('targetScore').value,10) || 10;
  scores = [0,0];
  currentPlayer = 0;
  seedCoins();
  updateScoreUI();
  document.getElementById('menu').style.display = 'none';
  document.getElementById('instructions').style.display = 'none';
  document.getElementById('settings').style.display = 'none';
  gameOver = false;
  requestAnimationFrame(loop);
});
document.getElementById('instructionsBtn').addEventListener('click', ()=>{ document.getElementById('menu').style.display='none'; document.getElementById('instructions').style.display='flex'; });
document.getElementById('closeInstructions').addEventListener('click', ()=>{ document.getElementById('instructions').style.display='none'; document.getElementById('menu').style.display='flex'; });
document.getElementById('openSettingsBtn').addEventListener('click', ()=>{ document.getElementById('settings').style.display='flex'; });
document.getElementById('closeSettings').addEventListener('click', ()=>{ document.getElementById('settings').style.display='none'; });
document.getElementById('saveSettings').addEventListener('click', ()=>{
  friction = parseFloat(document.getElementById('frictionRange').value);
  sfxvol = parseFloat(document.getElementById('sfxRange').value);
  colorBlind = document.getElementById('colorBlind').checked;
  document.getElementById('settings').style.display='none';
});
document.getElementById('pauseBtn').addEventListener('click', ()=>{
  if(document.hidden) return;
  gameOver = !gameOver;
  document.getElementById('pauseBtn').innerText = gameOver ? 'Resume' : 'Pause';
});
document.getElementById('restartBtn').addEventListener('click', ()=>{
  scores=[0,0]; currentPlayer=0; seedCoins(); updateScoreUI(); gameOver=false;
  striker.x = center.x; striker.y = H - 70; striker.vx=0; striker.vy=0;
});
document.addEventListener('keydown',(e)=>{ if(e.key.toLowerCase()==='p'){ gameOver = !gameOver; document.getElementById('pauseBtn').innerText = gameOver ? 'Resume' : 'Pause'; } if(e.key.toLowerCase()==='r'){ document.getElementById('restartBtn').click(); } });

// end game
function endGame(){
  gameOver = true;
  const winner = scores[0] === scores[1] ? 'Draw' : (scores[0] > scores[1] ? 'Player 1 Wins!' : 'Player 2 Wins!');
  document.getElementById('gameOver').style.display = 'block';
  document.getElementById('gameOver').innerHTML = '<h2>Game Over</h2><p>' + winner + '</p><button onclick="location.reload()">Play Again</button>';
}
