import { createClient } from "@redis/client"
import type {
  Adapter,
  AdapterUser,
  VerificationToken,
  AdapterSession,
  AdapterAccount,
} from "@auth/core/adapters"

const client = createClient();
type RedisClientType = typeof client;

// prefixes for keys in redis
const PREFIX = "authjs"
const TOKEN_PREFIX = `${PREFIX}:verification_token`
const USER_PREFIX = `${PREFIX}:user`
const SESSION_PREFIX = `${PREFIX}:session`
const PROVIDER_ACCOUNT_PREFIX = `${PREFIX}:provider_account`

async function getUser(id: string): Promise<AdapterUser | null> {
  const user = await client.hGetAll(`${USER_PREFIX}:${id}`)
  if (!user) return null
  return user
}

async function setUser(user: AdapterUser): Promise<AdapterUser> {
  await client.hSet(`${USER_PREFIX}:${user.email}`, user)
  return user
}

export function RedisAdapter(client: RedisClientType): Adapter {

  return {

    // Verification Token Management
    async createVerificationToken(
      verificationToken: VerificationToken
    ): Promise<VerificationToken> {
      const { identifier, expires, token } = verificationToken
      await client.hSet(`${TOKEN_PREFIX}:${identifier}`, {
        identifier,
        expires: expires.toString(),
        token,
      })
      // TODO expire the token
      return verificationToken
    },

    async useVerificationToken({
      identifier,
      token,
    }: {
      identifier: string
      token: string
    }): Promise<VerificationToken | null> {
      const result = await client.hGetAll(`${TOKEN_PREFIX}:${identifier}`)
      if (result.token === token) {
        await client.del(`${TOKEN_PREFIX}:${identifier}`)
        return result
      }
      return null
    },

    async getUserByEmail(email: string): Promise<null | AdapterUser> {
      return getUser(email)
    },

    // User Management
    async createUser(user: AdapterUser): Promise<AdapterUser> {
      return setUser(user)
    },

    async getUser(id) {
      return getUser(id)
    },

    async getUserByAccount({ providerAccountId, provider }): Promise<null | AdapterUser> {
      const key = `${PROVIDER_ACCOUNT_PREFIX}:${provider}:${providerAccountId}`
      const data = await client.hGetAll(key)
      if (!data) return null
      return getUser(data.userId)
    },

    async updateUser(user: AdapterUser): Promise<AdapterUser> {
      return setUser(user)
    },

    async linkAccount(data: AdapterAccount) {
      const { userId, providerAccountId, provider } = data

      // add the provider account to a set of provider accounts for the user
      await client.sAdd(`${USER_PREFIX}:${userId}:accounts`, `${provider}:${providerAccountId}`)

      await client.hSet(
        `${PROVIDER_ACCOUNT_PREFIX}:${provider}:${providerAccountId}`,
        data
      )
    },

    async unlinkAccount({ providerAccountId, provider }) {
      const key = `${PROVIDER_ACCOUNT_PREFIX}:${provider}:${providerAccountId}`
      const data = await client.hGetAll(key)
      if (!data) return
      const { userId } = data
      await client.sRem(`${USER_PREFIX}:${userId}:accounts`, `${provider}:${providerAccountId}`)
      await client.del(key)
    },

    async deleteUser(userId) {
      const user = await getUser(userId)
      if (!user) return
      
      await client.del(`${USER_PREFIX}:${userId}`)
      await client.del(`${USER_PREFIX}:${user.email}`)

      const accounts = await client.sMembers(`${USER_PREFIX}:${userId}:accounts`)
      for (const account of accounts) {
        await client.del(`${PROVIDER_ACCOUNT_PREFIX}:${account}`)
      }
    },

    // Session Management
    async createSession(session: AdapterSession) {
      const { sessionToken, userId, expires } = session
      await client.hSet(
        `${SESSION_PREFIX}:${sessionToken}`,
        {
          sessionToken,
          userId,
        }
      )
      // TODO expire the session
      return session
    },

    async getSessionAndUser(sessionToken: string): Promise<null | { session: AdapterSession, user: AdapterUser }> {
      const session = await client.hGetAll(`${SESSION_PREFIX}:${sessionToken}`)
      if (!session) return null

      const user = await getUser(session.userId)
      if (!user) return null

      return { session, user }
    },

    async updateSession(session: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">): Promise<AdapterSession | null | undefined> {
      const { sessionToken } = session
      const originalSession = await client.hGetAll(`${SESSION_PREFIX}:${sessionToken}`)
      if (!originalSession) return null

      const newSession = {
        ...originalSession,
        ...session,
      }
      // TODO expire the session
      await client.hSet(`${SESSION_PREFIX}:${sessionToken}`, newSession)
      return newSession
    },

    async deleteSession(sessionToken) {
      await client.del(`${SESSION_PREFIX}:${sessionToken}`)
    },
  }
}