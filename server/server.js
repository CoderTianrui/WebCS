const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
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

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', ({ name, room }) => {
        // Initialize room if not exists
        if (!rooms[room]) {
            rooms[room] = { players: {} };
        }

        const currentPlayers = Object.keys(rooms[room].players).length;
        if (currentPlayers >= 5) {
            socket.emit('error_msg', 'Room is full (Max 5)');
            return;
        }

        // Join room
        socket.join(room);
        
        // Initial state
        rooms[room].players[socket.id] = {
            id: socket.id,
            name: name || `Player ${socket.id.substr(0,4)}`,
            x: 0, y: 10, z: 0,
            hp: 100
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

        // Handle Updates
        socket.on('update', (data) => {
            if (rooms[room] && rooms[room].players[socket.id]) {
                const p = rooms[room].players[socket.id];
                p.x = data.x; p.y = data.y; p.z = data.z;
                p.rx = data.rx; p.ry = data.ry;
                // Broadcast to others (volatile for performance)
                socket.to(room).volatile.emit('player_update', { id: socket.id, ...data });
            }
        });

        // Handle Actions
        socket.on('shoot', (data) => {
            socket.to(room).emit('remote_shoot', { id: socket.id, ...data });
        });
        
        socket.on('hit', (data) => {
            // data: { targetId, damage }
            if (rooms[room] && rooms[room].players[data.targetId]) {
                const target = rooms[room].players[data.targetId];
                target.hp -= data.damage;
                io.to(room).emit('player_damaged', { id: data.targetId, hp: target.hp, attackerId: socket.id });
                
                if (target.hp <= 0) {
                    // Reset HP for respawn logic if needed, or let client handle
                    target.hp = 100; // Simple auto-reset server side tracking
                    io.to(room).emit('player_died', { id: data.targetId, attackerId: socket.id });
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

