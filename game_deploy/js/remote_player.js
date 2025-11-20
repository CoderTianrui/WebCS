import * as THREE from 'three';
import { state } from './state.js';
import { spawnParticles } from './utils.js';
import { playSound } from './audio.js';

// Simple class to render other players
export class RemotePlayer {
    constructor(id, name, startData) {
        this.id = id;
        this.name = name;
        this.mesh = new THREE.Group();
        this.isDead = false;
        
        // Body (Split into Torso and Legs for better visual grounding)
        const bodyMat = new THREE.MeshLambertMaterial({color: 0x0000ff}); 
        
        // Legs
        const legs = new THREE.Mesh(new THREE.BoxGeometry(3.5, 5, 2), new THREE.MeshLambertMaterial({color: 0x0000aa}));
        legs.position.y = 2.5;
        this.mesh.add(legs);

        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(3.5, 5, 2), bodyMat);
        torso.position.y = 7.5;
        this.mesh.add(torso);

        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(2,2,2), new THREE.MeshLambertMaterial({color:0xd2b48c}));
        head.position.y = 11;
        this.mesh.add(head);
        
        // Name Tag
        this.nameTag = this.createNameTag(name);
        this.nameTag.position.y = 14;
        this.mesh.add(this.nameTag);

        // Position
        // FIX: StartData.y is camera height (10), so feet should be at y-10.
        this.mesh.position.set(startData.x || 0, (startData.y || 0) - 10, startData.z || 0);
        
        state.scene.add(this.mesh);
        
        // Handle initial dead state
        if (startData.isDead || (startData.hp !== undefined && startData.hp <= 0)) {
            this.isDead = true;
            state.scene.remove(this.mesh);
        }
        
        // Interpolation buffer
        this.targetPos = this.mesh.position.clone();
        this.targetRot = 0;
    }

    createNameTag(text) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256; canvas.height = 64;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0,0,256,64);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 32);
        
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(10, 2.5, 1);
        return sprite;
    }

    update(delta) {
        if (this.isDead) return;
        // Simple Lerp for smoothness
        this.mesh.position.lerp(this.targetPos, 10 * delta);
        // Rotate body only on Y
        this.mesh.rotation.y = this.targetRot; 
    }

    setTarget(data) {
        // FIX: data.y is camera height, offset by -10 for feet
        this.targetPos.set(data.x, data.y - 10, data.z);
        this.targetRot = data.ry;
    }
    
    shoot(data) {
        if (this.isDead) return;
        // Visual flash or sound coming from this player
        playSound('enemy_fire'); 
    }
    
    die() {
        this.isDead = true;
        state.scene.remove(this.mesh);
    }
    
    respawn() {
        this.isDead = false;
        state.scene.add(this.mesh);
    }

    dispose() {
        state.scene.remove(this.mesh);
    }
}
