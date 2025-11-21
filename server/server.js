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

// Serve static files (for testing locally)
app.use(express.static(path.join(__dirname, '../game_deploy')));

const rooms = {}; // { roomId: { players: { socketId: { x,y,z, name, hp } } } }
const DEFAULT_SPAWN = { x: 0, y: 10, z: 100, ry: Math.PI };

const ZOMBIE_ROOM = process.env.ZOMBIE_ROOM || 'global';
const ZOMBIE_NAME = process.env.ZOMBIE_NAME || '[BOT] Zombie';
const ZOMBIE_UPDATE_MS = Number(process.env.ZOMBIE_UPDATE_MS) || 8000;
const ENABLE_ZOMBIE = process.env.DISABLE_ZOMBIE === 'true' ? false : true;
let zombieClient = null;
let zombieInterval = null;

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', ({ name, room, isBot }) => {
        // Initialize room if not exists
        if (!rooms[room]) {
            rooms[room] = { players: {} };
        }

        const isZombieClient = !!isBot && name === ZOMBIE_NAME;
        const currentPlayers = Object.values(rooms[room].players).filter(p => !p.isZombie).length;
        if (!isZombieClient && currentPlayers >= 5) {
            socket.emit('error_msg', 'Room is full (Max 5)');
            return;
        }

        // Join room
        socket.join(room);

        // Initial state
        rooms[room].players[socket.id] = {
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
            isZombie: isZombieClient
        };

        socket.emit('joined', { id: socket.id, players: rooms[room].players });
        socket.to(room).emit('player_joined', rooms[room].players[socket.id]);

        console.log(`${name} joined room ${room}`);

        // Handle Disconnect
        socket.on('disconnect', () => {
            if (rooms[room] && rooms[room].players[socket.id]) {
                delete rooms[room].players[socket.id];
                io.to(room).emit('player_left', socket.id);
                if (Object.keys(rooms[room].players).length === 0) {
                    delete rooms[room];
                }
            }
        });

        // Track activity
        const updateActivity = () => {
            if (rooms[room] && rooms[room].players[socket.id]) {
                rooms[room].players[socket.id].lastAction = Date.now();
            }
        };

        // Handle Updates
        socket.on('update', (data) => {
            if (rooms[room] && rooms[room].players[socket.id]) {
                const p = rooms[room].players[socket.id];
                // Check if position changed significantly to count as activity
                if (Math.abs(p.x - data.x) > 0.1 || Math.abs(p.z - data.z) > 0.1 || Math.abs(p.ry - data.ry) > 0.1) {
                    p.lastAction = Date.now();
                }

                p.x = data.x; p.y = data.y; p.z = data.z;
                p.rx = data.rx; p.ry = data.ry;
                // Broadcast to others (volatile for performance)
                socket.to(room).volatile.emit('player_update', {
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
            if (!text || !rooms[room]?.players[socket.id]) return;
            const clientMid = typeof payload === 'object' && payload?.mid ? String(payload.mid) : null;
            const clientTs = typeof payload === 'object' && payload?.ts ? Number(payload.ts) : Date.now();
            const messageId = clientMid || `${socket.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            io.to(room).emit('chat_message', {
                id: socket.id,
                name: rooms[room].players[socket.id].name,
                msg: text,
                mid: messageId,
                ts: clientTs || Date.now()
            });
        });

        // Handle Respawn
        socket.on('respawn', () => {
            updateActivity();
            if (rooms[room] && rooms[room].players[socket.id]) {
                const player = rooms[room].players[socket.id];
                player.hp = 100;
                player.isDead = false;
                player.x = DEFAULT_SPAWN.x;
                player.y = DEFAULT_SPAWN.y;
                player.z = DEFAULT_SPAWN.z;
                player.ry = DEFAULT_SPAWN.ry;
                io.to(room).emit('player_respawn', {
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
            if (rooms[room] && rooms[room].players[data.targetId]) {
                const target = rooms[room].players[data.targetId];
                const attackerId = socket.id; // Use local var to be safe
                target.hp -= data.damage;
                io.to(room).emit('player_damaged', { id: data.targetId, hp: target.hp, attackerId: attackerId });

                if (target.hp <= 0) {
                    // Reset HP for respawn logic if needed, or let client handle
                    target.hp = 0; // Keep at 0 to mark as dead
                    target.isDead = true;
                    target.deaths++;
                    if (rooms[room].players[attackerId]) rooms[room].players[attackerId].kills++;

                    io.to(room).emit('player_died', {
                        id: data.targetId,
                        attackerId: attackerId,
                        kills: rooms[room].players[attackerId]?.kills || 0,
                        deaths: target.deaths
                    });

                    // Broadcast updated scoreboard data
                    io.to(room).emit('scoreboard_update', rooms[room].players);
                }
            }
        });

        // Voice Chat
        socket.on('voice_start', () => {
            socket.to(room).emit('voice_start', socket.id);
        });

        socket.on('voice_end', () => {
            socket.to(room).emit('voice_end', socket.id);
        });

        socket.on('voice_data', (data) => {
            // data is the audio chunk (ArrayBuffer or Blob)
            socket.to(room).emit('voice_data', { id: socket.id, data: data });
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
            isBot: true
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

