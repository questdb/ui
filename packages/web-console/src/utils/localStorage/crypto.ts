/*******************************************************************************
 *     ___                  _   ____  ____
 *    / _ \ _   _  ___  ___| |_|  _ \| __ )
 *   | | | | | | |/ _ \/ __| __| | | |  _ \
 *   | |_| | |_| |  __/\__ \ |_| |_| | |_) |
 *    \__\_\\__,_|\___||___/\__|____/|____/
 *
 *  Copyright (c) 2014-2019 Appsicle
 *  Copyright (c) 2019-2022 QuestDB
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 ******************************************************************************/

// Simple obfuscation for API keys - not cryptographically secure
// but prevents casual inspection of localStorage

export const obfuscateKey = (key: string): string => {
  if (!key) return ""
  try {
    // Add a prefix to identify obfuscated values
    return "obf_" + btoa(key)
  } catch {
    return key
  }
}

export const deobfuscateKey = (obfuscated: string): string => {
  if (!obfuscated || !obfuscated.startsWith("obf_")) return obfuscated
  try {
    return atob(obfuscated.slice(4))
  } catch {
    return ""
  }
}

// Mask API key for display (show only first 8 and last 4 characters)
export const maskApiKey = (key: string): string => {
  if (!key || key.length < 20) return "••••••••••••••••"
  return `${key.slice(0, 8)}••••••••${key.slice(-4)}`
}