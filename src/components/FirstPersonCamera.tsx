import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import mapboxgl from 'mapbox-gl'
import type { RapierRigidBody } from '@react-three/rapier'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

type Props = {
  map: mapboxgl.Map | null
  body: React.RefObject<RapierRigidBody | null>
  origin: [number, number]
  active: boolean
  eyeHeight?: number
  targetPitch?: number
  duration?: number
  lookSpeed?: number // degrees per pixel
}

export default function FirstPersonCamera({
  map,
  body,
  origin,
  active,
  eyeHeight = 1.7,
  targetPitch = 80,
  duration = 1.0,
  lookSpeed = 0.2,
}: Props) {
  const look = useRef({ bearing: 0, pitch: 60 })
  const transition = useRef<{
    t: number
    startPos: mapboxgl.MercatorCoordinate
    startPitch: number
  } | null>(null)

  // Enter / exit
  useEffect(() => {
    if (!map) return
    const o = mapboxgl.MercatorCoordinate.fromLngLat(origin, 0)
    const s = o.meterInMercatorCoordinateUnits()

    if (active) {
      const c = mapboxgl.MercatorCoordinate.fromLngLat(map.getCenter(), 0)
      const b = body.current
      if (b) {
        b.setTranslation({ x: (c.x - o.x) / s, y: 0.5, z: (c.y - o.y) / s }, true)
        b.setLinvel({ x: 0, y: 0, z: 0 }, true)
      }

      look.current = { bearing: map.getBearing(), pitch: map.getPitch() }
      transition.current = {
        t: 0,
        startPos: map.getFreeCameraOptions().position!,
        startPitch: map.getPitch(),
      }

      map.scrollZoom.disable()
      map.doubleClickZoom.disable()
      map.touchZoomRotate.disable()
      map.dragPan.disable()
      map.dragRotate.disable() // we handle looking ourselves
    } else {
      transition.current = null
      map.scrollZoom.enable()
      map.doubleClickZoom.enable()
      map.touchZoomRotate.enable()
      map.dragPan.enable()
      map.dragRotate.enable()

      const t = body.current?.translation()
      if (t) {
        const ll = new mapboxgl.MercatorCoordinate(o.x + t.x * s, o.y + t.z * s, 0).toLngLat()
        map.easeTo({
          center: ll,
          zoom: 17.5,
          pitch: 55,
          bearing: look.current.bearing,
          duration: 800,
        })
      }
    }
    map.triggerRepaint()
  }, [active, map]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mouse look: left-drag on the canvas
  useEffect(() => {
    if (!map || !active) return
    const canvas = map.getCanvas()
    let dragging = false

    const down = (e: MouseEvent) => {
      if (e.button === 0) dragging = true
    }
    const up = () => {
      dragging = false
    }
    const move = (e: MouseEvent) => {
      if (!dragging) return
      look.current.bearing += e.movementX * lookSpeed
      // mouse up = look up (toward the horizon), mouse down = look down
      look.current.pitch = clamp(look.current.pitch - e.movementY * lookSpeed, 20, 85)
      transition.current = null // user took over, stop forcing pitch
    }

    canvas.addEventListener('mousedown', down)
    window.addEventListener('mouseup', up)
    window.addEventListener('mousemove', move)
    return () => {
      canvas.removeEventListener('mousedown', down)
      window.removeEventListener('mouseup', up)
      window.removeEventListener('mousemove', move)
    }
  }, [map, active, lookSpeed])

  useFrame((_, dt) => {
    if (!active || !map) return
    const t = body.current?.translation()
    if (!t) return

    map.triggerRepaint()

    const o = mapboxgl.MercatorCoordinate.fromLngLat(origin, 0)
    const s = o.meterInMercatorCoordinateUnits()
    const target = new mapboxgl.MercatorCoordinate(
      o.x + t.x * s,
      o.y + t.z * s,
      (t.y + eyeHeight) * s,
    )

    const cam = map.getFreeCameraOptions()
    const tr = transition.current

    if (tr) {
      tr.t = Math.min(1, tr.t + dt / duration)
      const k = ease(tr.t)
      cam.position = new mapboxgl.MercatorCoordinate(
        lerp(tr.startPos.x, target.x, k),
        lerp(tr.startPos.y, target.y, k),
        lerp(tr.startPos.z, target.z, k),
      )
      look.current.pitch = lerp(tr.startPitch, targetPitch, k)
      if (tr.t >= 1) transition.current = null
    } else {
      cam.position = target
    }

    cam.setPitchBearing(look.current.pitch, look.current.bearing)
    map.setFreeCameraOptions(cam)
  })

  return null
}