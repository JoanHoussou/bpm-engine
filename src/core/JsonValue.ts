import type { Prisma } from '@prisma/client';

export function toJsonValue(obj: unknown): Prisma.InputJsonValue {
  return obj as Prisma.InputJsonValue;
}
