import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma } from './prisma'

export const { handlers, signIn, signOut, auth } = NextAuth({
    session: { strategy: 'jwt' },
    pages: {
          signIn: '/login',
    },
    providers: [
          ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
            ? [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
            : []),
          CredentialsProvider({
                  name: 'credentials',
                  credentials: {
                            email: { label: 'Email', type: 'email' },
                            password: { label: 'Password', type: 'password' },
                  },
                  async authorize(credentials) {
                            if (!credentials?.email || !credentials?.password) return null

                    const user = await prisma.user.findUnique({
                                where: { email: credentials.email as string },
                    })
                            if (!user || !user.password) return null

                    const bcrypt = await import('bcryptjs')
                            const isValid = await bcrypt.compare(credentials.password as string, user.password)
                            if (!isValid) return null

                    return { id: user.id, name: user.name, email: user.email, role: user.role }
                  },
          }),
        ],
    callbacks: {
          async jwt({ token, user }) {
                  if (user) {
                            token.id = user.id
                            token.role = (user as { role?: string }).role ?? 'user'
                  }
                  return token
          },
          async session({ session, token }) {
                  if (token && session.user) {
                            session.user.id = token.id as string
                            session.user.role = token.role as string
                  }
                  return session
          },
    },
})

declare module 'next-auth' {
  interface Session {
        user: {
                id: string
                name?: string | null
                email?: string | null
                image?: string | null
                role: string
        }
  }
}
