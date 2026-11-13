import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CapsuleCollider, type RapierRigidBody } from '@react-three/rapier'
import { useThree } from '@react-three/fiber'

import { useRapier } from '@react-three/rapier'

import * as THREE from 'three'   // add to imports


type Props = {
  managerRef: React.RefObject<BuildingColliderManager | null>
  bodyRef: React.RefObject<RapierRigidBody | null>
  map: MapboxMap | null
  followCamera: boolean
}


export default function Character({ managerRef, bodyRef, map, followCamera }: Props) {
const invalidate = useThree((s) => s.invalidate)
const body = useRef<RapierRigidBody>(null)
 const keys = useRef({ forward: false, back: false, left: false, right: false })


const { world } = useRapier()
useEffect(() => {
  const id = setInterval(() => {
  //  console.log('world bodies', world.bodies.len(), 'manager', managerRef.current?.stats().colliders)
  }, 2000)
  return () => clearInterval(id)
}, [world])




useEffect(() => {
  const set = (e: KeyboardEvent, down: boolean) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.forward = down
    if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.back = down
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.left = down
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.right = down
    invalidate() // request a frame when a key changes
    map?.triggerRepaint() // wake the render loop
  }
  const down = (e: KeyboardEvent) => set(e, true)
  const up = (e: KeyboardEvent) => set(e, false)
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
  }
}, [map])

const frames = useRef(0)
const lastLog = useRef(performance.now())






const gl = useThree((s) => s.gl)


useEffect(() => {
  const id = setInterval(() => {
  //  console.log({
  //    geometries: gl.info.memory.geometries,
  //    textures: gl.info.memory.textures,
  //    drawCalls: gl.info.render.calls,
   //   triangles: gl.info.render.triangles,
   // })
  }, 2000)
  return () => clearInterval(id)
}, [gl])




const wasMoving = useRef(false)

useFrame(() => {
  const b = bodyRef.current
  if (!b) return // guard first

  const { forward, back, left, right } = keys.current

  if (forward) {
    const t = b.translation()
 const lv = b.linvel()
  //console.log('pos', t.x.toFixed(1), t.z.toFixed(1), 'linvel z', lv.z.toFixed(1))
  }
  const f = (forward ? 1 : 0) - (back ? 1 : 0)
  const r = (right ? 1 : 0) - (left ? 1 : 0)

  const yaw = followCamera && map ? (map.getBearing() * Math.PI) / 180 : 0
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)

  const vx = f * sin + r * cos
  const vz = -f * cos + r * sin
  const len = Math.hypot(vx, vz) || 1
  const speed = 4

  const moving = forward || back || left || right

if (moving) {
  b.setLinvel({ x: (vx / len) * speed, y: b.linvel().y, z: (vz / len) * speed }, true)
  invalidate()
  map?.triggerRepaint()
} else if (wasMoving.current) {
  // just released the keys: stop horizontal motion once, don't force awake
  b.setLinvel({ x: 0, y: b.linvel().y, z: 0 }, false)
}
wasMoving.current = moving

  const p = b.translation()
  managerRef.current?.setFocus({ x: p.x, z: p.z })





const m = meshRef.current
if (m && moving) {
  m.getWorldPosition(tmp.current)
  const f = (v: THREE.Vector3 | { x: number; y: number; z: number }) =>
    [v.x, v.y, v.z].map((n) => +n.toFixed(3))
 // console.log({
  //  rapier: f(b.translation()),            // physics truth
  //  parentPos: f(m.parent!.position),      // the object Rapier writes to
  //  meshLocal: f(m.position),              // never changes
  //  meshWorld: f(tmp.current),
  //})
}

})


const meshRef = useRef<THREE.Mesh>(null)
const tmp = useRef(new THREE.Vector3())






return (
  <>
    <RigidBody ref={bodyRef} position={[80, 0, 0]} colliders={false} enabledRotations={[false, false, false]}>
      <CapsuleCollider args={[0.5, 0.35]} position={[0, 0.85, 0]} />

      {/* original: child of the RigidBody */}
      <mesh ref={meshRef} position={[0, 0.85, 0]} scale={5}>
        <capsuleGeometry args={[0.35, 1]} />
        <meshBasicMaterial color="red" />
      </mesh>
    </RigidBody>

  
  </>
)



}