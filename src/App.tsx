import Map from 'react-map-gl/mapbox'
import { Suspense, useRef, useState, useEffect,useCallback } from 'react'
import { Canvas, Coordinates, coordsToVector3 } from 'react-three-map'
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier'
import type { Map as MapboxMap } from 'mapbox-gl'
import BuildingColliders from './physics/BuildingColliders'
import type { BuildingColliderManager } from './physics/BuildingColliderManager'
import Character from './components/Character'
import { Perf } from 'r3f-perf'
import Compass from './Compass'
import FirstPersonCamera from './components/FirstPersonCamera'

import { useFrame } from '@react-three/fiber'


const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const ORIGIN: [number, number] = [-73.9857, 40.7484]



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
      minzoom: 15,
      paint: {
        'fill-extrusion-color': '#e8e4dc',
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': ['get', 'min_height'],
        'fill-extrusion-opacity': 0.9,
      },
    },
    labelLayerId,
  )
}

function addSky(map: MapboxMap) {
  if (map.getLayer('sky')) return
  map.addLayer({
    id: 'sky',
    type: 'sky',
    paint: {
      'sky-type': 'atmosphere',
      'sky-atmosphere-sun': [0.0, 70.0], // [azimuth, altitude] in degrees
      'sky-atmosphere-sun-intensity': 10,
    },
  })
}


function addLights(map: MapboxMap) {
  map.setLights([
    {
      id: 'sun',
      type: 'directional',
      properties: {
        direction: [210, 35],      // [azimuth, polar angle]; lower polar = higher sun
        color: '#fff1d6',
        intensity: 1.0,            // max strength
        'cast-shadows': true,
        'shadow-intensity': 0.1,
      },
    },
    {
      id: 'ambient',
      type: 'ambient',
      properties: { color: '#8fa8d6', intensity: 0.25 }, // lower = more contrast
    },
  ])
}
export default function App() {
  const managerRef = useRef<BuildingColliderManager | null>(null)
  const [map, setMap] = useState<MapboxMap | null>(null)

  const [shown, setShown] = useState<
    { key: string; x: number; z: number; vertices: Float32Array; indices: Uint32Array }[]
  >([])

  const [origin, setOrigin] = useState<[number, number]>(ORIGIN)
  const [ready, setReady] = useState(true)
const project_ = useCallback(([lng, lat]: [number, number]): [number, number] => {
    const [x, , z] = coordsToVector3(
      { longitude: lng, latitude: lat },
      { longitude: origin[0], latitude: origin[1] },
    )
    return [x, z]
  }, [origin])


const characterBodyRef = useRef<RapierRigidBody | null>(null)



const [firstPerson, setFirstPerson] = useState(false)

// press V to toggle
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyV' && !(e.target instanceof HTMLInputElement)) {
      setFirstPerson((v) => !v)
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [])

  const jumpTo = (lng: number, lat: number) => {
  if (!map) return
  console.log('1 jump start')
  managerRef.current?.dispose()
  managerRef.current = null
  setShown([])
  setReady(false)
  map.jumpTo({ center: [lng, lat], zoom: 17.5, pitch: 55 })
  map.once('idle', () => {
    console.log('2 idle fired, remounting')
    setOrigin([lng, lat])
    setReady(true)
  })
}


useEffect(() => {
  const t = setTimeout(() => console.log('App ref', characterBodyRef.current), 2000)
  return () => clearTimeout(t)
}, [])


useEffect(() => {
  if (!map) return

  // --- counters + spy ---
  let renders = 0
  let calls = 0
  let traces = 0
  const original = map.triggerRepaint.bind(map)

  map.triggerRepaint = () => {
    calls++
    if (traces < 6) {
      traces++
      console.log('caller:', new Error().stack)
    }
    original()
  }

  const onRender = () => {
    renders++
  }
  map.on('render', onRender)

  const id = setInterval(() => {
    console.log(`renders/sec: ${renders}  triggerRepaint/sec: ${calls}`)
    renders = 0
    calls = 0
  }, 1000)

  // --- your click handler ---
  const onClick = (e: any) => {
    const hit = map.queryRenderedFeatures(e.point, { layers: ['3d-buildings'] })[0]
    console.log('click', 'hit?', !!hit, 'id', hit?.id, 'manager?', !!managerRef.current)
    if (hit?.id != null) console.log(managerRef.current?.pick(hit.id))
  }
  map.on('click', onClick)

  // --- cleanup ---
  return () => {
    clearInterval(id)
    map.off('render', onRender)
    map.off('click', onClick)
    map.triggerRepaint = original
  }
}, [map])



const renderCount = useRef(0)
renderCount.current++
const addCount = useRef(0)

const removeCount = useRef(0)
const prev = useRef<any>({})

const now = { map, shown, origin, ready, firstPerson }
const changed = Object.keys(now).filter((k) => (now as any)[k] !== prev.current[k])
if (changed.length) console.log('App rendered, changed:', changed)
prev.current = now

useEffect(() => {
  let lastR = 0, lastA = 0
  const id = setInterval(() => {
    const r = renderCount.current, a = addCount.current
    if (r !== lastR || a !== lastA) {
      console.log(`last second: ${a - lastA} adds, ${removeCount.current} removes total, ${r - lastR} renders`)
    }
    lastR = r
    lastA = a
  }, 1000)
  return () => clearInterval(id)
}, [])



function Probe() {
  useFrame(() => console.log('probe frame'))
  return null
}

const PROFILE = false // true = constant frames + Perf


  return (
    <Map maxPitch={85}
      
      mapboxAccessToken={TOKEN}
      initialViewState={{ longitude: ORIGIN[0], latitude: ORIGIN[1], zoom: 17.5, pitch: 55 }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      style={{ position: 'absolute', inset: 0 }}
      onLoad={(e) => {
addLights(e.target)
addSky(e.target)
        add3DBuildings(e.target)
        setMap(e.target)
      }}
    >


<button
  onClick={() => setFirstPerson((v) => !v)}
  style={{ position: 'absolute', top: 40, right: 10, zIndex: 1 }}
>
  {firstPerson ? 'Exit first person' : 'First person'}
</button>


{ /* <Compass map={map} /> */}
  <input
        placeholder="lng, lat"
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          const [lng, lat] = e.currentTarget.value.split(',').map(Number)
          if (!isNaN(lng) && !isNaN(lat)) jumpTo(lng, lat)
        }}
        style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}
      />
<Canvas
  longitude={ORIGIN[0]}
  latitude={ORIGIN[1]}
  shadows
  frameloop={PROFILE ? 'always' : 'demand'}
>
  {PROFILE && <Perf position="top-left" />}
 {ready && (
    <Coordinates key={origin.join(',')} longitude={origin[0]} latitude={origin[1]}>

        <Suspense fallback={null}>
          <Physics gravity={[0, -9.81, 0]} debug={false} updateLoop="independent">
            <RigidBody type="fixed">
              <CuboidCollider args={[2000, 0.5, 2000]} position={[0, -0.5, 0]} />
            </RigidBody>

            <BuildingColliders
              map={map}
              origin={ORIGIN}
              project={project_}
              radius={250}
              onReady={(m) => {
console.log('onReady called')

                managerRef.current = m

                m.on('add', (h) => {
  addCount.current++

                  const t = h.body.translation()
                  setShown((s) => [
                    ...s,
                    {
                      key: h.key,
                      x: t.x,
                      z: t.z,
                      vertices: h.collider.vertices(),
                      indices: h.collider.indices()!,
                    },
                  ])
  //console.log('added', h.key, 'height', h.height, 'triangles', h.triangles, 'at', h.body.translation())

                })

                m.on('remove', (h) => {
  removeCount.current++

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

<Character
  managerRef={managerRef}
  bodyRef={characterBodyRef}
  map={map}
  followCamera={firstPerson}
/>

<FirstPersonCamera map={map} body={characterBodyRef} origin={origin} active={firstPerson} debug />

          </Physics>
        </Suspense>
  </Coordinates>
  )}
      </Canvas>
    </Map>
  )
}