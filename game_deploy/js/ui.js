import { network } from './network.js';
import { WEAPONS } from './constants.js';
import { state } from './state.js';
import { switchWeapon, fireWeapon, reload } from './player.js';
import { playSound } from './audio.js';
import { startSinglePlayer } from './main.js';

export function initLoginUI() {
    const mpBtn = document.getElementById('multiplayer-btn');
    const spBtn = document.getElementById('singleplayer-btn');
    const nameInput = document.getElementById('player-name');
    const menuDiv = document.getElementById('login-modal');

    // MULTIPLAYER JOIN
    mpBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();

        if (name.length > 0) {
            state.gameMode = 'multi';
            // Connect to 'global' room
            network.connect(name, 'global');
        } else {
            alert("Please enter a name for Multiplayer");
        }
    });

    // SINGLE PLAYER START
    spBtn.addEventListener('click', () => {
        startSinglePlayer();
    });

    // Init Mobile Controls if touch supported
    if ('ontouchstart' in window || navigator.maxTouchPoints) {
        state.isMobile = true;
        initMobileControls();
    }
}

function initMobileControls() {
    const styles = `
        .mc-ctrl {
            position: absolute; z-index: 999; user-select: none; -webkit-user-select: none;
            background: rgba(255,255,255,0.2); border: 2px solid rgba(255,255,255,0.5);
            border-radius: 10px; touch-action: none;
        }
        .mc-ctrl:active { background: rgba(255,255,255,0.5); }
        #mc-dpad { bottom: 20px; left: 20px; width: 150px; height: 150px; border: none; background: none; pointer-events: none; }
        .d-btn { position: absolute; width: 50px; height: 50px; background: rgba(255,255,255,0.3); border-radius: 5px; text-align: center; line-height: 50px; color: white; font-weight: bold; font-size: 20px; pointer-events: auto; }
        #d-up { top: 0; left: 50px; }
        #d-down { bottom: 0; left: 50px; }
        #d-left { top: 50px; left: 0; }
        #d-right { top: 50px; right: 0; }
        
        #mc-jump { bottom: 100px; right: 20px; width: 60px; height: 60px; border-radius: 50%; line-height:60px; text-align:center; color:white; font-size:12px; }
        #mc-fire { bottom: 180px; right: 20px; width: 70px; height: 70px; border-radius: 50%; background: rgba(255,0,0,0.3); line-height:70px; text-align:center; color:white; font-weight:bold; }
        #mc-reload { bottom: 20px; right: 100px; width: 50px; height: 50px; border-radius: 50%; line-height:50px; text-align:center; color:white;}
        #mc-chat { top: 10px; left: 50%; transform: translateX(-50%); width: 40px; height: 40px; line-height:40px; text-align:center; color:white; }
    `;
    const s = document.createElement('style');
    s.innerHTML = styles;
    document.head.appendChild(s);

    const dpad = document.createElement('div');
    dpad.id = 'mc-dpad'; dpad.className = 'mc-ctrl';
    dpad.innerHTML = `
        <div class="d-btn" id="d-up">W</div>
        <div class="d-btn" id="d-left">A</div>
        <div class="d-btn" id="d-right">D</div>
        <div class="d-btn" id="d-down">S</div>
    `;
    document.body.appendChild(dpad);

    const createBtn = (id, text, fn) => {
        const b = document.createElement('div');
        b.id = id; b.className = 'mc-ctrl'; b.innerText = text;
        b.addEventListener('touchstart', (e) => { 
            e.preventDefault(); 
            e.stopPropagation(); // Critical for mobile to stop ghost clicks or zoom
            fn(true); 
        }, { passive: false });
        b.addEventListener('touchend', (e) => { 
            e.preventDefault(); 
            e.stopPropagation();
            fn(false); 
        }, { passive: false });
        document.body.appendChild(b);
        return b;
    };

    // D-PAD Logic
    const touchMap = { 'd-up': 'moveF', 'd-down': 'moveB', 'd-left': 'moveL', 'd-right': 'moveR' };
    
    // We must prevent default on the entire dpad container to avoid scroll/zoom
    dpad.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });

    ['d-up', 'd-down', 'd-left', 'd-right'].forEach(id => {
        const el = document.getElementById(id);
        
        // Use pointer events for better multi-touch support across modern browsers/mobile
        el.addEventListener('pointerdown', (e) => { 
            e.preventDefault(); 
            e.stopPropagation();
            state[touchMap[id]] = true; 
            el.style.backgroundColor = "rgba(255,255,255,0.5)"; // Visual feedback
        });
        el.addEventListener('pointerup', (e) => { 
            e.preventDefault(); 
            e.stopPropagation();
            state[touchMap[id]] = false; 
            el.style.backgroundColor = "rgba(255,255,255,0.3)";
        });
        el.addEventListener('pointerleave', (e) => { 
             // Handle sliding off button
             e.preventDefault();
             state[touchMap[id]] = false;
             el.style.backgroundColor = "rgba(255,255,255,0.3)";
        });
        
        // Fallback for old touch events if pointer not supported well (redundant but safe)
        el.addEventListener('touchstart', (e) => { 
            e.preventDefault(); 
            state[touchMap[id]] = true; 
        }, { passive: false });
        el.addEventListener('touchend', (e) => { 
            e.preventDefault(); 
            state[touchMap[id]] = false; 
        }, { passive: false });
    });

    createBtn('mc-jump', 'JUMP', (down) => { if(down && state.canJump) { state.velocity.y += 200; state.canJump = false; } });
    createBtn('mc-fire', 'FIRE', (down) => { if(down && !state.player.isDead) fireWeapon(); });
    createBtn('mc-reload', 'R', (down) => { if(down) reload(); });
    
    // Chat Toggle
    const chatBtn = document.createElement('div');
    chatBtn.id = 'mc-chat'; chatBtn.className = 'mc-ctrl'; chatBtn.innerText = '💬';
    chatBtn.addEventListener('touchstart', (e) => {
         e.preventDefault();
         e.stopPropagation();
         const input = document.getElementById('chat-input');
         if(input.style.display === 'none') {
             input.style.display = 'block';
             input.focus();
         } else {
             input.style.display = 'none';
         }
    }, { passive: false });
    document.body.appendChild(chatBtn);

    // Camera Look (Right side of screen swipe)
    const touchZone = document.createElement('div');
    touchZone.style.cssText = "position:absolute; top:0; right:0; width: 50%; height: 100%; z-index: 900;";
    document.body.appendChild(touchZone);

    let lastX, lastY;
    touchZone.addEventListener('touchstart', (e) => {
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
    }, { passive: false });
    
    touchZone.addEventListener('touchmove', (e) => {
        e.preventDefault(); // Prevent scrolling
        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const dx = x - lastX;
        const dy = y - lastY;
        
        if (state.camera) {
            state.camera.rotation.y -= dx * 0.005;
            // state.camera.rotation.x -= dy * 0.005; 
        }
        
        lastX = x;
        lastY = y;
    }, { passive: false });
}

export function updateHUD() {
    document.getElementById('hp').innerText = state.player.hp;
    document.getElementById('money').innerText = "$ " + state.player.money;
    const w = state.player.slots[state.player.activeSlot];
    if (w) {
        document.getElementById('wep-name').innerText = WEAPONS[w].name;
        document.getElementById('ammo').innerText = state.player.ammo[w] ?? '-';
        document.getElementById('mag').innerText = state.player.mags[w] ?? '-';
    }
}

export function toggleShop() {
    const m = document.getElementById('shop-menu');
    if (m.style.display === 'block') { m.style.display = 'none'; state.controls.lock(); }
    else { m.style.display = 'block'; state.controls.unlock(); }
}

export function buy(item) {
    const weapon = WEAPONS[item];
    if (!weapon) return;
    const price = weapon.price ?? 0;
    if (state.player.money < price) {
        playSound('click');
        return;
    }

    state.player.money -= price;
    const type = weapon.type;

    if (weapon.clip) {
        state.player.ammo[item] = weapon.clip;
    }
    if (weapon.mag) {
        state.player.mags[item] = weapon.mag;
    }

    if (type === 'rifle' || type === 'sniper') {
        state.player.slots[0] = item; // Primary
        switchWeapon(0);
    } else if (type === 'pistol') {
        state.player.slots[1] = item; // Secondary
        switchWeapon(1);
    } else if (type === 'melee') {
        state.player.slots[2] = item;
        switchWeapon(2);
    }

    toggleShop();
    playSound('buy');
    updateHUD();
}

// Expose for HTML onclick
window.buy = buy;
