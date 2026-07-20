import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'

/*
 * LOGIN 3D KAHRAMAN SAHNESİ — dalgalanan deniz + yüzen fener + şamandıra.
 * Lazy yüklenir (three yalnız login chunk zincirinde); WebGL yoksa Login'in
 * SVG sahnesi devrede kalır. Kamera sabit — form kartı önde, sahne fon.
 */

export default function Login3D({ koyu }: { koyu: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 1.6, 7], fov: 50 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={koyu ? 0.35 : 0.75} color={koyu ? '#7DA5D8' : '#FFFFFF'} />
        <directionalLight position={koyu ? [-3, 5, -2] : [4, 6, 3]} intensity={koyu ? 0.6 : 1} color={koyu ? '#9CC3F0' : '#FFF2D9'} />
        {koyu && <Stars radius={30} depth={15} count={700} factor={2.5} saturation={0} fade speed={0.5} />}
        <Deniz koyu={koyu} />
        <Fener koyu={koyu} />
        <Samandira />
      </Canvas>
    </div>
  )
}

function Deniz({ koyu }: { koyu: boolean }) {
  const geoRef = useRef<THREE.PlaneGeometry>(null)
  useFrame(({ clock }) => {
    const geo = geoRef.current
    if (!geo) return
    const t = clock.elapsedTime
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i)
      pos.setZ(i, Math.sin(x * 0.7 + t) * 0.12 + Math.cos(y * 0.9 + t * 0.7) * 0.1)
    }
    pos.needsUpdate = true
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
      <planeGeometry ref={geoRef} args={[36, 24, 40, 26]} />
      <meshStandardMaterial
        color={koyu ? '#0E2A44' : '#2E9BD6'}
        transparent opacity={0.95} roughness={0.4} metalness={0.15}
      />
    </mesh>
  )
}

/** Uzakta yüzen fener kulesi — huzme döner. */
function Fener({ koyu }: { koyu: boolean }) {
  const grup = useRef<THREE.Group>(null)
  const isik = useRef<THREE.SpotLight>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (grup.current) {
      grup.current.position.y = -0.15 + Math.sin(t * 0.7) * 0.06
      grup.current.rotation.z = Math.sin(t * 0.5) * 0.015
    }
    if (isik.current) {
      isik.current.target.position.set(Math.cos(t * 0.6) * 8, 0.5, Math.sin(t * 0.6) * 8 - 6)
      isik.current.target.updateMatrixWorld()
    }
  })
  return (
    <group ref={grup} position={[-3.4, -0.15, -5]}>
      {/* Kayalık */}
      <mesh position={[0, -0.25, 0]}>
        <dodecahedronGeometry args={[0.85, 0]} />
        <meshStandardMaterial color={koyu ? '#2A3A50' : '#8CA3B8'} roughness={1} flatShading />
      </mesh>
      {/* Kule */}
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.22, 0.34, 2.1, 10]} />
        <meshStandardMaterial color={koyu ? '#C9BFA8' : '#F2EDE0'} roughness={0.8} />
      </mesh>
      {[0.55, 1.35].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <cylinderGeometry args={[0.345 - y * 0.055, 0.345 - y * 0.055, 0.16, 10]} />
          <meshStandardMaterial color="#2E9BD6" roughness={0.7} />
        </mesh>
      ))}
      {/* Lamba odası */}
      <mesh position={[0, 2.2, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.3, 8]} />
        <meshStandardMaterial color="#FDE68A" emissive="#FBBF24" emissiveIntensity={koyu ? 1.3 : 0.5} />
      </mesh>
      <mesh position={[0, 2.48, 0]}>
        <coneGeometry args={[0.24, 0.3, 8]} />
        <meshStandardMaterial color="#B8863B" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Dönen huzme */}
      <spotLight
        ref={isik}
        position={[0, 2.2, 0]}
        intensity={koyu ? 14 : 5}
        angle={0.22}
        penumbra={0.6}
        distance={22}
        color="#FDE68A"
      />
      {koyu && <pointLight position={[0, 2.2, 0]} intensity={0.8} color="#FBBF24" distance={5} />}
    </group>
  )
}

/** Öne yakın küçük şamandıra — yavaşça sallanır. */
function Samandira() {
  const grup = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (!grup.current) return
    grup.current.position.y = -0.42 + Math.sin(t * 1.1 + 1) * 0.09
    grup.current.rotation.x = Math.sin(t * 0.8) * 0.09
    grup.current.rotation.z = Math.cos(t * 0.7) * 0.11
  })
  return (
    <group ref={grup} position={[2.9, -0.42, -2.2]}>
      <mesh>
        <sphereGeometry args={[0.28, 12, 10]} />
        <meshStandardMaterial color="#D64545" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.35, 6]} />
        <meshStandardMaterial color="#8C8578" />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshStandardMaterial color="#FDE68A" emissive="#FBBF24" emissiveIntensity={0.9} />
      </mesh>
    </group>
  )
}
