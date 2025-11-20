import { network } from './network.js';

// ... existing imports ...

export function initLoginUI() {
    const btn = document.getElementById('login-btn');
    const nameInput = document.getElementById('player-name');
    const roomInput = document.getElementById('room-name');

    btn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        const room = roomInput.value.trim() || 'default';
        
        if (name.length > 0) {
            network.connect(name, room);
        } else {
            alert("Please enter a name");
        }
    });
}

// ... existing functions ...
import { WEAPONS } from './constants.js';
import { state } from './state.js';
import { switchWeapon } from './player.js';
import { playSound } from './audio.js';

export function updateHUD() {
    document.getElementById('hp').innerText = state.player.hp;
    document.getElementById('money').innerText = "$ " + state.player.money;
    const w = state.player.slots[state.player.activeSlot];
    if(w) {
        document.getElementById('wep-name').innerText = WEAPONS[w].name;
        document.getElementById('ammo').innerText = state.player.ammo[w] ?? '-';
        document.getElementById('mag').innerText = state.player.mags[w] ?? '-';
    }
}

export function toggleShop() {
    const m = document.getElementById('shop-menu');
    if(m.style.display==='block'){m.style.display='none'; state.controls.lock();}
    else{m.style.display='block'; state.controls.unlock();}
}

export function buy(item) {
    const p = {glock:400, deagle:700, m4a1:3100, awp:4750}[item];
    if(state.player.money >= p) {
        state.player.money -= p;
        const type = WEAPONS[item].type;
        
        if(type === 'rifle') { 
            state.player.slots[0] = item; // Primary
            switchWeapon(0);
        } else if (type === 'pistol') {
            state.player.slots[1] = item; // Secondary
            switchWeapon(1);
        }
        // Knife stays at 2
        
        toggleShop();
        playSound('buy');
    }
}

// Expose for HTML onclick
window.buy = buy;
