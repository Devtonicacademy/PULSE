import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';

const SECURETOKEN_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/**
 * Verifies Firebase ID tokens without a service account: signature against Google's public
 * keys, issuer and audience for this project. With the Auth emulator (FIREBASE_AUTH_EMULATOR_HOST)
 * tokens are unsigned, so they are only decoded; never set that variable in production.
 */
export function createTokenVerifier({ projectId, emulator = false, jwks }) {
  const keys = jwks ?? createRemoteJWKSet(new URL(SECURETOKEN_JWKS));

  return async function verifyToken(token) {
    if (emulator) {
      const payload = decodeJwt(token);
      return { uid: payload.user_id || payload.sub, provider: payload.firebase?.sign_in_provider };
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId
    });
    if (!payload.sub) throw new Error('Token has no subject');
    return { uid: payload.sub, provider: payload.firebase?.sign_in_provider };
  };
}
