import { useEffect, useState } from 'react'
import {
  fetchMyCarUpdate,
  fetchUpdateNotices,
  pendingNotices,
  type CarUpdateStatusRow,
  type GoogleNotice,
} from './carReleases'

export interface CarUpdateInfoState {
  update: CarUpdateStatusRow | null
  notices: GoogleNotice[]
}

/** The member's car updater row and the Google notices still pending on it (specs/car-updates.md R8). Read once. */
export function useCarUpdateInfo(): CarUpdateInfoState {
  const [state, setState] = useState<CarUpdateInfoState>({ update: null, notices: [] })
  useEffect(() => {
    let cancelled = false
    void Promise.all([fetchMyCarUpdate(), fetchUpdateNotices()]).then(([update, notices]) => {
      if (!cancelled) setState({ update, notices: update ? pendingNotices(notices, update.installed) : [] })
    })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}
