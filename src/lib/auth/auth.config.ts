/**
 * NextAuth.js Configuration
 * Authentication system for user accounts
 */

import type { NextAuthConfig } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { compare } from 'bcryptjs';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

export const authConfig: NextAuthConfig = {
  providers: [
    // Email/Password authentication
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const [user] = await sql`
          SELECT id, email, name, password_hash, image_url, is_active
          FROM users
          WHERE email = ${credentials.email as string}
          AND provider = 'email'
          LIMIT 1
        `;

        if (!user || !user.is_active) {
          return null;
        }

        const isValidPassword = await compare(
          credentials.password as string,
          user.password_hash
        );

        if (!isValidPassword) {
          return null;
        }

        // Update last login
        await sql`
          UPDATE users
          SET last_login_at = NOW()
          WHERE id = ${user.id}
        `;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image_url,
        };
      },
    }),

    // Google OAuth
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  pages: {
    signIn: '/auth/login',
    signOut: '/auth/logout',
    error: '/auth/error',
    verifyRequest: '/auth/verify',
    newUser: '/auth/welcome',
  },

  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        // Check if user exists, create if not
        const [existingUser] = await sql`
          SELECT id FROM users WHERE email = ${user.email!} LIMIT 1
        `;

        if (!existingUser) {
          // Create new user from OAuth
          const [newUser] = await sql`
            INSERT INTO users (
              email,
              name,
              image_url,
              provider,
              provider_id,
              email_verified,
              email_verified_at
            ) VALUES (
              ${user.email!},
              ${user.name},
              ${user.image},
              ${account.provider},
              ${account.providerAccountId},
              true,
              NOW()
            )
            RETURNING id
          `;

          // Create default preferences
          await sql`
            INSERT INTO user_preferences (user_id)
            VALUES (${newUser.id})
          `;

          user.id = newUser.id;
        } else {
          user.id = existingUser.id;

          // Update last login
          await sql`
            UPDATE users
            SET last_login_at = NOW()
            WHERE id = ${existingUser.id}
          `;
        }
      }

      return true;
    },

    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },

    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  events: {
    async signIn(message) {
      // Log sign-in activity
      if (message.user.id) {
        await sql`
          INSERT INTO user_activity (
            user_id,
            activity_type,
            metadata
          ) VALUES (
            ${message.user.id},
            'sign_in',
            ${JSON.stringify({
              provider: message.account?.provider,
              isNewUser: message.isNewUser,
            })}
          )
        `;
      }
    },
  },

  debug: process.env.NODE_ENV === 'development',
};
