import { AuthPayload } from "./types";

class AuthPayloadHolder {
    private authPayload: AuthPayload | null = null;

    setAuthPayload(authPayload: AuthPayload) {
        this.authPayload = authPayload
    }

    getAuthPayload(): AuthPayload | null {
        return this.authPayload;
    }

    isSSOAuthenticated(): boolean {
        return !!this.authPayload;
    }

    clearAuthPayload() {
        this.authPayload = null;
    }
}

export const authPayloadHolder = new AuthPayloadHolder();
