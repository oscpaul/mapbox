import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CapsuleCollider, type RapierRigidBody } from '@react-three/rapier'
import { useKeyboardControls } from '@react-three/drei'
import type { BuildingColliderManager } from '../BuildingColliderManager'


const ORIGIN: [number, number] = [-73.9857, 40.7484]
const M_LAT = 111_320
const M_LNG = 111_320 * Math.cos((ORIGIN[1] * Math.PI) / 180)
const toLngLat = (x: number, z: number): [number, number] => [
  ORIGIN[0] + x / M_LNG,
  ORIGIN[1] - z / M_LAT,
]

export default function Character({ 
managerRef,   map,}: {
 managerRef: React.RefObject<BuildingColliderManager | null>
  map: MapboxMap | null

 }) {


  const body = useRef<RapierRigidBody>(null)
 const keys = useRef({ forward: false, back: false, left: false, right: false })

const last = useRef([0, 0])

useEffect(() => {
  const set = (e: KeyboardEvent, down: boolean) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.forward = down
    if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.back = down
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.left = down
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.right = down
  }
  const down = (e: KeyboardEvent) => set(e, true)
  const up = (e: KeyboardEvent) => set(e, false)
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
  }
}, [])
  useFrame(() => {
    const b = body.current
    if (!b) return

const { forward, back, left, right } = keys.current
  
 

    const speed = 4
    const dx = (right ? 1 : 0) - (left ? 1 : 0)
    const dz = (back ? 1 : 0) - (forward ? 1 : 0)
    const len = Math.hypot(dx, dz) || 1
    const v = b.linvel()
    b.setLinvel({ x: (dx / len) * speed, y: v.y, z: (dz / len) * speed }, true)

    const p = b.translation()
    managerRef.current?.setFocus({ x: p.x, z: p.z })
 if (Math.abs(p.x - last.current[0]) > 0.5 || Math.abs(p.z - last.current[1]) > 0.5) {
     last.current = [p.x, p.z]
}
  })

  return (
<RigidBody
  ref={body}
 position={[80, 0, 0]}              
  enabledRotations={[false, false, false]}   
  colliders={false}
>
  <CapsuleCollider args={[0.5, 0.35]} position={[0, 0.85, 0]} />    


<mesh position={[0, 0.85, 0]} scale={5}>
  <capsuleGeometry args={[0.35, 1]} />
  <meshBasicMaterial color="red" />
</mesh>


</RigidBody>
              )
}