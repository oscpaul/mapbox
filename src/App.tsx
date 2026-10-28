import Map, { NavigationControl } from 'react-map-gl/mapbox'
import Compass from './Compass'

import { Suspense, useState,  useRef, useEffect  } from 'react'                          // NEW: Suspense
import type { Map as MapboxMap } from 'mapbox-gl'                   // NEW
import { Canvas, coordsToVector3 } from 'react-three-map'           // NEW
import {RigidBody, Physics, CuboidCollider } from '@react-three/rapier'       // NEW
import BuildingColliders from './physics/BuildingColliders'         // NEW

import type { BuildingColliderManager } from './BuildingColliderManager'
import Character from './components/Character'

import { KeyboardControls } from '@react-three/drei'

import { Perf } from 'r3f-perf'


const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const ORIGIN: [number, number] = [-73.9857, 40.7484]
// NEW: same projection react-three-map uses, so colliders line up with the Canvas
const project = ([lng, lat]: [number, number]): [number, number] => {
  const [x, , z] = coordsToVector3(
    { longitude: lng, latitude: lat },
    { longitude: ORIGIN[0], latitude: ORIGIN[1] },
  )
  return [x, z]
}



// NEW: the visible 3D buildings (dark-v11 doesn't include them)
function add3DBuildings(map: MapboxMap) {
  if (map.getLayer('3d-buildings')) return
  const labelLayerId = map
    .getStyle()
    ?.layers.find((l) => l.type === 'symbol' && l.layout?.['text-field'])?.id

  map.addLayer(
    {
      id: '3d-buildings',
      source: 'composite',
      'source-layer': 'building',
      filter: ['==', 'extrude', 'true'],
      type: 'fill-extrusion',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': '#2a2d36',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'min_height'],
        'fill-extrusion-opacity': 0.9,
      },
    },
    labelLayerId,
  )
}



export default function App() {


  const managerRef = useRef<BuildingColliderManager | null>(null)   // <- here

const [map, setMap] = useState<MapboxMap | null>(null)

const [shown, setShown] = useState<
  { key: string; x: number; z: number; vertices: Float32Array; indices: Uint32Array }[]
>([])


useEffect(() => {
  //console.log('EFFECT RAN, map is', map)
  if (!map) return
const onClick = (e: any) => {
  const hit = map.queryRenderedFeatures(


e.point, 

{ layers: ['3d-buildings'] })[0]
  //console.log('hit id', hit?.id)






console.log({
  id: hit?.id,
  geometry: hit?.geometry?.type,
  properties: hit?.properties,
});

  if (hit?.id != null) console.log(managerRef.current?.pick(hit.id))
}
  map.on('click', onClick)
  return () => { map.off('click', onClick) }
}, [map])

  return (
    <Map
      mapboxAccessToken={TOKEN}
      initialViewState={{
         longitude: ORIGIN[0],                                       // CHANGED: uses ORIGIN
        latitude: ORIGIN[1],
        zoom: 17.5,
        pitch: 55,
        bearing: -20,
      }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      style={{ position: 'absolute', inset: 0 }}
        onLoad={(e) => {
        add3DBuildings(e.target)
setMap(e.target)
}}
    >
      <NavigationControl position="top-right" visualizePitch />
<Compass map={map} />



 <Canvas longitude={ORIGIN[0]} latitude={ORIGIN[1]}>
 <KeyboardControls
    map={[
      { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
      { name: 'back', keys: ['ArrowDown', 'KeyS'] },
      { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
      { name: 'right', keys: ['ArrowRight', 'KeyD'] },
    ]}
  >
  <Perf position="top-left" />
        
<Suspense fallback={null}>
          <Physics gravity={[0, -9.81, 0]} debug>
<RigidBody type="fixed">
  <CuboidCollider args={[2000, 0.5, 2000]} position={[0, -0.5, 0]} />
</RigidBody>

<BuildingColliders
  map={map}
  origin={ORIGIN}
  project={project}
  radius={250}
  onReady={(m) => { managerRef.current = m 


  m.on('add', (h) => {
    const t = h.body.translation()
    setShown((s) => [
      ...s,
      { key: h.key, x: t.x, z: t.z, vertices: h.collider.vertices(), indices: h.collider.indices()! },
    ])
  })


m.on('remove', (h) => {
    setShown((s) => s.filter((b) => b.key !== h.key))
  })

}}
/>

{shown.map((b) => (
  <mesh key={b.key} position={[b.x, 0, b.z]}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[b.vertices, 3]} />
      <bufferAttribute attach="index" args={[b.indices, 1]} />
    </bufferGeometry>
    <meshBasicMaterial color="lime" wireframe />
  </mesh>
))}
{ <Character managerRef={managerRef} map={map}/> }
          </Physics>
        </Suspense>
  </KeyboardControls>
      </Canvas>
</Map>
  )
}