import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const globalDb = globalThis as unknown as { db?: PrismaClient };
export const db = globalDb.db ?? new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5433/gogreen',max:5})});
if(process.env.NODE_ENV !== 'production') globalDb.db = db;
