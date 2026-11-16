export interface FakeBridgeSocket {
  framesOfType(type: string): Record<string, unknown>[]
  helloAck(): void
  toolCall(
    name: string,
    args: Record<string, unknown>,
    requestId?: string,
  ): string
}
export interface BridgeTestWindow extends Window {
  __mcpFakeWS: FakeBridgeSocket
  __mcpFakeSockets: FakeBridgeSocket[]
}
export function installFakeWebSocket(win: Window): void
export const TEST_BRIDGE_URL: string
export const TEST_BRIDGE_TOKEN: string
export const PROTOCOL_VERSION: string
