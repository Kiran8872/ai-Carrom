// FIXED GAME LOGIC - AI Only Takes AI Turns + Improved Physics

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let game = {
    screen: 'menu',
    paused: false,
    over: false,
    dragging: false,
    difficulty: 'normal',
    playerShots: 0,
    aiShots: 0,
    playerScore: 0,
    aiScore: 0,
    striker: {},
    coins: [],
    dragStart: { x: 0, y: 0 },
    dragCurrent: { x: 0, y: 0 },
    animationId: null,
    highScores: [],
    startTime: 0,
    currentTurn: 'player', // 'player' or 'ai'
    lastShotTime: 0,
    strikerMoving: false,
    coinsMoving: false,
    waitingForPhysics: false,
    physicsSettleCounter: 0
};

// ==================== INITIALIZATION ====================
game.highScores = JSON.parse(localStorage.getItem('carromHighScores') || '[]');
game.striker = resetStriker();
updateLeaderboard();

// ==================== UI FUNCTIONS ====================
function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screen + 'Screen').classList.add('active');
    game.screen = screen;

    if (screen === 'game') {
        resetGame();
        gameLoop();
    } else {
        cancelAnimationFrame(game.animationId);
    }
}

function startGame() {
    showScreen('game');
}

function resetGame() {
    game.coins = initCoins();
    game.striker = resetStriker();
    game.playerShots = 0;
    game.aiShots = 0;
    game.playerScore = 0;
    game.aiScore = 0;
    game.over = false;
    game.paused = false;
    game.dragging = false;
    game.startTime = Date.now();
    game.currentTurn = 'player';
    game.strikerMoving = false;
    game.coinsMoving = false;
    game.waitingForPhysics = false;
    game.physicsSettleCounter = 0;

    document.getElementById('score').textContent = '0';
    document.getElementById('shots').textContent = '0';
    document.getElementById('state').textContent = 'Playing';
    document.getElementById('gameStatus').textContent = '👤 Your turn: drag striker BACKWARD → flick!';
    document.getElementById('pauseBtn').textContent = '⏸️ Pause';
}

function togglePause() {
    game.paused = !game.paused;
    document.getElementById('pauseOverlay').classList.toggle('hidden');
    document.getElementById('pauseBtn').textContent = game.paused ? '▶️ Resume' : '⏸️ Pause';
    document.getElementById('state').textContent = game.paused ? 'Paused' : 'Playing';
    document.getElementById('pauseScore').textContent = game.playerScore;
    if (!game.paused) gameLoop();
}

function playAgain() {
    document.getElementById('gameOverOverlay').classList.add('hidden');
    showScreen('game');
}

function goToMenu() {
    showScreen('menu');
    document.getElementById('pauseOverlay').classList.add('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');
}

function toggleDifficulty() {
    game.difficulty = game.difficulty === 'normal' ? 'hard' : 'normal';
    document.getElementById('difficultyStatus').textContent = game.difficulty === 'normal' ? 'Normal' : 'Hard';
}

function submitScore() {
    const name = document.getElementById('playerName').value.trim() || 'Anonymous';
    game.highScores.push({ name, score: game.playerScore, shots: game.playerShots });
    game.highScores.sort((a, b) => b.score - a.score);
    game.highScores = game.highScores.slice(0, 10);
    localStorage.setItem('carromHighScores', JSON.stringify(game.highScores));
    updateLeaderboard();
    playAgain();
}

function updateLeaderboard() {
    const list = document.getElementById('leaderboardList');
    if (game.highScores.length === 0) {
        list.innerHTML = '<li>No scores yet. Play and get ranked!</li>';
        return;
    }
    list.innerHTML = game.highScores.map((s, i) =>
        `<li><span class="rank">#${i + 1}</span> <span class="name">${s.name}</span> <span class="score">${s.score} pts</span></li>`
    ).join('');
}

// ==================== GAME STATE CHECKING ====================
function updateScores() {
    const pocketedCoins = game.coins.filter(c => c.pocketed);
    game.playerScore = pocketedCoins.reduce((sum, c) => sum + c.value, 0);
    document.getElementById('score').textContent = game.playerScore;
}

function isPhysicsSettled() {
    // Check if striker and all coins have negligible velocity
    const strikerSettled = Math.abs(game.striker.vx) < 0.2 && Math.abs(game.striker.vy) < 0.2;
    const coinsSettled = game.coins.every(c => 
        c.pocketed || (Math.abs(c.vx) < 0.2 && Math.abs(c.vy) < 0.2)
    );
    return strikerSettled && coinsSettled;
}

function getUnpocketedCount() {
    return game.coins.filter(c => !c.pocketed).length;
}

function checkGameEnd() {
    return getUnpocketedCount() === 0;
}

function endGame() {
    game.over = true;
    document.getElementById('finalScore').textContent = game.playerScore;
    document.getElementById('totalShots').textContent = game.playerShots;
    document.getElementById('gameOverOverlay').classList.remove('hidden');
}

// ==================== MOUSE/TOUCH EVENTS ====================
canvas.addEventListener('mousedown', (e) => {
    // Only allow player to drag on their turn
    if (game.over || game.paused || game.currentTurn !== 'player') return;
    if (!isPhysicsSettled()) return; // Don't allow dragging while physics active

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = game.striker.x - x;
    const dy = game.striker.y - y;
    const dist = Math.hypot(dx, dy);

    if (dist < game.striker.radius * 2.5) {
        game.dragging = true;
        game.dragStart = { x, y };
        game.dragCurrent = { x, y };
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (!game.dragging) return;
    const rect = canvas.getBoundingClientRect();
    game.dragCurrent = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
});

canvas.addEventListener('mouseup', () => {
    if (!game.dragging) return;
    game.dragging = false;

    const dx = game.dragCurrent.x - game.dragStart.x;
    const dy = game.dragCurrent.y - game.dragStart.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 15) {
        // Power is proportional to drag distance (realistic carrom physics)
        const power = Math.min(distance / 40, 1);
        const angle = Math.atan2(dy, dx);

        // Apply power with realistic velocity
        game.striker.vx = Math.cos(angle) * power * 18;
        game.striker.vy = Math.sin(angle) * power * 18;

        game.playerShots++;
        document.getElementById('shots').textContent = game.playerShots;
        game.lastShotTime = Date.now();
        game.strikerMoving = true;
        game.waitingForPhysics = true;
        game.physicsSettleCounter = 0;
    }

    game.dragStart = { x: 0, y: 0 };
    game.dragCurrent = { x: 0, y: 0 };
});

// Touch support
canvas.addEventListener('touchstart', (e) => {
    if (game.over || game.paused || game.currentTurn !== 'player') return;
    if (!isPhysicsSettled()) return;

    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const dx = game.striker.x - x;
    const dy = game.striker.y - y;
    const dist = Math.hypot(dx, dy);

    if (dist < game.striker.radius * 2.5) {
        game.dragging = true;
        game.dragStart = { x, y };
        game.dragCurrent = { x, y };
    }
});

canvas.addEventListener('touchmove', (e) => {
    if (!game.dragging) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    game.dragCurrent = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
    };
});

canvas.addEventListener('touchend', () => {
    if (!game.dragging) return;
    game.dragging = false;

    const dx = game.dragCurrent.x - game.dragStart.x;
    const dy = game.dragCurrent.y - game.dragStart.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 15) {
        const power = Math.min(distance / 40, 1);
        const angle = Math.atan2(dy, dx);

        game.striker.vx = Math.cos(angle) * power * 18;
        game.striker.vy = Math.sin(angle) * power * 18;

        game.playerShots++;
        document.getElementById('shots').textContent = game.playerShots;
        game.lastShotTime = Date.now();
        game.strikerMoving = true;
        game.waitingForPhysics = true;
        game.physicsSettleCounter = 0;
    }

    game.dragStart = { x: 0, y: 0 };
    game.dragCurrent = { x: 0, y: 0 };
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (game.screen === 'game') togglePause();
    }
    if (e.code === 'Escape') {
        goToMenu();
    }
});

// ==================== AI LOGIC ====================
async function executeAIShot() {
    try {
        const response = await fetch('/ai-shot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                striker: game.striker,
                coins: game.coins,
                difficulty: game.difficulty
            })
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('AI shot error:', error);
        // Fallback: simple random shot
        const angle = Math.random() * Math.PI * 2;
        const power = 0.5 + Math.random() * 0.4;
        return {
            vx: Math.cos(angle) * power * 18,
            vy: Math.sin(angle) * power * 18
        };
    }
}

// ==================== GAME LOOP ====================
let aiShotScheduled = false;
let aiShotDelay = null;

function gameLoop() {
    game.animationId = requestAnimationFrame(gameLoop);

    if (game.paused) return;

    // Update physics
    updatePhysics(game.striker, game.coins);
    updateScores();

    // Check if game ended
    if (checkGameEnd() && isPhysicsSettled()) {
        endGame();
        return;
    }

    // Check if physics has settled after a shot
    if (game.waitingForPhysics) {
        if (isPhysicsSettled()) {
            game.physicsSettleCounter++;
            // Wait 30 frames after settled to ensure stability
            if (game.physicsSettleCounter > 30) {
                game.waitingForPhysics = false;
                game.strikerMoving = false;
                
                // Switch turns after player shot
                if (game.currentTurn === 'player') {
                    game.currentTurn = 'ai';
                    document.getElementById('gameStatus').textContent = '🤖 AI is thinking...';
                    
                    // Schedule AI shot after a delay
                    if (!aiShotScheduled) {
                        aiShotScheduled = true;
                        aiShotDelay = setTimeout(async () => {
                            const shot = await executeAIShot();
                            game.striker.vx = shot.vx;
                            game.striker.vy = shot.vy;
                            game.aiShots++;
                            game.lastShotTime = Date.now();
                            game.strikerMoving = true;
                            game.waitingForPhysics = true;
                            game.physicsSettleCounter = 0;
                            aiShotScheduled = false;
                        }, 1000); // 1 second delay before AI shoots
                    }
                } else if (game.currentTurn === 'ai') {
                    // After AI shot settles, switch back to player
                    game.currentTurn = 'player';
                    document.getElementById('gameStatus').textContent = '👤 Your turn: drag striker BACKWARD → flick!';
                }
            }
        } else {
            game.physicsSettleCounter = 0;
        }
    }

    // Render
    drawBoard(ctx);
    drawCoins(ctx, game.coins);
    drawStriker(ctx, game.striker);

    // Draw aim line when player dragging
    if (game.dragging && game.currentTurn === 'player') {
        drawAimLine(ctx, game.striker, game.dragStart, game.dragCurrent);
    }
}

// Start the game loop
gameLoop();