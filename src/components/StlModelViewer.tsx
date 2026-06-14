// src/components/StlModelViewer.tsx
//
// Lekka przeglądarka modelu STL (three.js) renderująca pojedynczą bryłę, która
// obraca się wokół własnej osi pionowej. Używana w kreatorze Wirtualnej
// Tożsamości jako podgląd postaci dla archetypu „Babcia". Model (15 MB) ładowany
// jest leniwie  -  fetch startuje dopiero przy zamontowaniu komponentu, więc nie
// obciąża głównego bundla ani pozostałych podglądów (sylwetka SVG).

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js"

interface StlModelViewerProps {
  /** URL do pliku .stl (z importu `url:`). */
  src: string
  /** Obrotów na sekundę wokół osi pionowej. */
  rotationsPerSecond?: number
  /** Kolor materiału modelu. */
  color?: string
}

export default function StlModelViewer({
  src,
  rotationsPerSecond = 0.12,
  color = "#cdbfb0"
}: StlModelViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const prefersReducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches

    const scene = new THREE.Scene()

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.display = "block"
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "100%"

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(0, 0.4, 4.2)
    camera.lookAt(0, 0, 0)

    // Oświetlenie: chłodne wypełnienie + ciepłe światło kluczowe + turkusowy rim,
    // żeby model wpisał się w paletę konsoli, ale pozostał czytelny.
    scene.add(new THREE.AmbientLight(0x8899aa, 0.9))
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(2.5, 4, 3)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x2bd4c4, 1.1)
    rim.position.set(-3, 1, -2.5)
    scene.add(rim)

    const modelGroup = new THREE.Group()
    scene.add(modelGroup)

    let mesh: THREE.Mesh | null = null
    let frame = 0
    let disposed = false
    const clock = new THREE.Clock()

    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }

    const ro = new ResizeObserver(resize)
    ro.observe(mount)
    resize()

    const loader = new STLLoader()
    loader.load(
      src,
      (geometry) => {
        if (disposed) {
          geometry.dispose()
          return
        }

        geometry.computeVertexNormals()
        geometry.computeBoundingBox()
        const box = geometry.boundingBox!
        const size = new THREE.Vector3()
        box.getSize(size)

        // Modele do druku bywają Z-up  -  jeśli głębokość przewyższa wysokość,
        // ustaw model pionowo (Z-up → Y-up), by stał, a nie leżał.
        if (size.z > size.y * 1.15) {
          geometry.rotateX(-Math.PI / 2)
          geometry.computeBoundingBox()
          geometry.boundingBox!.getSize(size)
        }

        // Wyśrodkuj geometrię w jej własnym centrum i znormalizuj skalę.
        geometry.center()
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const scale = 2.4 / maxDim

        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          metalness: 0.15,
          roughness: 0.65
        })
        mesh = new THREE.Mesh(geometry, material)
        mesh.scale.setScalar(scale)
        modelGroup.add(mesh)

        setStatus("ready")
      },
      (event) => {
        if (event.lengthComputable && event.total > 0) {
          setProgress(Math.round((event.loaded / event.total) * 100))
        }
      },
      () => {
        if (!disposed) setStatus("error")
      }
    )

    const animate = () => {
      frame = requestAnimationFrame(animate)
      const dt = clock.getDelta()
      if (!prefersReducedMotion) {
        modelGroup.rotation.y += rotationsPerSecond * Math.PI * 2 * dt
      }
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      ro.disconnect()
      if (mesh) {
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      }
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [src, rotationsPerSecond, color])

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full" />
      {status !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-[10px] uppercase tracking-wide text-fg-low">
            {status === "error"
              ? "Nie udało się wczytać modelu 3D"
              : `Ładowanie modelu 3D… ${progress || ""}${progress ? "%" : ""}`}
          </span>
        </div>
      )}
    </div>
  )
}
