import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CapsuleCollider, type RapierRigidBody } from '@react-three/rapier'


export default function Character({
  managerRef,
}: {
  managerRef: React.RefObject<BuildingColliderManager | null>
}) {

const body = useRef<RapierRigidBody>(null)
 const keys = useRef({ forward: false, back: false, left: false, right: false })


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

  const dx = (right ? 1 : 0) - (left ? 1 : 0)
const dz = (back ? 1 : 0) - (forward ? 1 : 0)
 b.setLinvel({ x: (dx / 1) * 4, y: 0, z: (dz / 1) * 4 }, true)

    const p = b.translation()
    managerRef.current?.setFocus({ x: p.x, z: p.z })
 
  })

  return (
<RigidBody
 ref={body}
  position={[80, 0, 0]}              
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