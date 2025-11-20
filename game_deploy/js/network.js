import { state } from './state.js';
import { RemotePlayer } from './remote_player.js';
import { playSound } from './audio.js';
import { updateHUD } from './ui.js';

// --- CONFIGURATION ---
// CHANGE THIS TO YOUR RENDER URL ONCE DEPLOYED
const PRODUCTION_SERVER_URL = "https://REPLACE-ME-WITH-YOUR-RENDER-URL.onrender.com"; 

export const network = {
    connect: (name, room) => {
        // Determine URL
        let serverUrl;
        
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
             serverUrl = 'http://localhost:3000';
        } else {
            // Check if the production URL has been set
            if (PRODUCTION_SERVER_URL.includes("REPLACE-ME")) {
                serverUrl = prompt("Enter Server URL (e.g. https://my-game-server.onrender.com)", "http://localhost:3000");
            } else {
                serverUrl = PRODUCTION_SERVER_URL;
            }
        }

        if(!serverUrl) return;

        state.socket = io(serverUrl);
        
        state.socket.on('connect', () => {
            console.log('Connected to server');
            state.id = state.socket.id;
            state.room = room;
            state.socket.emit('join', { name, room });
            
            // Hide Login, Show Game
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('start-screen').style.display = 'flex';
        });

        state.socket.on('connect_error', (err) => {
             alert("Failed to connect to server: " + serverUrl + "\nCheck console for details.");
             console.error(err);
        });

        network.initListeners();
    },

    initListeners: () => {
        const s = state.socket;

        s.on('error_msg', (msg) => {
            alert(msg);
            s.disconnect();
            document.getElementById('login-modal').style.display = 'flex';
        });

        s.on('joined', (data) => {
            // data.players is list of existing players
            Object.values(data.players).forEach(p => {
                if(p.id !== state.id) {
                    state.remotePlayers[p.id] = new RemotePlayer(p.id, p.name, p);
                }
            });
        });

        s.on('player_joined', (p) => {
            state.remotePlayers[p.id] = new RemotePlayer(p.id, p.name, p);
            // Maybe add chat message: p.name joined
        });

        s.on('player_left', (id) => {
            if(state.remotePlayers[id]) {
                state.remotePlayers[id].dispose();
                delete state.remotePlayers[id];
            }
        });

        s.on('player_update', (data) => {
            if(state.remotePlayers[data.id]) {
                state.remotePlayers[data.id].setTarget(data);
            }
        });
        
        s.on('remote_shoot', (data) => {
             if(state.remotePlayers[data.id]) {
                 state.remotePlayers[data.id].shoot(data);
             }
        });

        s.on('player_damaged', (data) => {
            if (data.id === state.id) {
                // I got hit!
                state.player.hp = data.hp;
                updateHUD();
                document.getElementById('damage-flash').style.opacity = 1;
                setTimeout(()=>document.getElementById('damage-flash').style.opacity=0, 100);
            }
        });

        s.on('player_died', (data) => {
             if (data.id === state.id) {
                 // I died
                 state.player.hp = 0;
                 state.player.isDead = true;
                 updateHUD();
                 state.controls.unlock();
                 document.getElementById('death-screen').style.display = 'block';
                 document.getElementById('start-screen').style.display = 'none';
             } else if (state.remotePlayers[data.id]) {
                 // Remote player died
                 state.remotePlayers[data.id].die();
             }
             
             // Kill feed
             if (data.attackerId === state.id) {
                 // I killed them
                 state.player.money += 300;
                 updateHUD();
                 playSound('buy');
                 const kf = document.getElementById('killfeed');
                 const div = document.createElement('div'); 
                 div.innerText = "You killed an Enemy +$300";
                 kf.appendChild(div);
                 setTimeout(()=>div.remove(),3000);
             }
        });
    },

    sendUpdate: (pos, rot) => {
        if(!state.socket) return;
        // Limit update rate? throttle handled by frame rate or explicit throttling
        // For now, send every frame (simple, high bandwidth) or every X frames
        state.socket.emit('update', {
            x: pos.x, y: pos.y, z: pos.z,
            rx: 0, ry: rot.y
        });
    },
    
    sendShoot: () => {
        if(!state.socket) return;
        state.socket.emit('shoot', {});
    },
    
    sendHit: (targetId, damage) => {
        if(!state.socket) return;
        state.socket.emit('hit', { targetId, damage });
    }
};
