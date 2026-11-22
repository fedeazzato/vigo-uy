// The "Control remoto" card (specs/car-remote-e3.md R6) stays hidden, and car_orders is never queried, until migration 0052
// is applied and the site is built with VITE_CAR_REMOTE=1. A module of its own so tests can switch it.
export const CAR_REMOTE_ENABLED: boolean = import.meta.env.VITE_CAR_REMOTE === '1'
