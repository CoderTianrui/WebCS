import * as THREE from 'three';
import { WEAPONS } from './constants.js';
import { state } from './state.js';
import { playSound } from './audio.js';
import { updateHUD, toggleShop } from './ui.js'; // toggleShop needed for key bind
import { createTracer, createHole, spawnParticles, showHeadshot } from './utils.js';
import { killEnemy, spawnEnemy } from './entities.js'; 
import { toggleMusic } from './audio.js'; // for key bind
import { network } from './network.js'; // NEW: Network actions

export function createWeaponModel() {
    if(state.weaponGroup) state.camera.remove(state.weaponGroup);
    state.weaponGroup = new THREE.Group();
    state.camera.add(state.weaponGroup);
}

export function switchWeapon(slot) {
    if(state.player.reloading || state.player.isDead) return;
    const name = state.player.slots[slot];
    if(!name) return;
    
    state.player.activeSlot = slot;
    
    // Rebuild model
    while(state.weaponGroup.children.length) state.weaponGroup.remove(state.weaponGroup.children[0]);
    const w = WEAPONS[name];
    
    const armColor = new THREE.MeshLambertMaterial({color: 0x3b5c26});
    const gunColor = new THREE.MeshStandardMaterial({color: 0x333});

    if(w.type === 'melee') {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.4), new THREE.MeshStandardMaterial({color:0x111}));
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.1,0.7), new THREE.MeshStandardMaterial({color:0xccc, metalness:0.8}));
        b.position.z = -0.5;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.2,1.5), new THREE.MeshLambertMaterial({color:0xd2b48c})); // Skin
        arm.position.set(0.2,-0.1,0.5);
        state.weaponGroup.add(h,b,arm);
        state.weaponGroup.position.set(0.5, -0.5, -1);
    } else {
        const len = w.type==='rifle'?2:1;
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.2,len), gunColor);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25,0.25,2), armColor);
        arm.position.set(0.3,0,0.5); arm.rotation.y = -0.2;
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
    
    if(state.player.reloading || now - state.player.lastShot < stat.rate) return;
    
    if(stat.type !== 'melee' && state.player.ammo[name] <= 0) {
        playSound('click'); return;
    }

    if(stat.type !== 'melee') state.player.ammo[name]--;
    state.player.lastShot = now;
    updateHUD();
    playSound(stat.sound);
    
    // Notify Network
    network.sendShoot();
    
    // Anim
    state.weaponGroup.position.z += 0.2;
    state.weaponGroup.rotation.x += 0.1;

    // Hit Scan
    const ray = new THREE.Raycaster();
    const spread = state.crouch ? stat.spread * 0.5 : stat.spread;
    ray.setFromCamera(new THREE.Vector2((Math.random()-.5)*spread, (Math.random()-.5)*spread), state.camera);
    
    const hits = ray.intersectObjects(state.scene.children, true);
    let target = null;

    // FIXED: Find first valid hit, stopping at walls
    for (let h of hits) {
        if (h.distance < 1) continue; // Skip self
        
        // Check if it's an enemy (NPC)
        let obj = h.object;
        let isEnemy = false;
        let isRemotePlayer = false;
        let remotePlayerId = null;

        while(obj.parent && obj.parent.type !== 'Scene') {
            if(state.enemies.find(e => e.mesh === obj)) isEnemy = true;
            // Check for Remote Players
            const foundId = Object.keys(state.remotePlayers).find(id => state.remotePlayers[id].mesh === obj);
            if (foundId) {
                isRemotePlayer = true;
                remotePlayerId = foundId;
            }
            obj = obj.parent;
        }

        target = h;
        target.isEnemy = isEnemy;
        target.isRemotePlayer = isRemotePlayer;
        target.remoteId = remotePlayerId;
        break; 
    }

    if (target) {
        const start = state.weaponGroup.getWorldPosition(new THREE.Vector3());
        start.y -= 0.1;
        createTracer(start, target.point, 0xffff00);

        if (target.isEnemy) {
            // NPC Logic (Local)
            let obj = target.object;
            let rootObj = obj;
            while(rootObj.parent && rootObj.parent.type !== 'Scene') rootObj = rootObj.parent;
            const enemy = state.enemies.find(e => e.mesh === rootObj);
            if (enemy) {
                enemy.hp -= stat.dmg;
                enemy.flash();
                spawnParticles(target.point, 0x880000, 5);
                if(enemy.hp <= 0) killEnemy(enemy);
            }
        } else if (target.isRemotePlayer) {
            // Multiplayer Logic
             spawnParticles(target.point, 0x880000, 5); // Blood
             playSound('hit');
             network.sendHit(target.remoteId, stat.dmg);
        } else {
            // Hit Wall
            createHole(target.point, target.face.normal);
            spawnParticles(target.point, 0xaaaaaa, 3); // Dust/Sparks
        }
    }
}

export function reload() {
    const name = state.player.slots[state.player.activeSlot];
    if(!name || WEAPONS[name].type === 'melee' || state.player.reloading) return;
    if(state.player.ammo[name] === WEAPONS[name].clip) return;

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
    state.player.ammo = { glock:20, deagle:7, m4a1:30, awp:10 };
    state.player.slots = [null, 'glock', 'knife'];
    state.player.activeSlot = 1;
    
    state.camera.position.set(0, 10, 100);
    state.camera.rotation.set(0, Math.PI, 0);
    state.velocity.set(0,0,0);
    switchWeapon(1);
    
    document.getElementById('death-screen').style.display = 'none';
    updateHUD();
    state.controls.lock();
}

// Expose for UI
window.respawnPlayer = respawnPlayer;

export function onKeyDown(e) {
    if(e.code==='KeyW') state.moveF=true; if(e.code==='KeyS') state.moveB=true;
    if(e.code==='KeyA') state.moveL=true; if(e.code==='KeyD') state.moveR=true;
    if(e.code==='Space'&&state.canJump){state.velocity.y+=200;state.canJump=false;}
    if(e.code==='KeyR') reload(); if(e.code==='KeyB') toggleShop();
    if(e.code==='Digit1') switchWeapon(0); // Primary
    if(e.code==='Digit2') switchWeapon(1); // Pistol
    if(e.code==='Digit3') switchWeapon(2); // Knife
    if(e.code==='ControlLeft') state.crouch=true;
    if(e.code==='KeyM') toggleMusic();
}

export function onKeyUp(e) {
    if(e.code==='KeyW') state.moveF=false; if(e.code==='KeyS') state.moveB=false;
    if(e.code==='KeyA') state.moveL=false; if(e.code==='KeyD') state.moveR=false;
    if(e.code==='ControlLeft') state.crouch=false;
}
