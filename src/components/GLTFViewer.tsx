'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface GLTFViewerProps {
  file: File | null;
  supportFiles?: FileList | null;
  className?: string;
  showNegativeFaces?: boolean;
}

export default function GLTFViewer({ file, supportFiles, className = '', showNegativeFaces = false }: GLTFViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const [isClient, setIsClient] = useState(false);
  const loadedModelRef = useRef<THREE.Group | null>(null);
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!mountRef.current || !isClient) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(5, 5, 5);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // Lighting - 非常に明るく設定
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = false;
    scene.add(directionalLight);

    // 全方向からライトを当てる
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight2.position.set(-10, -10, -5);
    scene.add(directionalLight2);

    const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight3.position.set(0, 10, -10);
    scene.add(directionalLight3);

    const directionalLight4 = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight4.position.set(5, -10, 10);
    scene.add(directionalLight4);

    const directionalLight5 = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight5.position.set(-5, 5, -10);
    scene.add(directionalLight5);

    // Grid
    const gridHelper = new THREE.GridHelper(10, 10);
    scene.add(gridHelper);

    mountRef.current.appendChild(renderer.domElement);

    // Controls
    const initControls = async () => {
      try {
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        const controls = new OrbitControls(camera, renderer.domElement);
        
        // 基本設定
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enableZoom = true;
        controls.enablePan = true;
        controls.enableRotate = true;
        
        // ズーム設定
        controls.minDistance = 0.5;
        controls.maxDistance = 100;
        controls.zoomSpeed = 1.0;
        
        // 回転設定
        controls.rotateSpeed = 1.0;
        controls.autoRotate = false;
        
        // パン設定
        controls.panSpeed = 0.8;
        controls.screenSpacePanning = false;
        
        // 垂直回転の制限
        controls.maxPolarAngle = Math.PI;
        controls.minPolarAngle = 0;
        
        // マウスボタンの設定を明示的に
        controls.mouseButtons = {
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN
        };
        
        // タッチ設定
        controls.touches = {
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN
        };
        
        // イベントの有効化
        controls.addEventListener('change', () => {
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
        });
        
        controlsRef.current = controls;
      } catch (error) {
        console.error('Failed to initialize controls:', error);
      }
    };

    initControls();

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    
    // Start animation after controls are ready
    setTimeout(() => {
      animate();
    }, 100);

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current || !camera || !renderer) return;
      
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      
      renderer.dispose();
    };
  }, [isClient]);

  useEffect(() => {
    if (!file || !sceneRef.current || !isClient) return;

    const loadGLTF = async () => {
      try {
        console.log('Loading GLTF file:', file.name);

        // サポートファイル（bin、画像など）をマップ化
        const fileMap = new Map<string, string>();
        if (supportFiles) {
          for (let i = 0; i < supportFiles.length; i++) {
            const supportFile = supportFiles[i];
            const url = URL.createObjectURL(supportFile);
            fileMap.set(supportFile.name, url);
            console.log('Support file:', supportFile.name, url);
          }
        }

        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');

        const loader = new GLTFLoader();

        // DRACOLoaderの設定
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        loader.setDRACOLoader(dracoLoader);

        // LoadingManagerを使用して外部ファイルの読み込みを解決
        const manager = new THREE.LoadingManager();
        manager.setURLModifier((url) => {
          const filename = url.split('/').pop() || url;
          if (fileMap.has(filename)) {
            console.log('URL modifier: replacing', url, 'with', fileMap.get(filename));
            return fileMap.get(filename)!;
          }
          return url;
        });
        loader.manager = manager;

        const arrayBuffer = await file.arrayBuffer();

        // Clear existing models
        const objectsToRemove: THREE.Object3D[] = [];
        sceneRef.current!.traverse((child) => {
          if (child.type === 'Group' && child !== sceneRef.current) {
            objectsToRemove.push(child);
          }
        });
        objectsToRemove.forEach((obj) => {
          sceneRef.current!.remove(obj);
        });

        loader.parse(arrayBuffer, '', (gltf) => {
          console.log('GLTF parsed successfully:', gltf);
          const model = gltf.scene;
          
          if (!model || model.children.length === 0) {
            console.warn('GLTF model is empty or has no children');
            return;
          }
          
          // Center and scale the model
          const box = new THREE.Box3().setFromObject(model);
          
          if (box.isEmpty()) {
            console.warn('Model bounding box is empty');
            // Create a fallback cube if model has no geometry
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
            const fallbackMesh = new THREE.Mesh(geometry, material);
            sceneRef.current!.add(fallbackMesh);
            return;
          }
          
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          
          if (maxDim === 0) {
            console.warn('Model has zero dimensions');
            return;
          }
          
          const scale = 3 / maxDim; // Scale to fit in a 3x3x3 box
          
          model.scale.setScalar(scale);
          model.position.sub(center.multiplyScalar(scale));
          
          // Enable shadows
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          
          sceneRef.current!.add(model);
          loadedModelRef.current = model;
          console.log('Model added to scene');
          
          // 元のマテリアルを保存
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              originalMaterialsRef.current.set(child, child.material);
            }
          });

          // Adjust camera to view the model
          if (cameraRef.current && controlsRef.current) {
            const distance = Math.max(maxDim * 1.5, 5);
            cameraRef.current.position.set(distance, distance * 0.8, distance);
            controlsRef.current.target.set(0, 0, 0);
            controlsRef.current.update();
            
            // Force a render
            if (rendererRef.current && sceneRef.current) {
              rendererRef.current.render(sceneRef.current, cameraRef.current);
            }
          }

          // Handle animations
          if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach((clip) => {
              mixer.clipAction(clip).play();
            });

            // Update mixer in animation loop
            const clock = new THREE.Clock();
            const originalAnimate = animationIdRef.current;
            
            const animateWithMixer = () => {
              animationIdRef.current = requestAnimationFrame(animateWithMixer);
              
              const delta = clock.getDelta();
              mixer.update(delta);
              
              if (controlsRef.current) {
                controlsRef.current.update();
              }
              
              if (rendererRef.current && sceneRef.current && cameraRef.current) {
                rendererRef.current.render(sceneRef.current, cameraRef.current);
              }
            };
            
            if (originalAnimate) {
              cancelAnimationFrame(originalAnimate);
            }
            animateWithMixer();
          }
        }, (error) => {
          console.error('Error loading GLTF:', error);
          
          // Create a fallback object to indicate loading failure
          const geometry = new THREE.BoxGeometry(1, 1, 1);
          const material = new THREE.MeshStandardMaterial({ 
            color: 0xff0000, 
            transparent: true, 
            opacity: 0.5 
          });
          const errorMesh = new THREE.Mesh(geometry, material);
          errorMesh.position.set(0, 0, 0);
          
          if (sceneRef.current) {
            sceneRef.current.add(errorMesh);
            
            // Force a render
            if (rendererRef.current && cameraRef.current) {
              rendererRef.current.render(sceneRef.current, cameraRef.current);
            }
          }
        });
      } catch (error) {
        console.error('Error processing file:', error);
      }
    };

    loadGLTF();
  }, [file, supportFiles, isClient]);


  // Create face orientation shader material (Blender-style)
  const createFaceOrientationMaterial = useCallback(() => {
    const vertexShader = `
      varying vec3 vNormalView;
      
      void main() {
        // 法線をビュー座標系に変換（vertex shaderで行う）
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    
    const fragmentShader = `
      varying vec3 vNormalView;
      
      void main() {
        // 法線は既にビュー座標系に変換済み
        vec3 normal = normalize(vNormalView);
        
        // カメラ方向（ビュー空間では常に (0,0,1)）
        vec3 viewDir = vec3(0.0, 0.0, 1.0);
        
        // 内積が負なら裏向き
        float facing = dot(normal, viewDir);
        
        if (facing > 0.0) {
          gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0); // 表 = 青
        } else {
          gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // 裏 = 赤
        }
      }
    `;
    
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide, // 両面を表示
    });
  }, []);

  // Apply face orientation shader to all meshes
  const detectNegativeFaces = useCallback((object: THREE.Object3D): THREE.Mesh[] => {
    const allMeshes: THREE.Mesh[] = [];
    
    console.log('=== APPLYING BLENDER-STYLE FACE ORIENTATION SHADER ===');
    
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        allMeshes.push(child);
        const meshName = child.name || 'Unnamed';
        console.log(`Found mesh: "${meshName}"`);
      }
    });
    
    console.log(`=== Found ${allMeshes.length} meshes for face orientation ===`);
    return allMeshes; // Return all meshes to apply shader
  }, []);

  // チェックボックスの状態に応じてface orientationシェーダーを適用
  useEffect(() => {
    console.log(`=== useEffect triggered: showNegativeFaces=${showNegativeFaces} ===`);
    
    if (!loadedModelRef.current) {
      console.log('No loaded model, returning');
      return;
    }

    const allMeshes = detectNegativeFaces(loadedModelRef.current);
    console.log(`Found ${allMeshes.length} meshes for face orientation`);
    
    let processedMeshes = 0;
    loadedModelRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        processedMeshes++;
        console.log(`Processing mesh ${processedMeshes}: "${child.name || 'Unnamed'}"`);
        
        if (showNegativeFaces) {
          // face orientationシェーダーを適用
          if (!originalMaterialsRef.current.has(child)) {
            console.log(`Saving original material for mesh: ${child.name || 'Unnamed'}`);
            originalMaterialsRef.current.set(child, child.material);
          }
          
          const faceOrientationMaterial = createFaceOrientationMaterial();
          child.material = faceOrientationMaterial;
          console.log(`✓ Applied face orientation shader to mesh: ${child.name || 'Unnamed'}`);
        } else {
          // 元のマテリアルに戻す
          const originalMaterial = originalMaterialsRef.current.get(child);
          if (originalMaterial) {
            child.material = originalMaterial;
            console.log(`✓ Restored original material for mesh: ${child.name || 'Unnamed'}`);
          }
        }
      }
    });
    
    console.log(`Processed ${processedMeshes} total meshes`);

    // 再レンダリング
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      console.log('✓ Scene re-rendered');
    }
  }, [showNegativeFaces, detectNegativeFaces, createFaceOrientationMaterial]);

  return (
    <div className={`relative bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-200 ${className}`}>
      <div 
        ref={mountRef} 
        className="w-full h-full"
      />
      {!file && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <svg
              className="mx-auto h-16 w-16 text-gray-400 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <p className="text-lg font-medium">3D Viewer</p>
            <p className="text-sm text-gray-400 mt-2">Upload GLTF file to display 3D model</p>
            <p className="text-xs text-gray-400 mt-1">Mouse controls for rotation, zoom, and panning</p>
          </div>
        </div>
      )}
    </div>
  );
}