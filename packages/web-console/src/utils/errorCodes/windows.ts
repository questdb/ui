import type { ErrorCode } from "./types"

export const windows: {
  [key: number]: ErrorCode
} = {
  1: { 
      errorCode: 'ERROR_INVALID_FUNCTION', 
      description: 'Incorrect function.' 
  },
  2: { 
      errorCode: 'ERROR_FILE_NOT_FOUND', 
      description: 'The system cannot find the file specified.' 
  },
  3: { 
      errorCode: 'ERROR_PATH_NOT_FOUND', 
      description: 'The system cannot find the path specified.' 
  },
  4: { 
      errorCode: 'ERROR_TOO_MANY_OPEN_FILES', 
      description: 'The system cannot open the file.' 
  },
  5: { 
      errorCode: 'ERROR_ACCESS_DENIED', 
      description: 'Access is denied.' 
  },
  6: { 
      errorCode: 'ERROR_INVALID_HANDLE', 
      description: 'The handle is invalid.' 
  },
  7: { 
      errorCode: 'ERROR_ARENA_TRASHED', 
      description: 'The storage control blocks were destroyed.' 
  },
  8: { 
      errorCode: 'ERROR_NOT_ENOUGH_MEMORY', 
      description: 'Not enough memory is available to process this command.' 
  },
  9: { 
      errorCode: 'ERROR_INVALID_BLOCK', 
      description: 'The storage control block address is invalid.' 
  },
  10: { 
      errorCode: 'ERROR_BAD_ENVIRONMENT', 
      description: 'The environment is incorrect.' 
  },
  11: { 
      errorCode: 'ERROR_BAD_FORMAT', 
      description: 'An attempt was made to load a program with an incorrect format.' 
  },
  12: { 
      errorCode: 'ERROR_INVALID_ACCESS', 
      description: 'The access code is invalid.' 
  },
  13: { 
      errorCode: 'ERROR_INVALID_DATA', 
      description: 'The data is invalid.' 
  },
  14: { 
      errorCode: 'ERROR_OUTOFMEMORY', 
      description: 'Not enough storage is available to complete this operation.' 
  },
  15: { 
      errorCode: 'ERROR_INVALID_DRIVE', 
      description: 'The system cannot find the drive specified.' 
  },
  16: { 
      errorCode: 'ERROR_CURRENT_DIRECTORY', 
      description: 'The directory cannot be removed.' 
  },
  17: { 
      errorCode: 'ERROR_NOT_SAME_DEVICE', 
      description: 'The system cannot move the file to a different disk drive.' 
  },
  18: { 
      errorCode: 'ERROR_NO_MORE_FILES', 
      description: 'There are no more files.' 
  },
  19: { 
      errorCode: 'ERROR_WRITE_PROTECT', 
      description: 'The media is write protected.' 
  },
  20: { 
      errorCode: 'ERROR_BAD_UNIT', 
      description: 'The system cannot find the device specified.' 
  },
  21: { 
      errorCode: 'ERROR_NOT_READY', 
      description: 'The device is not ready.' 
  },
  22: { 
      errorCode: 'ERROR_BAD_COMMAND', 
      description: 'The device does not recognize the command.' 
  },
  23: { 
      errorCode: 'ERROR_CRC', 
      description: 'Data error (cyclic redundancy check).' 
  },
  24: { 
      errorCode: 'ERROR_BAD_LENGTH', 
      description: 'The program issued a command but the command length is incorrect.' 
  },
  25: { 
      errorCode: 'ERROR_SEEK', 
      description: 'The drive cannot locate a specific area or track on the disk.' 
  },
  26: { 
      errorCode: 'ERROR_NOT_DOS_DISK', 
      description: 'The specified disk or diskette cannot be accessed.' 
  },
  27: { 
      errorCode: 'ERROR_SECTOR_NOT_FOUND', 
      description: 'The drive cannot find the sector requested.' 
  },
  28: { 
      errorCode: 'ERROR_OUT_OF_PAPER', 
      description: 'The printer is out of paper.' 
  },
  29: { 
      errorCode: 'ERROR_WRITE_FAULT', 
      description: 'The system cannot write to the specified device.' 
  },
  30: { 
      errorCode: 'ERROR_READ_FAULT', 
      description: 'The system cannot read from the specified device.' 
  },
  31: { 
      errorCode: 'ERROR_GEN_FAILURE', 
      description: 'A device attached to the system is not functioning.' 
  },
  32: { 
      errorCode: 'ERROR_SHARING_VIOLATION', 
      description: 'The process cannot access the file because it is being used by another process.' 
  },
  33: { 
      errorCode: 'ERROR_LOCK_VIOLATION', 
      description: 'The process cannot access the file because another process has locked a portion of the file.' 
  },
  34: { 
      errorCode: 'ERROR_WRONG_DISK', 
      description: 'The wrong diskette is in the drive. Insert %2 (Volume Serial Number: %3) into drive %1.' 
  },
  36: { 
      errorCode: 'ERROR_SHARING_BUFFER_EXCEEDED', 
      description: 'Too many files opened for sharing.' 
  },
  38: { 
      errorCode: 'ERROR_HANDLE_EOF', 
      description: 'Reached the end of the file.' 
  },
  39: { 
      errorCode: 'ERROR_HANDLE_DISK_FULL', 
      description: 'The disk is full.' 
  },
  87: { 
      errorCode: 'ERROR_INVALID_PARAMETER', 
      description: 'The parameter is incorrect.' 
  },
  112: { 
      errorCode: 'ERROR_DISK_FULL', 
      description: 'The disk is full.' 
  },
  123: { 
      errorCode: 'ERROR_INVALID_NAME', 
      description: 'The file name, directory name, or volume label syntax is incorrect.' 
  },
  1450: { 
      errorCode: 'ERROR_NO_SYSTEM_RESOURCES', 
      description: 'Insufficient system resources exist to complete the requested service
  }
}
