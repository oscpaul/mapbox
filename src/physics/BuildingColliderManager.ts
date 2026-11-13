import type { Map as MapboxMap } from 'mapbox-gl'
import type * as RapierNS from '@dimforge/rapier3d-compat'
import { extrudePolygon, featureKey, type Ring, type ExtrudedMesh } from './buildingGeometry'

export type RapierModule = typeof RapierNS
export type LngLat = [number, number]

export interface BuildingHandle {
  /** Dedupe key (feature id + geometry hash). */
  readonly key: string
  /** Mapbox feature id, if the tile had one. */
  readonly featureId: string | number | null
  readonly body: RapierNS.RigidBody
  readonly collider: RapierNS.Collider
  /** Footprint bounds in local metres. */
  readonly bounds: Bounds
  readonly height: number
  readonly base: number
  readonly triangles: number
readonly mesh: ExtrudedMesh
}

export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface BuildingColliderOptions {
  RAPIER: RapierModule
  /** Raw Rapier world. */
  world: RapierNS.World
  /** [lng, lat] of local (0, 0). Must match your three.js scene origin. */
  origin: LngLat
  /** lng/lat -> local [x, z] metres. Defaults to an equirectangular approximation around `origin`. */
  project?: (p: LngLat) => [number, number]
  /** Create colliders for buildings within this many metres of the focus. Default 250. */
  radius?: number
  /** Remove colliders beyond this distance. Keep > radius to avoid thrash. Default radius * 1.3. */
  releaseRadius?: number
  /** Hard cap on live colliders. Default 1500. */
  maxColliders?: number
  /** Max colliders created per pass, nearest first, so streaming in doesn't hitch. Default 120. */
  maxAddsPerPass?: number
  /** Coalesces map events into one pass per this many ms. Default 150. */
  debounceMs?: number
  sourceId?: string
  sourceLayer?: string
}

export type BuildingEvent = 'add' | 'remove'
type Listener = (handle: BuildingHandle) => void

interface SourceFeature {
  id?: string | number
  properties: Record<string, unknown> | null
  geometry: { type: string; coordinates: unknown }
}

interface Candidate {
  key: string
  featureId: string | number | null
  polygon: number[][][]
  height: number
  base: number
  bounds: Bounds
  d2: number
}

function equirect(origin: LngLat): (p: LngLat) => [number, number] {
  const mLat = 111_320
  const mLng = 111_320 * Math.cos((origin[1] * Math.PI) / 180)
  return ([lng, lat]) => [(lng - origin[0]) * mLng, -(lat - origin[1]) * mLat]
}

function toPolygons(g: SourceFeature['geometry']): number[][][][] {
  if (g.type === 'Polygon') return [g.coordinates as number[][][]]
  if (g.type === 'MultiPolygon') return g.coordinates as number[][][][]
  return []
}

/** Squared distance from a point to a rectangle (0 if inside). */
function dist2(b: Bounds, x: number, z: number): number {
  const dx = Math.max(b.minX - x, 0, x - b.maxX)
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ)
  return dx * dx + dz * dz
}

/**
 * Keeps a set of fixed Rapier trimesh colliders in sync with the Mapbox building tiles around a focus point.
 *
 * Lifecycle:
 *   start()  -> listens to map 'idle'/'moveend', runs a pass
 *   a pass   -> releases colliders beyond releaseRadius, then adds new ones within radius (nearest first)
 *   stop()   -> detaches listeners, keeps existing colliders
 *   clear()  -> removes every collider
 *   dispose()-> stop() + clear(), the manager is finished
 */
export class BuildingColliderManager {
  private readonly map: MapboxMap
  private readonly RAPIER: RapierModule
  private readonly world: RapierNS.World
  private readonly project: (p: LngLat) => [number, number]
  private readonly radius: number
  private readonly releaseRadius: number
  private readonly maxColliders: number
  private readonly maxAddsPerPass: number
  private readonly debounceMs: number
  private readonly sourceId: string
  private readonly sourceLayer: string

  private readonly handles = new Map<string, BuildingHandle>()
  private readonly byCollider = new Map<number, BuildingHandle>()
  private readonly rejected = new Set<string>()
  private readonly listeners: Record<BuildingEvent, Set<Listener>> = { add: new Set(), remove: new Set() }

  private focus: [number, number] | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private disposed = false
  private capped = false

  private pickedId: string | number | null = null

pick(id: string | number): { added: number; removed: number } {
  this.pickedId = id
  return this.update(true)
}


  constructor(map: MapboxMap, opts: BuildingColliderOptions) {
    this.map = map
    this.RAPIER = opts.RAPIER
    this.world = opts.world
    this.project = opts.project ?? equirect(opts.origin)
    this.radius = opts.radius ?? 250
    this.releaseRadius = opts.releaseRadius ?? this.radius * 1.3
    this.maxColliders = opts.maxColliders ?? 1500
    this.maxAddsPerPass = opts.maxAddsPerPass ?? 120
    this.debounceMs = opts.debounceMs ?? 150
    this.sourceId = opts.sourceId ?? 'composite'
    this.sourceLayer = opts.sourceLayer ?? 'building'
  }

  // ---- lifecycle handles -------------------------------------------------




private stale = false
private readonly markStale = (e: any): void => {
  if (e.sourceId === this.sourceId && e.sourceDataType !== 'metadata') {
    this.stale = true // cheap: just a flag, no rebuild
  }
}

private readonly onIdle = (): void => {
  if (this.stale) {
    this.stale = false
    this.index = null // rebuilt on the next pass
    this.dirty = true
  }
  this.schedule()
}






  /** Begin tracking the map. Safe to call again after stop(). */
  start(): void {

    if (this.running || this.disposed) return
    this.running = true
this.map.on('sourcedata', this.markStale)
this.map.on('idle', this.onIdle) 
    this.map.on('moveend', this.schedule)
    this.schedule()
  }

  /** Stop reacting to the map. Existing colliders stay in the world. */
  stop(): void {
    if (!this.running) return
    this.running = false
this.map.off('sourcedata', this.markStale)
this.map.off('idle', this.onIdle)
    this.map.off('moveend', this.schedule)
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /** Remove every collider and forget rejected footprints. */
  clear(): void {
    for (const h of [...this.handles.values()]) this.remove(h.key)
    this.rejected.clear()
    this.capped = false
  }

  /** stop() + clear(). The manager can't be restarted afterwards. */
  dispose(): void {
    if (this.disposed) return
    this.stop()
    try {
      this.clear()
    } catch {
      // The Rapier world may already be freed (e.g. <Physics> unmounted first). Nothing left to remove.
      this.handles.clear()
      this.byCollider.clear()
    }
    this.disposed = true
  }

  /**
   * Centre the collider set on a point in local metres (e.g. your player). Pass null to follow the
   * map centre again. Call as often as you like; passes are coalesced.
   */
  setFocus(point: { x: number; z: number } | null): void {
    this.focus = point ? [point.x, point.z] : null
    this.schedule()
  }



private lastFocus: [number, number] | null = null
private dirty = true

private readonly onMapChange = (): void => {
  this.dirty = true   // new tiles may have loaded
  this.schedule()
}



update(force = false): { added: number; removed: number } {
  if (this.disposed) return { added: 0, removed: 0 }
  const [fx, fz] = this.focusPoint()

  const moved =
    !this.lastFocus ||
    Math.hypot(fx - this.lastFocus[0], fz - this.lastFocus[1]) > 10 // metres

  // nothing new to learn: skip the expensive query and loop
  if (!force && !moved && !this.dirty) return { added: 0, removed: 0 }

  this.lastFocus = [fx, fz]
  this.dirty = false

  const removed = this.release(fx, fz)

  const t0 = performance.now()
  const added = this.acquire(fx, fz)
  const ms = performance.now() - t0
console.log('acquire ms', ms.toFixed(2), 'added', added, 'index', this.index?.length, 'colliders', this.handles.size)
  return { added, removed }
}

  /** Remove one building's collider. */
  remove(key: string): boolean {
    const h = this.handles.get(key)
    if (!h) return false
    this.handles.delete(key)
    this.byCollider.delete(h.collider.handle)
    this.world.removeRigidBody(h.body) // also removes its collider
    this.capped = false
    this.emit('remove', h)
    return true
  }

  // ---- queries -----------------------------------------------------------

  get size(): number {
    return this.handles.size
  }

  get(key: string): BuildingHandle | undefined {
    return this.handles.get(key)
  }

  /** Map a Rapier collider handle (e.g. from a contact event) back to its building. */
  fromCollider(colliderHandle: number): BuildingHandle | undefined {
    return this.byCollider.get(colliderHandle)
  }

  all(): IterableIterator<BuildingHandle> {
    return this.handles.values()
  }

  stats() {
    let triangles = 0
    for (const h of this.handles.values()) triangles += h.triangles
    return { colliders: this.handles.size, triangles, rejected: this.rejected.size, capped: this.capped, running: this.running }
  }

  on(event: BuildingEvent, fn: Listener): () => void {
    this.listeners[event].add(fn)
    return () => this.listeners[event].delete(fn)
  }

  // ---- internals ---------------------------------------------------------

  private readonly schedule = (): void => {
    if (!this.running || this.timer !== null) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.update()
    }, this.debounceMs)
  }

  private emit(event: BuildingEvent, h: BuildingHandle): void {
    for (const fn of this.listeners[event]) fn(h)
  }

  private focusPoint(): [number, number] {
    if (this.focus) return this.focus
    const c = this.map.getCenter()
    return this.project([c.lng, c.lat])
  }

private readonly halfLength = 60
private readonly halfWidth = 10
private readonly releaseMargin = 20 // metres beyond the add area before removing


private inCross(b: Bounds, fx: number, fz: number, margin = 0): boolean {
  const hl = this.halfLength + margin
  const hw = this.halfWidth + margin
  const inH =
    b.maxX >= fx - hl && b.minX <= fx + hl &&
    b.maxZ >= fz - hw && b.minZ <= fz + hw
  const inV =
    b.maxX >= fx - hw && b.minX <= fx + hw &&
    b.maxZ >= fz - hl && b.minZ <= fz + hl
  return inH || inV
}




  private release(fx: number, fz: number): number {
    let n = 0
    for (const h of [...this.handles.values()]) {
  if (this.pickedId != null && h.featureId === this.pickedId) continue

if (!this.inCross(h.bounds, fx, fz, this.releaseMargin)) {
this.remove(h.key)
n++
}

    }
    return n
  }










private index:
  | { key: string; featureId: string | number | null; polygon: number[][][]; height: number; base: number; bounds: Bounds }[]
  | null = null


private buildIndex(): void {
  const feats = this.map.querySourceFeatures(this.sourceId, {
    sourceLayer: this.sourceLayer,
    filter: ['==', 'extrude', 'true'],
  }) as unknown as SourceFeature[]

  const seen = new Set<string>()
  const out: NonNullable<typeof this.index> = []

  for (const f of feats) {
    const height = Number(f.properties?.height)
    const base = Number(f.properties?.min_height ?? 0)
    if (!Number.isFinite(height) || !Number.isFinite(base) || height <= base) continue

    for (const polygon of toPolygons(f.geometry)) {
      const outer = polygon[0]
      if (!outer || outer.length < 4) continue

      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
      for (const p of outer) {
        if (p[0] < minLng) minLng = p[0]
        if (p[0] > maxLng) maxLng = p[0]
        if (p[1] < minLat) minLat = p[1]
        if (p[1] > maxLat) maxLat = p[1]
      }
      const [ax, az] = this.project([minLng, minLat])
      const [bx, bz] = this.project([maxLng, maxLat])
      const bounds: Bounds = {
        minX: Math.min(ax, bx), maxX: Math.max(ax, bx),
        minZ: Math.min(az, bz), maxZ: Math.max(az, bz),
      }

      const key = featureKey(f.id, polygon, height, base)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, featureId: f.id ?? null, polygon, height, base, bounds })
    }
  }
  this.index = out
}















  private acquire(fx: number, fz: number): number {


if (!this.map.getSource(this.sourceId)) return 0
if (!this.index) this.buildIndex()

const cands: Candidate[] = []
for (const e of this.index!) {
  const isPicked = this.pickedId != null && e.featureId === this.pickedId
  if (!isPicked && !this.inCross(e.bounds, fx, fz)) continue
  if (this.handles.has(e.key) || this.rejected.has(e.key)) continue
  cands.push({ ...e, d2: dist2(e.bounds, fx, fz) })
}








    cands.sort((a, b) => a.d2 - b.d2) // nearest first

    const room = this.maxColliders - this.handles.size
    this.capped = cands.length > room && room <= this.maxAddsPerPass
    const budget = Math.min(this.maxAddsPerPass, Math.max(room, 0))

    let added = 0
    for (let i = 0; i < Math.min(budget, cands.length); i++) {
      if (this.add(cands[i])) added++
    }
//console.log('cands', cands.length)
    if (cands.length > budget && budget > 0) this.schedule() // more waiting, run another pass
    return added
  }mie





  private add(c: Candidate): boolean {
    const cx = (c.bounds.minX + c.bounds.maxX) / 2
    const cz = (c.bounds.minZ + c.bounds.maxZ) / 2

    // Vertices relative to the body origin keeps float32 precision good far from the scene origin.
    const rings: Ring[] = c.polygon.map((ring) =>
      ring.map((p): [number, number] => {
        const [x, z] = this.project([p[0], p[1]])
        return [x - cx, z - cz]
      }),
    )

    const mesh = extrudePolygon(rings, c.base, c.height)
    if (!mesh) {
      this.rejected.add(c.key)
      return false
    }

    let body: RapierNS.RigidBody | null = null
    try {
      body = this.world.createRigidBody(this.RAPIER.RigidBodyDesc.fixed().setTranslation(cx, 0, cz))
      const collider = this.world.createCollider(
        this.RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices),
        body,
      )
      const handle: BuildingHandle = {
        key: c.key,
        featureId: c.featureId,
        body,
        collider,
  mesh,                 
        bounds: c.bounds,
        height: c.height,
        base: c.base,
        triangles: mesh.indices.length / 3,
      }
      this.handles.set(c.key, handle)
      this.byCollider.set(collider.handle, handle)
      this.emit('add', handle)
      return true
    } catch (err) {
      if (body) {
        try {
          this.world.removeRigidBody(body)
        } catch {
          /* ignore */
        }
      }
      this.rejected.add(c.key)
      console.warn('[BuildingColliderManager] skipped a footprint', c.key, err)
      return false
    }
  }
}
