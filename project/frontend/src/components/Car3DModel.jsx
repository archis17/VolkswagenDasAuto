import { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF, ContactShadows } from '@react-three/drei';
import { motion } from 'framer-motion';
import * as THREE from 'three';

// Particle system for dust trail
function DustTrail({ position, opacity }) {
  const particlesRef = useRef();
  const particleCount = 30;
  
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  
  // Initialize particles
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 2;
    positions[i3 + 1] = Math.random() * 0.5;
    positions[i3 + 2] = (Math.random() - 0.5) * 2;
    
    velocities[i3] = (Math.random() - 0.5) * 0.1;
    velocities[i3 + 1] = Math.random() * 0.05;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.1;
    
    sizes[i] = Math.random() * 0.3 + 0.1;
  }
  
  useFrame((state, delta) => {
    if (particlesRef.current && opacity > 0) {
      const positions = particlesRef.current.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3] += velocities[i3] * delta * 10;
        positions[i3 + 1] += velocities[i3 + 1] * delta * 10;
        positions[i3 + 2] += velocities[i3 + 2] * delta * 10;
        
        // Reset if too far
        if (Math.abs(positions[i3]) > 3 || positions[i3 + 1] > 1) {
          positions[i3] = (Math.random() - 0.5) * 2;
          positions[i3 + 1] = Math.random() * 0.5;
          positions[i3 + 2] = (Math.random() - 0.5) * 2;
        }
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });
  
  return (
    <points ref={particlesRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={particleCount}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        color="#d4a574"
        transparent
        opacity={opacity * 0.6}
        sizeAttenuation={true}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Headlight lights component
function HeadlightLights({ modelRef, isActive, animationPhase }) {
  const leftLightRef = useRef();
  const rightLightRef = useRef();
  
  useFrame(() => {
    if (modelRef.current && isActive && (animationPhase === 'idle' || animationPhase === 'driving')) {
      // Position lights at front of car (adjust based on car model)
      const carPos = modelRef.current.position;
      
      // Calculate headlight positions relative to car
      const offsetX = 0.6; // Distance from center
      const offsetY = 0.2; // Height from ground
      const offsetZ = 1.5; // Forward from center
      
      if (leftLightRef.current) {
        const worldPos = new THREE.Vector3(-offsetX, offsetY, offsetZ);
        worldPos.applyQuaternion(modelRef.current.quaternion);
        leftLightRef.current.position.set(
          carPos.x + worldPos.x,
          carPos.y + worldPos.y,
          carPos.z + worldPos.z
        );
        // Point light forward
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(modelRef.current.quaternion);
        leftLightRef.current.lookAt(
          carPos.x + forward.x * 5,
          carPos.y + forward.y * 5,
          carPos.z + forward.z * 5
        );
      }
      
      if (rightLightRef.current) {
        const worldPos = new THREE.Vector3(offsetX, offsetY, offsetZ);
        worldPos.applyQuaternion(modelRef.current.quaternion);
        rightLightRef.current.position.set(
          carPos.x + worldPos.x,
          carPos.y + worldPos.y,
          carPos.z + worldPos.z
        );
        // Point light forward
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(modelRef.current.quaternion);
        rightLightRef.current.lookAt(
          carPos.x + forward.x * 5,
          carPos.y + forward.y * 5,
          carPos.z + forward.z * 5
        );
      }
    }
  });
  
  if (!isActive) return null;
  
  return (
    <>
      <spotLight
        ref={leftLightRef}
        intensity={animationPhase === 'driving' ? 3.0 : 2.0}
        angle={0.4}
        penumbra={0.5}
        distance={25}
        decay={2}
        color="#aaccff"
        castShadow={false}
      />
      <spotLight
        ref={rightLightRef}
        intensity={animationPhase === 'driving' ? 3.0 : 2.0}
        angle={0.4}
        penumbra={0.5}
        distance={25}
        decay={2}
        color="#aaccff"
        castShadow={false}
      />
    </>
  );
}

// Load the 3D model
function Model({ url, isInteracting, isDetectionActive, onShadowOpacityChange }) {
  const { scene, animations } = useGLTF(url);
  const modelRef = useRef();
  const mixerRef = useRef(null);
  const headlightLeftRef = useRef();
  const headlightRightRef = useRef();
  const wheelRefs = useRef({ frontLeft: null, frontRight: null, rearLeft: null, rearRight: null });
  const numberPlateRef = useRef(null);
  
  // Animation state
  const [animationPhase, setAnimationPhase] = useState('idle'); // 'idle', 'starting', 'driving'
  const startTimeRef = useRef(0);
  const initialPositionRef = useRef(new THREE.Vector3(0, -0.2, 0));
  const shadowOpacityRef = useRef(0.3);

  // Set initial position when model loads (using useFrame to check once)
  const positionSetRef = useRef(false);
  useFrame(() => {
    if (!positionSetRef.current && modelRef.current && modelRef.current.position) {
      initialPositionRef.current.copy(modelRef.current.position);
      positionSetRef.current = true;
      console.log('Model loaded, initial position:', initialPositionRef.current);
    }
  });

  // Find wheels and headlights in the model
  useEffect(() => {
    if (modelRef.current) {
      const findMeshes = (object, namePatterns) => {
        const results = [];
        object.traverse((child) => {
          if (child.isMesh) {
            const name = child.name.toLowerCase();
            namePatterns.forEach((pattern) => {
              if (name.includes(pattern)) {
                results.push(child);
              }
            });
          }
        });
        return results;
      };
      
      // Find wheels (common naming patterns)
      const wheels = findMeshes(modelRef.current, ['wheel', 'tire', 'tyre', 'rim']);
      if (wheels.length >= 2) {
        wheelRefs.current.frontLeft = wheels[0];
        wheelRefs.current.frontRight = wheels[1];
        if (wheels.length >= 4) {
          wheelRefs.current.rearLeft = wheels[2];
          wheelRefs.current.rearRight = wheels[3];
        }
      }
      
      // Find headlights (common naming patterns)
      const headlights = findMeshes(modelRef.current, ['headlight', 'headlamp', 'light']);
      if (headlights.length >= 2) {
        // Store headlight meshes for emissive material
        headlightLeftRef.current = headlights[0];
        headlightRightRef.current = headlights[1];
      }
      
      // Find number plate (common naming patterns)
      const numberPlates = findMeshes(modelRef.current, ['plate', 'license', 'number', 'registration', 'plaque']);
      if (numberPlates.length > 0) {
        numberPlateRef.current = numberPlates[0];
        console.log('Found number plate:', numberPlates[0].name);
      }
      
      // Store initial position
      if (modelRef.current && modelRef.current.position) {
        initialPositionRef.current.copy(modelRef.current.position);
        console.log('Initial position set:', initialPositionRef.current);
      } else {
        // Set default initial position
        initialPositionRef.current.set(0, -0.2, 0);
      }
    }
  }, [scene]);
  
  // Set up animation mixer for built-in animations
  useEffect(() => {
    // Wait for model to be ready
    const setupMixer = () => {
      if (animations && animations.length > 0 && modelRef.current) {
        // Create mixer if it doesn't exist
        if (!mixerRef.current) {
          mixerRef.current = new THREE.AnimationMixer(modelRef.current);
          console.log(`Loaded ${animations.length} animation(s) from GLB file:`, animations.map(a => a.name));
        }
        
        // Set up all animation clips
        animations.forEach((clip) => {
          const action = mixerRef.current.clipAction(clip);
          action.setLoop(THREE.LoopRepeat);
          action.setEffectiveTimeScale(1.0);
          action.setEffectiveWeight(1.0);
          // Enable blending for smooth transitions
          action.clampWhenFinished = false;
        });
      } else if (animations && animations.length === 0) {
        console.log('No built-in animations found in GLB file');
      }
    };

    // Try to set up immediately, or wait a frame if model isn't ready
    if (modelRef.current) {
      setupMixer();
    } else {
      const timer = setTimeout(setupMixer, 100);
      return () => clearTimeout(timer);
    }
  }, [animations]);

  // Control cinematic sequence based on detection state
  useEffect(() => {
    if (isDetectionActive) {
      // Start the cinematic sequence
      console.log('Starting detection animation');
      setAnimationPhase('idle');
      startTimeRef.current = Date.now();
      shadowOpacityRef.current = 0.3;
      
      // Ensure initial position is set
      if (modelRef.current && modelRef.current.position) {
        initialPositionRef.current.copy(modelRef.current.position);
      } else {
        initialPositionRef.current.set(0, -0.2, 0);
      }
      
      // Turn on headlights
      if (headlightLeftRef.current && headlightLeftRef.current.material) {
        const material = Array.isArray(headlightLeftRef.current.material) 
          ? headlightLeftRef.current.material[0] 
          : headlightLeftRef.current.material;
        if (material) {
          material.emissive = new THREE.Color(0xaaccff);
          material.emissiveIntensity = 1.5;
        }
      }
      if (headlightRightRef.current && headlightRightRef.current.material) {
        const material = Array.isArray(headlightRightRef.current.material) 
          ? headlightRightRef.current.material[0] 
          : headlightRightRef.current.material;
        if (material) {
          material.emissive = new THREE.Color(0xaaccff);
          material.emissiveIntensity = 1.5;
        }
      }
      
      // After 1 second, start driving
      const driveTimer = setTimeout(() => {
        console.log('Transitioning to driving phase');
        setAnimationPhase('driving');
      }, 1000);
      
      return () => clearTimeout(driveTimer);
    } else {
      // Reset everything
      setAnimationPhase('idle');
      startTimeRef.current = 0;
      shadowOpacityRef.current = 0.3;
      
      // Turn off headlights
      if (headlightLeftRef.current && headlightLeftRef.current.material) {
        const material = Array.isArray(headlightLeftRef.current.material) 
          ? headlightLeftRef.current.material[0] 
          : headlightLeftRef.current.material;
        if (material) {
          material.emissive = new THREE.Color(0x000000);
          material.emissiveIntensity = 0;
        }
      }
      if (headlightRightRef.current && headlightRightRef.current.material) {
        const material = Array.isArray(headlightRightRef.current.material) 
          ? headlightRightRef.current.material[0] 
          : headlightRightRef.current.material;
        if (material) {
          material.emissive = new THREE.Color(0x000000);
          material.emissiveIntensity = 0;
        }
      }
      
      // Reset position
      if (modelRef.current) {
        modelRef.current.position.copy(initialPositionRef.current);
        modelRef.current.rotation.set(0, 0, 0);
      }
      
      // Stop built-in animations
      if (mixerRef.current && animations && animations.length > 0) {
        animations.forEach((clip) => {
          const action = mixerRef.current.clipAction(clip);
          if (action.isRunning()) {
            action.stop();
            action.reset();
          }
        });
      }
    }
  }, [isDetectionActive, animations]);

  // Update animation mixer
  useFrame((state, delta) => {
    if (mixerRef.current) {
      mixerRef.current.update(delta);
    }
  });

  // Cinematic animation sequence
  useFrame((state) => {
    if (!modelRef.current) return;
    
    // Ensure initial position is set (Vector3 always has length, so check if it's zero vector)
    if (initialPositionRef.current.length() === 0) {
      initialPositionRef.current.set(0, -0.2, 0);
    }
    
    // Calculate elapsed time only if detection is active and start time is set
    const elapsed = (startTimeRef.current > 0 && isDetectionActive) 
      ? (Date.now() - startTimeRef.current) / 1000 
      : 0;
    
    if (isDetectionActive && startTimeRef.current > 0) {
      // Debug: log animation state occasionally
      if (Math.floor(state.clock.elapsedTime * 10) % 10 === 0) {
        console.log('Animation state:', { 
          phase: animationPhase, 
          elapsed, 
          isActive: isDetectionActive,
          hasModel: !!modelRef.current 
        });
      }
      
      if (animationPhase === 'idle') {
        // Idle phase: engine rumble/vibration (0-1 second)
        const baseY = initialPositionRef.current.y;
        const rumbleIntensity = Math.sin(state.clock.elapsedTime * 20) * 0.01;
        const rumbleX = Math.sin(state.clock.elapsedTime * 15) * 0.005;
        
        if (modelRef.current) {
          modelRef.current.position.y = baseY + rumbleIntensity;
          modelRef.current.position.x = initialPositionRef.current.x + rumbleX;
          modelRef.current.position.z = initialPositionRef.current.z;
          
          // Slight rotation shake
          modelRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 18) * 0.002;
          modelRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 22) * 0.001;
        }
        
      } else if (animationPhase === 'driving') {
        // Driving phase: smooth forward movement
        const driveTime = Math.max(0, elapsed - 1.0); // Time since driving started
        const baseY = initialPositionRef.current.y;
        
        // Smooth acceleration curve (ease-out)
        const acceleration = 1 - Math.exp(-driveTime * 2);
        const forwardSpeed = 8; // units per second
        const forwardDistance = forwardSpeed * driveTime * acceleration;
        
        // Move forward and slightly to the right (exiting frame)
        const exitAngle = Math.PI * 0.15; // ~27 degrees to the right
        const newX = initialPositionRef.current.x + Math.sin(exitAngle) * forwardDistance * 0.3;
        const newZ = initialPositionRef.current.z - Math.cos(exitAngle) * forwardDistance;
        
        // Update position
        if (modelRef.current) {
          modelRef.current.position.set(newX, baseY, newZ);
          
          // Rotate car to face direction of travel
          modelRef.current.rotation.y = exitAngle;
        }
        
        // Rotate front wheels as car accelerates
        const wheelRotationSpeed = forwardDistance * 2; // Rotate based on distance traveled
        if (wheelRefs.current.frontLeft) {
          wheelRefs.current.frontLeft.rotation.z = wheelRotationSpeed;
        }
        if (wheelRefs.current.frontRight) {
          wheelRefs.current.frontRight.rotation.z = wheelRotationSpeed;
        }
        if (wheelRefs.current.rearLeft) {
          wheelRefs.current.rearLeft.rotation.z = wheelRotationSpeed;
        }
        if (wheelRefs.current.rearRight) {
          wheelRefs.current.rearRight.rotation.z = wheelRotationSpeed;
        }
        
        // Fade shadows and reflections as car moves away
        const fadeStart = 2.0; // Start fading after 2 seconds of driving
        const fadeDuration = 3.0; // Fade over 3 seconds
        if (driveTime > fadeStart) {
          const fadeProgress = Math.min((driveTime - fadeStart) / fadeDuration, 1);
          shadowOpacityRef.current = 0.3 * (1 - fadeProgress);
          if (onShadowOpacityChange) {
            onShadowOpacityChange(shadowOpacityRef.current);
          }
        } else if (onShadowOpacityChange) {
          onShadowOpacityChange(shadowOpacityRef.current);
        }
      }
    } else if (!isInteracting) {
      // Idle: gentle floating animation
      const baseY = initialPositionRef.current.y;
      modelRef.current.position.y = baseY + Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      modelRef.current.position.x = initialPositionRef.current.x;
      modelRef.current.position.z = initialPositionRef.current.z;
      modelRef.current.rotation.set(0, 0, 0);
      
      // Reset wheel rotations
      Object.values(wheelRefs.current).forEach((wheel) => {
        if (wheel) wheel.rotation.z = 0;
      });
    }
  });

  // Clone the scene to avoid issues with multiple instances
  const clonedScene = scene.clone();
  
  // Helper function to blur texture using canvas
  const blurTexture = (texture, blurAmount = 10) => {
    if (!texture || !texture.image) return texture;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = texture.image.width || 512;
    canvas.height = texture.image.height || 512;
    
    // Apply blur filter
    ctx.filter = `blur(${blurAmount}px)`;
    ctx.drawImage(texture.image, 0, 0, canvas.width, canvas.height);
    
    // Create new texture from blurred canvas
    const blurredTexture = new THREE.CanvasTexture(canvas);
    blurredTexture.minFilter = THREE.LinearFilter;
    blurredTexture.magFilter = THREE.LinearFilter;
    blurredTexture.needsUpdate = true;
    
    return blurredTexture;
  };
  
  // Traverse and improve materials - realistic look with subtle reflections
  clonedScene.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      
      // Check if this is the number plate by name
      const childName = child.name.toLowerCase();
      const isNumberPlate = ['plate', 'license', 'number', 'registration', 'plaque'].some(
        pattern => childName.includes(pattern)
      );
      
      if (child.material) {
        // Enhance materials for realistic look
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            if (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
              mat.metalness = 0.95;
              mat.roughness = 0.05;
              // Subtle emissive for realistic glow (not overpowering)
              mat.emissive = new THREE.Color(0x1a1a2e);
              mat.emissiveIntensity = 0.05;
              
              // Apply blur to number plate texture
              if (isNumberPlate && mat.map) {
                // Wait for texture to load, then blur it
                if (mat.map.image && mat.map.image.complete) {
                  mat.map = blurTexture(mat.map, 12);
                } else if (mat.map.image) {
                  mat.map.image.onload = () => {
                    mat.map = blurTexture(mat.map, 12);
                    mat.needsUpdate = true;
                  };
                }
              }
            }
          });
        } else {
          if (child.material.isMeshStandardMaterial || child.material.isMeshPhysicalMaterial) {
            child.material.metalness = 0.95;
            child.material.roughness = 0.05;
            // Subtle emissive
            child.material.emissive = new THREE.Color(0x1a1a2e);
            child.material.emissiveIntensity = 0.05;
            
            // Apply blur to number plate texture
            if (isNumberPlate && child.material.map) {
              // Wait for texture to load, then blur it
              if (child.material.map.image && child.material.map.image.complete) {
                child.material.map = blurTexture(child.material.map, 12);
              } else if (child.material.map.image) {
                child.material.map.image.onload = () => {
                  child.material.map = blurTexture(child.material.map, 12);
                  child.material.needsUpdate = true;
                };
              }
            }
          }
        }
      }
    }
  });

  return (
    <group>
      <primitive 
        ref={modelRef}
        object={clonedScene} 
        scale={[2.2, 2.2, 2.2]} 
        position={[0, -0.2, 0]}
      />
      {/* Headlight lights */}
      <HeadlightLights 
        modelRef={modelRef}
        isActive={isDetectionActive}
        animationPhase={animationPhase}
      />
      {/* Dust trail - appears when driving */}
      {animationPhase === 'driving' && modelRef.current && (
        <DustTrail 
          position={[
            modelRef.current.position.x,
            modelRef.current.position.y - 0.3,
            modelRef.current.position.z + 1
          ]}
          opacity={Math.min(1, shadowOpacityRef.current / 0.3)}
        />
      )}
    </group>
  );
}

// Loading fallback with animation
function LoadingFallback() {
  const meshRef = useRef();
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[3, 1.5, 6]} />
      <meshStandardMaterial 
        color="#3498db" 
        metalness={0.8} 
        roughness={0.2}
        emissive="#3498db"
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

// Main 3D Scene Component
function Scene({ isDetectionActive }) {
  const [isInteracting, setIsInteracting] = useState(false);
  const [shadowOpacity, setShadowOpacity] = useState(0.3);
  const controlsRef = useRef();

  return (
    <Canvas
      camera={{ position: [0, 2, 12], fov: 50 }}
      gl={{ 
        antialias: true, 
        alpha: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true,
        stencil: false,
        depth: true
      }}
      style={{ background: 'transparent' }}
      shadows
      dpr={[1, 2]}
      frameloop="always"
    >
      {/* Enhanced lighting setup for realistic glow */}
      <ambientLight intensity={0.4} />
      <directionalLight 
        position={[10, 10, 5]} 
        intensity={2.0} 
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        color="#ffffff"
      />
      {/* Key light - main illumination */}
      <directionalLight 
        position={[-5, 8, -5]} 
        intensity={0.8} 
        color="#3498db"
      />
      {/* Fill lights for subtle glow around edges */}
      <pointLight position={[-8, 3, 6]} intensity={0.6} color="#3498db" distance={15} decay={2} />
      <pointLight position={[8, 3, 6]} intensity={0.6} color="#2ecc71" distance={15} decay={2} />
      {/* Rim lights for edge definition */}
      <pointLight position={[-12, 2, 8]} intensity={0.8} color="#4a90e2" distance={12} decay={2.5} />
      <pointLight position={[12, 2, 8]} intensity={0.8} color="#4a90e2" distance={12} decay={2.5} />
      {/* Top accent light */}
      <pointLight position={[0, 10, 0]} intensity={0.5} color="#3498db" distance={20} decay={2} />
      <spotLight 
        position={[0, 15, 0]} 
        angle={0.6} 
        penumbra={1.5} 
        intensity={1.2}
        castShadow
        color="#ffffff"
      />
      
      {/* Environment for realistic reflections */}
      <Environment preset="sunset" />
      
      {/* Contact shadows for better grounding - fades as car drives away */}
      <ContactShadows
        position={[0, -1.2, 0]}
        opacity={shadowOpacity}
        scale={12}
        blur={2.5}
        far={5}
      />
      
      {/* 3D Model */}
      <Suspense fallback={<LoadingFallback />}>
        <Model 
          url="/lotus_elise.glb" 
          isInteracting={isInteracting}
          isDetectionActive={isDetectionActive}
          onShadowOpacityChange={setShadowOpacity}
        />
      </Suspense>
      
      {/* Orbit controls for manual interaction */}
      <OrbitControls
        ref={controlsRef}
        enableZoom={true}
        enablePan={false}
        minDistance={8}
        maxDistance={25}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.1}
        autoRotate={!isInteracting}
        autoRotateSpeed={2.3}
        enableDamping={true}
        dampingFactor={0.05}
        onStart={() => setIsInteracting(true)}
        onEnd={() => {
          // Delay to allow smooth transition back to auto-rotate
          setTimeout(() => setIsInteracting(false), 2000);
        }}
      />
    </Canvas>
  );
}

// Main exported component - fills entire viewport
export default function Car3DModel({ isDetectionActive = false }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="absolute inset-0 w-full h-full"
    >
      {/* 3D Canvas - fills entire viewport */}
      <div className="relative w-full h-full">
        <Scene isDetectionActive={isDetectionActive} />
      </div>
    </motion.div>
  );
}

// Preload the model for better performance
useGLTF.preload('/lotus_elise.glb');

