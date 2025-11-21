import * as THREE from 'three';

class RendererManager {
    constructor() {
        if (RendererManager.instance) {
            return RendererManager.instance;
        }

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        this.disposables = []; // { object, removeTime }

        window.addEventListener('resize', () => {
            if (this.renderer) {
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            }
        });

        RendererManager.instance = this;
    }

    getRenderer() {
        return this.renderer;
    }

    registerDisposable(object, delayMs) {
        const removeTime = performance.now() + delayMs;
        this.disposables.push({ object, removeTime });
    }

    cancelDisposable(object) {
        this.disposables = this.disposables.filter(item => item.object !== object);
    }

    update() {
        const now = performance.now();
        for (let i = this.disposables.length - 1; i >= 0; i--) {
            const item = this.disposables[i];
            if (now >= item.removeTime) {
                if (item.object.parent) {
                    item.object.parent.remove(item.object);
                }
                // Traverse and dispose geometries/materials
                item.object.traverse(child => {
                    if (child.geometry && child.geometry.dispose) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose && m.dispose());
                        } else if (child.material.dispose) {
                            child.material.dispose();
                        }
                    }
                });
                this.disposables.splice(i, 1);
            }
        }
    }
}

const rendererInstance = new RendererManager();
export default rendererInstance;

