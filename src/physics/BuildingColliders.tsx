import { useEffect, useRef } from 'react'
import { useRapier } from '@react-three/rapier'
import type { Map as MapboxMap } from 'mapbox-gl'
import { BuildingColliderManager, type BuildingColliderOptions } from './BuildingColliderManager'

type Props = Omit<BuildingColliderOptions, 'RAPIER' | 'world'> & {
  map: MapboxMap | null
  /** Called once the manager exists, so you can call setFocus(), on('add'), stats(), etc. */
  onReady?: (manager: BuildingColliderManager) => void
}

/**
 * Render inside <Physics>. Creates the manager for the current map + world, starts it, and disposes it
 * (removing every collider) on unmount. Options are read when the manager is created; change the `key`
 * prop to rebuild with new ones.
 */
export default function BuildingColliders({ map, onReady, ...opts }: Props) {
  const { rapier, world } = useRapier()
  const optsRef = useRef(opts)
  optsRef.current = opts
  const readyRef = useRef(onReady)
  readyRef.current = onReady

  useEffect(() => {
    if (!map) return
    const manager = new BuildingColliderManager(map, {
      ...optsRef.current,
      RAPIER: rapier,
      world: world as unknown as BuildingColliderOptions['world'],
    })
    manager.start()
    readyRef.current?.(manager)
    return () => manager.dispose()
  }, [map, rapier, world])

  return null
}
