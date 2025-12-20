/**
 * Prisma client stub
 * This project uses postgres library instead of Prisma
 * This file provides compatibility for code that expects Prisma
 */

import { sql } from './client';

// Export the postgres client as prisma for compatibility
export const prisma = sql;

export default sql;
