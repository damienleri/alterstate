import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Center, Environment } from "@react-three/drei";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { Suspense, forwardRef, useImperativeHandle, useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { UnzippedAssets } from "@/utils/zipLoader";

interface RoomViewerProps {
  fileUrl: string | null;
  assets?: UnzippedAssets | null;
}

export interface RoomViewerHandle {
  captureSnapshot: () => string | null;
}

const Scene = ({ fileUrl, assets }: { fileUrl: string | null; assets?: UnzippedAssets | null }) => {
  const [obj, setObj] = useState<THREE.Group | null>(null);
  const { gl } = useThree();
  // Ensure tone mapping is correct for textures
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
  }, [gl]);

  useEffect(() => {
    if (!fileUrl && !assets?.objUrl) return;

    const loadModel = async () => {
      const manager = new THREE.LoadingManager();
      
      // If we have assets (from ZIP), configure the manager to use blob URLs for textures
      if (assets) {
        manager.setURLModifier((url) => {
          // The loader might ask for "texture.jpg" or "./texture.jpg"
          const filename = url.split('/').pop() || url;
          if (assets.textures[filename]) {
            return assets.textures[filename];
          }
          return url;
        });
      }

      const objLoader = new OBJLoader(manager);

      if (assets?.mtlUrl) {
        const mtlLoader = new MTLLoader(manager);
        try {
          const materials = await mtlLoader.loadAsync(assets.mtlUrl);
          materials.preload();
          objLoader.setMaterials(materials);
        } catch (e) {
          console.error("Failed to load MTL:", e);
        }
      }

      const urlToLoad = assets?.objUrl || fileUrl;
      if (urlToLoad) {
        try {
          const object = await objLoader.loadAsync(urlToLoad);
          setObj(object);
        } catch (e) {
          console.error("Failed to load OBJ:", e);
        }
      }
    };

    loadModel();
  }, [fileUrl, assets]);

  if (!obj) return null;

  return (
    <Center>
      <primitive object={obj} />
    </Center>
  );
};

const RoomViewer = forwardRef<RoomViewerHandle, RoomViewerProps>(({ fileUrl, assets }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    captureSnapshot: () => {
      if (canvasRef.current) {
        return canvasRef.current.toDataURL("image/png");
      }
      return null;
    },
  }));

  return (
    <div className="w-full h-full bg-neutral-900 rounded-xl overflow-hidden relative">
      <Canvas
        ref={canvasRef}
        gl={{ preserveDrawingBuffer: true }}
        camera={{ position: [5, 5, 5], fov: 50 }}
        shadows
      >
        <Suspense fallback={null}>
          <Scene fileUrl={fileUrl} assets={assets} />
          <Environment preset="apartment" />
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
          <OrbitControls makeDefault />
        </Suspense>
      </Canvas>
      
      <div className="absolute bottom-4 left-4 bg-black/50 text-white px-3 py-1 rounded-full text-xs backdrop-blur-sm pointer-events-none">
        Left Click: Rotate • Right Click: Pan • Scroll: Zoom
      </div>
    </div>
  );
});

RoomViewer.displayName = "RoomViewer";

export default RoomViewer;
