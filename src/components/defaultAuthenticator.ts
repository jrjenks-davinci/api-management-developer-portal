import * as moment from "moment";
import { Utils } from "../utils";
import { IAuthenticator, AccessToken } from "./../authentication";
import { HttpHeader } from "@paperbits/common/http/httpHeader";

export class DefaultAuthenticator implements IAuthenticator {
    public async getAccessToken(): Promise<string> {
        return new Promise<string>((resolve) => {
            const accessToken = sessionStorage.getItem("accessToken");
            resolve(accessToken);
        });
    }

    public async setAccessToken(accessToken: string): Promise<void> {        
        return new Promise<void>((resolve) => {
            sessionStorage.setItem("accessToken", accessToken);
            resolve();
        });
    }

    public async refreshAccessTokenFromHeader(responseHeaders: HttpHeader[] = []): Promise<string> {
        return new Promise<string>(async (resolve) => {
            const accessTokenHeader = responseHeaders.find(x => x.name.toLowerCase() === "ocp-apim-sas-token");
            if (accessTokenHeader && accessTokenHeader.value) {
                const regex = /token=\"(.*)",refresh/gm;
                const match = regex.exec(accessTokenHeader.value);

                if (!match || match.length < 2) {
                    console.error(`Token format is not valid.`);
                }

                const accessToken = `SharedAccessSignature ${accessTokenHeader.value}`;
                const current = sessionStorage.getItem("accessToken");
                if (current !== accessToken) {
                    sessionStorage.setItem("accessToken", accessToken);                
                    resolve(accessToken);
                    return;
                }
            }
            
            resolve(undefined);
        });
    }

    public clearAccessToken(): void {
        sessionStorage.removeItem("accessToken");
    }

    public async isAuthenticated(): Promise<boolean> {
        const accessToken = await this.getAccessToken();

        if (!accessToken) {
            return false;
        }

        const parsedToken = this.parseAccessToken(accessToken);

        if (!parsedToken) {
            return false;
        }

        const now = Utils.getUtcDateTime();

        return now < parsedToken.expires;
    }

    private parseSharedAccessSignature(fullAccessToken: string): AccessToken {
        let accessToken = fullAccessToken;
        const refreshRegex = /token=\"(.*)",refresh/gm;
        const refreshMatch = refreshRegex.exec(fullAccessToken);

        if (refreshMatch && refreshMatch.length >= 2) {
            accessToken = refreshMatch[1];
        }

        const regex = /^[\w\-]*\&(\d*)\&/gm;
        const match = regex.exec(accessToken);

        if (!match || match.length < 2) {
            throw new Error(`SharedAccessSignature token format is not valid.`);
        }

        const dateTime = match[1];
        const dateTimeIso = `${dateTime.substr(0, 8)} ${dateTime.substr(8, 4)}`;
        const expirationDateUtc = moment(dateTimeIso).toDate();

        return { type: "SharedAccessSignature", expires: expirationDateUtc, value: accessToken };
    }

    private parseBearerToken(accessToken: string): AccessToken {
        const decodedToken = Utils.parseJwt(accessToken);
        const exp = moment(decodedToken.exp).toDate();

        return { type: "Bearer", expires: exp, value: accessToken };
    }

    public parseAccessToken(token: string): AccessToken {
        if (!token) {
            throw new Error("Access token is missing.");
        }

        let accessToken: AccessToken;

        if (token.startsWith("Bearer ")) {
            accessToken = this.parseBearerToken(token.replace("Bearer ", ""));
            return accessToken;
        }

        if (token.startsWith("SharedAccessSignature ")) {
            accessToken = this.parseSharedAccessSignature(token.replace("SharedAccessSignature ", ""));
            return accessToken;
        }

        accessToken = this.parseSharedAccessSignature(token);

        if (!accessToken) {
            throw new Error(`Access token format is not valid. Please use "Bearer" or "SharedAccessSignature".`);
        }
    }
}