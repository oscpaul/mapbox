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

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const ORIGIN: [number, number] = [-73.9857, 40.7484]

const project = ([lng, lat]: [number, number]): [number, number] => {
  const [x, , z] = coordsToVector3(
    { longitude: lng, latitude: lat },
    { longitude: ORIGIN[0], latitude: ORIGIN[1] },
  )
  return [x, z]
}

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
  if (!map) return
  const onClick = (e: any) => {
    const hit = map.queryRenderedFeatures(e.point, { layers: ['3d-buildings'] })[0]
    console.log('clicked id', hit?.id)
    if (hit?.id != null) console.log(managerRef.current?.pick(hit.id))
  }
  map.on('click', onClick)

  const t = setInterval(() => ('manager', managerRef.current?.stats()), 3000)

  return () => {
    map.off('click', onClick)
    clearInterval(t)
  }
}, [map])


  return (
    <Map
      
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
       <Canvas longitude={ORIGIN[0]} latitude={ORIGIN[1]} shadows> 
<Perf position="top-left" />

 {ready && (
    <Coordinates key={origin.join(',')} longitude={origin[0]} latitude={origin[1]}>

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
              onReady={(m) => {
console.log('onReady called')

                managerRef.current = m

                m.on('add', (h) => {
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

            <Character managerRef={managerRef} />
          </Physics>
        </Suspense>
  </Coordinates>
  )}
      </Canvas>
    </Map>
  )
}