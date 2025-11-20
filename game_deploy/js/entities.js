import * as THREE from 'three';
import { state } from './state.js';
import { updateHUD } from './ui.js';
import { playSound } from './audio.js';

export function spawnEnemy(x, y, z) {
    const mesh = new THREE.Group();
    
    const legMat = new THREE.MeshLambertMaterial({color:0x222});
    const bodyMat = new THREE.MeshLambertMaterial({color:0x800000}); 
    const skinMat = new THREE.MeshLambertMaterial({color:0xd2b48c});

    // Hitbox approx: 3w x 10h x 3d
    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(1,4,1), legMat); lLeg.position.set(-1,2,0);
    const rLeg = new THREE.Mesh(new THREE.BoxGeometry(1,4,1), legMat); rLeg.position.set(1,2,0);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(3.5,4,2), bodyMat); torso.position.set(0,6,0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(2,2,2), skinMat); head.position.set(0,9,0);
    
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1,3,1), skinMat); arm.position.set(2,6,1); arm.rotation.x = -1.5;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,3), new THREE.MeshBasicMaterial({color:0x000})); gun.position.set(2,6,3);

    mesh.add(lLeg, rLeg, torso, head, arm, gun);
    mesh.position.set(x, y, z); 
    state.scene.add(mesh);

    const enemy = {
        mesh: mesh, lLeg: lLeg, rLeg: rLeg,
        hp: 100,
        velocity: new THREE.Vector3(0,0,0),
        lastShot: 0,
        state: 'chase', // chase, strafe
        strafeDir: 1,
        changeStateTime: 0,
        
        flash: function() {
            this.mesh.traverse(c => { if(c.isMesh) { c.oldHex = c.material.color.getHex(); c.material.color.setHex(0xff0000); }});
            setTimeout(() => this.mesh.traverse(c => { if(c.isMesh && c.oldHex) c.material.color.setHex(c.oldHex); }), 100);
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
        setTimeout(()=>div.remove(),3000);
        
        // Respawn logic - ONLY IN SINGLE PLAYER
        if(state.gameMode === 'single') {
            setTimeout(() => spawnEnemy(Math.random()*100-50, 0, -150 + Math.random()*50), 3000);
        }
    }
}

export function clearEnemies() {
    // Remove all existing enemies
    state.enemies.forEach(e => state.scene.remove(e.mesh));
    state.enemies = [];
}
