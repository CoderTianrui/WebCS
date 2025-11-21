import { state } from './state.js';
import { RemotePlayer } from './remote_player.js';
import { playSound } from './audio.js';
import { updateHUD } from './ui.js';

const MAX_CHAT_HISTORY = 200;

const chatRenderQueue = [];
let chatRenderScheduled = false;

function scheduleFrame(fn) {
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
        window.requestAnimationFrame(fn);
    } else {
        setTimeout(fn, 16);
    }
}

function scheduleChatRender() {
    if (chatRenderScheduled) return;
    chatRenderScheduled = true;
    scheduleFrame(() => {
        chatRenderScheduled = false;
        if (!chatRenderQueue.length) return;
        const chatBox = document.getElementById('chat-history');
        if (!chatBox) {
            chatRenderQueue.length = 0;
            return;
        }
        const fragment = document.createDocumentFragment();
        while (chatRenderQueue.length) {
            const item = chatRenderQueue.shift();
            const line = document.createElement('div');
            line.innerHTML = `<span style="color:#aaa">&lt;${item.displayName}&gt;</span> ${item.msg}`;
            fragment.appendChild(line);
        }
        chatBox.appendChild(fragment);
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

export function appendChatMessage(data) {
    if (!data || !data.msg) return false;
    ensureChatBuffers();

    const dedupId = data.mid || `${data.id || 'unknown'}-${data.msg}-${data.ts || ''}`;
    if (state.chatMessageIds.has(dedupId)) return false;

    state.chatMessageIds.add(dedupId);
    state.chatMessageQueue.push(dedupId);
    if (state.chatMessageQueue.length > MAX_CHAT_HISTORY) {
        const oldest = state.chatMessageQueue.shift();
        if (oldest) state.chatMessageIds.delete(oldest);
    }

    const displayName = data.self ? `${data.name || 'You'} (You)` : (data.name || 'Player');
    chatRenderQueue.push({ displayName, msg: data.msg });
    scheduleChatRender();
    return true;
}

function ensureChatBuffers() {
    if (!state.chatMessageIds) {
        state.chatMessageIds = new Set();
    }
    if (!state.chatMessageQueue) {
        state.chatMessageQueue = [];
    }
}

// --- CONFIGURATION ---
// CHANGE THIS TO YOUR RENDER URL ONCE DEPLOYED
const PRODUCTION_SERVER_URL = "https://webcs-6js9.onrender.com";

export const network = {
    connect: (name, room) => {
        // Determine URL
        let serverUrl;

        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            serverUrl = 'http://localhost:3000';
        } else {
            // Use production URL
            serverUrl = PRODUCTION_SERVER_URL;
        }

        if (!serverUrl) return;

        // Prevent multiple connections or duplicate listeners
        if (state.socket) {
            state.socket.removeAllListeners();
            state.socket.disconnect();
        }

        const playerLabel = name?.trim() || state.playerName || 'Player';
        state.playerName = playerLabel;

        state.socket = io(serverUrl);

        state.socket.on('connect', () => {
            console.log('Connected to server');
            state.id = state.socket.id;
            state.room = room;
            state.socket.emit('join', { name: playerLabel, room });

            // Hide Login, Show Game
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('start-screen').style.display = 'flex';
        });

        state.socket.on('connect_error', (err) => {
            alert("Failed to connect to server. Multiplayer unavailable.");
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
                if (p.id !== state.id) {
                    state.remotePlayers[p.id] = new RemotePlayer(p.id, p.name, p);
                }
            });
        });

        s.on('player_joined', (p) => {
            if (p.id !== state.id && !state.remotePlayers[p.id]) {
                state.remotePlayers[p.id] = new RemotePlayer(p.id, p.name, p);
            }
            appendChatMessage({
                id: 'server',
                name: 'SERVER',
                msg: `<span style="color:#4caf50">${p.name || 'Someone'} joined the room.</span>`,
                mid: `join-${p.id}-${Date.now()}`,
                ts: Date.now()
            });
        });

        s.on('player_left', (id) => {
            if (state.remotePlayers[id]) {
                state.remotePlayers[id].dispose();
                delete state.remotePlayers[id];
            }
        });

        s.on('player_update', (data) => {
            const remote = state.remotePlayers[data.id];
            if (remote) {
                remote.syncFromServer(data);
            }
        });

        s.on('remote_shoot', (data) => {
            if (state.remotePlayers[data.id]) {
                state.remotePlayers[data.id].shoot(data);
            }
        });

        s.on('player_damaged', (data) => {
            if (data.id === state.id) {
                // I got hit!
                state.player.hp = data.hp;
                updateHUD();
                document.getElementById('damage-flash').style.opacity = 1;
                setTimeout(() => document.getElementById('damage-flash').style.opacity = 0, 100);
            }
        });

        s.on('player_respawn', (payload) => {
            const data = typeof payload === 'string' ? { id: payload } : payload;
            if (!data || data.id === state.id) return;
            const remote = state.remotePlayers[data.id];
            if (remote) {
                remote.respawn(data);
            }
        });

        s.on('chat_message', (data) => appendChatMessage(data));

        s.on('scoreboard_update', (players) => {
            // Update global scoreboard data
            state.scoreboardData = players;
            // If visible, update UI
            const sb = document.getElementById('scoreboard');
            if (sb && sb.style.display === 'block') {
                updateScoreboardUI();
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
                setTimeout(() => div.remove(), 3000);
            }
        });

        // Voice Listeners
        s.on('voice_start', (id) => {
            if (state.remotePlayers[id]) {
                state.remotePlayers[id].setTalking(true);
            }
        });

        s.on('voice_end', (id) => {
            if (state.remotePlayers[id]) {
                state.remotePlayers[id].setTalking(false);
            }
        });

        s.on('voice_data', (payload) => {
            // payload: { id, data }
            if (state.remotePlayers[payload.id]) {
                playVoiceChunk(payload.data);
            }
        });
    },

    sendUpdate: (pos, rot) => {
        if (!state.socket) return;
        // Limit update rate? throttle handled by frame rate or explicit throttling
        // For now, send every frame (simple, high bandwidth) or every X frames
        state.socket.emit('update', {
            x: pos.x, y: pos.y, z: pos.z,
            rx: 0, ry: rot.y
        });
    },

    sendShoot: () => {
        if (!state.socket) return;
        state.socket.emit('shoot', {});
    },

    sendHit: (targetId, damage) => {
        if (!state.socket) return;
        state.socket.emit('hit', { targetId, damage });
    },

    sendRespawn: () => {
        if (!state.socket) return;
        state.socket.emit('respawn');
    },

    sendChat: (msg) => {
        if (!state.socket || !msg) return null;
        const payload = {
            msg,
            mid: `${state.id || 'local'}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            ts: Date.now()
        };
        state.socket.emit('chat_message', payload);
        return payload;
    },

    // Voice
    sendVoiceStart: () => {
        if (!state.socket) return;
        state.socket.emit('voice_start');
    },

    sendVoiceEnd: () => {
        if (!state.socket) return;
        state.socket.emit('voice_end');
    },

    sendVoiceData: (blob) => {
        if (!state.socket) return;
        state.socket.emit('voice_data', blob);
    }
};

// Audio Context for playback
let audioCtx;

function playVoiceChunk(data) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // Decode raw data (from Blob/ArrayBuffer) to PCM
    // NOTE: MediaRecorder usually gives WEBM/OPUS chunks.
    // decodeAudioData is good but might be tricky with small chunks of stream data.
    // However, for "press T to talk" it usually sends a decent chunk.
    
    // Ensure data is an ArrayBuffer
    let arrayBuffer = data;
    if (data instanceof Blob) {
         data.arrayBuffer().then(buf => playVoiceChunk(buf));
         return;
    }

    try {
        // Make a copy of buffer because decodeAudioData detaches it
        const bufferCopy = data.slice(0);
        audioCtx.decodeAudioData(bufferCopy, (buffer) => {
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            source.start(0);
        }, (err) => {
            // It's common to get decode errors on partial webm chunks
            // Real implementation would use SourceBuffer/MediaSource extensions or similar
            // But for simple hack, we suppress or log
            // console.error("Error decoding audio chunk", err);
        });
    } catch(e) {
        console.error("Audio processing error", e);
    }
}

// Helper to update Scoreboard UI (called from ui.js or network)
export function updateScoreboardUI() {
    const sb = document.getElementById('scoreboard-list');
    if (!sb || !state.scoreboardData) return;

    sb.innerHTML = `
        <tr style="color:#ffb93b; border-bottom:1px solid #555;">
            <th style="text-align:left; padding:5px;">NAME</th>
            <th style="padding:5px;">KILLS</th>
            <th style="padding:5px;">DEATHS</th>
            <th style="padding:5px;">PING</th>
        </tr>
    `;

    // Add self
    const myKills = state.player.kills || 0; // Need to track local kills/deaths or rely on server data
    // Actually server sends all data including self in 'scoreboard_update'

    Object.values(state.scoreboardData).sort((a, b) => b.kills - a.kills).forEach(p => {
        const row = document.createElement('tr');
        const isMe = p.id === state.id;
        row.style.color = isMe ? '#00ff00' : 'white';
        // Ping is fake for now or we can add latency later. 
        // Let's show a random realistic ping for others, 15ms for self
        const ping = isMe ? 15 : Math.floor(Math.random() * 50 + 20);

        row.innerHTML = `
            <td style="text-align:left; padding:5px;">${p.name}</td>
            <td style="text-align:center; padding:5px;">${p.kills || 0}</td>
            <td style="text-align:center; padding:5px;">${p.deaths || 0}</td>
            <td style="text-align:center; padding:5px;">${ping}</td>
        `;
        sb.appendChild(row);
    });
}
