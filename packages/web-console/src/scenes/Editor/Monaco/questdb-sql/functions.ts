
export const functions =  [
  {
    name: "abs",
    label: "abs(value)",
    documentation: "return the absolute value. The behavior of `abs` is as follows:\n" +
      "\n" +
      "- When the input `value` is positive, `abs` returns `value`\n" +
      "- When the input `value` is negative, `abs` returns `- value`\n" +
      "- When the input `value` is `0`, `abs` returns `0`",
    parameters: [
      {
        label: "value",
        documentation: "any numeric value.",
      },
    ],
    docsLink: "https://questdb.io/docs/reference/function/numeric/#abs"
  },
  {
    name: "acos",
    label: "acos(value)",
    documentation: "returns the arccosine of a value.",
    parameters: [
      {
        label: "value",
        documentation: "a numeric value whose arccosine is to be returned. The returned\n" +
          " angle is between 0.0 and pi inclusively."
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/trigonometric/#acos"
  },
  {
    name: "approx_percentile",
    label: "approx_percentile(value, percentile, precision)",
    documentation: "calculates the approximate\n" +
      "value for the given non-negative column and percentile using the\n" +
      "[HdrHistogram](http://hdrhistogram.org/) algorithm.",
    parameters: [
      {
        label: "value",
        documentation: "any numeric non-negative value."
      },
      {
        label: "percentile",
        documentation: "a `double` value between 0.0 and 1.0, inclusive."
      },
      {
        label: "precision",
        documentation: "`an optional `int` value between 0 and 5, inclusive."
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#approx_percentile"
  },
  {
    name: "asin",
    label: "asin(value)",
    documentation: "the arcsine of a value.",
    parameters: [
      {
        label: "value",
        documentation: "a numeric value whose arcsine is to be returned."
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/trigonometric/#asin"
  },
  {
    name: "atan",
    label: "atan(value)",
    documentation: "returns the arctangent of a value.",
    parameters: [
      {
        label: "value",
        documentation: "a numeric value whose arctangent is to be returned."
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/trigonometric/#atan"
  },
  {
    name: "atan2",
    label: "atan2(valueX, valueY)",
    documentation: "returns the angle _theta_ from the conversion of\n" +
      "rectangular coordinates (x, y) to polar (r, theta). This function computes\n" +
      "_theta_ (the phase) by computing an arctangent of y/x in the range of -pi to pi\n" +
      "inclusively.",
    parameters: [
      {
        label: "valueX",
        documentation: "numeric ordinate coordinate."
      },
      {
        label: "valueY",
        documentation: "numeric abscissa coordinate."
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/trigonometric/#atan2"
  },
  {
    name: "avg",
    label: "avg(value)",
    documentation: "calculates simple average of values ignoring missing data (e.g `null` values).",
    parameters: [
      {
        label: "value",
        documentation: "any numeric value."
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#avg"
  },
  {
    name: "base64",
    label: "base64(data, maxLenght)",
    documentation: "encodes raw binary data using the base64 encoding into a string with a maximum length defined by `maxLength`.",
    parameters: [
      {
        label: "data",
        documentation: "the binary data to be encoded."
      },
      {
        label: "maxLength",
        documentation: "the intended maximum length of the encoded string."
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/binary/#base64"
  },
  {
    name: "build",
    label: "build()",
    documentation: "Returns the current QuestDB version and hash.",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/meta/#build"
  },
  {
    name: "ceil",
    label: "ceil(value)",
    documentation: "returns the smallest integer greater than, or equal to, a specified numeric expression.",
    parameters: [
      {
        label: "value",
        documentation: "any numeric value."
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/numeric/#ceil--ceiling"
  },
  {
    name: "ceiling",
    label: "ceiling(value)",
    documentation: "returns the smallest integer greater than, or equal to, a specified numeric expression.",
    parameters: [
      {
        label: "value",
        documentation: "any numeric value."
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/numeric/#ceil--ceiling"
  },
  {
    name: "coalesce",
    label: "coalesce(value [, ...])",
    documentation: "returns the first non-null argument in a provided list of arguments in cases where null values should not appear in query results.",
    parameters: [
      {
        label: "value [, ...]",
        documentation: "value and subsequent comma-separated list of arguments which may be of any type except binary. If the provided arguments are of different types, one should be `CAST`able to another."
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/conditional/#coalesce"
  },
  {
    name: "concat",
    label: "concat(str, ...)",
    documentation: "concatenates a string from one or more input values.",
    parameters: [{
      label: "str, ...",
      documentation: "a string from one or more input values"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#concat"
  },
  {
    name: "cos",
    label: "cos(angleRadians)",
    documentation: "returns the trigonometric cosine of an angle.",
    parameters: [
      {
        label: "angleRadians",
        documentation: "numeric value for the angle, in radians."
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/trigonometric/#cos"
  },
  {
    name: "cot",
    label: "cot(angleRadians)",
    documentation: "returns the trigonometric cotangent of an angle.",
    parameters: [
      {
        label: "angleRadians",
        documentation: "numeric value for the angle, in radians."
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/trigonometric/#cot"
  },
  {
    name: "count",
    label: "count(column_name)",
    documentation: "- `count()` or `count(*)` - counts the number of rows irrespective of underlying\n" +
      "  data.\n" +
      "- `count(column_name)` - counts the number of non-null values in a given column.",
    parameters: [
      {
        label: "column_name",
        documentation: "a column name or an expression."
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#count"
  },
  {
    name: "count_distinct",
    label: "count_distinct(column_name)",
    documentation: "counts distinct non-`null` values in `string`,\n" +
      "`symbol`, `long256`, `UUID`, `IPv4`, `long`, or `int` columns.\n",
    parameters: [{
      label: "column_name",
      documentation: "a column name or an expression."
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#count_distinct"
  },
  {
    name: "current_database",
    label: "current_database()",
    documentation: "Get the current database",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/meta/#current-database-schema-or-user"
  },
  {
    name: "current_schema",
    label: "current_schema()",
    documentation: "Get the current schema",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/meta/#current-database-schema-or-user"
  },
  {
    name: "current_schemas",
    label: "current_schemas()",
    documentation: "Get the current schemas",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/meta/#current-database-schema-or-user"
  },
  {
    name: "current_user",
    label: "current_user()",
    documentation: "Get the current user",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/meta/#current-database-schema-or-user"
  },
  {
    name: "date_trunc",
    label: "date_trunc(unit, timestamp)",
    documentation: "returns a timestamps truncated to the selected precision",
    parameters: [{
      label: "unit",
      documentation: "a string representing the unit of time to truncate to"
    }, {
      label: "timestamp",
      documentation: "any timestamp value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#date_trunc"
  },
  {
    name: "dateadd",
    label: "dateadd(period, n, startDate)",
    documentation: "adds `n` period to `startDate`.",
    parameters: [
      {
        label: "period",
        documentation: "A `char`. Period to be added."
      },
      {
        label: "n",
        documentation: " an `int` indicating the number of periods to add."
      },
      {
        label: "startDate",
        documentation: "a timestamp or date indicating the timestamp to add the period to"
      }
    ],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#dateadd"
  },
  {
    name: "datediff",
    label: "datediff(period, date1, date2)",
    documentation: "returns the absolute number of `period` between `date1` and `date2`.",
    parameters: [{
      label: "period",
      documentation: "A `char`. Period to be added."
    }, {
      label: "date1",
      documentation: "a timestamp or date indicating the start date"
    }, {
      label: "date2",
      documentation: "a timestamp or date indicating the end date"

    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#datediff"
  },
  {
    name: "day",
    label: "day(value)",
    documentation: "returns the `day` of month for a given timestamp from `1` to `31`.",
    parameters: [{
      label: "value",
      documentation: "any `timestamp` or `date`"

    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#day"
  },
  {
    name: "day_of_week",
    label: "day_of_week(value)",
    documentation: "returns the day number in a week from `1` (Monday) to `7` (Sunday)",
    parameters: [{
      label: "value",
      documentation: "any `timestamp` or `date`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#day_of_week"
  },
  {
    name: "day_of_week_sunday_first",
    label: "day_of_week_sunday_first(value)",
    documentation: "returns the day number in a week from `1` (Sunday) to `7` (Saturday)",
    parameters: [{
      label: "value",
      documentation: "any `timestamp` or `date`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#day_of_week_sunday_first"
  },
  {
    name: "days_in_month",
    label: "days_in_month(value)",
    documentation: "returns the number of days in a month from a provided timestamp or date.",
    parameters: [{
      label: "value",
      documentation: "any `timestamp` or `date`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#days_in_month"
  },
  {
    name: "degrees",
    label: "degrees(angleRadians)",
    documentation: "converts an angle measured in radians to the equivalent angle measured in degrees.",
    parameters: [{
      label: "angleRadians",
      documentation: "a numeric value for the angle, in radians."
    }],
    docsLink: "https://questdb.io/docs/reference/function/trigonometric/#degrees"
  },
  {
    name: "extract",
    label: "extract(unit, timestamp)",
    documentation: "returns the selected time unit from the input timestamp.",
    parameters: [{
      label: "unit",
      documentation: "a string representing the unit of time to extract"
    }, {
      label: "timestamp",
      documentation: "any timestamp value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#extract"
  },
  {
    name: "floor",
    label: "floor(value)",
    documentation: "returns the largest integer less than or equal to a specified numeric expression",
    parameters: [{
      label: "value",
      documentation: "any numeric value."
    }],
    docsLink: "https://questdb.io/docs/reference/function/numeric/#floor"
  },
  {
    name: "haversine_dist_deg",
    label: "haversine_dist_deg(lat, lon, ts)",
    documentation: "calculates the traveled distance for a series of latitude and longitude points.",
    parameters: [{
      label: "lat",
      documentation: "the latitude expressed as degrees in decimal format (`double`)"
    }, {
      label: "lon",
      documentation: "the longitude expressed as degrees in decimal format (`double`)"
    }, {
      label: "ts",
      documentation: "a timestamp value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#haversine_dist_deg"
  },
  {
    name: "hour",
    label: "hour(value)",
    documentation: "returns the `hour` of day for a given timestamp from `0` to `23`",
    parameters: [{
      label: "value",
      documentation: "any `timestamp` or `date`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#hour"
  },
  {
    name: "isOrdered",
    label: "isOrdered(column)",
    documentation: "return a `boolean` indicating whether the column values are ordered in a table.",
    parameters: [{
      label: "column",
      documentation: "a column name of numeric or timestamp type"
    }],
    docsLink: "https://questdb.io/docs/reference/function/boolean/#isordered"
  },
  {
    name: "is_leap_year",
    label: "is_leap_year(value)",
    documentation: "returns `true` if the `year` of `value` is a leap year, `false` otherwise.",
    parameters: [{
      label: "value",
      documentation: "any `timestamp` or `date`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#is_leap_year"
  },
  {
    name: "ksum",
    label: "ksum(value)",
    documentation: "adds values ignoring missing data (e.g `null` values). Values\n" +
      "are added using the\n" +
      "\n" +
      "[Kahan compensated sum algorithm](https://en.wikipedia.org/wiki/Kahan_summation_algorithm).\n" +
      "This is only beneficial for floating-point values such as `float` or `double`.",
    parameters: [{
      label: "value",
      documentation: "any numeric value."
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#ksum"
  },
  {
    name: "last",
    label: "last(column_name)",
    documentation: "returns the last value of a column",
    parameters: [{
      label: "column_name",
      documentation: "a column name or an expression."
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#firstlast"
  },
  {
    name: "left",
    label: "left(string, count)",
    documentation: "extracts a substring of the given length from a string (starting from left).",
    parameters: [{
      label: "string",
      documentation: "a string to extract from"
    }, {
      label: "count",
      documentation: "an integer specifying the count of characters to be extracted into a substring"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#left"
  },
  {
    name: "length",
    label: "length(value)",
    documentation: "`length(string)` - reads length of `string` value type (result is `int`)\n" +
      "\n" +
      "`length(symbol)` - reads length of `symbol` value type (result is `int`)\n" +
      "\n" +
      "`length(blob)` - reads length of `binary` value type (result is `long`)\n" +
      "\n" +
      "- a `string`\n" +
      "- a `symbol`\n" +
      "- a `binary` blob",
    parameters: [{
      label: "value",
      documentation: "a string, symbol, or binary blob"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#length"
  },
  {
    name: "long_sequence",
    label: "long_sequence(iterations, seed1, seed2)",
    documentation: "- `long_sequence(iterations)` - generates rows\n" +
      "- `long_sequence(iterations, seed1, seed2)` - generates rows deterministically",
    parameters: [{
      label: "iterations",
      documentation: "an integer specifying the number of rows to generate"
    }, {
      label: "seed1",
      documentation: "an integer specifying the first seed"
    }, {
      label: "seed2",
      documentation: "an integer specifying the second seed"
    }],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#long_sequence"
  },
  {
    name: "lpad",
    label: "lpad(string, length, fill)",
    documentation: "",
    parameters: [{
      label: "string",
      documentation: "the input string that you want to pad"
    }, {
      label: "length",
      documentation: "the length of the resulting string after padding. If this is less than the length of the original string, the original string is truncated to the specified length"
    }, {
      label: "fill",
      documentation: "the string to use for padding. If this is not specified, spaces are used"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#lpad"
  },
  {
    name: "ltrim",
    label: "ltrim(string)",
    documentation: "",
    parameters: [{
      label: "string",
      documentation: "the input string from which you want to remove leading whitespace"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#ltrim"
  },
  {
    name: "make_geohash",
    label: "make_geohash(lon, lat, bits)",
    documentation: "returns a geohash equivalent of latitude and longitude, with precision specified in bits",
    parameters: [{
      label: "lon",
      documentation: "longitude coordinate as a floating point value with up to eight decimal places"
    }, {
      label: "lat",
      documentation: "latitude coordinate as a floating point value with up to eight decimal places"
    }, {
      label: "bits",
      documentation: "an integer between `1` and `60` which determines the precision of the generated geohash"
    }],
    docsLink: "https://questdb.io/docs/reference/function/spatial/#make_geohash"
  },
  {
    name: "max",
    label: "max(value)",
    documentation: "returns the highest value ignoring missing data (e.g `null` values)",
    parameters: [{
      label: "value",
      documentation: "any numeric or `string` value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#max"
  },
  {
    name: "memory_metrics",
    label: "memory_metrics()",
    documentation: "Returns granular memory metrics",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/meta/#memory_metrics"
  },
  {
    name: "micros",
    label: "micros(value)",
    documentation: "returns the `micros` of the millisecond for a given date or timestamp from `0` to `999`",
    parameters: [{
      label: "value",
      documentation: "any `timestamp` or `date`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#micros"
  },
  {
    name: "millis",
    label: "millis(value)",
    documentation: "returns the `millis` of the second for a given date or timestamp from `0` to `999`",
    parameters: [{
      label: "value",
      documentation: "any `timestamp` or `date`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#millis"
  },
  {
    name: "min",
    label: "min(value)",
    documentation: "returns the lowest value ignoring missing data (e.g null values)",
    parameters: [{
      label: "value",
      documentation: "any numeric or `string` value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#min"
  },
  {
    name: "minute",
    label: "minute(value)",
    documentation: "returns the `minute` of the hour for a given timestamp from `0` to `59`",
    parameters: [{
      label: "value",
      documentation: "any `timestamp` or `date`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#minute"
  },
  {
    name: "month",
    label: "month(value)",
    documentation: "returns the `month` of year for a given date from `1` to `12`",
    parameters: [{
      label: "value",
      documentation: "any `timestamp` or `date`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#month"
  },
  {
    name: "netmask",
    label: "netmask(string)",
    documentation: "Takes a `string` IPv4 argument as either:\n" +
      "\n" +
      "- ipv4 address with a netmask `22.59.138.9/8`\n" +
      "- subnet with netmask: `2.2/16`\n" +
      "\n" +
      "Returns an IPv4 addresses' netmask (`255.0.0.0`) in IPv4 format.",
    parameters: [{
      label: "string",
      documentation: "a string representing an IPv4 address or subnet"
    }],
    docsLink: "https://questdb.io/docs/reference/operators/ipv4/#return-netmask---netmaskstring"
  },
  {
    name: "now",
    label: "now()",
    documentation: "offset from UTC Epoch in microseconds.",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#now"
  },
  {
    name: "nsum",
    label: "nsum(value)",
    documentation: "`nsum(value)` - adds values ignoring missing data (e.g `null` values). Values\n" +
      "are added using the\n" +
      "[Neumaier sum algorithm](https://en.wikipedia.org/wiki/Kahan_summation_algorithm#Further_enhancements).\n" +
      "This is only beneficial for floating-point values such as `float` or `double`.",
    parameters: [{
      label: "value",
      documentation: "any numeric value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#nsum"
  },
  {
    name: "nullif",
    label: "nullif(value1, value2)",
    documentation: "returns a null value if `value1` is equal to `value2` or otherwise returns `value1`",
    parameters: [{
      label: "value1",
      documentation: "any numeric, char, or string value"
    }, {
      label: "value2",
      documentation: "any numeric, char, or string value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/conditional/#nullif"
  },
  {
    name: "pi",
    label: "pi()",
    documentation: "returns the constant pi as a double",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/trigonometric/#pi"
  },
  {
    name: "position",
    label: "position(string, substring)",
    documentation: "searches for the first substring occurrence in a string, and returns the index position of the starting character. If the substring is not found, this function returns `0`. The performed search is case-sensitive.",
    parameters: [{
      label: "string",
      documentation: "a string to search in"
    }, {
      label: "substring",
      documentation: "a string to search for"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#strpos--position"
  },
  {
    name: "power",
    label: "power(base, exponent)",
    documentation: "returns the value of a number `base` raised to the power defined by `exponent`",
    parameters: [{
      label: "base",
      documentation: "a numeric value"
    }, {
      label: "exponent",
      documentation: "a numeric value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/numeric/#power"
  },
  {
    name: "radians",
    label: "radians(angleDegrees)",
    documentation: "converts an angle measured in degrees to the equivalent angle measured in radians",
    parameters: [{
      label: "angleDegrees",
      documentation: "a numeric value for the angle, in degrees"
    }],
    docsLink: "https://questdb.io/docs/reference/function/trigonometric/#radians"
  },
  {
    name: "rank",
    label: "rank()",
    documentation: "In the context of window functions, `rank()` assigns a unique rank to each row within the window frame, with the same rank assigned to rows with the same values. Rows with equal values receive the same rank, and a gap appears in the sequence for the next distinct value; that is, the `row_number` of the first row in its peer group.",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/window/#rank"
  },
  {
    name: "reader_pool",
    label: "reader_pool()",
    documentation: "Returns information about the current state of the reader pool in QuestDB. The reader pool is a cache of table readers that are kept open to speed up subsequent reads from the same table. The returned information includes the table name, the ID of the thread that currently owns the reader, the timestamp of the last time the reader was accessed, and the current transaction ID with which the reader is associated.",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/meta/#reader_pool"
  },
  {
    name: "regexp_replace",
    label: "regexp_replace(string1, regex, string2)",
    documentation: "provides substitution of new text for substrings that match regular expression patterns",
    parameters: [{
      label: "string1",
      documentation: "a source `string` value to be manipulated"
    }, {
      label: "regex",
      documentation: "a regular expression pattern"
    }, {
      label: "string2",
      documentation: "any `string` value to replace part or the whole of the source value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#regexp_replace"
  },
  {
    name: "replace",
    label: "replace(string, from_string, to_string)",
    documentation: "replaces all occurrences of a substring within a string with another substrin",
    parameters: [{
      label: "string",
      documentation: "the original string where replacements will be made"
    }, {
      label: "from_string",
      documentation: "the substring that will be searched for in the original string"
    }, {
      label: "to_string",
      documentation: "the substring that will replace occurrences of `from_string`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#replace"
  },
  {
    name: "right",
    label: "right(string, count)",
    documentation: "extracts a substring of the given length from a string (starting from right)",
    parameters: [{
      label: "string",
      documentation: "a string to extract from"
    }, {
      label: "count",
      documentation: "an integer specifying the count of characters to be extracted into a substring"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#right"
  },
  {
    name: "rnd_bin",
    label: "rnd_bin(minBytes, maxBytes, nullRate)",
    documentation: "generates random binary data of a size up to `32` bytes.\n" +
      "- `rnd_bin(minBytes, maxBytes, nullRate)` generates random binary data of a size\n" +
      "  between `minBytes` and `maxBytes` and returns `null` at a rate defined by\n" +
      "  `nullRate`.",
    parameters: [{
      label: "minBytes",
      documentation: "an integer specifying the minimum number of bytes to generate"
    }, {
      label: "maxBytes",
      documentation: "an integer specifying the maximum number of bytes to generate"
    }, {
      label: "nullRate",
      documentation: "a floating-point value between `0.0` and `1.0` specifying the rate at which `null` values will be generated"
    }],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_bin"
  },
  {
    name: "rnd_boolean",
    label: "rnd_boolean()",
    documentation: "generates a random `boolean` value, either `true` or `false`, both having equal probability",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_boolean"
  },
  {
    name: "rnd_byte",
    label: "rnd_byte(min, max)",
    documentation: "returns a random integer which can take any value between `0`\n" +
      "  and `127`.\n" +
      "- `rnd_byte(min, max)` - generates byte values in a specific range (for example\n" +
      "  only positive, or between 1 and 10).",
    parameters: [{
      label: "min",
      documentation: "an integer specifying the minimum value to generate"
    }, {
      label: "max",
      documentation: "an integer specifying the maximum value to generate"
    }],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_byte"
  },
  {
    name: "rnd_char",
    label: "rnd_char()",
    documentation: "used to generate a random `char` which will be an uppercase character from the 26-letter A to Z alphabet. Letters from A to Z will be generated with equal probability.",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_char"
  },
  {
    name: "rnd_date",
    label: "rnd_date()",
    documentation: "generates a random date between `start` and `end` dates (both\n" +
      "  inclusive). IT will also generate `NaN` values at a frequency defined by\n" +
      "  `nanRate`. When `start` or `end` are invalid dates, or when `start` is\n" +
      "  superior to `end`, it will return `invalid range` error. When `nanRate` is\n" +
      "  inferior to 0, it will return `invalid NAN rate` error.",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_date"
  },
  {
    name: "rnd_double",
    label: "rnd_double(nanRate)",
    documentation: "generates a random **positive** `double` between 0 and 1.\n" +
      "- `rnd_double(nanRate)` - generates a random **positive** `double` between 0 and\n" +
      "  1 which will be `NaN` at a frequency defined by `nanRate`.",
    parameters: [{
      label: "nanRate",
      documentation: "a floating-point value between `0.0` and `1.0` specifying the rate at which `NaN` values will be generated"
    }],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_double"
  },
  {
    name: "rnd_float",
    label: "rnd_float(nanRate)",
    documentation: "generates a random **positive** `float` between 0 and 1.\n" +
      "- `rnd_float(nanRate)` - generates a random **positive** `float` between 0 and 1\n" +
      "  which will be `NaN` at a frequency defined by `nanRate`.",
    parameters: [{
      label: "nanRate",
      documentation: "a floating-point value between `0.0` and `1.0` specifying the rate at which `NaN` values will be generated"
    }],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_float"
  },
  {
    name: "rnd_geohash",
    label: "rnd_geohash(bits)",
    documentation: "returns a random geohash of variable precision",
    parameters: [{
      label: "bits",
      documentation: "an integer between `1` and `60` which determines the precision of the generated geohash"
    }],
    docsLink: "https://questdb.io/docs/reference/function/spatial/#rnd_geohash"
  },
  {
    name: "rnd_int",
    label: "rnd_int(min, max, nanRate)",
    documentation: "used to return a random integer which can take any value\n" +
      "  between `-2147483648` and `2147483647`.\n" +
      "- `rnd_int(min, max, nanRate)` is used to generate int values in a specific\n" +
      "  range (for example only positive, or between 1 and 10), or to get occasional\n" +
      "  `NaN` values along with int values.",
    parameters: [{
      label: "min",
      documentation: "an integer specifying the minimum value to generate"
    }, {
      label: "max",
      documentation: "an integer specifying the maximum value to generate"
    }, {
      label: "nanRate",
      documentation: "a floating-point value between `0.0` and `1.0` specifying the rate at which `NaN` values will be generated"
    }],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_int"
  },
  {
    name: "rnd_long",
    label: "rnd_long(min, max, nanRate)",
    documentation: "- `rnd_long()` is used to return a random signed integer between\n" +
      "  `0x8000000000000000L` and `0x7fffffffffffffffL`.\n" +
      "- `rnd_long(min, max, nanRate)` is used to generate long values in a specific\n" +
      "  range (for example only positive, or between 1 and 10), or to get occasional\n" +
      "  `NaN` values along with int values.",
    parameters: [{
      label: "min",
      documentation: "an integer specifying the minimum value to generate"
    }, {
      label: "max",
      documentation: "an integer specifying the maximum value to generate"
    }, {
      label: "nanRate",
      documentation: "a floating-point value between `0.0` and `1.0` specifying the rate at which `NaN` values will be generated"
    }],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_long"
  },
  {
    name: "rnd_short",
    label: "rnd_short(min, max)",
    documentation: "returns a random integer which can take any value between\n" +
      "  `-32768` and `32767`.\n" +
      "- `rnd_short(min, max)` - returns short values in a specific range (for example\n" +
      "  only positive, or between 1 and 10). Supplying `min` above `max` will result\n" +
      "  in an `invalid range` error.",
    parameters: [{
      label: "min",
      documentation: "a `short` representing the lowest possible generated value (inclusive)"
    }, {
      label: "max",
      documentation: "a `short` representing the highest possible generated value (inclusive)"
    }],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_short"
  },
  {
    name: "rnd_str",
    label: "rnd_str()",
    documentation: "- `rnd_str(stringList)` is used to choose a random `string` from a list defined\n" +
      "  by the user. It is useful when looking to generate specific strings from a\n" +
      "  finite list (e.g `BUY, SELL` or `AUTUMN, WINTER, SPRING, SUMMER`. Strings are\n" +
      "  randomly chosen from the list with equal probability. When only one string is\n" +
      "  provided in the list, this string will be chosen with 100% probability.\n" +
      "- `rnd_str(list_size, minLength, maxLength, nullRate)` generated a finite list\n" +
      "  of distinct random string and chooses one string from the list at random. The\n" +
      "  finite list is of size `list_size`. The generated strings length is between\n" +
      "  `minLength` and `maxLength` (both inclusive). The function will also generate\n" +
      "  `null` values at a rate defined by `nullRate`.\n",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_str"
  },
  {
    name: "rnd_symbol",
    label: "rnd_symbol()",
    documentation: "- `rnd_symbol(symbolList)` is used to choose a random `symbol` from a list\n" +
      "  defined by the user. It is useful when looking to generate specific symbols\n" +
      "  from a finite list (e.g `BUY, SELL` or `AUTUMN, WINTER, SPRING, SUMMER`.\n" +
      "  Symbols are randomly chosen from the list with equal probability. When only\n" +
      "  one symbol is provided in the list, this symbol will be chosen with 100%\n" +
      "  probability, in which case it is more efficient to use\n" +
      "  `cast('your_symbol' as symbol`\n" +
      "- `rnd_symbol(list_size, minLength, maxLength, nullRate)` generated a finite\n" +
      "  list of distinct random symbols and chooses one symbol from the list at\n" +
      "  random. The finite list is of size `list_size`. The generated symbols length\n" +
      "  is between `minLength` and `maxLength` (both inclusive). The function will\n" +
      "  also generate `null` values at a rate defined by `nullRate`.",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_symbol"
  },
  {
    name: "rnd_timestamp",
    label: "rnd_timestamp(start, end, nanRate)",
    documentation: "- `rnd_timestamp(start, end, nanRate)` generates a random timestamp between\n" +
      "  `start` and `end` timestamps (both inclusive). It will also generate `NaN`\n" +
      "  values at a frequency defined by `nanRate`. When `start` or `end` are invalid\n" +
      "  timestamps, or when `start` is superior to `end`, it will return\n" +
      "  `invalid range` error. When `nanRate` is inferior to 0, it will return\n" +
      "  `invalid NAN rate` error.",
    parameters: [{
      label: "start",
      documentation: "a timestamp value"
    }, {
      label: "end",
      documentation: "a timestamp value"
    }, {
      label: "nanRate",
      documentation: "a floating-point value between `0.0` and `1.0` specifying the rate at which `NaN` values will be generated"
    }],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_timestamp"
  },
  {
    name: "rnd_uuid4",
    label: "rnd_uuid4()",
    documentation: "used to generate a random\n" +
      "  [UUID](https://questdb.io/docs/reference/sql/datatypes/#the-uuid-type)",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/row-generator/#rnd_uuid4"
  },
  {
    name: "round",
    label: "round(value, scale)",
    documentation: "returns the closest value in the specified scale. It uses the \"half up\" tie-breaking method when the value is exactly halfway between the `round_up` and `round_down` values.",
    parameters: [{
      label: "value",
      documentation: "a numeric value"
    }, {
      label: "scale",
      documentation: "an integer specifying the number of decimal places to round to"
    }],
    docsLink: "https://questdb.io/docs/reference/function/numeric/#round"
  },
  {
    name: "round_down",
    label: "round_down(value, scale)",
    documentation: "rounds a value down to the specified scale",
    parameters: [{
      label: "value",
      documentation: "a numeric value"
    }, {
      label: "scale",
      documentation: "an integer specifying the number of decimal places to round to"
    }],
    docsLink: "https://questdb.io/docs/reference/function/numeric/#round_down"
  },
  {
    name: "round_half_even",
    label: "round_half_even(value, scale)",
    documentation: "returns the closest value in the specified scale. It uses the \"half up\" tie-breaking method when the value is exactly halfway between the `round_up` and `round_down` values.",
    parameters: [{
      label: "value",
      documentation: "a numeric value"
    }, {
      label: "scale",
      documentation: "an integer specifying the number of decimal places to round to"
    }],
    docsLink: "https://questdb.io/docs/reference/function/numeric/#round_half_even"
  },
  {
    name: "round_up",
    label: "round_up(value, scale)",
    documentation: "rounds a value up to the specified scale",
    parameters: [{
      label: "value",
      documentation: "a numeric value"
    }, {
      label: "scale",
      documentation: "an integer specifying the number of decimal places to round to"
    }],
    docsLink: "https://questdb.io/docs/reference/function/numeric/#round_up"
  },
  {
    name: "row_number",
    label: "row_number()",
    documentation: "In the context of window functions, `row_number()` assigns a unique row number to each row within the window frame. For each partition, the row number starts with one and increments by one.",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/window/#row_number"
  },
  {
    name: "rtrim",
    label: "rtrim(string)",
    documentation: "extracts white space from the right of a string value",
    parameters: [{
      label: "string",
      documentation: "a string to manipulate"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#rtrim"
  },
  {
    name: "second",
    label: "second(value)",
    documentation: "returns the `second` of the minute for a given date or timestamp from `0` to `59`",
    parameters: [{
      label: "value",
      documentation: "any `timestamp` or `date`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#second"
  },
  {
    name: "sin",
    label: "sin(angleRadians)",
    documentation: "returns the trigonometric sine of an angle",
    parameters: [{
      label: "angleRadians",
      documentation: "a numeric value representing an angle in radians"
    }],
    docsLink: "https://questdb.io/docs/reference/function/trigonometric/#sin"
  },
  {
    name: "size_pretty",
    label: "size_pretty(value)",
    documentation: "returns a human-readable string equivalent to the input value.",
    parameters: [{
      label: "value",
      documentation: "a `long` value that represents size in byte"
    }],
    docsLink: "https://questdb.io/docs/reference/function/numeric/#size_pretty"
  },
  {
    name: "split_part",
    label: "split_part(string, delimiter, part)",
    documentation: "",
    parameters: [{
      label: "string",
      documentation: "a string to split"
    }, {
      label: "delimiter",
      documentation: "a string that separates the input string"
    }, {
      label: "part",
      documentation: "an integer specifying the part of the string to return"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#split_part"
  },
  {
    name: "sqrt",
    label: "sqrt(value)",
    documentation: "return the square root of a given number",
    parameters: [{
      label: "value",
      documentation: "a numeric value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/numeric/#sqrt"
  },
  {
    name: "starts_with",
    label: "starts_with(string, substring)",
    documentation: "",
    parameters: [{
      label: "string",
      documentation: "the original string that will be checked"
    }, {
      label: "substring",
      documentation: "the substring that will be checked if it's at the start of the original string"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#starts_with"
  },
  {
    name: "stddev",
    label: "stddev(value)",
    documentation: "Calculates the sample standard deviation of a set of values, ignoring missing data (e.g., null values). The sample standard deviation is a measure of the amount of variation or dispersion in a sample of a population. A low standard deviation indicates that the values tend to be close to the mean of the set, while a high standard deviation indicates that the values are spread out over a wider range",
    parameters: [{
      label: "value",
      documentation: "any numeric value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#stddev--stddev_samp"
  },
  {
    name: "stddev_pop",
    label: "stddev_pop(value)",
    documentation: "Calculates the population standard deviation of a set of values. The population standard deviation is a measure of the amount of variation or dispersion of a set of values. A low standard deviation indicates that the values tend to be close to the mean of the set, while a high standard deviation indicates that the values are spread out over a wider range.",
    parameters: [{
      label: "value",
      documentation: "any numeric value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#stddev_pop"
  },
  {
    name: "stddev_samp",
    label: "stddev_samp(value)",
    documentation: "Calculates the sample standard deviation of a set of values, ignoring missing data (e.g., null values). The sample standard deviation is a measure of the amount of variation or dispersion in a sample of a population. A low standard deviation indicates that the values tend to be close to the mean of the set, while a high standard deviation indicates that the values are spread out over a wider range",
    parameters: [{
      label: "value",
      documentation: "any numeric value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#stddev--stddev_samp"
  },
  {
    name: "string_agg",
    label: "string_agg(value, delimiter)",
    documentation: "Concatenates the given string values into a single string with the delimiter used as a value separator.",
    parameters: [{
      label: "value",
      documentation: "any string value"
    }, {
      label: "delimiter",
      documentation: "a string that separates the input string values"
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#string_agg"
  },
  {
    name: "strpos",
    label: "strpos(string, substring)",
    documentation: "`strpos(string, substring)` or `position(string, substring)` - searches for the\n" +
      "first substring occurrence in a string, and returns the index position of the\n" +
      "starting character. If the substring is not found, this function returns `0`.\n" +
      "The performed search is case-sensitive.",
    parameters: [{
      label: "string",
      documentation: "a string to search"
    }, {
      label: "substring",
      documentation: "a string to search for"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#strpos--position"
  },
  {
    name: "substring",
    label: "substring(string, start, length)",
    documentation: "extracts a substring from the given string",
    parameters: [{
      label: "string",
      documentation: "a string to extract from"
    }, {
      label: "start",
      documentation: "a starting position of the substring"
    }, {
      label: "length",
      documentation: "a length of the substring"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#substring"
  },
  {
    name: "sum",
    label: "sum(value)",
    documentation: "In the context of window functions, `sum(value)` calculates the sum of value in the set of rows defined by the window frame. Also known as \"cumulative sum\".",
    parameters: [{
      label: "value",
      documentation: "any numeric value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#sum"
  },
  {
    name: "sysdate",
    label: "sysdate()",
    documentation: "",
    parameters: []
  },
  {
    name: "systimestamp",
    label: "systimestamp()",
    documentation: "",
    parameters: []
  },
  {
    name: "table_columns",
    label: "table_columns(tableName)",
    documentation: "returns the schema of a table",
    parameters: [{
      label: "tableName",
      documentation: "a name of the table"
    }],
    docsLink: "https://questdb.io/docs/reference/function/meta/#table_columns"
  },
  {
    name: "table_partitions",
    label: "table_partitions(tableName)",
    documentation: "returns information for the partitions of a table with the option to filter the partitions.",
    parameters: [{
      label: "tableName",
      documentation: "a name of the table"
    }],
    docsLink: "https://questdb.io/docs/reference/function/meta/#table_partitions"
  },
  {
    name: "tan",
    label: "tan(angleRadians)",
    documentation: "returns the trigonometric tangent of an angle",
    parameters: [{
      label: "angleRadians",
      documentation: "a numeric value representing an angle in radians"
    }],
    docsLink: "https://questdb.io/docs/reference/function/trigonometric/#tan"
  },
  {
    name: "timestamp_ceil",
    label: "timestamp_ceil(unit, timestamp)",
    documentation: "performs a ceiling calculation on a timestamp by given unit",
    parameters: [{
      label: "unit",
      documentation: "a string representing the unit of time"
    }, {
      label: "timestamp",
      documentation: "a timestamp value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#timestamp_ceil"
  },
  {
    name: "timestamp_floor",
    label: "timestamp_floor(unit, timestamp)",
    documentation: "performs a floor calculation on a timestamp by given uni",
    parameters: [{
      label: "unit",
      documentation: "a string representing the unit of time"
    }, {
      label: "timestamp",
      documentation: "a timestamp value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#timestamp_floor"
  },
  {
    name: "timestamp_sequence",
    label: "timestamp_sequence(startTimestamp, step)",
    documentation: "generates a sequence of `timestamp`\n" +
      "  starting at `startTimestamp`, and incrementing by a `step` set as a `long`\n" +
      "  value in microseconds. This `step` can be either;\n" +
      "\n" +
      "  - a static value, in which case the growth will be monotonic, or\n" +
      "\n" +
      "  - a randomized value, in which case the growth will be randomized. This is\n" +
      "    done using\n" +
      "    [random value generator functions](/docs/reference/function/random-value-generator/).",
    parameters: [{
      label: "startTimestamp",
      documentation: "a timestamp value"
    }, {
      label: "step",
      documentation: " a `long` representing the interval between 2 consecutive generated timestamps in `microseconds`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#timestamp_sequence"
  },
  {
    name: "timestamp_shuffle",
    label: "timestamp_shuffle(timestamp1, timestamp2)",
    documentation: "generates a random timestamp inclusively between the two input timestamps",
    parameters: [{
      label: "timestamp1",
      documentation: "any timestamp value"
    }, {
      label: "timestamp2",
      documentation: " a timestamp value that is not equal to `timestamp_1`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#timestamp_shuffle"
  },
  {
    name: "to_date",
    label: "to_date(string, format)",
    documentation: "converts `string` to `date` by using the supplied format to extract the value",
    parameters: [{
      label: "string",
      documentation: "any string that represents a date and/or time"
    }, {
      label: "format",
      documentation: "a string that describes the date format in which string is expressed"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#to_date"
  },
  {
    name: "to_lowercase",
    label: "to_lowercase(string)",
    documentation: "converts all upper case string characters to lowercase",
    parameters: [{
      label: "string",
      documentation: "a string to convert to lowercase"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#to_lowercase--lower"
  },
  {
    name: "to_str",
    label: "to_str(value, format)",
    documentation: "converts timestamp value to a string in the specified format",
    parameters: [{
      label: "value",
      documentation: "any `date` or `timestamp`"
    }, {
      label: "format",
      documentation: "a timestamp format"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#to_str"
  },
  {
    name: "to_timestamp",
    label: "to_timestamp(string, format)",
    documentation: "converts `string` to `timestamp` by using the supplied `format` to extract the `value` with `microsecond` precision.",
    parameters: [{
      label: "string",
      documentation: "any string that represents a date and/or time"
    }, {
      label: "format",
      documentation: "a string that describes the date format in which `string` is expressed"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#to_timestamp"
  },
  {
    name: "to_timezone",
    label: "to_timezone(timestamp, timezone)",
    documentation: "`to_timezone(timestamp, timezone)` - converts a timestamp value to a specified\n" +
      "timezone. For more information on the time zone database used for this function,\n" +
      "see the\n" +
      "[QuestDB time zone database documentation](/docs/guides/working-with-timestamps-timezones/).",
    parameters: [{
      label: "timestamp",
      documentation: "a timestamp value"
    }, {
      label: "timezone",
      documentation: "may be `Country/City` tz database name, time zone abbreviation such as `PST` or in `UTC` offset in string format."
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#to_timezone"
  },
  {
    name: "to_uppercase",
    label: "to_uppercase(string)",
    documentation: "converts all lower case string characters to uppercase",
    parameters: [{
      label: "string",
      documentation: "a string to convert to uppercase"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#to_uppercase--upper"
  },
  {
    name: "to_utc",
    label: "to_utc(timestamp, timezone)",
    documentation: "converts a timestamp by specified timezone to UTC. May be provided a timezone in string format or a UTC offset in hours and minutes. For more information on the time zone database used for this function, see the [QuestDB time zone database documentation](/docs/guides/working-with-timestamps-timezones/).",
    parameters: [{
      label: "timestamp",
      documentation: "a timestamp value"
    }, {
      label: "timezone",
      documentation: "may be `Country/City` tz database name, time zone abbreviation such as `PST` or in `UTC` offset in string format."
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#to_utc"
  },
  {
    name: "to_uuid",
    label: "to_uuid(value)",
    documentation: "combines two 64-bit `long` into a single 128-bit `uuid`",
    parameters: [{
      label: "value",
      documentation: "a `long` value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/uuid/#to_uuid"
  },
  {
    name: "touch",
    label: "touch(sql)",
    documentation: "the `touch()` function loads a table from disk to memory. Useful for triggering a \"hot\" start from conditions where data may be \"cold\", such as after a restart or any condition which caused disk cache to flush. A \"hot\" start provides the usual fast and expected query performance, as no caching or movement from disk to memory is required prior to an initial query.",
    parameters: [{
      label: "sql",
      documentation: "a SQL statement"
    }],
    docsLink: "https://questdb.io/docs/reference/function/touch"
  },
  {
    name: "trim",
    label: "trim(string)",
    documentation: "returns a string with leading and trailing whitespace removed",
    parameters: [{
      label: "string",
      documentation: "the input string from which you want to remove leading and trailing whitespace"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#trim"
  },
  {
    name: "upper",
    label: "upper(string)",
    documentation: "converts all lower case string characters to uppercase",
    parameters: [{
      label: "string",
      documentation: "a string to convert to uppercase"
    }],
    docsLink: "https://questdb.io/docs/reference/function/text/#to_uppercase--upper"
  },
  {
    name: "var_pop",
    label: "var_pop(value)",
    documentation: "Calculates the population variance of a set of values. The population variance is a measure of the amount of variation or dispersion of a set of values. A low variance indicates that the values tend to be very close to the mean, while a high variance indicates that the values are spread out over a wider range.",
    parameters: [{
      label: "value",
      documentation: "any numeric value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#var_pop"
  },
  {
    name: "var_samp",
    label: "var_samp(value)",
    documentation: "Calculates the sample variance of a set of values. The sample variance is a measure of the amount of variation or dispersion of a set of values in a sample from a population. A low variance indicates that the values tend to be very close to the mean, while a high variance indicates that the values are spread out over a wider range.",
    parameters: [{
      label: "value",
      documentation: "any numeric value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#variance--var_samp"
  },
  {
    name: "variance",
    label: "variance(value)",
    documentation: "Calculates the sample variance of a set of values. The sample variance is a measure of the amount of variation or dispersion of a set of values in a sample from a population. A low variance indicates that the values tend to be very close to the mean, while a high variance indicates that the values are spread out over a wider range.",
    parameters: [{
      label: "value",
      documentation: "any numeric value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#variance--var_samp"
  },
  {
    name: "wal_tables",
    label: "wal_tables()",
    documentation: "returns the WAL status for all\n" +
      "[WAL tables](https://questdb.io/docs/concept/write-ahead-log/) in the database.",
    parameters: [],
    docsLink: "https://questdb.io/docs/reference/function/meta/#wal_tables"
  },
  {
    name: "week_of_year",
    label: "week_of_year(value)",
    documentation: "returns the number representing the week number in the year",
    parameters: [{
      label: "value",
      documentation: "any `date` or `timestamp`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#week_of_year"
  },
  {
    name: "vwap",
    label: "vwap(price, quantity)",
    documentation: "Calculates the volume-weighted average price (VWAP) based on the given price and quantity columns. This is a handy replacement for the `sum(price * quantity) / sum(quantity)` expression.",
    parameters: [{
      label: "price",
      documentation: "any numeric price, value"
    }, {
      label: "quantity",
      documentation: "any numeric quantity value"
    }],
    docsLink: "https://questdb.io/docs/reference/function/aggregation/#vwap"
  },
  {
    name: "year",
    label: "year(value)",
    documentation: "returns the `year` for a given timestamp",
    parameters: [{
      label: "value",
      documentation: "any `date` or `timestamp`"
    }],
    docsLink: "https://questdb.io/docs/reference/function/date-time/#year"
  }
]
