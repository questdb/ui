export type RowsApplied = {
  time: string
  numOfWalApplies: string
  numOfRowsApplied: string
  numOfRowsWritten: string
  avgWalAmplification: string
}

export type Latency = {
  time: string
  numOfWalApplies: string
  avg_latency: string
}

export enum GraphType {
  RowsApplied = "Rows Applied",
  Latency = "Latency",
  WriteAmplification = "Write Amplification",
}
