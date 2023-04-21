export const isValidTableName = (tableName: string): boolean => {
  const l = tableName.length

  // An arbitrary limit on the length of the table name
  if (l > 127) {
    return false
  }

  // Telemetry tables are not allowed
  if (["telemetry", "telemetry_config"].includes(tableName)) {
    return false
  }

  for (let i = 0; i < l; i++) {
    const c = tableName.charAt(i)
    switch (c) {
      case ".":
        if (i == 0 || i == l - 1 || tableName.charAt(i - 1) == ".") {
          // Single dot in the middle is allowed only
          // Starting from . hides directory in Linux
          // Ending . can be trimmed by some Windows versions / file systems
          // Double, triple dot look suspicious
          // Single dot allowed as compatibility,
          // when someone uploads 'file_name.csv' the file name used as the table name
          return false
        }
        break
      case "?":
      case ",":
      case "'":
      case '"':
      case "\\":
      case "/":
      case ":":
      case ")":
      case "(":
      case "+":
      case "*":
      case "%":
      case "~":
      case "\u0000": // Control characters
      case "\u0001":
      case "\u0002":
      case "\u0003":
      case "\u0004":
      case "\u0005":
      case "\u0006":
      case "\u0007":
      case "\u0008":
      case "\t":
      case "\u000B":
      case "\u000c":
      case "\r":
      case "\n":
      case "\u000e":
      case "\u000f":
      case "\u007f":
      case "0xfeff": // UTF-8 BOM (Byte Order Mark) can appear at the beginning of a character stream
        return false
    }
  }
  return (
    tableName.length > 0 &&
    tableName.charAt(0) != " " &&
    tableName.charAt(l - 1) != " "
  )
}
