export type GateStatus =
  | 'OPEN'
  | 'CLOSED'
  | 'OPENING'
  | 'CLOSING'
  | 'UNKNOWN'

type GatesState = Record<number, GateStatus>

const gates: GatesState = {
  1: 'UNKNOWN',
  2: 'UNKNOWN',
  3: 'UNKNOWN',
  4: 'UNKNOWN'
}

export const setGateStatus = (gateId: number, status: GateStatus) => {
  gates[gateId] = status
}

export const getGateStatus = (gateId: number) => {
  return gates[gateId] ?? 'UNKNOWN'
}

export const getAllGatesStatus = () => {
  return gates
}

