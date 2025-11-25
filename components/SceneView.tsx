import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { ModelMesh, GitHubFile } from '../types';

// More pinkish white (Pastel Pink)
const MODEL_COLOR = '#ffe4e9';

interface SceneViewProps {
  files: GitHubFile[];
  onModelSelect: (model: ModelMesh | null) => void;
  onProgress: (loaded: number, total: number) => void;
  onHover: (data: { name: string; x: number; y: number } | null) => void;
  panelSize: number;
  selectedModel: ModelMesh | null;
  searchTerm: string; // New Prop
}

// Helper to create a soft radial gradient texture for the glow
const createGlowTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256);
    
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 512);
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
};

// Create fuzzy regex from string (e.g. "apl" -> /a.*p.*l/i)
const createFuzzyRegex = (str: string) => {
    if (!str) return null;
    const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = escaped.split('').join('.*');
    return new RegExp(pattern, 'i');
};

export const SceneView: React.FC<SceneViewProps> = ({ 
    files, 
    onModelSelect, 
    onProgress, 
    onHover, 
    panelSize,
    selectedModel,
    searchTerm
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3()));
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  
  const loadedModelsRef = useRef<ModelMesh[]>([]);
  const boundingSpheresRef = useRef<{ sphere: THREE.Sphere, model: ModelMesh }[]>([]);
  
  // Interaction state refs
  const isZoomedRef = useRef(false);
  const zoomedModelRef = useRef<ModelMesh | null>(null);
  const hoveredModelRef = useRef<ModelMesh | null>(null);
  const previousCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const animationFrameRef = useRef<number>(0);
  
  // Glow Effect Refs
  const glowSpriteRef = useRef<THREE.Sprite | null>(null);
  const glowOpacityRef = useRef(0);
  const glowScaleRef = useRef(0);

  // Camera Orbit State
  const orbitRef = useRef({ theta: 0, phi: Math.PI / 2 });
  const panShiftRef = useRef({ x: 0, y: 0 });
  
  // Mouse Interaction Refs
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const isMouseDownRef = useRef(false);

  // Touch Interaction Refs
  const touchStartRef = useRef({ x: 0, y: 0 });

  // Scroll/Grid refs
  const scrollOffsetRef = useRef(0);
  const visibleRowsRef = useRef(0); // Track visible rows for scrolling limit

  const zoomOutRef = useRef<() => void>(() => {});
  
  // Configuration
  const MODEL_SIZE = 350;
  const SPACING = 650;
  
  // Dynamic Configuration Refs
  const homeZRef = useRef(1200);
  const gridYOffsetRef = useRef(200);
  const gridColsRef = useRef(4);

  const panelSizeRef = useRef(panelSize);
  useEffect(() => {
    panelSizeRef.current = panelSize;
  }, [panelSize]);

  // Keep track of search term in ref for immediate access in layout/load functions
  const searchTermRef = useRef(searchTerm);
  useEffect(() => {
    searchTermRef.current = searchTerm;
  }, [searchTerm]);

  const getGridConfig = (width: number) => {
      if (width > 1200) return 6;
      if (width > 768) return 4;
      return 2;
  };

  const updateZoomTargets = (w: number, h: number) => {
    const sidebarWidth = panelSizeRef.current;
    const camDist = 1200;
    const vFOV = THREE.MathUtils.degToRad(60);
    const visibleHeight = 2 * Math.tan(vFOV / 2) * camDist;
    
    let shiftX = 0;
    let shiftY = 0;
    
    if (w > 768) {
       const visibleWidth = visibleHeight * (w / h);
       const unitsPerPixel = visibleWidth / w;
       shiftX = (sidebarWidth / 2) * unitsPerPixel; 
    } else {
       const unitsPerPixel = visibleHeight / h;
       const pixelShift = sidebarWidth * 0.5;
       shiftY = -pixelShift * unitsPerPixel; 
    }

    panShiftRef.current = { x: shiftX, y: shiftY };
  };

  // Main Layout Function: Handles Grid Positioning based on Filter
  const performLayout = () => {
    const cols = gridColsRef.current;
    const gridYOffset = gridYOffsetRef.current;
    
    // Sort models by their original index to keep consistent order even if they load async
    loadedModelsRef.current.sort((a, b) => a.userData.index - b.userData.index);

    const regex = createFuzzyRegex(searchTermRef.current);
    let visibleIndex = 0;

    loadedModelsRef.current.forEach(mesh => {
        const name = mesh.userData.fileName;
        const isMatch = !searchTermRef.current || (regex ? regex.test(name) : true);

        mesh.userData.matchesSearch = isMatch;

        if (isMatch) {
            const row = Math.floor(visibleIndex / cols);
            const col = visibleIndex % cols;
            
            const gridWidth = (cols - 1) * SPACING;
            const startX = -gridWidth / 2;
            
            const posX = startX + col * SPACING;
            const posY = gridYOffset - (row * SPACING);
            const posZ = 0;

            mesh.userData.originalPosition = { x: posX, y: posY, z: posZ };
            mesh.position.set(posX, posY, posZ);

            // Update bounding sphere position
            const hit = boundingSpheresRef.current.find(b => b.model === mesh);
            if (hit) {
                hit.sphere.center.copy(mesh.position);
            }

            // Immediately make visible if currently hidden (but let animate loop handle opacity fade if desired)
            // We force it here to prevent 'pop-in' delay
            mesh.visible = true;
            
            visibleIndex++;
        } else {
            mesh.visible = false;
        }
    });

    // Update scroll limit based on filtered count
    visibleRowsRef.current = Math.ceil(visibleIndex / cols);
  };

  // Trigger layout when search term changes
  useEffect(() => {
    if (!containerRef.current) return;
    performLayout();
  }, [searchTerm]);

  useEffect(() => {
    if (!containerRef.current || !files.length) return;

    // --- INIT THREE.JS ---
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 10000); 
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
        alpha: true, 
        antialias: true, 
        powerPreference: 'high-performance' 
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const currentCamPos = camera.position.clone();
    const targetCamPos = camera.position.clone();
    const currentLookAt = new THREE.Vector3(0, 0, 0);
    const targetLookAt = new THREE.Vector3(0, 0, 0);

    const updateViewParams = (w: number, h: number) => {
        const aspect = w / h;
        const cols = getGridConfig(w);
        gridColsRef.current = cols;

        const contentWidth = ((cols - 1) * SPACING) + MODEL_SIZE + 600; 
        const tanFOV = Math.tan(THREE.MathUtils.degToRad(30));
        const requiredZ = contentWidth / (2 * tanFOV * aspect);
        
        homeZRef.current = Math.max(requiredZ, 1200);

        const worldTop = homeZRef.current * tanFOV;
        const topOffset = w <= 768 ? 800 : 700; 
        gridYOffsetRef.current = worldTop - topOffset;

        if (!isZoomedRef.current) {
            camera.position.z = homeZRef.current;
            targetCamPos.z = homeZRef.current;
        }
    };

    updateViewParams(width, height);
    currentCamPos.z = homeZRef.current;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight.position.set(500, 1000, 750);
    scene.add(dirLight);

    const glowTexture = createGlowTexture();
    const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffe4e9,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const glowSprite = new THREE.Sprite(glowMaterial);
    glowSprite.renderOrder = -1;
    scene.add(glowSprite);
    glowSpriteRef.current = glowSprite;

    const loader = new STLLoader();
    let loadedCount = 0;

    const loadModel = (file: GitHubFile, index: number) => {
      loader.load(
        file.url,
        (geometry) => {
          const material = new THREE.MeshStandardMaterial({
            color: MODEL_COLOR,
            roughness: 0.5,
            metalness: 0.0,
          });

          const mesh = new THREE.Mesh(geometry, material) as unknown as ModelMesh;
          mesh.userData.fileName = file.name;
          mesh.userData.scadContent = file.scadContent;
          mesh.userData.index = index; 
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          // Init as matching search by default, performLayout will correct if needed
          mesh.userData.matchesSearch = true; 

          geometry.center();
          geometry.computeBoundingBox();
          const bbox = geometry.boundingBox!;
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = MODEL_SIZE / maxDim;
          mesh.scale.setScalar(scale);

          mesh.rotation.set(-Math.PI / 2, 0, Math.PI / 4);

          // Subtle Wireframe
          const edges = new THREE.EdgesGeometry(geometry);
          const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
              color: 0xd4b0b8, // Slightly darker dusty pink to match object
              transparent: true,
              opacity: 0.3
          }));
          mesh.add(line);
          
          const bSphere = new THREE.Sphere(mesh.position.clone(), MODEL_SIZE * 0.8);
          boundingSpheresRef.current.push({ sphere: bSphere, model: mesh });
          
          scene.add(mesh);
          loadedModelsRef.current.push(mesh);

          // Update grid layout with new model
          performLayout();

          loadedCount++;
          onProgress(loadedCount, files.length);
        },
        undefined,
        (err) => {
          console.warn(`Failed to load ${file.name}`, err);
          loadedCount++;
          onProgress(loadedCount, files.length);
        }
      );
    };

    files.forEach((file, i) => {
      setTimeout(() => loadModel(file, i), i * 100);
    });

    // --- INPUT HANDLING ---
    const handleMouseDown = (e: MouseEvent) => {
        isMouseDownRef.current = true;
        isDraggingRef.current = false;
        dragStartRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isMouseDownRef.current && isZoomedRef.current && zoomedModelRef.current) {
          const deltaX = e.clientX - dragStartRef.current.x;
          const deltaY = e.clientY - dragStartRef.current.y;

          if (!isDraggingRef.current && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) { 
              isDraggingRef.current = true;
              dragStartRef.current = { x: e.clientX, y: e.clientY };
          }

          if (isDraggingRef.current) {
              const sensitivity = 0.005;
              orbitRef.current.theta -= (e.clientX - dragStartRef.current.x) * sensitivity;
              orbitRef.current.phi -= (e.clientY - dragStartRef.current.y) * sensitivity;
              
              orbitRef.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbitRef.current.phi));

              dragStartRef.current = { x: e.clientX, y: e.clientY };
          }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
        const wasMouseDown = isMouseDownRef.current;
        isMouseDownRef.current = false;

        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        }
        
        if (!isDraggingRef.current && wasMouseDown) {
            handleSingleClick();
        }
        isDraggingRef.current = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 1) {
            isMouseDownRef.current = true;
            isDraggingRef.current = false;
            touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                mouseRef.current.x = ((e.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
                mouseRef.current.y = -((e.touches[0].clientY - rect.top) / rect.height) * 2 + 1;
            }
        }
    };

    const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length !== 1) return;
        if (e.cancelable) e.preventDefault();

        const clientX = e.touches[0].clientX;
        const clientY = e.touches[0].clientY;

        const deltaX = clientX - touchStartRef.current.x;
        const deltaY = clientY - touchStartRef.current.y;

        if (!isDraggingRef.current && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
            isDraggingRef.current = true;
        }

        if (isZoomedRef.current && zoomedModelRef.current) {
             const sensitivity = 0.005;
             orbitRef.current.theta -= deltaX * sensitivity;
             orbitRef.current.phi -= deltaY * sensitivity;
             orbitRef.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, orbitRef.current.phi));
        } else {
             const scrollSensitivity = 4.0; 
             const deltaScroll = -deltaY * scrollSensitivity;
             
             const contentHeight = visibleRowsRef.current * SPACING;
             const maxScroll = Math.max(0, contentHeight - gridYOffsetRef.current);
             
             scrollOffsetRef.current += deltaScroll;
             scrollOffsetRef.current = Math.max(0, Math.min(scrollOffsetRef.current, maxScroll));
        }
        
        touchStartRef.current = { x: clientX, y: clientY };
    };

    const handleTouchEnd = (e: TouchEvent) => {
        isMouseDownRef.current = false;
        
        if (!isDraggingRef.current) {
            handleSingleClick();
        }
        isDraggingRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isZoomedRef.current) return;

      const delta = e.deltaY * 0.8;
      const contentHeight = visibleRowsRef.current * SPACING;
      
      const maxScroll = Math.max(0, contentHeight - gridYOffsetRef.current);
      
      scrollOffsetRef.current += delta;
      scrollOffsetRef.current = Math.max(0, Math.min(scrollOffsetRef.current, maxScroll));
    };

    const handleSingleClick = () => {
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current!);
      const hit = boundingSpheresRef.current.find(item => 
        // Only allow clicking visible models that match search
        item.model.userData.matchesSearch &&
        raycasterRef.current.ray.intersectsSphere(item.sphere)
      );

      if (isZoomedRef.current) {
        zoomOut();
      } else {
        if (hit) {
          zoomIn(hit.model);
        }
      }
    };

    containerRef.current.addEventListener('mousedown', handleMouseDown);
    containerRef.current.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    containerRef.current.addEventListener('wheel', handleWheel, { passive: false });
    containerRef.current.addEventListener('touchstart', handleTouchStart, { passive: false });
    containerRef.current.addEventListener('touchmove', handleTouchMove, { passive: false });
    containerRef.current.addEventListener('touchend', handleTouchEnd);

    // --- LOGIC FUNCTIONS ---
    
    const zoomIn = (model: ModelMesh) => {
      isZoomedRef.current = true;
      zoomedModelRef.current = model;
      
      hoveredModelRef.current = null;
      onHover(null);
      glowOpacityRef.current = 0;
      glowScaleRef.current = 0;
      if (glowSpriteRef.current) {
          glowSpriteRef.current.visible = false;
      }

      if (cameraRef.current) {
          previousCamPosRef.current.copy(cameraRef.current.position);
      }
      
      orbitRef.current = { theta: Math.PI / 4, phi: Math.PI / 3 }; 

      loadedModelsRef.current.forEach((mesh) => {
        if (mesh !== model) {
            mesh.visible = false;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.opacity = 0;
            mat.transparent = true; 
        } else {
            mesh.visible = true;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.opacity = 1;
            mat.transparent = false;
        }
      });

      onModelSelect(model);

      const w = containerRef.current?.clientWidth || window.innerWidth;
      const h = containerRef.current?.clientHeight || window.innerHeight;
      
      updateZoomTargets(w, h);
    };

    const zoomOut = () => {
      isZoomedRef.current = false;
      zoomedModelRef.current = null;
      onModelSelect(null);
      
      targetCamPos.set(0, 0, homeZRef.current);
      targetLookAt.set(0, -scrollOffsetRef.current, 0);

      // Re-apply visibility based on search when zooming out
      performLayout();
    };

    zoomOutRef.current = zoomOut;

    // --- RENDER LOOP ---
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

      // 1. Raycasting & Hover Logic
      if (!isZoomedRef.current && !isDraggingRef.current) {
        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
        const hit = boundingSpheresRef.current.find(item => 
          item.model.userData.matchesSearch && // Only hover matches
          raycasterRef.current.ray.intersectsSphere(item.sphere)
        );
        
        if (hit) {
             hoveredModelRef.current = hit.model;
        } else {
             hoveredModelRef.current = null;
        }

        if (hit && containerRef.current) {
          const bottomPos = hit.model.position.clone();
          bottomPos.y -= (MODEL_SIZE * 0.55); 
          bottomPos.project(cameraRef.current);
          
          const w = containerRef.current.clientWidth;
          const h = containerRef.current.clientHeight;
          const x = (bottomPos.x * 0.5 + 0.5) * w;
          const y = (-(bottomPos.y * 0.5) + 0.5) * h;
          
          onHover({ name: hit.model.userData.fileName, x, y });
        } else {
          onHover(null);
        }
      } else {
         hoveredModelRef.current = null;
         onHover(null);
      }

      // 2. Glow Animation Logic
      let targetGlowOpacity = 0;
      let targetGlowScale = MODEL_SIZE * 1.5;
      let lerpSpeedOpacity = 0.005;
      let lerpSpeedScale = 0.005;

      if (hoveredModelRef.current && !isZoomedRef.current && !isDraggingRef.current) {
          targetGlowOpacity = 0.5;
          targetGlowScale = MODEL_SIZE * 3.0;
          
          const camPos = cameraRef.current.position;
          const modelPos = hoveredModelRef.current.position;
          const ray = modelPos.clone().sub(camPos).normalize();
          
          const offset = ray.multiplyScalar(MODEL_SIZE); 
          glowSpriteRef.current!.position.copy(modelPos).add(offset);

          lerpSpeedOpacity = 0.02;
          lerpSpeedScale = 0.02;
      } else {
          targetGlowScale = MODEL_SIZE * 1.5;
      }

      glowOpacityRef.current = THREE.MathUtils.lerp(glowOpacityRef.current, targetGlowOpacity, lerpSpeedOpacity);
      glowScaleRef.current = THREE.MathUtils.lerp(glowScaleRef.current, targetGlowScale, lerpSpeedScale);

      if (glowSpriteRef.current) {
          glowSpriteRef.current.material.opacity = glowOpacityRef.current;
          glowSpriteRef.current.scale.setScalar(glowScaleRef.current);
          glowSpriteRef.current.visible = glowOpacityRef.current > 0.01;
      }

      // 3. Camera Animation
      if (!isZoomedRef.current) {
        const targetY = -scrollOffsetRef.current;
        targetCamPos.y = targetY;
        targetLookAt.y = targetY;
        
        targetCamPos.x = 0;
        targetCamPos.z = homeZRef.current;
        targetLookAt.x = 0;
        targetLookAt.z = 0;
        
        currentCamPos.lerp(targetCamPos, 0.05);
        currentLookAt.lerp(targetLookAt, 0.05);
      } else if (zoomedModelRef.current) {
        const radius = 1200;
        const { theta, phi } = orbitRef.current;
        
        const ox = radius * Math.sin(phi) * Math.sin(theta);
        const oy = radius * Math.cos(phi);
        const oz = radius * Math.sin(phi) * Math.cos(theta);
        const orbitOffset = new THREE.Vector3(ox, oy, oz);

        const viewDir = orbitOffset.clone().normalize().negate();
        const upVec = new THREE.Vector3(0, 1, 0);
        const rightVec = new THREE.Vector3().crossVectors(viewDir, upVec).normalize();
        const screenUpVec = new THREE.Vector3().crossVectors(rightVec, viewDir).normalize();

        const panShift = rightVec.multiplyScalar(panShiftRef.current.x)
                         .add(screenUpVec.multiplyScalar(panShiftRef.current.y));

        const pivot = zoomedModelRef.current.position.clone();
        
        targetLookAt.copy(pivot).add(panShift);
        targetCamPos.copy(pivot).add(orbitOffset).add(panShift);

        currentCamPos.lerp(targetCamPos, 0.1); 
        currentLookAt.lerp(targetLookAt, 0.1);
      }

      cameraRef.current.position.copy(currentCamPos);
      cameraRef.current.lookAt(currentLookAt);

      // 4. Objects Animation
      loadedModelsRef.current.forEach((mesh) => {
        if (mesh === zoomedModelRef.current) {
            (mesh.material as THREE.MeshStandardMaterial).transparent = false;
            (mesh.material as THREE.MeshStandardMaterial).opacity = 1;
            mesh.visible = true;
        } else {
            // Respect search visibility
            if (!mesh.userData.matchesSearch) {
                mesh.visible = false;
                return;
            }

            mesh.rotation.z -= 0.001; 

            const targetOpacity = isZoomedRef.current ? 0 : 1;
            const currentOpacity = (mesh.material as THREE.MeshStandardMaterial).opacity;
            const nextOpacity = THREE.MathUtils.lerp(currentOpacity, targetOpacity, 0.05);
            
            const isFading = nextOpacity < 0.99;
            (mesh.material as THREE.MeshStandardMaterial).transparent = isFading;
            (mesh.material as THREE.MeshStandardMaterial).opacity = nextOpacity;
            mesh.visible = nextOpacity > 0.01;
        }
      });

      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);

      updateViewParams(w, h); 
      performLayout(); // Re-layout on resize to adjust to new gridCols
      
      if (isZoomedRef.current && zoomedModelRef.current) {
        updateZoomTargets(w, h);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      containerRef.current?.removeEventListener('mousedown', handleMouseDown);
      containerRef.current?.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      containerRef.current?.removeEventListener('wheel', handleWheel);
      containerRef.current?.removeEventListener('touchstart', handleTouchStart);
      containerRef.current?.removeEventListener('touchmove', handleTouchMove);
      containerRef.current?.removeEventListener('touchend', handleTouchEnd);
      
      cancelAnimationFrame(animationFrameRef.current!);
      rendererRef.current?.dispose();
      if (containerRef.current && rendererRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, [files]);
  
  useEffect(() => {
      if (isZoomedRef.current && containerRef.current) {
          updateZoomTargets(containerRef.current.clientWidth, containerRef.current.clientHeight);
      }
  }, [panelSize]);

  useEffect(() => {
    if (!selectedModel && isZoomedRef.current) {
        zoomOutRef.current();
    }
  }, [selectedModel]);

  useEffect(() => {
    if (!onModelSelect) {
        isZoomedRef.current = false;
        zoomedModelRef.current = null;
    }
  }, [onModelSelect]);

  return <div ref={containerRef} className="w-full h-full relative" />;
};