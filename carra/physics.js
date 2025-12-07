// IMPROVED PHYSICS ENGINE - Realistic Carrom Physics

// Game Constants (Realistic Carrom Values)
const BOARD_SIZE = 600;
const POCKET_RADIUS = 28;
const STRIKER_RADIUS = 16;
const COIN_RADIUS = 12;

// IMPROVED PHYSICS CONSTANTS - Based on real Carrom physics
const FRICTION = 0.988;        // Slightly higher friction for realistic slow-down
const BOUNCE = 0.82;           // Realistic bounce off walls
const AIR_RESISTANCE = 0.9955; // Additional air resistance
const BASELINE_Y = BOARD_SIZE * 0.83;

const pockets = [
    { x: 28, y: 28 },
    { x: BOARD_SIZE - 28, y: 28 },
    { x: 28, y: BOARD_SIZE - 28 },
    { x: BOARD_SIZE - 28, y: BOARD_SIZE - 28 }
];

// Initialize coins with proper setup
function initCoins() {
    const coins = [];
    const cx = BOARD_SIZE / 2;
    const cy = BOARD_SIZE / 2;

    // Red Queen (center) - slightly heavier
    coins.push({
        x: cx,
        y: cy,
        vx: 0,
        vy: 0,
        radius: COIN_RADIUS,
        color: '#D32F2F',
        value: 50,
        pocketed: false,
        mass: 1.1,
        type: 'queen'
    });

    // 18 coins in circle (9 white, 9 black)
    const numCoins = 18;
    const radius = 35; // Slightly larger spread for realistic setup
    for (let i = 0; i < numCoins; i++) {
        const angle = (i / numCoins) * Math.PI * 2;
        const color = i % 2 === 0 ? '#F5F5F5' : '#1A1A1A';
        coins.push({
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius,
            vx: 0,
            vy: 0,
            radius: COIN_RADIUS,
            color,
            value: 10,
            pocketed: false,
            mass: 1.0,
            type: 'coin'
        });
    }

    return coins;
}

function resetStriker() {
    return {
        x: BOARD_SIZE / 2,
        y: BASELINE_Y,
        vx: 0,
        vy: 0,
        radius: STRIKER_RADIUS,
        mass: 2.0 // Striker is heavier
    };
}

// Physics calculations with improved collision and friction
function updatePhysics(striker, coins) {
    // Update striker position
    striker.x += striker.vx;
    striker.y += striker.vy;
    
    // Apply realistic friction (compound effect)
    striker.vx *= FRICTION;
    striker.vy *= FRICTION;
    striker.vx *= AIR_RESISTANCE;
    striker.vy *= AIR_RESISTANCE;

    // Striker boundaries with realistic bounce
    const sBorder = 20;
    if (striker.x < sBorder || striker.x > BOARD_SIZE - sBorder) {
        striker.vx *= -BOUNCE;
        striker.x = Math.max(sBorder, Math.min(BOARD_SIZE - sBorder, striker.x));
    }

    if (striker.y < sBorder || striker.y > BOARD_SIZE - sBorder) {
        striker.vy *= -BOUNCE;
        striker.y = Math.max(sBorder, Math.min(BOARD_SIZE - sBorder, striker.y));
    }

    // Update coins
    coins.forEach(coin => {
        if (coin.pocketed) return;
        
        coin.x += coin.vx;
        coin.y += coin.vy;
        
        // Apply realistic friction
        coin.vx *= FRICTION;
        coin.vy *= FRICTION;
        coin.vx *= AIR_RESISTANCE;
        coin.vy *= AIR_RESISTANCE;

        // Coin boundaries
        const cBorder = 18;
        if (coin.x < cBorder || coin.x > BOARD_SIZE - cBorder) {
            coin.vx *= -BOUNCE;
            coin.x = Math.max(cBorder, Math.min(BOARD_SIZE - cBorder, coin.x));
        }

        if (coin.y < cBorder || coin.y > BOARD_SIZE - cBorder) {
            coin.vy *= -BOUNCE;
            coin.y = Math.max(cBorder, Math.min(BOARD_SIZE - cBorder, coin.y));
        }

        // Pocket detection
        if (inPocket(coin.x, coin.y)) coin.pocketed = true;
    });

    // Striker-coin collisions with mass-aware physics
    coins.forEach(coin => {
        if (coin.pocketed) return;
        
        const dx = striker.x - coin.x;
        const dy = striker.y - coin.y;
        const dist = Math.hypot(dx, dy);

        if (dist < striker.radius + coin.radius) {
            // Realistic elastic collision
            const angle = Math.atan2(dy, dx);
            const sin = Math.sin(angle), cos = Math.cos(angle);

            // Convert to collision space
            let vx1 = striker.vx * cos + striker.vy * sin;
            let vy1 = striker.vy * cos - striker.vx * sin;
            let vx2 = coin.vx * cos + coin.vy * sin;
            let vy2 = coin.vy * cos - coin.vx * sin;

            const m1 = striker.mass || 2;
            const m2 = coin.mass || 1;

            // Elastic collision formulas
            const v1f = (vx1 * (m1 - m2) + 2 * m2 * vx2) / (m1 + m2);
            const v2f = (vx2 * (m2 - m1) + 2 * m1 * vx1) / (m1 + m2);

            // Convert back to world space
            striker.vx = v1f * cos - vy1 * sin;
            striker.vy = vy1 * cos + v1f * sin;
            coin.vx = v2f * cos - vy2 * sin;
            coin.vy = vy2 * cos + v2f * sin;

            // Separate overlapping objects to prevent sticking
            const overlap = (striker.radius + coin.radius) - dist + 2;
            const nx = dx / (dist || 0.01);
            const ny = dy / (dist || 0.01);
            coin.x -= nx * overlap;
            coin.y -= ny * overlap;
        }
    });

    // Coin-coin collisions
    for (let i = 0; i < coins.length; i++) {
        if (coins[i].pocketed) continue;
        for (let j = i + 1; j < coins.length; j++) {
            if (coins[j].pocketed) continue;
            
            const dx = coins[i].x - coins[j].x;
            const dy = coins[i].y - coins[j].y;
            const dist = Math.hypot(dx, dy);

            if (dist < coins[i].radius + coins[j].radius) {
                // Positional correction
                const overlap = (coins[i].radius + coins[j].radius) - dist + 1;
                const nx = dx / (dist || 0.01);
                const ny = dy / (dist || 0.01);
                coins[i].x += nx * (overlap / 2);
                coins[i].y += ny * (overlap / 2);
                coins[j].x -= nx * (overlap / 2);
                coins[j].y -= ny * (overlap / 2);

                // Elastic collision
                const angle = Math.atan2(coins[i].y - coins[j].y, coins[i].x - coins[j].x);
                const sin = Math.sin(angle), cos = Math.cos(angle);

                let vx1 = coins[i].vx * cos + coins[i].vy * sin;
                let vy1 = coins[i].vy * cos - coins[i].vx * sin;
                let vx2 = coins[j].vx * cos + coins[j].vy * sin;
                let vy2 = coins[j].vy * cos - coins[j].vx * sin;

                // For equal mass coins, swap velocities
                const m1 = coins[i].mass || 1;
                const m2 = coins[j].mass || 1;
                
                const v1f = (vx1 * (m1 - m2) + 2 * m2 * vx2) / (m1 + m2);
                const v2f = (vx2 * (m2 - m1) + 2 * m1 * vx1) / (m1 + m2);

                coins[i].vx = v1f * cos - vy1 * sin;
                coins[i].vy = vy1 * cos + v1f * sin;
                coins[j].vx = v2f * cos - vy2 * sin;
                coins[j].vy = vy2 * cos + v2f * sin;
            }
        }
    }

    return { striker, coins };
}

function inPocket(x, y) {
    return pockets.some(p => {
        const dx = x - p.x, dy = y - p.y;
        return Math.hypot(dx, dy) < POCKET_RADIUS - COIN_RADIUS;
    });
}

function isResting(striker, coins) {
    const s = striker;
    if (Math.abs(s.vx) > 0.15 || Math.abs(s.vy) > 0.15) return false;
    return coins.every(c => c.pocketed || (Math.abs(c.vx) < 0.15 && Math.abs(c.vy) < 0.15));
}

// ==================== DRAWING FUNCTIONS ====================

function drawBoard(ctx) {
    ctx.fillStyle = '#1B5E20';
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    // Border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 24;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeRect(12, 12, BOARD_SIZE - 24, BOARD_SIZE - 24);

    // Baseline
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#CCCCCC';
    ctx.beginPath();
    ctx.moveTo(25, BASELINE_Y + 10);
    ctx.lineTo(BOARD_SIZE - 25, BASELINE_Y + 10);
    ctx.stroke();

    // Pockets
    ctx.fillStyle = '#111';
    pockets.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        
        // Pocket shine
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, POCKET_RADIUS - 3, 0, Math.PI * 2);
        ctx.stroke();
    });
}

function drawCoins(ctx, coins) {
    coins.forEach(coin => {
        if (coin.pocketed) return;

        // Shadow
        ctx.save();
        ctx.translate(coin.x + 2, coin.y + 2);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(0, 0, coin.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Coin body with gradient
        ctx.save();
        ctx.translate(coin.x, coin.y);
        const grad = ctx.createRadialGradient(-4, -4, 0, 0, 0, coin.radius);
        grad.addColorStop(0, '#FFF');
        grad.addColorStop(0.6, coin.color);
        grad.addColorStop(1, coin.color === '#F5F5F5' ? '#BBB' : '#111');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, coin.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Border
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.restore();
    });
}

function drawStriker(ctx, striker) {
    ctx.save();
    ctx.translate(striker.x, striker.y);
    
    // Striker with gradient
    const grad = ctx.createRadialGradient(-3, -3, 0, 0, 0, striker.radius);
    grad.addColorStop(0, '#FFEB3B');
    grad.addColorStop(0.7, '#FBC02D');
    grad.addColorStop(1, '#F57F17');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, striker.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Border
    ctx.strokeStyle = '#E65100';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.restore();
}

function drawAimLine(ctx, striker, dragStart, dragEnd) {
    const dx = dragEnd.x - dragStart.x;
    const dy = dragEnd.y - dragStart.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 10) {
        // Aim line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(dragStart.x, dragStart.y);
        ctx.lineTo(dragEnd.x, dragEnd.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Power indicator bar
        const power = Math.min(dist / 40, 1);
        const barWidth = BOARD_SIZE - 20;
        const barHeight = 20;
        const barX = 10;
        const barY = BOARD_SIZE - 30;
        
        ctx.fillStyle = `rgba(255, ${100 - power * 50}, ${100 - power * 50}, 0.4)`;
        ctx.fillRect(barX, barY, barWidth * power, barHeight);
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        // Power text
        ctx.fillStyle = '#FFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Power: ${Math.round(power * 100)}%`, BOARD_SIZE / 2, barY + 35);
    }
}