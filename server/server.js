const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { io: ClientIO } = require('socket.io-client');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Force no-cache headers so clients always fetch latest assets
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    next();
});

// Serve static files (for testing locally)
app.use(express.static(path.join(__dirname, '../game_deploy')));

const rooms = {}; // { roomId: { players: {...}, mode: 'ffa'|'ctt', bomb: {...} } }
const DEFAULT_SPAWN = { x: 0, y: 10, z: 100, ry: Math.PI };
const BOMB_TIMER_SECONDS = 40;

const ZOMBIE_ROOM = process.env.ZOMBIE_ROOM || 'global';
const ZOMBIE_NAME = process.env.ZOMBIE_NAME || '[BOT] Zombie';
const ZOMBIE_UPDATE_MS = Number(process.env.ZOMBIE_UPDATE_MS) || 8000;
const ENABLE_ZOMBIE = process.env.DISABLE_ZOMBIE === 'true' ? false : true;
let zombieClient = null;
let zombieInterval = null;

function broadcastScoreboard(roomId) {
    if (rooms[roomId]) {
        io.to(roomId).emit('scoreboard_update', rooms[roomId].players);
    }
}

function createBombState() {
    return {
        carrierId: null,
        planted: false,
        site: null,
        plantedAt: 0,
        explodeTimer: null
    };
}

function ensureRoom(roomId, mode = 'ffa') {
    if (!rooms[roomId]) {
        rooms[roomId] = { players: {}, mode, bomb: createBombState() };
    } else if (!rooms[roomId].bomb) {
        rooms[roomId].bomb = createBombState();
    }
    if (!rooms[roomId].mode) rooms[roomId].mode = mode;
}

function assignTeam(roomData, preferred) {
    const counts = { CT: 0, T: 0 };
    Object.values(roomData.players).forEach(p => {
        if (p.team === 'CT') counts.CT++;
        if (p.team === 'T') counts.T++;
    });
    let team = preferred;
    if (!team || counts[team] > counts[team === 'CT' ? 'T' : 'CT']) {
        team = counts.CT <= counts.T ? 'CT' : 'T';
    }
    return team;
}

function assignBombCarrier(roomId) {
    const room = rooms[roomId];
    if (!room || room.mode !== 'ctt') return;
    const carrier = Object.values(room.players).find(p => p.team === 'T');
    room.bomb.carrierId = carrier ? carrier.id : null;
    io.to(roomId).emit('bomb_carrier', { id: room.bomb.carrierId });
}

function endRound(roomId, winnerLabel, message) {
    const room = rooms[roomId];
    if (!room) return;
    if (room.bomb?.explodeTimer) {
        clearTimeout(room.bomb.explodeTimer);
        room.bomb.explodeTimer = null;
    }
    io.to(roomId).emit('round_result', {
        winner: winnerLabel,
        message,
        color: winnerLabel === 'COUNTER-TERRORISTS' ? 'rgba(76,175,80,0.85)' : 'rgba(255,64,64,0.9)'
    });
    room.bomb = createBombState();
    assignBombCarrier(roomId);
}

function emitVoice(roomId, socket, eventName, payload) {
    const room = rooms[roomId];
    if (!room) return;
    const sender = room.players[socket.id];
    if (!sender) return;
    if (room.mode === 'ctt') {
        Object.keys(room.players).forEach(id => {
            if (id === socket.id) return;
            if (room.players[id].team === sender.team) {
                io.to(id).emit(eventName, payload);
            }
        });
    } else {
        socket.to(roomId).emit(eventName, payload);
    }
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', ({ name, room, isBot, mode, teamPreference }) => {
        const roomId = room || 'global';
        // Initialize room if not exists
        ensureRoom(roomId, mode || 'ffa');

        const roomData = rooms[roomId];
        const isCTTRoom = roomData.mode === 'ctt';

        const isZombieClient = !!isBot && name === ZOMBIE_NAME;
        const currentPlayers = Object.values(roomData.players).filter(p => !p.isZombie).length;
        if (!isZombieClient && currentPlayers >= 5) {
            socket.emit('error_msg', 'Room is full (Max 5)');
            return;
        }

        // Join room
        socket.join(roomId);

        // Initial state
        let playerTeam = null;
        if (isCTTRoom && !isZombieClient) {
            playerTeam = assignTeam(roomData, teamPreference);
        }

        roomData.players[socket.id] = {
            id: socket.id,
            name: name || `Player ${socket.id.substr(0, 4)}`,
            x: DEFAULT_SPAWN.x,
            y: DEFAULT_SPAWN.y,
            z: DEFAULT_SPAWN.z,
            ry: DEFAULT_SPAWN.ry,
            rx: 0,
            hp: 100,
            isDead: false,
            kills: 0,
            deaths: 0,
            lastAction: Date.now(),
            isZombie: isZombieClient,
            team: playerTeam
        };
        roomData.players[socket.id].id = socket.id;

        socket.emit('joined', { id: socket.id, players: roomData.players });
        socket.to(roomId).emit('player_joined', roomData.players[socket.id]);
        broadcastScoreboard(roomId);

        if (isCTTRoom && !isZombieClient) {
            socket.emit('team_assignment', { team: playerTeam, mode: roomData.mode, isCarrier: roomData.bomb.carrierId === socket.id });
            socket.to(roomId).emit('team_assignment', { id: socket.id, team: playerTeam });
            if (playerTeam === 'T' && !roomData.bomb.carrierId) {
                roomData.bomb.carrierId = socket.id;
                io.to(roomId).emit('bomb_carrier', { id: socket.id });
            } else if (roomData.bomb.carrierId) {
                socket.emit('bomb_carrier', { id: roomData.bomb.carrierId });
            }
        }

        console.log(`${name} joined room ${roomId}`);

        // Handle Disconnect
        socket.on('disconnect', () => {
            if (rooms[roomId] && rooms[roomId].players[socket.id]) {
                if (rooms[roomId].mode === 'ctt' && rooms[roomId].bomb?.carrierId === socket.id) {
                    rooms[roomId].bomb.carrierId = null;
                    assignBombCarrier(roomId);
                }
                delete rooms[roomId].players[socket.id];
                io.to(roomId).emit('player_left', socket.id);
                if (Object.keys(rooms[roomId].players).length === 0) {
                    delete rooms[roomId];
                } else {
                    broadcastScoreboard(roomId);
                }
            }
        });

        // Track activity
        const updateActivity = () => {
            if (rooms[roomId] && rooms[roomId].players[socket.id]) {
                rooms[roomId].players[socket.id].lastAction = Date.now();
            }
        };

        // Handle Updates
        socket.on('update', (data) => {
            if (rooms[roomId] && rooms[roomId].players[socket.id]) {
                const p = rooms[roomId].players[socket.id];
                // Check if position changed significantly to count as activity
                if (Math.abs(p.x - data.x) > 0.1 || Math.abs(p.z - data.z) > 0.1 || Math.abs(p.ry - data.ry) > 0.1) {
                    p.lastAction = Date.now();
                }

                p.x = data.x; p.y = data.y; p.z = data.z;
                p.rx = data.rx; p.ry = data.ry;
                // Broadcast to others (volatile for performance)
                socket.to(roomId).volatile.emit('player_update', {
                    id: socket.id,
                    ...data,
                    hp: p.hp,
                    isDead: p.isDead
                });
            }
        });

        // Handle Chat
        socket.on('chat_message', (payload) => {
            updateActivity();
            const raw = typeof payload === 'string' ? payload : (payload?.msg ?? '');
            const text = typeof raw === 'string' ? raw.trim() : '';
            if (!text || !rooms[roomId]?.players[socket.id]) return;
            const clientMid = typeof payload === 'object' && payload?.mid ? String(payload.mid) : null;
            const clientTs = typeof payload === 'object' && payload?.ts ? Number(payload.ts) : Date.now();
            const messageId = clientMid || `${socket.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            io.to(roomId).emit('chat_message', {
                id: socket.id,
                name: rooms[roomId].players[socket.id].name,
                msg: text,
                mid: messageId,
                ts: clientTs || Date.now()
            });
        });

        // Handle Respawn
        socket.on('respawn', () => {
            updateActivity();
            if (rooms[roomId] && rooms[roomId].players[socket.id]) {
                const player = rooms[roomId].players[socket.id];
                player.hp = 100;
                player.isDead = false;
                player.x = DEFAULT_SPAWN.x;
                player.y = DEFAULT_SPAWN.y;
                player.z = DEFAULT_SPAWN.z;
                player.ry = DEFAULT_SPAWN.ry;
                io.to(roomId).emit('player_respawn', {
                    id: socket.id,
                    x: player.x,
                    y: player.y,
                    z: player.z,
                    ry: player.ry,
                    hp: player.hp
                });
            }
        });

        // Handle Actions
        socket.on('shoot', (data) => {
            updateActivity();
            socket.to(room).emit('remote_shoot', { id: socket.id, ...data });
        });

        socket.on('hit', (data) => {
            // data: { targetId, damage }
            if (rooms[roomId] && rooms[roomId].players[data.targetId]) {
                const target = rooms[roomId].players[data.targetId];
                const attackerId = socket.id; // Use local var to be safe
                target.hp -= data.damage;
                io.to(roomId).emit('player_damaged', { id: data.targetId, hp: target.hp, attackerId: attackerId });

                if (target.hp <= 0) {
                    // Reset HP for respawn logic if needed, or let client handle
                    target.hp = 0; // Keep at 0 to mark as dead
                    target.isDead = true;
                    target.deaths++;
                    if (rooms[roomId].players[attackerId]) rooms[roomId].players[attackerId].kills++;

                    io.to(roomId).emit('player_died', {
                        id: data.targetId,
                        attackerId: attackerId,
                        kills: rooms[roomId].players[attackerId]?.kills || 0,
                        deaths: target.deaths
                    });

                    // Broadcast updated scoreboard data
                    io.to(roomId).emit('scoreboard_update', rooms[roomId].players);
                }
            }
        });

        socket.on('projectile_launch', (data) => {
            updateActivity();
            if (!data || !data.weaponName) return;
            socket.to(roomId).emit('projectile_spawn', {
                weaponName: data.weaponName,
                ownerId: socket.id,
                position: data.position,
                direction: data.direction,
                speed: data.speed
            });
        });

        socket.on('snowball_impulse', (payload) => {
            updateActivity();
            if (!payload || !payload.targetId || !payload.impulse) return;
            const roomInfo = rooms[roomId];
            if (!roomInfo || !roomInfo.players[payload.targetId]) return;
            io.to(payload.targetId).emit('snowball_hit', {
                impulse: payload.impulse,
                sourceId: socket.id
            });
        });

        socket.on('plant_bomb', ({ site }) => {
            updateActivity();
            const roomInfo = rooms[roomId];
            if (!roomInfo || roomInfo.mode !== 'ctt') return;
            const player = roomInfo.players[socket.id];
            if (!player || player.team !== 'T') return;
            if (roomInfo.bomb.planted || roomInfo.bomb.carrierId !== socket.id) return;
            const siteName = site === 'B' ? 'B' : 'A';
            roomInfo.bomb.planted = true;
            roomInfo.bomb.site = siteName;
            roomInfo.bomb.plantedAt = Date.now();
            roomInfo.bomb.carrierId = null;
            if (roomInfo.bomb.explodeTimer) clearTimeout(roomInfo.bomb.explodeTimer);
            roomInfo.bomb.explodeTimer = setTimeout(() => {
                endRound(roomId, 'TERRORISTS', 'Bomb exploded! Terrorists win.');
            }, BOMB_TIMER_SECONDS * 1000);
            io.to(roomId).emit('bomb_planted', {
                site: siteName,
                plantedBy: socket.id,
                plantedAt: roomInfo.bomb.plantedAt,
                explodeTime: roomInfo.bomb.plantedAt + (BOMB_TIMER_SECONDS * 1000)
            });
        });

        socket.on('defuse_bomb', () => {
            updateActivity();
            const roomInfo = rooms[roomId];
            if (!roomInfo || roomInfo.mode !== 'ctt' || !roomInfo.bomb.planted) return;
            const player = roomInfo.players[socket.id];
            if (!player || player.team !== 'CT') return;
            io.to(roomId).emit('bomb_defused', { by: socket.id, message: 'Bomb defused! CT win.' });
            endRound(roomId, 'COUNTER-TERRORISTS', 'Bomb defused! CT win.');
        });

        // Voice Chat
        socket.on('voice_start', () => {
            emitVoice(roomId, socket, 'voice_start', socket.id);
        });

        socket.on('voice_end', () => {
            emitVoice(roomId, socket, 'voice_end', socket.id);
        });

        socket.on('voice_data', (data) => {
            // data is the audio chunk (ArrayBuffer or Blob)
            emitVoice(roomId, socket, 'voice_data', { id: socket.id, data: data });
        });
    });
});

// Check for inactive players every 1 second
setInterval(() => {
    const now = Date.now();
    Object.keys(rooms).forEach(roomId => {
        const room = rooms[roomId];
        Object.keys(room.players).forEach(socketId => {
            const p = room.players[socketId];
            if (p.isZombie) return;
            const idleTime = now - p.lastAction;

            // Warning at 110s (10s before kick)
            if (idleTime > 110000 && idleTime < 111000) {
                io.to(socketId).emit('chat_message', {
                    id: 'server',
                    name: 'SERVER',
                    msg: '<span style="color:red">Warning: You will be kicked in 10s for inactivity!</span>'
                });
            }

            // Kick at 120s
            if (idleTime > 120000) {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.emit('error_msg', 'You were kicked for being idle (120s). Refresh to rejoin.');
                    socket.disconnect();
                }
                // Cleanup happens in disconnect handler
            }
        });
    });
}, 1000);

function startZombieClient(port) {
    if (!ENABLE_ZOMBIE || zombieClient) return;

    const targetUrl = process.env.ZOMBIE_TARGET || `http://127.0.0.1:${port}`;
    zombieClient = ClientIO(targetUrl, {
        transports: ['websocket'],
        reconnectionDelayMax: 5000
    });

    zombieClient.on('connect', () => {
        console.log('Zombie bot connected to server');
        zombieClient.emit('join', {
            name: ZOMBIE_NAME,
            room: ZOMBIE_ROOM,
            isBot: true,
            mode: 'ffa'
        });
    });

    zombieClient.on('disconnect', () => {
        console.log('Zombie bot disconnected, waiting for reconnect...');
    });

    zombieClient.on('connect_error', (err) => {
        console.error('Zombie bot connection error:', err.message);
    });

    zombieInterval = setInterval(() => {
        if (zombieClient && zombieClient.connected) {
            const wander = (Date.now() / 4000);
            zombieClient.emit('update', {
                x: DEFAULT_SPAWN.x + Math.cos(wander) * 5,
                y: DEFAULT_SPAWN.y,
                z: DEFAULT_SPAWN.z + Math.sin(wander) * 5,
                rx: 0,
                ry: wander % (Math.PI * 2)
            });
        }
    }, ZOMBIE_UPDATE_MS);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startZombieClient(PORT);
});

process.on('SIGINT', () => {
    if (zombieInterval) clearInterval(zombieInterval);
    if (zombieClient) zombieClient.close();
    process.exit(0);
});

