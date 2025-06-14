import { PrismaClient, Vehicle } from '@prisma/client';

const prisma = new PrismaClient();

export let vehicleCache: Vehicle[] = [];
export let listingCountMap: Record<string, number> = {};

// Load or reload caches from the database
export async function initCache() {
  console.log('Loading cache…');

  vehicleCache = await prisma.vehicle.findMany();

  const groups = await prisma.listing.groupBy({
    by: ['vehicleId'],
    _count: { vehicleId: true },
  });

  listingCountMap = groups.reduce((map, g) => {
    map[g.vehicleId] = g._count.vehicleId;
    return map;
  }, {} as Record<string, number>);

  console.log(
    `Cache loaded: ${vehicleCache.length} vehicles, counts for ${groups.length} keys`
  );
}
