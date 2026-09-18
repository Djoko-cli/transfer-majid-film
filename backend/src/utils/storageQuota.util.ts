import * as moment from "moment";
import { PrismaService } from "src/prisma/prisma.service";

export async function getUserActiveStorageUsage(
  prisma: PrismaService,
  userId: string,
): Promise<number> {
  const files = await prisma.file.findMany({
    where: {
      share: {
        removedReason: null,
        // A NAS-imported file is a symlink, not a real copy — it doesn't
        // consume the owner's own storage the way an uploaded one does,
        // so it shouldn't count against their quota either. Without this,
        // importing a large archive would permanently inflate usage here
        // for ~0 real disk cost, potentially locking them out of ever
        // creating a normal share again.
        hasNasImportedFiles: false,
        OR: [
          { expiration: { gt: new Date() } },
          { expiration: moment(0).toDate() },
        ],
        creatorId: userId,
      },
    },
    select: { size: true },
  });

  return files.reduce((sum, file) => sum + parseInt(file.size), 0);
}
