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
  panelSize: number; // Dynamic size of the sidebar/bottom-sheet
  selectedModel: ModelMesh | null; // Pass selected model to sync state (e.g. when closed via UI)
}

// Helper to create a soft radial gradient texture for the glow
const createGlowTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; // Higher resolution for smoother gradient
    canvas.height = 512;
    const context = canvas.getContext('2d')!;
    // Radial gradient: White center -> Transparent edge
    const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256);
    
    // Very smooth, soft falloff
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.4)'); // Midpoint for "core" glow
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 512);
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
};

export const SceneView: React.FC<SceneViewProps> = ({ 
    files, 
    onModelSelect, 
    onProgress, 
    onHover, 
    panelSize,
    selectedModel
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  // Initializing with a vector to satisfy potential strict type requirements
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3()));
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  
  const loadedModelsRef = useRef<ModelMesh[]>([]);
  const boundingSpheresRef = useRef<{ sphere: THREE.Sphere, model: ModelMesh }[]>([]);
  
  // Interaction state refs
  const isZoomedRef = useRef(false);
  const zoomedModelRef = useRef<ModelMesh | null>(null);
  const hoveredModelRef = useRef<ModelMesh | null>(null); // Track currently hovered model
  const previousCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const animationFrameRef = useRef<number>();
  
  // Glow Effect Refs
  const glowSpriteRef = useRef<THREE.Sprite | null>(null);
  const glowOpacityRef = useRef(0);
  const glowScaleRef = useRef(0);

  // Camera Orbit State
  const orbitRef = useRef({ theta: 0, phi: Math.PI / 2 }); // Spherical coordinates
  const panShiftRef = useRef({ x: 0, y: 0 }); // Screen space offsets in world units
  
  // Mouse Interaction Refs for Click vs Drag
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const isMouseDownRef = useRef(false);

  // Scroll/Grid refs
  const scrollOffsetRef = useRef(0);

  // Expose zoomOut to external effects
  const zoomOutRef = useRef<() => void>(() => {});
  
  // Configuration
  const MODEL_SIZE = 350; // Even bigger objects
  const SPACING = 650;    // Adjusted spacing
  
  // Dynamic Configuration Refs
  const homeZRef = useRef(1200);
  const gridYOffsetRef = useRef(200);
  const gridColsRef = useRef(4);

  // Track panelSize in a ref so it can be accessed in closures without dependencies
  const panelSizeRef = useRef(panelSize);
  useEffect(() => {
    panelSizeRef.current = panelSize;
  }, [panelSize]);

  // Responsive Helpers
  const getGridConfig = (width: number) => {
      if (width > 1200) return 6; // Large Desktop
      if (width > 768) return 4;  // Tablet / Small Desktop
      return 2;                   // Mobile
  };

  // Calculates visual offsets for zoomed model based on screen size
  // Moved out of useEffect so it can be shared
  const updateZoomTargets = (w: number, h: number) => {
    const sidebarWidth = panelSizeRef.current; // Use ref
    const camDist = 1200;
    const vFOV = THREE.MathUtils.degToRad(60);
    const visibleHeight = 2 * Math.tan(vFOV / 2) * camDist;
    
    let shiftX = 0;
    let shiftY = 0;
    
    if (w > 768) {
       // Desktop: Shift object left (Camera pans Right)
       const visibleWidth = visibleHeight * (w / h);
       const unitsPerPixel = visibleWidth / w;
       // We want to center in the remaining space: (W - Sidebar)
       shiftX = (sidebarWidth / 2) * unitsPerPixel; 
    } else {
       // Mobile: Shift object up (Camera pans Down)
       const unitsPerPixel = visibleHeight / h;
       // Panel takes up panelSize pixels from bottom. Center in remaining top space.
       const pixelShift = sidebarWidth * 0.5; // Shift center up by half the panel height
       shiftY = -pixelShift * unitsPerPixel; 
    }

    panShiftRef.current = { x: shiftX, y: shiftY };
  };

  useEffect(() => {
    if (!containerRef.current || !files.length) return;

    // --- INIT THREE.JS ---
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    // No Fog, transparent background
    sceneRef.current = scene;

    // Camera: Perspective
    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 10000); 
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
        alpha: true, 
        antialias: true, 
        powerPreference: 'high-performance' 
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Disable Shadows and ToneMapping for flat, exact color rendering
    renderer.shadowMap.enabled = false;
    // Updated for Three.js r152+ where outputEncoding is replaced by outputColorSpace
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping; // Important for exact hex color match
    
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- ANIMATION HELPERS (Declared early for usage in init) ---
    const currentCamPos = camera.position.clone();
    const targetCamPos = camera.position.clone();
    const currentLookAt = new THREE.Vector3(0, 0, 0);
    const targetLookAt = new THREE.Vector3(0, 0, 0);

    // --- VIEWPORT CALCULATION ---
    const updateViewParams = (w: number, h: number) => {
        const aspect = w / h;
        const cols = getGridConfig(w);
        gridColsRef.current = cols;

        // Calculate Visible Width Requirement
        const contentWidth = ((cols - 1) * SPACING) + MODEL_SIZE + 600; 

        // Z = width / (2 * tan(FOV/2) * aspect)
        const tanFOV = Math.tan(THREE.MathUtils.degToRad(30)); // 60 deg vertical fov
        const requiredZ = contentWidth / (2 * tanFOV * aspect);
        
        // Clamp minimum Z
        homeZRef.current = Math.max(requiredZ, 1200);

        // Calculate Y Offset to keep first row near top
        const worldTop = homeZRef.current * tanFOV;
        // Increased offset for desktop to push grid down further
        const topOffset = w <= 768 ? 800 : 700; 
        gridYOffsetRef.current = worldTop - topOffset;

        // Apply immediately if not animating/zoomed
        if (!isZoomedRef.current) {
            camera.position.z = homeZRef.current;
            targetCamPos.z = homeZRef.current;
        }
    };

    // Initial View Setup
    updateViewParams(width, height);
    currentCamPos.z = homeZRef.current; // Force initial pos

    // --- LIGHTING ---
    // High Ambient Light to preserve pastel color and prevent darkening
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    // Subtle Directional Light for depth/faces
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight.position.set(500, 1000, 750);
    scene.add(dirLight);

    // --- GLOW SPRITE SETUP ---
    const glowTexture = createGlowTexture();
    const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffe4e9, // Same pink as model
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false, // Don't occlude other objects
    });
    const glowSprite = new THREE.Sprite(glowMaterial);
    glowSprite.renderOrder = -1; // Render first (behind transparent objects if sorted correctly)
    scene.add(glowSprite);
    glowSpriteRef.current = glowSprite;

    // --- LOADER ---
    const loader = new STLLoader();
    let loadedCount = 0;

    const loadModel = (file: GitHubFile, index: number) => {
      loader.load(
        file.url,
        (geometry) => {
          // Use MeshStandardMaterial for lighting/shading support
          const material = new THREE.MeshStandardMaterial({
            color: MODEL_COLOR,
            roughness: 0.5,
            metalness: 0.0, // Remove metalness to avoid grey darkening
          });

          // Cast to unknown first to avoid type overlap error with incompatible userData
          const mesh = new THREE.Mesh(geometry, material) as unknown as ModelMesh;
          mesh.userData.fileName = file.name;
          mesh.userData.scadContent = file.scadContent;
          mesh.userData.index = index; 
          mesh.castShadow = false;
          mesh.receiveShadow = false;

          geometry.center();
          geometry.computeBoundingBox();
          const bbox = geometry.boundingBox!;
          const size = new THREE.Vector3();
          bbox.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = MODEL_SIZE / maxDim;
          mesh.scale.setScalar(scale);

          // Grid Position Calculation
          const cols = gridColsRef.current;
          const row = Math.floor(index / cols);
          const col = index % cols;
          
          const gridWidth = (cols - 1) * SPACING;
          const startX = -gridWidth / 2;
          
          const posX = startX + col * SPACING;
          const posY = gridYOffsetRef.current - (row * SPACING);
          const posZ = 0;

          mesh.position.set(posX, posY, posZ);
          mesh.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
          
          mesh.userData.originalPosition = { x: posX, y: posY, z: posZ };

          const bSphere = new THREE.Sphere(mesh.position.clone(), MODEL_SIZE * 0.8);
          boundingSpheresRef.current.push({ sphere: bSphere, model: mesh });
          
          scene.add(mesh);
          loadedModelsRef.current.push(mesh);

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
        
        // Only trigger click if:
        // 1. It wasn't a drag operation
        // 2. The interaction started inside the scene (wasMouseDown)
        //    (This prevents clicks on UI resizing handles from zooming out the scene)
        if (!isDraggingRef.current && wasMouseDown) {
            handleSingleClick();
        }
        isDraggingRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isZoomedRef.current) return;

      const delta = e.deltaY * 0.8;
      const cols = gridColsRef.current;
      const totalRows = Math.ceil(files.length / cols);
      const contentHeight = totalRows * SPACING;
      
      const maxScroll = Math.max(0, contentHeight - gridYOffsetRef.current);
      
      scrollOffsetRef.current += delta;
      scrollOffsetRef.current = Math.max(0, Math.min(scrollOffsetRef.current, maxScroll));
    };

    const handleSingleClick = () => {
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current!);
      const hit = boundingSpheresRef.current.find(item => 
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

    // --- LOGIC FUNCTIONS ---
    
    // Zoom functions
    const zoomIn = (model: ModelMesh) => {
      isZoomedRef.current = true;
      zoomedModelRef.current = model;
      
      // Immediately clear hover state
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

      // Immediately hide all other models so they don't clip/clutter the view during zoom
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
    };

    // Expose zoomOut to external refs
    zoomOutRef.current = zoomOut;

    const repositionModels = () => {
        const cols = gridColsRef.current;
        const gridWidth = (cols - 1) * SPACING;
        const startX = -gridWidth / 2;
        const startY = gridYOffsetRef.current;

        loadedModelsRef.current.forEach(mesh => {
            const index = mesh.userData.index;
            const row = Math.floor(index / cols);
            const col = index % cols;

            const posX = startX + col * SPACING;
            const posY = startY - (row * SPACING);
            const posZ = 0;

            mesh.userData.originalPosition = { x: posX, y: posY, z: posZ };
            
            mesh.position.set(posX, posY, posZ);
            const hit = boundingSpheresRef.current.find(b => b.model === mesh);
            if (hit) {
                hit.sphere.center.copy(mesh.position);
            }
        });
    };

    // --- RENDER LOOP ---
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

      // 1. Raycasting & Hover Logic
      if (!isZoomedRef.current && !isDraggingRef.current) {
        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
        const hit = boundingSpheresRef.current.find(item => 
          raycasterRef.current.ray.intersectsSphere(item.sphere)
        );
        
        // Update hovered model reference for tooltip
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
      let lerpSpeedOpacity = 0.005; // Default decay speed (much slower)
      let lerpSpeedScale = 0.005;

      if (hoveredModelRef.current && !isZoomedRef.current && !isDraggingRef.current) {
          targetGlowOpacity = 0.5; // Visible but not blinding
          targetGlowScale = MODEL_SIZE * 3.0; // Grow large around object
          
          // Position glow at model center, but pushed away from camera along the viewing ray
          // This ensures no parallax error (glow stays visually centered behind object)
          const camPos = cameraRef.current.position;
          const modelPos = hoveredModelRef.current.position;
          const ray = modelPos.clone().sub(camPos).normalize();
          
          // Push sprite behind model by a fixed distance (enough to clear the geometry)
          const offset = ray.multiplyScalar(MODEL_SIZE); 
          glowSpriteRef.current!.position.copy(modelPos).add(offset);

          lerpSpeedOpacity = 0.02; // Grow slower
          lerpSpeedScale = 0.02;
      } else {
          // Shrink slightly when fading out
          targetGlowScale = MODEL_SIZE * 1.5;
      }

      // Smoothly interpolate glow values
      glowOpacityRef.current = THREE.MathUtils.lerp(glowOpacityRef.current, targetGlowOpacity, lerpSpeedOpacity);
      glowScaleRef.current = THREE.MathUtils.lerp(glowScaleRef.current, targetGlowScale, lerpSpeedScale);

      if (glowSpriteRef.current) {
          glowSpriteRef.current.material.opacity = glowOpacityRef.current;
          glowSpriteRef.current.scale.setScalar(glowScaleRef.current);
          glowSpriteRef.current.visible = glowOpacityRef.current > 0.01;
      }

      // 3. Camera Animation
      if (!isZoomedRef.current) {
        // --- SCROLL MODE ---
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
        // --- ORBIT MODE ---
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
            // Ensure opaque when zoomed so glow sprite doesn't show through if behind
            (mesh.material as THREE.MeshStandardMaterial).transparent = false;
            (mesh.material as THREE.MeshStandardMaterial).opacity = 1;
            mesh.visible = true;
        } else {
            mesh.rotation.z -= 0.001; 

            const targetOpacity = isZoomedRef.current ? 0 : 1;
            const currentOpacity = (mesh.material as THREE.MeshStandardMaterial).opacity;
            const nextOpacity = THREE.MathUtils.lerp(currentOpacity, targetOpacity, 0.05);
            
            // Only use transparent mode if fading out, otherwise opaque solves sorting issues
            const isFading = nextOpacity < 0.99;
            (mesh.material as THREE.MeshStandardMaterial).transparent = isFading;
            (mesh.material as THREE.MeshStandardMaterial).opacity = nextOpacity;
            // Only set visibility here if we are not forcibly hiding them (which we did in zoomIn for zoomed state)
            // But if isZoomed is true, target is 0, next will approach 0.
            // If isZoomed is false, target is 1, next will approach 1.
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
      repositionModels();     
      
      // Update camera target for zoomed model on resize
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
      cancelAnimationFrame(animationFrameRef.current!);
      rendererRef.current?.dispose();
      if (containerRef.current && rendererRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, [files]);
  
  // React to panel size changes by updating targets if zoomed
  useEffect(() => {
      if (isZoomedRef.current && containerRef.current) {
          updateZoomTargets(containerRef.current.clientWidth, containerRef.current.clientHeight);
      }
  }, [panelSize]);

  // Sync internal zoom state if the selected model is cleared externally (e.g. by closing the sidebar)
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