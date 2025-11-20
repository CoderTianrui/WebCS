import * as THREE from 'three';
import { state } from './state.js';

export function createTracer(s, e, c) {
    const g = new THREE.BufferGeometry().setFromPoints([s, e]);
    const m = new THREE.LineBasicMaterial({ color: c });
    const l = new THREE.Line(g, m);
    state.scene.add(l);
    setTimeout(() => state.scene.remove(l), 50);
}

export function createHole(p, n) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3,0.3), new THREE.MeshBasicMaterial({color:0x000}));
    m.position.copy(p).add(n.multiplyScalar(0.01));
    m.lookAt(p.clone().add(n));
    state.scene.add(m);
    setTimeout(()=>state.scene.remove(m), 5000);
}

export function createTexture(c1, c2, brick, box) {
    const c = document.createElement('canvas'); c.width=64; c.height=64;
    const ctx = c.getContext('2d');
    ctx.fillStyle=c1; ctx.fillRect(0,0,64,64); ctx.fillStyle=c2;
    if(brick) { ctx.fillRect(0,0,64,2); ctx.fillRect(0,0,2,64); ctx.fillRect(32,0,2,64); ctx.fillRect(0,32,64,2); }
    else if(box) { ctx.strokeRect(0,0,64,64); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(64,64); ctx.stroke(); ctx.moveTo(64,0); ctx.lineTo(0,64); ctx.stroke(); }
    else for(let i=0;i<50;i++) ctx.fillRect(Math.random()*64,Math.random()*64,2,2);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t;
}

export function spawnParticles(pos, color, count) {
    for(let i=0; i<count; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.2,0.2,0.2), new THREE.MeshBasicMaterial({color:color}));
        p.position.copy(pos);
        p.velocity = new THREE.Vector3((Math.random()-.5)*10, (Math.random()-.5)*10, (Math.random()-.5)*10);
        state.scene.add(p);
        state.particles.push({mesh:p, life:1.0});
    }
}

export function showHeadshot() {
    const el = document.getElementById('headshot-msg');
    el.style.opacity = 1;
    setTimeout(() => el.style.opacity = 0, 500);
}

