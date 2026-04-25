// Runtime mock flag — starts from BUNQ_MOCK env var but can be toggled via /api/dev/mock-mode
// Survives between requests in the same Node process; resets on cold start (env var wins again).

let _mock: boolean = process.env.BUNQ_MOCK === 'true'

export function isMock(): boolean { return _mock }
export function setMock(value: boolean): void { _mock = value }
