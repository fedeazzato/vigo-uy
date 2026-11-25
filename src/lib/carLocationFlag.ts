// "Dónde está tu auto" (specs/car-location.md R5) stays hidden, and get_car_location is never called, until migration 0083 is
// applied and the site is built with VITE_CAR_LOCATION=1. A module of its own so tests can switch it.
export const CAR_LOCATION_ENABLED: boolean = import.meta.env.VITE_CAR_LOCATION === '1'
