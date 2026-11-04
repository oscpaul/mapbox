import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CapsuleCollider, type RapierRigidBody } from '@react-three/rapier'

type Props = {
  managerRef: React.RefObject<BuildingColliderManager | null>
  bodyRef: React.RefObject<RapierRigidBody | null>
  map: MapboxMap | null
  followCamera: boolean
}


export default function Character({ managerRef, bodyRef, map, followCamera }: Props) {

const body = useRef<RapierRigidBody>(null)
 const keys = useRef({ forward: false, back: false, left: false, right: false })







useEffect(() => {
  const set = (e: KeyboardEvent, down: boolean) => {
    if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.forward = down
    if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.back = down
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.left = down
    if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.right = down
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

  useFrame(() => {







const now = performance.now()
  if (now - lastLog.current > 1000) {
    lastLog.current = now
  //  console.log('Character frame', { hasBody: !!bodyRef.current, followCamera })
  }


 


  
    


  const b = bodyRef.current
frames.current++

  if (!b) return







const { forward, back, left, right } = keys.current

if (forward || back || left || right) {
 // console.log('keys', { forward, back, left, right }, 'followCamera', followCamera, 'bearing', map?.getBearing())
}


const f = (forward ? 1 : 0) - (back ? 1 : 0)
const r = (right ? 1 : 0) - (left ? 1 : 0)

// bearing: degrees clockwise from north. In this frame +x = east, +z = south.
const yaw = followCamera && map ? (map.getBearing() * Math.PI) / 180 : 0
const sin = Math.sin(yaw)
const cos = Math.cos(yaw)

const vx = f * sin + r * cos
const vz = -f * cos + r * sin
const len = Math.hypot(vx, vz) || 1
const speed = 4

b.setLinvel({ x: (vx / len) * speed, y: 0, z: (vz / len) * speed }, true)




  const p = b.translation()
  //if (forward || back || left || right) 
//console.log('pos', p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1))
  managerRef.current?.setFocus({ x: p.x, z: p.z })
 
  })

  return (
<RigidBody ref={bodyRef} position={[80, 0, 0]} colliders={false} enabledRotations={[false, false, false]}>

  <CapsuleCollider args={[0.5, 0.35]} position={[0, 0.85, 0]} />    

<mesh position={[0, 0.85, 0]} scale={5}>
  <capsuleGeometry args={[0.35, 1]} />
  <meshBasicMaterial color="red" />
</mesh>


</RigidBody>
              )
}