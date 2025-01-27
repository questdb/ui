import {MetricType} from "../utils"
import {walTransactionLatency} from "./walTransactionLatency"
import {tableWriteAmplification} from "./tableWriteAmplification"
import {walRowThroughput} from "./walRowThroughput"
import {walTransactionThroughput} from "./walTransactionThroughput"
import {tableAvgTransactionSize} from "./tableAvgTransactionSize";

export const widgets = {
    [MetricType.WAL_TRANSACTION_THROUGHPUT]: walTransactionThroughput,
    [MetricType.WAL_TRANSACTION_LATENCY]: walTransactionLatency,
    [MetricType.WAL_ROW_THROUGHPUT]: walRowThroughput,
    [MetricType.TABLE_WRITE_AMPLIFICATION]: tableWriteAmplification,
    [MetricType.TABLE_AVERAGE_TRANSACTION_SIZE]: tableAvgTransactionSize
}
