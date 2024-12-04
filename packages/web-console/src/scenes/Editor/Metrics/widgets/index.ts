import { MetricType } from "../utils"
import { latency } from "./latency"
import { writeAmplification } from "./writeAmplification"
import { writeThroughput } from "./writeThroughput"
import { commitRate } from "./commitRate"

export const widgets = {
  [MetricType.COMMIT_RATE]: commitRate,
  [MetricType.LATENCY]: latency,
  [MetricType.WRITE_THROUGHPUT]: writeThroughput,
  [MetricType.WRITE_AMPLIFICATION]: writeAmplification,
}
