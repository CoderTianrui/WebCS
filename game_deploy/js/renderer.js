import * as THREE from 'three';

class RendererManager {
    constructor() {
        if (RendererManager.instance) {
            return RendererManager.instance;
        }
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);
        
        window.addEventListener('resize', () => {
            if (this.renderer) {
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                // We might need to update camera aspect ratio elsewhere or handle it here if we had access to camera
            }
        });
        
        RendererManager.instance = this;
    }

    getRenderer() {
        return this.renderer;
    }
}

const rendererInstance = new RendererManager();
export default rendererInstance;

