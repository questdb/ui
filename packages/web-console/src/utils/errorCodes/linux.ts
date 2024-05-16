import type { ErrorCode } from "./types"

export const linux: {
  [key: number]: ErrorCode
} = {
  1: {
    errorCode: "EPERM",
    description: "Operation not permitted.",
  },
  2: {
    errorCode: "ENOENT",
    description: "No such file or directory.",
  },
  3: {
    errorCode: "ESRCH",
    description: "No such process.",
  },
  4: {
    errorCode: "EINTR",
    description: "Interrupted system call.",
  },
  5: {
    errorCode: "EIO",
    description: "I/O error.",
  },
  6: {
    errorCode: "ENXIO",
    description: "No such device or address.",
  },
  7: {
    errorCode: "E2BIG",
    description: "Argument list too long.",
  },
  8: {
    errorCode: "ENOEXEC",
    description: "Exec format error.",
  },
  9: {
    errorCode: "EBADF",
    description: "Bad file number.",
  },
  10: {
    errorCode: "ECHILD",
    description: "No child processes.",
  },
  11: {
    errorCode: "EAGAIN",
    description: "Try again.",
  },
  12: {
    errorCode: "ENOMEM",
    description: "Out of memory.",
  },
  13: {
    errorCode: "EACCES",
    description: "Permission denied.",
  },
  14: {
    errorCode: "EFAULT",
    description: "Bad address.",
  },
  15: {
    errorCode: "ENOTBLK",
    description: "Block device required.",
  },
  16: {
    errorCode: "EBUSY",
    description: "Device or resource busy.",
  },
  17: {
    errorCode: "EEXIST",
    description: "File exists.",
  },
  18: {
    errorCode: "EXDEV",
    description: "Cross-device link.",
  },
  19: {
    errorCode: "ENODEV",
    description: "No such device.",
  },
  20: {
    errorCode: "ENOTDIR",
    description: "Not a directory.",
  },
  21: {
    errorCode: "EISDIR",
    description: "Is a directory.",
  },
  22: {
    errorCode: "EINVAL",
    description: "Invalid argument.",
  },
  23: {
    errorCode: "ENFILE",
    description: "File table overflow.",
  },
  24: {
    errorCode: "EMFILE",
    description: "Too many open files.",
  },
  25: {
    errorCode: "ENOTTY",
    description: "Not a typewriter.",
  },
  26: {
    errorCode: "ETXTBSY",
    description: "Text file busy.",
  },
  27: {
    errorCode: "EFBIG",
    description: "File too large.",
  },
  28: {
    errorCode: "ENOSPC",
    description: "No space left on device.",
  },
  29: {
    errorCode: "ESPIPE",
    description: "Illegal seek.",
  },
  30: {
    errorCode: "EROFS",
    description: "Read-only file system.",
  },
  31: {
    errorCode: "EMLINK",
    description: "Too many links.",
  },
  32: {
    errorCode: "EPIPE",
    description: "Broken pipe.",
  },
  33: {
    errorCode: "EDOM",
    description: "Math argument out of domain of func.",
  },
  34: {
    errorCode: "ERANGE",
    description: "Math result not representable.",
  },
  35: {
    errorCode: "EDEADLK",
    description: "Resource deadlock would occur.",
  },
  36: {
    errorCode: "ENAMETOOLONG",
    description: "File name too long.",
  },
  37: {
    errorCode: "ENOLCK",
    description: "No record locks available.",
  },
  38: {
    errorCode: "ENOSYS",
    description: "Function not implemented.",
  },
  39: {
    errorCode: "ENOTEMPTY",
    description: "Directory not empty.",
  },
  40: {
    errorCode: "ELOOP",
    description: "Too many symbolic links encountered.",
  },
  42: {
    errorCode: "ENOMSG",
    description: "No message of desired type.",
  },
  43: {
    errorCode: "EIDRM",
    description: "Identifier removed.",
  },
  44: {
    errorCode: "ECHRNG",
    description: "Channel number out of range.",
  },
  45: {
    errorCode: "EL2NSYNC",
    description: "Level 2 not synchronized.",
  },
  46: {
    errorCode: "EL3HLT",
    description: "Level 3 halted.",
  },
  47: {
    errorCode: "EL3RST",
    description: "Level 3 reset.",
  },
  48: {
    errorCode: "ELNRNG",
    description: "Link number out of range.",
  },
  49: {
    errorCode: "EUNATCH",
    description: "Protocol driver not attached.",
  },
  50: {
    errorCode: "ENOCSI",
    description: "No CSI structure available.",
  },
  51: {
    errorCode: "EL2HLT",
    description: "Level 2 halted.",
  },
  52: {
    errorCode: "EBADE",
    description: "Invalid exchange.",
  },
  53: {
    errorCode: "EBADR",
    description: "Invalid request descriptor.",
  },
  54: {
    errorCode: "EXFULL",
    description: "Exchange full.",
  },
  55: {
    errorCode: "ENOANO",
    description: "No anode.",
  },
  56: {
    errorCode: "EBADRQC",
    description: "Invalid request code.",
  },
  57: {
    errorCode: "EBADSLT",
    description: "Invalid slot.",
  },
  59: {
    errorCode: "EBFONT",
    description: "Bad font file format.",
  },
  60: {
    errorCode: "ENOSTR",
    description: "Device not a stream.",
  },
  61: {
    errorCode: "ENODATA",
    description: "No data available.",
  },
  62: {
    errorCode: "ETIME",
    description: "Timer expired.",
  },
  63: {
    errorCode: "ENOSR",
    description: "Out of streams resources.",
  },
  64: {
    errorCode: "ENONET",
    description: "Machine is not on the network.",
  },
  65: {
    errorCode: "ENOPKG",
    description: "Package not installed.",
  },
  66: {
    errorCode: "EREMOTE",
    description: "Object is remote.",
  },
  67: {
    errorCode: "ENOLINK",
    description: "Link has been severed.",
  },
  68: {
    errorCode: "EADV",
    description: "Advertise error.",
  },
  69: {
    errorCode: "ESRMNT",
    description: "Srmount error.",
  },
  70: {
    errorCode: "ECOMM",
    description: "Communication error on send.",
  },
  71: {
    errorCode: "EPROTO",
    description: "Protocol error.",
  },
  72: {
    errorCode: "EMULTIHOP",
    description: "Multihop attempted.",
  },
  73: {
    errorCode: "EDOTDOT",
    description: "RFS specific error.",
  },
  74: {
    errorCode: "EBADMSG",
    description: "Not a data message.",
  },
  75: {
    errorCode: "EOVERFLOW",
    description: "Value too large for defined data type.",
  },
  76: {
    errorCode: "ENOTUNIQ",
    description: "Name not unique on network.",
  },
  77: {
    errorCode: "EBADFD",
    description: "File descriptor in bad state.",
  },
  78: {
    errorCode: "EREMCHG",
    description: "Remote address changed.",
  },
  79: {
    errorCode: "ELIBACC",
    description: "Can not access a needed shared library.",
  },
  80: {
    errorCode: "ELIBBAD",
    description: "Accessing a corrupted shared library.",
  },
  81: {
    errorCode: "ELIBSCN",
    description: ".lib section in a.out corrupted.",
  },
  82: {
    errorCode: "ELIBMAX",
    description: "Attempting to link in too many shared libraries.",
  },
  83: {
    errorCode: "ELIBEXEC",
    description: "Cannot exec a shared library directly.",
  },
  84: {
    errorCode: "EILSEQ",
    description: "Illegal byte sequence.",
  },
  85: {
    errorCode: "ERESTART",
    description: "Interrupted system call should be restarted.",
  },
  86: {
    errorCode: "ESTRPIPE",
    description: "Streams pipe error.",
  },
  87: {
    errorCode: "EUSERS",
    description: "Too many users.",
  },
  88: {
    errorCode: "ENOTSOCK",
    description: "Socket operation on non-socket.",
  },
  89: {
    errorCode: "EDESTADDRREQ",
    description: "Destination address required.",
  },
  90: {
    errorCode: "EMSGSIZE",
    description: "Message too long.",
  },
  91: {
    errorCode: "EPROTOTYPE",
    description: "Protocol wrong type for socket.",
  },
  92: {
    errorCode: "ENOPROTOOPT",
    description: "Protocol not available.",
  },
  93: {
    errorCode: "EPROTONOSUPPORT",
    description: "Protocol not supported.",
  },
  94: {
    errorCode: "ESOCKTNOSUPPORT",
    description: "Socket type not supported.",
  },
  95: {
    errorCode: "EOPNOTSUPP",
    description: "Operation not supported on transport endpoint.",
  },
  96: {
    errorCode: "EPFNOSUPPORT",
    description: "Protocol family not supported.",
  },
  97: {
    errorCode: "EAFNOSUPPORT",
    description: "Address family not supported by protocol.",
  },
  98: {
    errorCode: "EADDRINUSE",
    description: "Address already in use.",
  },
  99: {
    errorCode: "EADDRNOTAVAIL",
    description: "Cannot assign requested address.",
  },
  100: {
    errorCode: "ENETDOWN",
    description: "Network is down.",
  },
  101: {
    errorCode: "ENETUNREACH",
    description: "Network is unreachable.",
  },
  102: {
    errorCode: "ENETRESET",
    description: "Network dropped connection because of reset.",
  },
  103: {
    errorCode: "ECONNABORTED",
    description: "Software caused connection abort.",
  },
  104: {
    errorCode: "ECONNRESET",
    description: "Connection reset by peer.",
  },
  105: {
    errorCode: "ENOBUFS",
    description: "No buffer space available.",
  },
  106: {
    errorCode: "EISCONN",
    description: "Transport endpoint is already connected.",
  },
  107: {
    errorCode: "ENOTCONN",
    description: "Transport endpoint is not connected.",
  },
  108: {
    errorCode: "ESHUTDOWN",
    description: "Cannot send after transport endpoint shutdown.",
  },
  109: {
    errorCode: "ETOOMANYREFS",
    description: "Too many references: cannot splice.",
  },
  110: {
    errorCode: "ETIMEDOUT",
    description: "Connection timed out.",
  },
  111: {
    errorCode: "ECONNREFUSED",
    description: "Connection refused.",
  },
  112: {
    errorCode: "EHOSTDOWN",
    description: "Host is down.",
  },
  113: {
    errorCode: "EHOSTUNREACH",
    description: "No route to host.",
  },
  114: {
    errorCode: "EALREADY",
    description: "Operation already in progress.",
  },
  115: {
    errorCode: "EINPROGRESS",
    description: "Operation now in progress.",
  },
  116: {
    errorCode: "ESTALE",
    description: "Stale NFS file handle.",
  },
  117: {
    errorCode: "EUCLEAN",
    description: "Structure needs cleaning.",
  },
  118: {
    errorCode: "ENOTNAM",
    description: "Not a XENIX named type file.",
  },
  119: {
    errorCode: "ENAVAIL",
    description: "No XENIX semaphores available.",
  },
  120: {
    errorCode: "EISNAM",
    description: "Is a named type file.",
  },
  121: {
    errorCode: "EREMOTEIO",
    description: "Remote I/O error.",
  },
  122: {
    errorCode: "EDQUOT",
    description: "Quota exceeded.",
  },
  123: {
    errorCode: "ENOMEDIUM",
    description: "No medium found.",
  },
  124: {
    errorCode: "EMEDIUMTYPE",
    description: "Wrong medium type.",
  },
  125: {
    errorCode: "ECANCELED",
    description: "Operation Canceled.",
  },
  126: {
    errorCode: "ENOKEY",
    description: "Required key not available.",
  },
  127: {
    errorCode: "EKEYEXPIRED",
    description: "Key has expired.",
  },
  128: {
    errorCode: "EKEYREVOKED",
    description: "Key has been revoked.",
  },
  129: {
    errorCode: "EKEYREJECTED",
    description: "Key was rejected by service.",
  },
  130: {
    errorCode: "EOWNERDEAD",
    description: "Owner died.",
  },
  131: {
    errorCode: "ENOTRECOVERABLE",
    description: "State not recoverable.",
  },
}
