// A stand-in for '@hermes/plugin-sdk', for rendering desktop/plugin.js in a plain browser. The components
// come from the kit's stand-in (kit-sdk-stub.js, copied by the kit's build); atom and useValue are the real
// nanostores at the app's version; host records calls. Harness only: the app provides the real SDK.
import { useStore } from '@nanostores/react'
import { atom as nanoAtom } from 'nanostores'

export * from './kit-sdk-stub.js'
export const atom = nanoAtom
export const useValue = useStore
export const host = {
  navigate(path) { (window.__hostLog = window.__hostLog || []).push(['navigate', path]) },
}
