import os
from flask import Flask, render_template, request, jsonify, send_from_directory
import json
import math
import random
import copy
from datetime import datetime

# Create Flask app with current directory as static/template folder
app = Flask(__name__, static_folder='.', template_folder='.')

# Get port from environment variable or use default
PORT = int(os.environ.get('PORT', 5000))
SCORES_FILE = 'scores.json'

# ==================== SCORE MANAGEMENT ====================
def load_scores():
    if os.path.exists(SCORES_FILE):
        try:
            with open(SCORES_FILE, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def save_score(name, score, mode='classic', time_taken=0):
    scores = load_scores()
    scores.append({
        'name': name,
        'score': score,
        'mode': mode,
        'time': time_taken,
        'date': datetime.now().isoformat()
    })
    scores = sorted(scores, key=lambda x: x['score'], reverse=True)[:10]
    with open(SCORES_FILE, 'w') as f:
        json.dump(scores, f, indent=2)
    return scores

# ==================== PHYSICS CONSTANTS ====================
BOARD_SIZE = 600
POCKET_RADIUS = 28
STRIKER_RADIUS = 16
COIN_RADIUS = 12
FRICTION = 0.993
BOUNCE = 0.85
STRIKER_MASS = 2
BASELINE_Y = BOARD_SIZE * 0.83

pockets = [
    {'x': 28, 'y': 28},
    {'x': BOARD_SIZE - 28, 'y': 28},
    {'x': 28, 'y': BOARD_SIZE - 28},
    {'x': BOARD_SIZE - 28, 'y': BOARD_SIZE - 28}
]

# ==================== PHYSICS FUNCTIONS ====================
def in_pocket(x, y, radius):
    for pocket in pockets:
        dx = x - pocket['x']
        dy = y - pocket['y']
        if math.sqrt(dx * dx + dy * dy) < POCKET_RADIUS - radius:
            return True
    return False

def simulate_step(striker, coins):
    """Single physics step simulation"""
    # Update striker
    striker['x'] += striker['vx']
    striker['y'] += striker['vy']
    striker['vx'] *= FRICTION
    striker['vy'] *= FRICTION

    # Striker boundaries
    s_border = 20
    if striker['x'] < s_border or striker['x'] > BOARD_SIZE - s_border:
        striker['vx'] *= -BOUNCE
        striker['x'] = max(s_border, min(BOARD_SIZE - s_border, striker['x']))

    if striker['y'] < s_border or striker['y'] > BOARD_SIZE - s_border:
        striker['vy'] *= -BOUNCE
        striker['y'] = max(s_border, min(BOARD_SIZE - s_border, striker['y']))

    # Update coins
    for coin in coins:
        if coin.get('pocketed', False):
            continue

        coin['x'] += coin['vx']
        coin['y'] += coin['vy']
        coin['vx'] *= FRICTION
        coin['vy'] *= FRICTION

        # Coin boundaries
        c_border = 18
        if coin['x'] < c_border or coin['x'] > BOARD_SIZE - c_border:
            coin['vx'] *= -BOUNCE
            coin['x'] = max(c_border, min(BOARD_SIZE - c_border, coin['x']))

        if coin['y'] < c_border or coin['y'] > BOARD_SIZE - c_border:
            coin['vy'] *= -BOUNCE
            coin['y'] = max(c_border, min(BOARD_SIZE - c_border, coin['y']))

        # Pocket detection
        if in_pocket(coin['x'], coin['y'], COIN_RADIUS):
            coin['pocketed'] = True

    # Striker-coin collisions
    for coin in coins:
        if coin.get('pocketed', False):
            continue

        dx = striker['x'] - coin['x']
        dy = striker['y'] - coin['y']
        dist = math.sqrt(dx * dx + dy * dy)

        if dist < STRIKER_RADIUS + COIN_RADIUS:
            angle = math.atan2(dy, dx)
            sin_a, cos_a = math.sin(angle), math.cos(angle)

            vx1 = striker['vx'] * cos_a + striker['vy'] * sin_a
            vy1 = striker['vy'] * cos_a - striker['vx'] * sin_a
            vx2 = coin['vx'] * cos_a + coin['vy'] * sin_a
            vy2 = coin['vy'] * cos_a - coin['vx'] * sin_a

            m1, m2 = STRIKER_MASS, coin.get('mass', 1)

            v1f = (vx1 * (m1 - m2) + 2 * m2 * vx2) / (m1 + m2)
            v2f = (vx2 * (m2 - m1) + 2 * m1 * vx1) / (m1 + m2)

            striker['vx'] = v1f * cos_a - vy1 * sin_a
            striker['vy'] = vy1 * cos_a + v1f * sin_a
            coin['vx'] = v2f * cos_a - vy2 * sin_a
            coin['vy'] = vy2 * cos_a + v2f * sin_a

            # SEPARATION FIX: Separate overlapping objects
            overlap = (STRIKER_RADIUS + COIN_RADIUS) - dist + 1
            nx = dx / (dist or 0.01)
            ny = dy / (dist or 0.01)
            coin['x'] -= nx * overlap
            coin['y'] -= ny * overlap

    # Coin-coin collisions
    for i in range(len(coins)):
        if coins[i].get('pocketed', False):
            continue
        for j in range(i + 1, len(coins)):
            if coins[j].get('pocketed', False):
                continue

            dx = coins[i]['x'] - coins[j]['x']
            dy = coins[i]['y'] - coins[j]['y']
            dist = math.sqrt(dx * dx + dy * dy)

            if dist < coins[i]['radius'] + coins[j]['radius']:
                # Positional correction
                overlap = (coins[i]['radius'] + coins[j]['radius']) - dist + 0.5
                nx = dx / (dist or 0.01)
                ny = dy / (dist or 0.01)
                coins[i]['x'] += nx * (overlap / 2)
                coins[i]['y'] += ny * (overlap / 2)
                coins[j]['x'] -= nx * (overlap / 2)
                coins[j]['y'] -= ny * (overlap / 2)

                # Velocity exchange
                angle = math.atan2(coins[i]['y'] - coins[j]['y'], coins[i]['x'] - coins[j]['x'])
                sin_a, cos_a = math.sin(angle), math.cos(angle)

                vx1 = coins[i]['vx'] * cos_a + coins[i]['vy'] * sin_a
                vy1 = coins[i]['vy'] * cos_a - coins[i]['vx'] * sin_a
                vx2 = coins[j]['vx'] * cos_a + coins[j]['vy'] * sin_a
                vy2 = coins[j]['vy'] * cos_a - coins[j]['vx'] * sin_a

                vx1, vx2 = vx2, vx1

                coins[i]['vx'] = vx1 * cos_a - vy1 * sin_a
                coins[i]['vy'] = vy1 * cos_a + vx1 * sin_a
                coins[j]['vx'] = vx2 * cos_a - vy2 * sin_a
                coins[j]['vy'] = vy2 * cos_a + vx2 * sin_a

    return striker, coins

def evaluate_state(striker, coins, unpocketed_count):
    """Evaluate board state for AI decision"""
    score = sum(coin.get('value', 10) for coin in coins if coin.get('pocketed', False))

    # Penalize if coins still moving
    for coin in coins:
        if not coin.get('pocketed', False):
            speed = abs(coin.get('vx', 0)) + abs(coin.get('vy', 0))
            score -= 0.05 * speed

    # Reward if striker is stationary
    striker_speed = abs(striker['vx']) + abs(striker['vy'])
    if striker_speed < 1:
        score += 5

    return score

# ==================== AI LOGIC ====================
def calculate_ai_shot(striker, coins, difficulty='normal'):
    """
    Calculate best AI shot using lookahead simulation
    difficulty: 'easy' | 'normal' | 'hard'
    """
    unpocketed = [c for c in coins if not c.get('pocketed', False)]

    if not unpocketed:
        return {'vx': 0, 'vy': 0}

    # Difficulty parameters
    if difficulty == 'easy':
        depth = 8
        num_angles = 3
        powers = [6, 10, 14]
        noise = 0.8
        targets_count = 1
    elif difficulty == 'hard':
        depth = 22
        num_angles = 9
        powers = [6, 10, 14, 18, 22]
        noise = 0.15
        targets_count = 4
    else:  # 'normal'
        depth = 15
        num_angles = 6
        powers = [6, 10, 14, 18]
        noise = 0.4
        targets_count = 3

    best_vx, best_vy = 0, 0
    best_score = -float('inf')

    # Target nearby coins
    targets = sorted(
        unpocketed,
        key=lambda c: math.sqrt((c['x'] - striker['x']) ** 2 + (c['y'] - striker['y']) ** 2)
    )[:targets_count]

    for target in targets:
        dx = target['x'] - striker['x']
        dy = target['y'] - striker['y']
        dist = max(math.sqrt(dx * dx + dy * dy), 1)
        base_angle = math.atan2(dy, dx)

        for angle_offset in range(-num_angles // 2, num_angles // 2 + 1):
            for power in powers:
                angle = base_angle + angle_offset * 0.15
                vx = math.cos(angle) * power * 0.3
                vy = math.sin(angle) * power * 0.3

                # Simulate
                sim_striker = copy.deepcopy(striker)
                sim_striker['vx'] = vx
                sim_striker['vy'] = vy
                sim_coins = copy.deepcopy(unpocketed)

                for _ in range(depth):
                    sim_striker, sim_coins = simulate_step(sim_striker, sim_coins)
                    if abs(sim_striker['vx']) < 0.1 and abs(sim_striker['vy']) < 0.1:
                        break

                sim_score = evaluate_state(sim_striker, sim_coins, len(unpocketed))

                if sim_score > best_score:
                    best_score = sim_score
                    best_vx = vx + random.uniform(-noise, noise)
                    best_vy = vy + random.uniform(-noise, noise)

    return {'vx': best_vx, 'vy': best_vy}

# ==================== FLASK ROUTES ====================
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

@app.route('/scores', methods=['GET'])
def get_scores():
    return jsonify(load_scores())

@app.route('/scores', methods=['POST'])
def post_score():
    data = request.json
    name = data.get('name', 'Anonymous')
    score = data.get('score', 0)
    mode = data.get('mode', 'classic')
    time_taken = data.get('time', 0)
    updated = save_score(name, score, mode, time_taken)
    return jsonify(updated)

@app.route('/ai-shot', methods=['POST'])
def ai_shot():
    data = request.json
    striker = data.get('striker', {})
    coins = data.get('coins', [])
    difficulty = data.get('difficulty', 'normal')
    shot = calculate_ai_shot(striker, coins, difficulty)
    return jsonify(shot)

# ==================== MAIN ====================
if __name__ == '__main__':
    print(f"🎮 Carrom Game Server starting on port {PORT}")
    print(f"📍 Open http://localhost:{PORT} in your browser")
    app.run(debug=True, host='0.0.0.0', port=PORT)