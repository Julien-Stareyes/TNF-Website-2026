"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// The studio's mark, modeled in Blender (mesh name "TNF_Logo_Curve"),
// rendered with plain three.js (no react-three-fiber in this project) --
// a slow, endless spin on its own vertical axis, brushed-metal finish (a
// generic room environment map feeds the reflections, since there's no
// real HDRI on hand). Also draggable horizontally (mouse or touch) to spin
// it by hand; letting go resumes the auto-rotate from wherever it was left.
const MODEL_URL = "/models/tnf-logo.glb";
const TARGET_MESH_NAME = "TNF_Logo_Curve";
const DRAG_SENSITIVITY = 0.008; // rad per pixel of horizontal drag

// Tuned values -- previously dialed in live via an on-screen debug panel
// (since removed) and copied back over chat.
const SETTINGS = {
  rotationSpeed: 0.08, // rad/s
  size: 1.4, // the model's largest dimension, in scene units, once normalized
  metalness: 0.92,
  roughness: 0.15,
  color: "#d1d1d1",
  offsetX: 0, // manual nudge, in scene units, on top of the auto-centering
  offsetY: 0,
};

const Logo3D = () => {
  const containerRef = useRef(null);
  const materialRef = useRef(null);
  const logoRef = useRef(null);
  const baseScaleRef = useRef(1); // 1 / model's own maxDim -- see onLoad below

  // Drag-to-rotate (horizontal only): `rotationYRef` is the one running
  // total the pivot's rotation is set from every frame, advanced either by
  // the auto-rotate speed or by a drag delta -- never both at once, so
  // letting go always resumes auto-rotation from exactly where the drag
  // left it, with no snap.
  const rotationYRef = useRef(0);
  const isDraggingRef = useRef(false);
  const lastPointerXRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    // A generic room environment (not a real HDRI, just a neutral lit
    // interior) gives the metal something to reflect -- flat lighting
    // alone reads as plastic, not metal.
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 4, 5);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-4, -2, 3);
    scene.add(ambient, key, fill);

    // The pivot is what actually gets rotated/scaled/nudged -- the loaded
    // `root` becomes its child, offset so the mesh's own visual centroid
    // (not Blender's object origin, which this export doesn't center) sits
    // exactly at the pivot's local origin. Rotating/scaling the *pivot*
    // then always happens around that visual centroid; rotating `root`
    // itself (as before) span it around Blender's off-centroid origin
    // instead, which is why it both sat left of center and wobbled/orbited
    // instead of spinning cleanly in place.
    const pivot = new THREE.Group();
    scene.add(pivot);

    let disposed = false;
    let frameId = 0;

    // The exported .glb is Draco-compressed ("-optimized" in its filename),
    // so GLTFLoader needs a DRACOLoader to actually decode the mesh --
    // decoder files served locally (public/draco/) rather than off a CDN,
    // to match the rest of the site's self-hosted assets.
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/draco/");

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.load(
      MODEL_URL,
      (gltf) => {
        if (disposed) return;
        const root = gltf.scene;
        // Fall back to the whole scene if the named mesh isn't found (a
        // re-export could rename it) -- better a visible logo with the
        // wrong grouping than nothing at all.
        const target = root.getObjectByName(TARGET_MESH_NAME) || root;

        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(SETTINGS.color),
          metalness: SETTINGS.metalness,
          roughness: SETTINGS.roughness,
        });
        materialRef.current = material;

        target.traverse((child) => {
          if (child.isMesh) child.material = material;
        });

        // Center on the *visible mesh's* own bounding box, not the whole
        // exported scene -- a Blender glTF export can carry extra nodes
        // (an empty, a leftover camera/light transform) off to one side,
        // which skewed the centering left/right when the box was taken
        // from `root` as a whole. This offset lives on `root`'s own
        // position (a child of `pivot`, scale 1, rotation 0), which keeps
        // it a fixed rigid offset unaffected by the pivot's own rotation
        // or scale -- see the `pivot` comment above for why that matters.
        const box = new THREE.Box3().setFromObject(target);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);
        root.position.sub(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        baseScaleRef.current = 1 / maxDim;
        pivot.scale.setScalar(baseScaleRef.current * SETTINGS.size);
        pivot.position.set(SETTINGS.offsetX, SETTINGS.offsetY, 0);

        pivot.add(root);
        logoRef.current = pivot;
      },
      undefined,
      (err) => {
        console.error("Logo3D: failed to load", MODEL_URL, err);
      }
    );

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    };
    resize();
    window.addEventListener("resize", resize);

    // Drag to spin horizontally -- vertical movement is ignored entirely
    // (only `clientX` is read), and releasing just lets the auto-rotate
    // pick back up from the dragged-to angle instead of resetting.
    container.style.cursor = "grab";
    container.style.touchAction = "none"; // no native scroll/pinch to fight
    const onPointerDown = (e) => {
      isDraggingRef.current = true;
      lastPointerXRef.current = e.clientX;
      container.style.cursor = "grabbing";
    };
    const onPointerMove = (e) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - lastPointerXRef.current;
      lastPointerXRef.current = e.clientX;
      rotationYRef.current += dx * DRAG_SENSITIVITY;
    };
    const onPointerUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      container.style.cursor = "grab";
    };
    container.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;

      if (!isDraggingRef.current) {
        rotationYRef.current += SETTINGS.rotationSpeed * dt;
      }

      if (logoRef.current) {
        logoRef.current.rotation.y = rotationYRef.current;
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      container.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      scene.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });
      renderer.dispose();
      dracoLoader.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />;
};

export default Logo3D;
