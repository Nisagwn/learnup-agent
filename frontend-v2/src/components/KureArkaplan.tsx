import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { cn } from '../lib/cn'

/*
 * KÜRE ARKAPLAN — Vanta GLOBE görünümünün React Three Fiber ile birebir yeniden yorumu.
 * Vanta.js kütüphanesi three r134'e bağlı (THREE.Geometry/Face3); depo three@0.185 kullanıyor,
 * bu yüzden kütüphaneyi çekmek yerine efekti doğrudan R3F ile çiziyoruz — ekstra bağımlılık YOK,
 * three zaten `vendor-three` chunk'ında, `Bahce3D`/`Login3D` ile aynı desen.
 *
 * Ekrandaki Vanta yapılandırması varsayılan olarak gömülü:
 *   VANTA.GLOBE({ color: 0x020402, color2: 0xe0ff70, backgroundColor: 0x87c591, size: 1.5 })
 * Bütün renkler/yoğunluk prop olarak dışa açık → yeniden kullanılabilir.
 *
 * Üretim notları:
 * · Arkaplan güvenli: sarmalayıcı `pointer-events: none` + `aria-hidden` → içeriği/formları engellemez.
 *   Fare etkileşimi window dinleyicisiyle alınır, canvas tıklamayı yutmaz.
 * · WebGL yoksa yalnız düz `backgroundColor` çizilir (Canvas hiç kurulmaz) — güvenli düşüş.
 * · `prefers-reduced-motion: reduce` → dönüş/parlama durur, küre statik kalır.
 * · dpr [1, 1.75] sınırlı, canvas `alpha` — düz zemin div'i arkada kalsın.
 *
 * Lazy önerilir: `const KureArkaplan = lazy(() => import('../components/KureArkaplan'))`
 * (three yalnız bu ekranın chunk'ında yüklensin).
 */

export interface KureArkaplanProps {
  /** Küre ağı + noktaları (Vanta `color`). Varsayılan #020402 (0x020402). */
  color?: string
  /** Canlı vurgu çizgileri (Vanta `color2`). Varsayılan #e0ff70. */
  color2?: string
  /** Düz zemin rengi (Vanta `backgroundColor`). Varsayılan #87c591. */
  backgroundColor?: string
  /** Küre ölçeği (Vanta `size`). Varsayılan 1.5. */
  size?: number
  /** Ağ yoğunluğu — ikosahedron alt bölünme derinliği (Vanta "globe density"). 1–4, varsayılan 2. */
  density?: number
  /** Fareyle eğilme (Vanta `mouseControls`). Varsayılan true. */
  mouseControls?: boolean
  /** Sarmalayıcıya eklenir; konumlandırmayı burada değiştir (varsayılan tam ekran sabit fon). */
  className?: string
  style?: React.CSSProperties
}

const SPIN = 0.12 // rad/sn otomatik dönüş
const TABAN_EGIM = -0.32 // kuzey kutbu hafif izleyiciye dönük

function webglVar(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')))
  } catch {
    return false
  }
}

export default function KureArkaplan({
  color = '#020402',
  color2 = '#e0ff70',
  backgroundColor = '#87c591',
  size = 1.5,
  density = 2,
  mouseControls = true,
  className,
  style,
}: KureArkaplanProps) {
  const [webgl] = useState(webglVar)

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none fixed inset-0 -z-10 overflow-hidden', className)}
      style={{ backgroundColor, ...style }}
    >
      {webgl && (
        <Canvas
          dpr={[1, 1.75]}
          camera={{ position: [0, 0, 3.3], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
          style={{ pointerEvents: 'none' }}
        >
          <Kure color={color} color2={color2} size={size} density={density} mouseControls={mouseControls} />
        </Canvas>
      )}
    </div>
  )
}

function Kure({
  color,
  color2,
  size,
  density,
  mouseControls,
}: Required<Pick<KureArkaplanProps, 'color' | 'color2' | 'size' | 'density' | 'mouseControls'>>) {
  const grup = useRef<THREE.Group>(null)
  const vurguMat = useRef<THREE.LineBasicMaterial>(null)

  // Dönüş + fare durumu (render'ı tetiklemeden, useFrame içinde okunur)
  const spin = useRef(0)
  const egimX = useRef(TABAN_EGIM)
  const egimY = useRef(0)
  const fare = useRef({ x: 0, y: 0 })
  const azalt = useRef(false)

  // Ağ (ikosahedron teli), köşe noktaları ve color2 vurgu çizgileri — density'e bağlı, bir kez üretilir.
  const { agGeo, noktaGeo, vurguGeo } = useMemo(() => {
    const derinlik = Math.max(1, Math.min(4, Math.round(density)))
    const taban = new THREE.IcosahedronGeometry(1, derinlik)

    // Üçgen ağın tüm kenarları (Vanta'nın "net" görünümü)
    const agGeo = new THREE.WireframeGeometry(taban)

    // Köşe noktaları — ikosahedron non-indexed olduğundan konuma göre tekilleştir
    const pos = taban.attributes.position as THREE.BufferAttribute
    const gorulen = new Map<string, [number, number, number]>()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      gorulen.set(`${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`, [x, y, z])
    }
    const noktaGeo = new THREE.BufferGeometry()
    noktaGeo.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(gorulen.values()).flat(), 3))

    // color2 vurguları: fibonacci küresinde teğet kısa çizgiler — Vanta'nın dağınık parlak tikleri
    const N = 46
    const cizgiler: number[] = []
    const teğet = new THREE.Vector3()
    const yukari = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      const aci = i * 2.399963 // altın açı → kümelenme olmaz
      const p = new THREE.Vector3(Math.cos(aci) * r, y, Math.sin(aci) * r)
      teğet.crossVectors(p, yukari)
      if (teğet.lengthSq() < 1e-4) teğet.set(1, 0, 0)
      teğet.normalize()
      const a = p.clone().multiplyScalar(1.004)
      const b = a.clone().addScaledVector(teğet, 0.14)
      cizgiler.push(a.x, a.y, a.z, b.x, b.y, b.z)
    }
    const vurguGeo = new THREE.BufferGeometry()
    vurguGeo.setAttribute('position', new THREE.Float32BufferAttribute(cizgiler, 3))

    taban.dispose()
    return { agGeo, noktaGeo, vurguGeo }
  }, [density])

  // Geometrileri sökümde temizle (primitive nesneleri elle kurduk)
  useEffect(() => () => {
    agGeo.dispose()
    noktaGeo.dispose()
    vurguGeo.dispose()
  }, [agGeo, noktaGeo, vurguGeo])

  // Hareket-azalt tercihi + fare dinleyicisi (window → canvas tıklamayı yutmaz)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    azalt.current = mq.matches
    const onMq = () => { azalt.current = mq.matches }
    mq.addEventListener('change', onMq)

    let onMove: ((e: PointerEvent) => void) | undefined
    if (mouseControls) {
      onMove = (e: PointerEvent) => {
        fare.current.x = (e.clientX / window.innerWidth) * 2 - 1
        fare.current.y = (e.clientY / window.innerHeight) * 2 - 1
      }
      window.addEventListener('pointermove', onMove, { passive: true })
    }
    return () => {
      mq.removeEventListener('change', onMq)
      if (onMove) window.removeEventListener('pointermove', onMove)
    }
  }, [mouseControls])

  useFrame((_, delta) => {
    const g = grup.current
    if (!g) return
    const d = Math.min(delta, 0.05) // sekme geri geldiğinde sıçramayı önle

    if (azalt.current) {
      g.rotation.set(TABAN_EGIM, 0, 0)
      if (vurguMat.current) vurguMat.current.opacity = 0.7
      return
    }

    spin.current += d * SPIN
    const hedefY = fare.current.x * 0.45
    const hedefX = TABAN_EGIM - fare.current.y * 0.28
    egimY.current = THREE.MathUtils.damp(egimY.current, hedefY, 3, d)
    egimX.current = THREE.MathUtils.damp(egimX.current, hedefX, 3, d)

    g.rotation.y = spin.current + egimY.current
    g.rotation.x = egimX.current

    if (vurguMat.current) {
      // Yumuşak parlama — dağınık color2 tikleri "yaşasın"
      const t = spin.current * 6
      vurguMat.current.opacity = 0.55 + Math.sin(t) * 0.28
    }
  })

  return (
    <group ref={grup} scale={size} rotation={[TABAN_EGIM, 0, 0]}>
      {/* Üçgen ağ (color) */}
      <lineSegments>
        <primitive object={agGeo} attach="geometry" />
        <lineBasicMaterial color={color} transparent opacity={0.82} />
      </lineSegments>

      {/* Köşe noktaları (color) */}
      <points>
        <primitive object={noktaGeo} attach="geometry" />
        <pointsMaterial color={color} size={0.026} sizeAttenuation transparent opacity={0.9} />
      </points>

      {/* Vurgu tikleri (color2) — parlar */}
      <lineSegments>
        <primitive object={vurguGeo} attach="geometry" />
        <lineBasicMaterial ref={vurguMat} color={color2} transparent opacity={0.7} />
      </lineSegments>
    </group>
  )
}
