import * as THREE from 'three';
import { state } from './state.js';
import { updateHUD } from './ui.js';
import { playSound } from './audio.js';
import { WEAPONS } from './constants.js';

const DROPPABLE_WEAPONS = ['m4a1', 'ak47', 'mp5', 'awp', 'deagle', 'usp', 'katana'];
const DROP_COLORS = {
    rifle: 0x4caf50,
    sniper: 0x9c27b0,
    pistol: 0x2196f3,
    melee: 0xff9800,
    heavy: 0xff5722,
    utility: 0xe0f7fa
};

export function spawnEnemy(x, y, z) {
    const mesh = new THREE.Group();

    const legMat = new THREE.MeshLambertMaterial({ color: 0x222 });
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x800000 });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xd2b48c });

    // Hitbox approx: 3w x 10h x 3d
    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), legMat); lLeg.position.set(-1, 2, 0);
    const rLeg = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), legMat); rLeg.position.set(1, 2, 0);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4, 2), bodyMat); torso.position.set(0, 6, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), skinMat); head.position.set(0, 9, 0);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), skinMat); arm.position.set(2, 6, 1); arm.rotation.x = -1.5;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3), new THREE.MeshBasicMaterial({ color: 0x000 })); gun.position.set(2, 6, 3);

    mesh.add(lLeg, rLeg, torso, head, arm, gun);
    mesh.position.set(x, y, z);
    state.scene.add(mesh);

    const enemy = {
        mesh: mesh, lLeg: lLeg, rLeg: rLeg,
        hp: 100,
        velocity: new THREE.Vector3(0, 0, 0),
        lastShot: 0,
        state: 'chase', // chase, strafe
        strafeDir: 1,
        changeStateTime: 0,

        flash: function () {
            this.mesh.traverse(c => { if (c.isMesh) { c.oldHex = c.material.color.getHex(); c.material.color.setHex(0xff0000); } });
            setTimeout(() => this.mesh.traverse(c => { if (c.isMesh && c.oldHex) c.material.color.setHex(c.oldHex); }), 100);
        }
    };

    // LINK MESH TO ENEMY OBJECT FOR HIT DETECTION
    mesh.userData = { type: 'enemy', entity: enemy };
    // Also tag children so we don't have to traverse too far if not needed (though parent traversal is fine)
    mesh.traverse((child) => {
        child.userData.parentEnemy = enemy;
    });

    state.enemies.push(enemy);
}

export function killEnemy(e) {
    const idx = state.enemies.indexOf(e);
    if (idx > -1) {
        state.enemies.splice(idx, 1);
        state.scene.remove(e.mesh);
        state.player.money += 300;
        updateHUD();
        playSound('buy'); // Reward sound

        const kf = document.getElementById('killfeed');
        const div = document.createElement('div');
        div.innerText = "Enemy Down +$300";
        kf.appendChild(div);
        setTimeout(() => div.remove(), 3000);

        // Respawn logic - ONLY IN SINGLE PLAYER / AI CT
        if (state.gameMode === 'single' || state.gameMode === 'ai_ct') {
            const dropWeapon = DROPPABLE_WEAPONS[Math.floor(Math.random() * DROPPABLE_WEAPONS.length)];
            spawnWeaponDrop(dropWeapon, e.mesh.position.clone());
            setTimeout(() => {
                const spawnX = Math.random() * 600 - 300;
                const spawnZ = Math.random() * 600 - 300;
                spawnEnemy(spawnX, 0, spawnZ);
            }, 3000);
        }
    }
}

export function clearEnemies() {
    // Remove all existing enemies
    state.enemies.forEach(e => state.scene.remove(e.mesh));
    state.enemies = [];
    if (state.weaponDrops.length) {
        state.weaponDrops.forEach(drop => {
            if (drop.mesh?.parent) state.scene.remove(drop.mesh);
        });
        state.weaponDrops = [];
    }
}

export function updateWeaponDrops(delta) {
    if (!state.weaponDrops.length || !state.controls) return;
    const playerObj = state.controls.getObject();
    if (!playerObj) return;
    const playerPos = playerObj.position;
    const time = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

    state.weaponDrops = state.weaponDrops.filter(drop => {
        if (!drop.mesh.parent) return false;
        drop.mesh.rotation.z += delta * drop.spin;
        drop.mesh.position.y = drop.baseY + Math.sin(time * 2 + drop.bobOffset) * 1.2;
        if (playerPos.distanceTo(drop.mesh.position) < 10) {
            grantWeaponToPlayer(drop.weapon);
            state.scene.remove(drop.mesh);
            return false;
        }
        return true;
    });
}

export function spawnWeaponDrop(weaponName, position) {
    const weapon = WEAPONS[weaponName];
    if (!weapon) return;
    const color = DROP_COLORS[weapon.type] || 0xffffff;
    const geo = new THREE.TorusGeometry(3, 0.8, 12, 24);
    const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.25,
        metalness: 0.5,
        roughness: 0.2
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.position.y += 6;
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    state.scene.add(mesh);

    state.weaponDrops.push({
        weapon: weaponName,
        mesh,
        baseY: mesh.position.y,
        spin: 2 + Math.random(),
        bobOffset: Math.random() * Math.PI * 2
    });
}

function grantWeaponToPlayer(weaponName) {
    const weapon = WEAPONS[weaponName];
    if (!weapon) return;

    if (weapon.clip !== undefined) state.player.ammo[weaponName] = weapon.clip;
    if (weapon.mag !== undefined) state.player.mags[weaponName] = weapon.mag;
    if (weapon.type === 'rifle' || weapon.type === 'sniper') {
        state.player.slots[0] = weaponName;
    } else if (weapon.type === 'pistol') {
        state.player.slots[1] = weaponName;
    } else if (weapon.type === 'melee') {
        state.player.slots[2] = weaponName;
    }
    updateHUD();
    playSound('buy');
}
