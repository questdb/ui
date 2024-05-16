import type { ErrorCode } from "./types"

export const macos: {
  [key: number]: ErrorCode
} = {
  0: {
    errorCode: "Base",
    description: "Undefined error: 0",
  },
  1: {
    errorCode: "EPERM",
    description: "Operation not permitted",
  },
  2: {
    errorCode: "ENOENT",
    description: "No such file or directory",
  },
  3: {
    errorCode: "ESRCH",
    description: "No such process",
  },
  4: {
    errorCode: "EINTR",
    description: "Interrupted system call",
  },
  5: {
    errorCode: "EIO",
    description: "Input/output error",
  },
  6: {
    errorCode: "ENXIO",
    description: "Device not configured",
  },
  7: {
    errorCode: "E2BIG",
    description: "Argument list too long",
  },
  8: {
    errorCode: "ENOEXEC",
    description: "Exec format error",
  },
  9: {
    errorCode: "EBADF",
    description: "Bad file descriptor",
  },
  10: {
    errorCode: "ECHILD",
    description: "No child processes",
  },
  11: {
    errorCode: "EDEADLK",
    description: "Resource deadlock avoided",
  },
  12: {
    errorCode: "ENOMEM",
    description: "Cannot allocate memory",
  },
  13: {
    errorCode: "EACCES",
    description: "Permission denied",
  },
  14: {
    errorCode: "EFAULT",
    description: "Bad address",
  },
  15: {
    errorCode: "ENOTBLK",
    description: "Block device required",
  },
  16: {
    errorCode: "EBUSY",
    description: "Device busy",
  },
  17: {
    errorCode: "EEXIST",
    description: "File exists",
  },
  18: {
    errorCode: "EXDEV",
    description: "Cross-device link",
  },
  19: {
    errorCode: "ENODEV",
    description: "Operation not supported by device",
  },
  20: {
    errorCode: "ENOTDIR",
    description: "Not a directory",
  },
  21: {
    errorCode: "EISDIR",
    description: "Is a directory",
  },
  22: {
    errorCode: "EINVAL",
    description: "Invalid argument",
  },
  23: {
    errorCode: "ENFILE",
    description: "Too many open files in system",
  },
  24: {
    errorCode: "EMFILE",
    description: "Too many open files",
  },
  25: {
    errorCode: "ENOTTY",
    description: "Inappropriate ioctl for device",
  },
  26: {
    errorCode: "ETXTBSY",
    description: "Text file busy",
  },
  27: {
    errorCode: "EFBIG",
    description: "File too large",
  },
  28: {
    errorCode: "ENOSPC",
    description: "No space left on device",
  },
  29: {
    errorCode: "ESPIPE",
    description: "Illegal seek",
  },
  30: {
    errorCode: "EROFS",
    description: "Read-only file system",
  },
  31: {
    errorCode: "EMLINK",
    description: "Too many links",
  },
  32: {
    errorCode: "EPIPE",
    description: "Broken pipe",
  },
  33: {
    errorCode: "EDOM",
    description: "Numerical argument out of domain",
  },
  34: {
    errorCode: "ERANGE",
    description: "Result too large",
  },
  35: {
    errorCode: "EAGAIN",
    description: "Resource temporarily unavailable",
  },
  36: {
    errorCode: "EINPROGRESS",
    description: "Operation now in progress",
  },
  37: {
    errorCode: "EALREADY",
    description: "Operation already in progress",
  },
  38: {
    errorCode: "ENOTSOCK",
    description: "Socket operation on non-socket",
  },
  39: {
    errorCode: "EDESTADDRREQ",
    description: "Destination address required",
  },
  40: {
    errorCode: "EMSGSIZE",
    description: "Message too long",
  },
  41: {
    errorCode: "EPROTOTYPE",
    description: "Protocol wrong type for socket",
  },
  42: {
    errorCode: "ENOPROTOOPT",
    description: "Protocol not available",
  },
  43: {
    errorCode: "EPROTONOSUPPORT",
    description: "Protocol not supported",
  },
  44: {
    errorCode: "ESOCKTNOSUPPORT",
    description: "Socket type not supported",
  },
  45: {
    errorCode: "ENOTSUP",
    description: "Operation not supported",
  },
  46: {
    errorCode: "EPFNOSUPPORT",
    description: "Protocol family not supported",
  },
  47: {
    errorCode: "EAFNOSUPPORT",
    description: "Address family not supported by protocol family",
  },
  48: {
    errorCode: "EADDRINUSE",
    description: "Address already in use",
  },
  49: {
    errorCode: "EADDRNOTAVAIL",
    description: "Can’t assign requested address",
  },
  50: {
    errorCode: "ENETDOWN",
    description: "Network is down",
  },
  51: {
    errorCode: "ENETUNREACH",
    description: "Network is unreachable",
  },
  52: {
    errorCode: "ENETRESET",
    description: "Network dropped connection on reset",
  },
  53: {
    errorCode: "ECONNABORTED",
    description: "Software caused connection abort",
  },
  54: {
    errorCode: "ECONNRESET",
    description: "Connection reset by peer",
  },
  55: {
    errorCode: "ENOBUFS",
    description: "No buffer space available",
  },
  56: {
    errorCode: "EISCONN",
    description: "Socket is already connected",
  },
  57: {
    errorCode: "ENOTCONN",
    description: "Socket is not connected",
  },
  58: {
    errorCode: "ESHUTDOWN",
    description: "Can’t send after socket shutdown",
  },
  59: {
    errorCode: "ETOOMANYREFS",
    description: "Too many references: can’t splice",
  },
  60: {
    errorCode: "ETIMEDOUT",
    description: "Operation timed out",
  },
  61: {
    errorCode: "ECONNREFUSED",
    description: "Connection refused",
  },
  62: {
    errorCode: "ELOOP",
    description: "Too many levels of symbolic links",
  },
  63: {
    errorCode: "ENAMETOOLONG",
    description: "File name too long",
  },
  64: {
    errorCode: "EHOSTDOWN",
    description: "Host is down",
  },
  65: {
    errorCode: "EHOSTUNREACH",
    description: "No route to host",
  },
  66: {
    errorCode: "ENOTEMPTY",
    description: "Directory not empty",
  },
  67: {
    errorCode: "EPROCLIM",
    description: "Too many processes",
  },
  68: {
    errorCode: "EUSERS",
    description: "Too many users",
  },
  69: {
    errorCode: "EDQUOT",
    description: "Disc quota exceeded",
  },
  70: {
    errorCode: "ESTALE",
    description: "Stale NFS file handle",
  },
  71: {
    errorCode: "EREMOTE",
    description: "Too many levels of remote in path",
  },
  72: {
    errorCode: "EBADRPC",
    description: "RPC struct is bad",
  },
  73: {
    errorCode: "ERPCMISMATCH",
    description: "RPC version wrong",
  },
  74: {
    errorCode: "EPROGUNAVAIL",
    description: "RPC prog. not avail",
  },
  75: {
    errorCode: "EPROGMISMATCH",
    description: "Program version wrong",
  },
  76: {
    errorCode: "EPROCUNAVAIL",
    description: "Bad procedure for program",
  },
  77: {
    errorCode: "ENOLCK",
    description: "No locks available",
  },
  78: {
    errorCode: "ENOSYS",
    description: "Function not implemented",
  },
  79: {
    errorCode: "EFTYPE",
    description: "Inappropriate file type or format",
  },
  80: {
    errorCode: "EAUTH",
    description: "Authentication error",
  },
  81: {
    errorCode: "ENEEDAUTH",
    description: "Need authenticator",
  },
  82: {
    errorCode: "EPWROFF",
    description: "Device power is off",
  },
  83: {
    errorCode: "EDEVERR",
    description: "Device error",
  },
  84: {
    errorCode: "EOVERFLOW",
    description: "Value too large to be stored in data type",
  },
  85: {
    errorCode: "EBADEXEC",
    description: "Bad executable",
  },
  86: {
    errorCode: "EBADARCH",
    description: "Bad CPU type in executable",
  },
  87: {
    errorCode: "ESHLIBVERS",
    description: "Shared library version mismatch",
  },
  88: {
    errorCode: "EBADMACHO",
    description: "Malformed Macho file",
  },
  89: {
    errorCode: "ECANCELED",
    description: "Operation canceled",
  },
  90: {
    errorCode: "EIDRM",
    description: "Identifier removed",
  },
  91: {
    errorCode: "ENOMSG",
    description: "No message of desired type",
  },
  92: {
    errorCode: "EILSEQ",
    description: "Illegal byte sequence",
  },
  93: {
    errorCode: "ENOATTR",
    description: "Attribute not found",
  },
  94: {
    errorCode: "EBADMSG",
    description: "Bad message",
  },
  95: {
    errorCode: "EMULTIHOP",
    description: "EMULTIHOP (Reserved)",
  },
  96: {
    errorCode: "ENODATA",
    description: "No message available on STREAM",
  },
  97: {
    errorCode: "ENOLINK",
    description: "ENOLINK (Reserved)",
  },
  98: {
    errorCode: "ENOSR",
    description: "No STREAM resources",
  },
  99: {
    errorCode: "ENOSTR",
    description: "Not a STREAM",
  },
  100: {
    errorCode: "EPROTO",
    description: "Protocol error",
  },
  101: {
    errorCode: "ETIME",
    description: "STREAM ioctl timeout",
  },
  102: {
    errorCode: "EOPNOTSUPP",
    description: "Operation not supported on socket",
  },
  103: {
    errorCode: "ENOPOLICY",
    description: "Policy not found",
  },
  104: {
    errorCode: "ENOTRECOVERABLE",
    description: "State not recoverable",
  },
  105: {
    errorCode: "EOWNERDEAD",
    description: "Previous owner died",
  },
  106: {
    errorCode: "EQFULL",
    description: "Interface output queue is full",
  },
}
