import * as THREE from 'three';
import { WEAPONS } from './constants.js';
import { state } from './state.js';
import { playSound } from './audio.js';
import { updateHUD, toggleShop, toggleSettingsMenu } from './ui.js';
import { createTracer, createHole, spawnParticles, showHeadshot } from './utils.js';
import { killEnemy } from './entities.js';
import { toggleMusic } from './audio.js';
import { network, updateScoreboardUI, appendChatMessage } from './network.js';

const isEnterKey = (event) => event.code === 'Enter' || event.code === 'NumpadEnter' || event.key === 'Enter' || event.keyCode === 13;
const isEscapeKey = (event) => event.code === 'Escape' || event.key === 'Escape' || event.keyCode === 27;

const LOCAL_BOMB_TIMER = 40000;

// Voice Recording
let mediaRecorder;
let voiceStream;

async function initVoice() {
    if (voiceStream) return;
    try {
        voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        console.error("Microphone access denied", err);
    }
}

function startRecording() {
    if (!voiceStream) {
        initVoice().then(() => {
            if (voiceStream) startRecording();
        });
        return;
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') return;

    mediaRecorder = new MediaRecorder(voiceStream, { mimeType: 'audio/webm;codecs=opus' });
    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
            network.sendVoiceData(e.data);
        }
    };
    mediaRecorder.start(100); // Send chunks every 100ms
    network.sendVoiceStart();

    // Show local indicator
    const hud = document.getElementById('hud');
    let micIcon = document.getElementById('mic-icon');
    if (!micIcon) {
        micIcon = document.createElement('div');
        micIcon.id = 'mic-icon';
        micIcon.innerHTML = '🎤 SPEAKING...';
        micIcon.style.cssText = 'position:absolute; top:20%; left:50%; transform:translate(-50%,0); font-size:40px; color:#00ff00; font-weight:bold; text-shadow: 2px 2px 0 #000; display:none; animation: blink 1s infinite;';

        const style = document.createElement('style');
        style.innerHTML = `@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }`;
        document.head.appendChild(style);

        hud.appendChild(micIcon);
    }
    micIcon.style.display = 'block';
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        network.sendVoiceEnd();
    }
    const micIcon = document.getElementById('mic-icon');
    if (micIcon) micIcon.style.display = 'none';
}

export function createWeaponModel() {
    if (state.weaponGroup) state.camera.remove(state.weaponGroup);
    state.weaponGroup = new THREE.Group();
    state.camera.add(state.weaponGroup);
}

export function switchWeapon(slot) {
    if (state.player.reloading || state.player.isDead) return;
    const name = state.player.slots[slot];
    if (!name) return;

    state.player.activeSlot = slot;

    // Rebuild model
    while (state.weaponGroup.children.length) state.weaponGroup.remove(state.weaponGroup.children[0]);
    const w = WEAPONS[name];

    const armColor = new THREE.MeshLambertMaterial({ color: 0x3b5c26 });
    const gunColor = new THREE.MeshStandardMaterial({ color: 0x333 });

    if (w.type === 'melee') {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0x111 }));
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.7), new THREE.MeshStandardMaterial({ color: 0xccc, metalness: 0.8 }));
        b.position.z = -0.5;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.5), new THREE.MeshLambertMaterial({ color: 0xd2b48c })); // Skin
        arm.position.set(0.2, -0.1, 0.5);
        state.weaponGroup.add(h, b, arm);
        state.weaponGroup.position.set(0.5, -0.5, -1);
    } else {
        const len = w.type === 'rifle' || w.type === 'sniper' ? 2 : 1;
        const barrelColor = name === 'ak47' ? new THREE.MeshStandardMaterial({ color: 0x4d2c19 }) : gunColor;
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, len), barrelColor);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 2), armColor);
        arm.position.set(0.3, 0, 0.5); arm.rotation.y = -0.2;
        state.weaponGroup.add(barrel, arm);
        state.weaponGroup.position.set(0.5, -0.5, -1);
    }
    updateHUD();
    playSound('click');
}

export function fireWeapon() {
    const now = performance.now();
    const name = state.player.slots[state.player.activeSlot];
    const stat = WEAPONS[name];

    if (state.player.reloading || now - state.player.lastShot < stat.rate) return;

    if (stat.type !== 'melee' && state.player.ammo[name] <= 0) {
        playSound('click'); return;
    }

    if (stat.type !== 'melee') state.player.ammo[name]--;
    state.player.lastShot = now;
    updateHUD();
    playSound(stat.sound);

    // Notify Network if Multiplayer
    if (state.gameMode === 'multi' || state.gameMode === 'multi_ct') {
        network.sendShoot();
    }

    // Anim
    state.weaponGroup.position.z += 0.2;
    state.weaponGroup.rotation.x += 0.1;

    // Hit Scan
    const ray = new THREE.Raycaster();
    const baseSpread = typeof stat.spread === 'number' ? stat.spread : (stat.type === 'melee' ? 0 : 0.02);
    const spread = state.crouch ? baseSpread * 0.5 : baseSpread;
    const maxDist = stat.range ?? (stat.type === 'melee' ? 6 : 1000);
    ray.far = maxDist;
    ray.setFromCamera(new THREE.Vector2((Math.random() - .5) * spread, (Math.random() - .5) * spread), state.camera);

    // Intersect everything
    const hits = ray.intersectObjects(state.scene.children, true);
    let targetHit = null;
    let hitEnemy = null;
    let hitRemotePlayerId = null;

    // FIXED HIT DETECTION LOGIC
    const minHitDistance = stat.type === 'melee' ? 0.05 : 1;

    for (let h of hits) {
        if (h.distance < minHitDistance) continue; // Skip self/close artifacts
        if (h.distance > maxDist) break; // Too far (hits are sorted, so we can break early)

        let obj = h.object;

        // 1. Check for NPC Enemy (using userData we added in entities.js)
        if (obj.userData && obj.userData.parentEnemy) {
            targetHit = h;
            hitEnemy = obj.userData.parentEnemy;
            break; // Hit an enemy, stop ray
        }
        // Also check if we hit the group itself (rare but possible)
        if (obj.userData && obj.userData.entity) {
            targetHit = h;
            hitEnemy = obj.userData.entity;
            break;
        }

        // 2. Check for Remote Player (Multiplayer)
        // We need to traverse up to find the group that represents a player
        let remoteId = null;
        let tempObj = obj;
        while (tempObj) {
            // We need a way to identify remote player meshes. 
            // In remote_player.js, we didn't add userData. Let's assume we can find it by reference.
            const foundId = Object.keys(state.remotePlayers).find(id => state.remotePlayers[id].mesh === tempObj);
            if (foundId) {
                remoteId = foundId;
                break;
            }
            tempObj = tempObj.parent;
        }

        if (remoteId) {
            if (state.gameMode === 'multi' || state.gameMode === 'multi_ct') {
                targetHit = h;
                hitRemotePlayerId = remoteId;
                break;
            } else {
                // In single player, ignore remote players (shouldn't exist anyway)
                continue;
            }
        }

        // 3. Check for Wall/Environment
        // If we didn't hit an enemy/player, and we hit something else, it's a wall.
        // BUT, we must ensure we don't stop on "invisible" things or helpers.
        // Check if it's in state.objects (walls/floor)
        let isWall = false;
        // state.objects contains meshes.
        if (state.objects.includes(obj)) isWall = true;

        if (isWall || obj.isWall || (obj.parent && obj.parent.type === 'Scene')) {
            // Hit map geometry
            targetHit = h;
            break; // Stop at wall
        }
    }

    if (targetHit) {
        const start = state.weaponGroup.getWorldPosition(new THREE.Vector3());
        start.y -= 0.1;
        createTracer(start, targetHit.point, 0xffff00);

        if (hitEnemy && (state.gameMode === 'single' || state.gameMode === 'ai_ct')) {
            // Hit NPC
            // Headshot Logic?
            const enemy = hitEnemy;
            const hitHeight = targetHit.point.y - enemy.mesh.position.y;
            let damage = stat.dmg;
            let isHeadshot = hitHeight > 8.5;

            if (isHeadshot) {
                damage *= 4;
                showHeadshot();
                playSound('headshot');
            } else {
                playSound('hit');
            }

            enemy.hp -= damage;
            enemy.flash();
            spawnParticles(targetHit.point, 0x880000, 5);

            if (enemy.hp <= 0) killEnemy(enemy);

        } else if (hitRemotePlayerId && (state.gameMode === 'multi' || state.gameMode === 'multi_ct')) {
            // Hit Remote Player
            spawnParticles(targetHit.point, 0x880000, 5); // Blood
            playSound('hit');
            network.sendHit(hitRemotePlayerId, stat.dmg);
        } else {
            // Hit Wall
            // If knife, make scratch
            if (stat.type === 'melee') {
                 // Scratch effect (using createHole but could be customized)
                 // Ideally we'd rotate it or stretch it to look like a slash
                 createHole(targetHit.point, targetHit.face.normal); 
                 // Add sparks specifically for knife on wall
                 spawnParticles(targetHit.point, 0xffff00, 5);
                 playSound('knife'); // Knife hitting wall sound
            } else {
                 createHole(targetHit.point, targetHit.face.normal);
                 spawnParticles(targetHit.point, 0xaaaaaa, 3); // Dust/Sparks
            }
        }
    }
}

export function reload() {
    const name = state.player.slots[state.player.activeSlot];
    if (!name || WEAPONS[name].type === 'melee' || state.player.reloading) return;
    if (state.player.ammo[name] === WEAPONS[name].clip) return;

    state.player.reloading = true;
    playSound('reload');
    state.weaponGroup.position.y -= 0.5; // Dip

    setTimeout(() => {
        const need = WEAPONS[name].clip - state.player.ammo[name];
        const take = Math.min(need, state.player.mags[name]);
        state.player.ammo[name] += take;
        state.player.mags[name] -= take;
        state.player.reloading = false;
        state.weaponGroup.position.y += 0.5;
        updateHUD();
    }, 1500);
}

// Utils/Global
export function respawnPlayer() {
    state.player.hp = 100;
    state.player.isDead = false;
    state.player.ammo = { glock: 20, usp: 12, deagle: 7, m4a1: 30, ak47: 30, mp5: 30, awp: 10 };
    state.player.mags = { glock: 120, usp: 60, deagle: 35, m4a1: 90, ak47: 90, mp5: 120, awp: 30 };
    state.player.slots = ['m4a1', 'glock', 'knife'];
    state.player.activeSlot = 1;

    state.camera.position.set(0, 10, 100);
    state.camera.rotation.set(0, Math.PI, 0);
    state.velocity.set(0, 0, 0);
    switchWeapon(1);

    document.getElementById('death-screen').style.display = 'none';
    updateHUD();
    state.controls.lock();

    if (state.gameMode === 'multi' || state.gameMode === 'multi_ct') {
        network.sendRespawn();
    }
}

// Expose for UI
window.respawnPlayer = respawnPlayer;

export function onKeyDown(e) {
    const chatInput = document.getElementById('chat-input');
    const isChatVisible = chatInput.style.display === 'block';

    // Chat Logic
    if (isChatVisible) {
        // If chat is open, capture inputs
        if (isEnterKey(e)) {
            e.preventDefault();
            e.stopPropagation(); 
            
            // Debounce: Check if we just sent a message recently (e.g. < 200ms) to prevent double sends from keyboard repeat or event bubbles
            const now = performance.now();
            if (state.lastChatTime && now - state.lastChatTime < 200) return;
            
            const msg = chatInput.value.trim();
            if (msg.length > 0 && (state.gameMode === 'multi' || state.gameMode === 'multi_ct')) {
                const payload = network.sendChat(msg);
                if (payload) {
                    appendChatMessage({
                        id: state.id || 'local',
                        name: state.playerName || 'You',
                        msg,
                        mid: payload.mid,
                        ts: payload.ts,
                        self: true
                    });
                }
                state.lastChatTime = now;
            }
            chatInput.value = '';
            chatInput.style.display = 'none'; // Hide
            chatInput.blur();
            
            // Fix stuck view: ensure pointer lock is requested properly with a slight delay to clear the UI stack
            setTimeout(() => {
                state.controls.lock(); 
            }, 50);
            return;
        }
        if (isEscapeKey(e)) {
            chatInput.value = '';
            chatInput.style.display = 'none'; // Hide
            chatInput.blur();
            state.controls.lock();
            return;
        }
        return; // Block other game controls while typing
    } else {
        if (state.settingsOpen && !isEnterKey(e)) {
            if (isEscapeKey(e)) toggleSettingsMenu(false);
            return;
        }
        // Chat not open
        if (isEnterKey(e)) {
            e.preventDefault(); // Prevent default behavior
            const chatInput = document.getElementById('chat-input');

            // Unlock controls first
            if (state.controls.isLocked) {
                state.controls.unlock();
            }

            chatInput.style.display = 'block';

            // Force focus with a slight delay to ensure UI is ready
            setTimeout(() => {
                chatInput.focus();
            }, 10);
            return;
        }
        if (isEscapeKey(e)) {
            toggleSettingsMenu(!state.settingsOpen);
            return;
        }
    }

    // Standard Game Controls (only if chat is closed)
    if (e.code === 'Tab') {
        e.preventDefault(); // Prevent focus change
        document.getElementById('scoreboard').style.display = 'block';
        // Update scoreboard now just in case
        if (state.gameMode === 'multi' || state.gameMode === 'multi_ct') {
            updateScoreboardUI();
        }
    }

    if (e.code === 'KeyW') state.moveF = true; if (e.code === 'KeyS') state.moveB = true;
    if (e.code === 'KeyA') state.moveL = true; if (e.code === 'KeyD') state.moveR = true;
    if (e.code === 'Space' && state.canJump) { state.velocity.y += 200; state.canJump = false; }
    if (e.code === 'KeyR') reload(); if (e.code === 'KeyB') toggleShop();
    if (e.code === 'Digit1') switchWeapon(0); // Primary
    if (e.code === 'Digit2') switchWeapon(1); // Pistol
    if (e.code === 'Digit3') switchWeapon(2); // Knife
    if (e.code === 'ControlLeft') state.crouch = true;
    if (e.code === 'KeyM') toggleMusic();
    if (e.code === 'KeyT') startRecording();
    if (e.code === 'KeyG') attemptPlantBomb();
    if (e.code === 'KeyH') attemptDefuseBomb();
}

function getBombSiteUnderPlayer() {
    if (!state.bombSites || !state.controls) return null;
    const pos = state.controls.getObject().position;
    return state.bombSites.find(site => site.position.distanceTo(pos) <= site.radius) || null;
}

function attemptPlantBomb() {
    if (state.player.isDead || !state.controls) return;
    if (!state.bomb || (!state.bomb.hasBomb && state.gameMode !== 'multi_ct')) return;
    const site = getBombSiteUnderPlayer();
    if (!site) {
        window.updateBombIndicator && window.updateBombIndicator('Enter bomb site to plant (G).', 'rgba(255,152,0,0.85)');
        return;
    }
    if (state.gameMode === 'ai_ct' && state.playerTeam === 'T' && state.bomb.hasBomb) {
        plantLocalBomb(site);
    } else if (state.gameMode === 'multi_ct' && state.playerTeam === 'T' && state.bomb.hasBomb) {
        network.sendPlantBomb(site.name);
    }
}

function attemptDefuseBomb() {
    if (!state.bomb || !state.bomb.isPlanted || state.player.isDead) return;
    const site = getBombSiteUnderPlayer();
    if (!site || state.bomb.site !== site.name) {
        window.updateBombIndicator && window.updateBombIndicator('Locate the bomb to defuse (H).', 'rgba(100,181,246,0.85)');
        return;
    }
    if (state.gameMode === 'ai_ct' && state.playerTeam === 'CT') {
        defuseLocalBomb('Bomb defused! CT win.');
    } else if (state.gameMode === 'multi_ct' && state.playerTeam === 'CT') {
        network.sendDefuseBomb();
    }
}

function plantLocalBomb(site) {
    state.bomb.hasBomb = false;
    state.bomb.isPlanted = true;
    state.bomb.site = site.name;
    state.bomb.plantedAt = performance.now();
    state.bomb.explodeTime = performance.now() + LOCAL_BOMB_TIMER;
    window.updateBombIndicator && window.updateBombIndicator(`Bomb planted at Site ${site.name}!`, 'rgba(255,64,64,0.9)');
}

function defuseLocalBomb(message = 'Bomb defused!') {
    state.bomb.isPlanted = false;
    state.bomb.hasBomb = false;
    state.bomb.explodeTime = 0;
    window.updateBombIndicator && window.updateBombIndicator(message, 'rgba(76,175,80,0.85)');
}

export function onKeyUp(e) {
    if (e.code === 'Tab') {
        document.getElementById('scoreboard').style.display = 'none';
    }

    if (e.code === 'KeyW') state.moveF = false; if (e.code === 'KeyS') state.moveB = false;
    if (e.code === 'KeyA') state.moveL = false; if (e.code === 'KeyD') state.moveR = false;
    if (e.code === 'ControlLeft') state.crouch = false;
    if (e.code === 'KeyT') stopRecording();
}
