import { prisma } from "@/lib/db";
import { DEFAULT_PRICE_ITEMS } from "@/lib/domain";

export type PriceOption = {
  id: number;
  name: string;
  kind: string;
  type: string;
  format: string;
  price: number;
  minLessons: number | null;
  active: boolean;
  sortOrder: number;
};

export async function ensureDefaultPriceItems() {
  const count = await prisma.priceItem.count();
  if (count > 0) return;

  for (const item of DEFAULT_PRICE_ITEMS) {
    await prisma.priceItem.create({ data: item });
  }
}

export async function getPriceItems(): Promise<PriceOption[]> {
  await ensureDefaultPriceItems();
  return prisma.priceItem.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

export async function getActivePriceItems(): Promise<PriceOption[]> {
  await ensureDefaultPriceItems();
  return prisma.priceItem.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}
