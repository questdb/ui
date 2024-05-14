import * as QuestDB from "../../utils/questdb"

export default {
  query: "wal_tables()",
  type: QuestDB.Type.DQL,
  columns: [
    {
      name: "name",
      type: "STRING",
    },
    {
      name: "suspended",
      type: "BOOLEAN",
    },
    {
      name: "writerTxn",
      type: "LONG",
    },
    {
      name: "writerLagTxnCount",
      type: "LONG",
    },
    {
      name: "sequencerTxn",
      type: "LONG",
    },
  ],
  timestamp: -1,
  dataset: [
    ["sys.acl_entities", false, "3", "0", "3"],
    ["sys.acl_permissions", false, "30", "0", "30"],
    ["sys.acl_jwk_tokens", false, "0", "0", "0"],
    ["ecommerce_stats", false, "1", "0", "1"],
    ["sys.acl_rest_tokens", false, "13", "0", "13"],
    ["btc_trades", false, "1", "0", "1"],
    ["gitlog", true, "1", "0", "1"],
    ["chicago_weather_stations", true, "1", "0", "1"],
    ["sys.acl_links", false, "0", "0", "0"],
    ["sys.acl_external_groups", false, "1", "0", "1"],
    ["sys.acl_passwords", false, "0", "0", "0"],
  ],
  count: 11,
  timings: {
    authentication: 25125,
    compiler: 0,
    execute: 14539625,
    count: 0,
  },
  explain: {
    jitCompiled: false,
  },
}
