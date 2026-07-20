import { useMemo, useRef } from 'react'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { itemModeli } from '../lib/katalog'

/*
 * BAHÇE 3D SAHNESİ — düşük poligon kod-üretimli ada (GLB varlığı YOK, her şey primitif).
 * · Temayla gündüz/gece ışıklandırma (gece: yıldızlar + ateşböcekleri)
 * · Su: vertex sine dalgası · Ağaçlar: rüzgâr salınımı · Nadirler: emissive parıltı
 * · Etkileşim: bitkiye tıkla → seç · zemine tıkla → yerleştirme modundaysa koordinat
 *   (0–100 yüzdesi — garden.x/y sözleşmesi) üst bileşene raporlanır.
 * Bu modül LAZY yüklenir (three yalnız /bahce chunk'ında).
 */

export interface SahneBitkisi {
  id: string
  item_id: string
  x: number | null
  y: number | null
  scale: number | null
}

const ADA_YARICAP = 4.6
const YERLESIM_YARICAP = 4.0

/** garden.x/y (0–100) → ada yüzeyi koordinatı. */
function konum(x: number | null, y: number | null, i: number): [number, number] {
  if (x == null || y == null) {
    // Konumsuz eski kayıtlar: deterministik halka dizilimi
    const aci = i * 2.399963 // altın açı — kümelenme olmaz
    const r = 1.2 + (i % 5) * 0.6
    return [Math.cos(aci) * r, Math.sin(aci) * r]
  }
  const px = ((x / 100) - 0.5) * 2 * YERLESIM_YARICAP
  const pz = ((y / 100) - 0.5) * 2 * YERLESIM_YARICAP
  const uz = Math.hypot(px, pz)
  if (uz > YERLESIM_YARICAP) {
    const k = YERLESIM_YARICAP / uz
    return [px * k, pz * k]
  }
  return [px, pz]
}

/** Ada yüzeyi noktası → garden.x/y (0–100). */
export function yuzdeKoordinat(p: { x: number; z: number }): { x: number; y: number } {
  const x = Math.round(((p.x / (2 * YERLESIM_YARICAP)) + 0.5) * 100)
  const y = Math.round(((p.z / (2 * YERLESIM_YARICAP)) + 0.5) * 100)
  return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
}

export default function Bahce3D({ koyu, bitkiler, seciliId, yerlesimModu, onBitkiTikla, onZeminTikla }: {
  koyu: boolean
  bitkiler: SahneBitkisi[]
  seciliId: string | null
  yerlesimModu: boolean
  onBitkiTikla: (id: string) => void
  onZeminTikla: (p: { x: number; y: number }) => void
}) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [7.5, 6.5, 7.5], fov: 42 }}
      style={{ touchAction: 'none' }}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={[koyu ? '#0B1520' : '#BFE0F5'] as any} />
      <fog attach="fog" args={[koyu ? '#0B1520' : '#BFE0F5', 14, 30] as any} />

      {/* Işıklandırma — tema */}
      <ambientLight intensity={koyu ? 0.35 : 0.7} color={koyu ? '#7DA5D8' : '#FFFFFF'} />
      <directionalLight
        position={koyu ? [-4, 6, -3] : [5, 8, 4]}
        intensity={koyu ? 0.7 : 1.15}
        color={koyu ? '#9CC3F0' : '#FFF2D9'}
      />
      {koyu && <pointLight position={[0, 4, 0]} intensity={0.5} color="#38BDF8" distance={12} />}

      {koyu && <Stars radius={40} depth={20} count={900} factor={3} saturation={0} fade speed={0.6} />}

      <Su koyu={koyu} />
      <Ada koyu={koyu} yerlesimModu={yerlesimModu} onZeminTikla={onZeminTikla} />

      {bitkiler.map((b, i) => {
        const [px, pz] = konum(b.x, b.y, i)
        return (
          <Bitki
            key={b.id}
            itemId={b.item_id}
            x={px}
            z={pz}
            olcek={b.scale ?? 1}
            secili={b.id === seciliId}
            koyu={koyu}
            faz={i}
            onClick={() => onBitkiTikla(b.id)}
          />
        )
      })}

      {koyu && <Atesbocekleri />}

      <OrbitControls
        enablePan={false}
        minDistance={6}
        maxDistance={16}
        minPolarAngle={0.5}
        maxPolarAngle={1.32}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  )
}

/* ── Su — vertex sine dalgası ─────────────────────────────────────────────── */
function Su({ koyu }: { koyu: boolean }) {
  const geoRef = useRef<THREE.PlaneGeometry>(null)
  useFrame(({ clock }) => {
    const geo = geoRef.current
    if (!geo) return
    const t = clock.elapsedTime
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i)
      pos.setZ(i, Math.sin(x * 0.9 + t * 0.8) * 0.07 + Math.cos(y * 1.1 + t * 0.6) * 0.07)
    }
    pos.needsUpdate = true
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.55, 0]}>
      <planeGeometry ref={geoRef} args={[40, 40, 28, 28]} />
      <meshStandardMaterial
        color={koyu ? '#0E2A44' : '#2E9BD6'}
        transparent
        opacity={0.92}
        roughness={0.35}
        metalness={0.15}
      />
    </mesh>
  )
}

/* ── Ada — çim tepe + toprak gövde ────────────────────────────────────────── */
function Ada({ koyu, yerlesimModu, onZeminTikla }: {
  koyu: boolean; yerlesimModu: boolean; onZeminTikla: (p: { x: number; y: number }) => void
}) {
  const tikla = (e: ThreeEvent<MouseEvent>) => {
    if (!yerlesimModu) return
    e.stopPropagation()
    onZeminTikla(yuzdeKoordinat({ x: e.point.x, z: e.point.z }))
  }
  return (
    <group>
      {/* Çim tepe — tıklanabilir yerleştirme yüzeyi */}
      <mesh position={[0, -0.05, 0]} onClick={tikla}>
        <cylinderGeometry args={[ADA_YARICAP, ADA_YARICAP * 0.94, 0.5, 40]} />
        <meshStandardMaterial color={koyu ? '#1E4D33' : '#4CAF6D'} roughness={0.9} />
      </mesh>
      {/* Toprak gövde */}
      <mesh position={[0, -0.75, 0]}>
        <cylinderGeometry args={[ADA_YARICAP * 0.94, ADA_YARICAP * 0.62, 0.95, 40]} />
        <meshStandardMaterial color={koyu ? '#3A2E22' : '#7A5C3E'} roughness={1} />
      </mesh>
      {/* Kumsal halka */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ADA_YARICAP * 0.88, ADA_YARICAP, 40]} />
        <meshStandardMaterial color={koyu ? '#6B5B3E' : '#E8D5A8'} roughness={1} />
      </mesh>
      {/* Yerleştirme modunda hedef halkası ipucu */}
      {yerlesimModu && (
        <mesh position={[0, 0.24, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[YERLESIM_YARICAP - 0.06, YERLESIM_YARICAP, 48]} />
          <meshBasicMaterial color="#38BDF8" transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  )
}

/* ── Bitki/dekor modelleri — primitiflerden ───────────────────────────────── */
function Bitki({ itemId, x, z, olcek, secili, koyu, faz, onClick }: {
  itemId: string; x: number; z: number; olcek: number
  secili: boolean; koyu: boolean; faz: number; onClick: () => void
}) {
  const grup = useRef<THREE.Group>(null)
  const { tur, evre } = itemModeli(itemId)

  // Rüzgâr salınımı (gövde grubu) + seçili nefes
  useFrame(({ clock }) => {
    const g = grup.current
    if (!g) return
    const t = clock.elapsedTime
    g.rotation.z = Math.sin(t * 0.9 + faz * 1.7) * 0.022
    const hedef = secili ? 1.08 + Math.sin(t * 4) * 0.03 : 1
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, hedef * olcek, 0.12))
  })

  const tikla = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick() }

  return (
    <group position={[x, 0.2, z]}>
      <group ref={grup} onClick={tikla}>
        {evre === 'fide' ? <Fide /> : <Model tur={tur} koyu={koyu} />}
      </group>
      {secili && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.5, 0.62, 32]} />
          <meshBasicMaterial color="#38BDF8" transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  )
}

function Fide() {
  return (
    <group>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.03, 0.045, 0.24, 6]} />
        <meshStandardMaterial color="#7A5C3E" />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.14, 8, 6]} />
        <meshStandardMaterial color="#5BBF7A" roughness={0.8} />
      </mesh>
      <mesh position={[0.1, 0.36, 0.04]} rotation={[0, 0, -0.5]}>
        <sphereGeometry args={[0.09, 8, 6]} />
        <meshStandardMaterial color="#7ACD93" roughness={0.8} />
      </mesh>
    </group>
  )
}

function Model({ tur, koyu }: { tur: string; koyu: boolean }) {
  switch (tur) {
    case 'sogut':
      return (
        <group>
          <Govde h={0.9} r={0.09} />
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2
            return (
              <mesh key={i} position={[Math.cos(a) * 0.3, 0.95 - (i % 2) * 0.12, Math.sin(a) * 0.3]} rotation={[0.35, a, 0]}>
                <coneGeometry args={[0.16, 0.7, 6]} />
                <meshStandardMaterial color="#6FA96B" roughness={0.85} />
              </mesh>
            )
          })}
          <mesh position={[0, 1.12, 0]}>
            <sphereGeometry args={[0.34, 10, 8]} />
            <meshStandardMaterial color="#84B87E" roughness={0.85} />
          </mesh>
        </group>
      )
    case 'akca_agac':
      return (
        <group>
          <Govde h={0.8} r={0.1} />
          <mesh position={[0, 1.15, 0]}>
            <sphereGeometry args={[0.52, 10, 8]} />
            <meshStandardMaterial color="#D97742" roughness={0.85} />
          </mesh>
          <mesh position={[0.3, 0.95, 0.15]}>
            <sphereGeometry args={[0.3, 9, 7]} />
            <meshStandardMaterial color="#E8925B" roughness={0.85} />
          </mesh>
        </group>
      )
    case 'mavi_cam':
      return (
        <group>
          <Govde h={0.5} r={0.09} />
          {[0.62, 0.98, 1.3].map((y, i) => (
            <mesh key={i} position={[0, y, 0]}>
              <coneGeometry args={[0.55 - i * 0.14, 0.55, 8]} />
              <meshStandardMaterial color={i % 2 ? '#3E7FA8' : '#4A94BF'} roughness={0.8} />
            </mesh>
          ))}
        </group>
      )
    case 'egri_agac':
      return (
        <group>
          <mesh position={[0.08, 0.4, 0]} rotation={[0, 0, -0.35]}>
            <cylinderGeometry args={[0.07, 0.11, 0.85, 7]} />
            <meshStandardMaterial color="#6E4F32" roughness={0.95} />
          </mesh>
          <mesh position={[0.34, 0.85, 0]}>
            <sphereGeometry args={[0.4, 9, 7]} />
            <meshStandardMaterial color="#79A85C" roughness={0.85} />
          </mesh>
        </group>
      )
    case 'dev_agac':
      return (
        <group>
          <Govde h={1.3} r={0.18} />
          <mesh position={[0, 1.75, 0]}>
            <sphereGeometry args={[0.75, 11, 9]} />
            <meshStandardMaterial color="#3E7D4E" roughness={0.85} />
          </mesh>
          <mesh position={[-0.45, 1.4, 0.2]}>
            <sphereGeometry args={[0.42, 9, 7]} />
            <meshStandardMaterial color="#4C9160" roughness={0.85} />
          </mesh>
          <mesh position={[0.5, 1.5, -0.15]}>
            <sphereGeometry args={[0.38, 9, 7]} />
            <meshStandardMaterial color="#57A06B" roughness={0.85} />
          </mesh>
        </group>
      )
    case 'burgu':
      return (
        <group>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <mesh key={i} position={[0, 0.12 + i * 0.2, 0]} rotation={[0, i * 0.55, 0]}>
              <boxGeometry args={[0.34 - i * 0.03, 0.16, 0.34 - i * 0.03]} />
              <meshStandardMaterial color={i % 2 ? '#8A6844' : '#77593A'} roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 1.45, 0]}>
            <sphereGeometry args={[0.32, 9, 7]} />
            <meshStandardMaterial color="#A3C167" roughness={0.85} />
          </mesh>
        </group>
      )
    case 'isik_agaci':
      return (
        <group>
          <Govde h={0.9} r={0.09} renk="#5E4A6B" />
          <mesh position={[0, 1.25, 0]}>
            <sphereGeometry args={[0.45, 10, 8]} />
            <meshStandardMaterial color="#B78FE0" emissive="#8B5CF6" emissiveIntensity={koyu ? 0.9 : 0.25} roughness={0.5} />
          </mesh>
          {koyu && <pointLight position={[0, 1.25, 0]} intensity={0.9} color="#A78BFA" distance={3.2} />}
        </group>
      )
    case 'parilti':
      return (
        <group>
          <Govde h={1} r={0.1} renk="#7A6A3A" />
          <mesh position={[0, 1.4, 0]}>
            <icosahedronGeometry args={[0.42, 0]} />
            <meshStandardMaterial color="#FCD34D" emissive="#F59E0B" emissiveIntensity={koyu ? 1.1 : 0.35} metalness={0.4} roughness={0.25} />
          </mesh>
          {koyu && <pointLight position={[0, 1.4, 0]} intensity={1.1} color="#FBBF24" distance={3.6} />}
        </group>
      )
    default:
      return <Dekor itemId={tur} />
  }
}

function Govde({ h, r, renk = '#6E4F32' }: { h: number; r: number; renk?: string }) {
  return (
    <mesh position={[0, h / 2, 0]}>
      <cylinderGeometry args={[r * 0.8, r, h, 7]} />
      <meshStandardMaterial color={renk} roughness={0.95} />
    </mesh>
  )
}

/* ── Dekorlar: mantar / totem / kameriye / ent ───────────────────────────── */
function Dekor({ itemId }: { itemId: string }) {
  if (itemId.startsWith('decor_mushroom')) {
    const kirmizi = itemId.includes('red')
    const buyuk = itemId.endsWith('_lg') ? 1.25 : itemId.endsWith('_sm') ? 0.6 : 0.9
    return (
      <group scale={buyuk}>
        <mesh position={[0, 0.14, 0]}>
          <cylinderGeometry args={[0.07, 0.09, 0.28, 7]} />
          <meshStandardMaterial color="#EFE6D4" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.32, 0]}>
          <sphereGeometry args={[0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={kirmizi ? '#D64545' : itemId.includes('beige') ? '#D8C6A5' : '#E8B84A'} roughness={0.75} />
        </mesh>
      </group>
    )
  }
  if (itemId.startsWith('decor_idol')) {
    return (
      <group>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[0.3, 0.9, 0.3]} />
          <meshStandardMaterial color="#8C8578" roughness={1} />
        </mesh>
        <mesh position={[0, 1.02, 0]}>
          <boxGeometry args={[0.4, 0.28, 0.34]} />
          <meshStandardMaterial color="#A39B8B" roughness={1} />
        </mesh>
      </group>
    )
  }
  if (itemId.startsWith('decor_gazebo')) {
    const b = itemId.endsWith('v2') ? 1.25 : 1
    return (
      <group scale={b}>
        {[[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]].map(([px, pz], i) => (
          <mesh key={i} position={[px, 0.45, pz]}>
            <cylinderGeometry args={[0.045, 0.045, 0.9, 6]} />
            <meshStandardMaterial color="#9C7B52" roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[0, 1.05, 0]}>
          <coneGeometry args={[0.78, 0.42, 4]} />
          <meshStandardMaterial color="#B05E4A" roughness={0.85} />
        </mesh>
      </group>
    )
  }
  // special_ent_*
  return (
    <group>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.14, 0.2, 1.4, 7]} />
        <meshStandardMaterial color="#5E4630" roughness={1} />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.4, 9, 7]} />
        <meshStandardMaterial color="#6E9E58" roughness={0.85} />
      </mesh>
      <mesh position={[-0.08, 1.28, 0.17]}>
        <sphereGeometry args={[0.035, 6, 5]} />
        <meshStandardMaterial color="#FCD34D" emissive="#F59E0B" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0.08, 1.28, 0.17]}>
        <sphereGeometry args={[0.035, 6, 5]} />
        <meshStandardMaterial color="#FCD34D" emissive="#F59E0B" emissiveIntensity={0.8} />
      </mesh>
    </group>
  )
}

/* ── Ateşböcekleri — yalnız gece ─────────────────────────────────────────── */
function Atesbocekleri() {
  const grup = useRef<THREE.Group>(null)
  const tohumlar = useMemo(
    () => Array.from({ length: 11 }, (_, i) => ({
      r: 1 + (i % 4),
      a: (i / 11) * Math.PI * 2,
      h: 0.7 + (i % 3) * 0.5,
      hiz: 0.3 + (i % 5) * 0.12,
    })),
    [],
  )
  useFrame(({ clock }) => {
    const g = grup.current
    if (!g) return
    const t = clock.elapsedTime
    g.children.forEach((c, i) => {
      const s = tohumlar[i]
      c.position.set(
        Math.cos(s.a + t * s.hiz * 0.4) * s.r,
        s.h + Math.sin(t * s.hiz * 2 + i) * 0.25,
        Math.sin(s.a + t * s.hiz * 0.4) * s.r,
      )
      const mat = (c as THREE.Mesh).material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.7 + Math.sin(t * 3 + i * 2) * 0.5
    })
  })
  return (
    <group ref={grup}>
      {tohumlar.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.035, 6, 5]} />
          <meshStandardMaterial color="#FDE68A" emissive="#FBBF24" emissiveIntensity={1} />
        </mesh>
      ))}
    </group>
  )
}
